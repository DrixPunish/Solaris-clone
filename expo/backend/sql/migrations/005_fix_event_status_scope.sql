-- Migration 005: Fix event cancellation to include 'processing' status
-- RPCs: rpc_rush_timer, rpc_cancel_timer, rpc_recall_fleet
-- Reason: An event already claimed by the worker (status='processing') must also
-- be cancelled/neutralised, otherwise the handler could still apply the effect
-- after the user has rushed/cancelled/recalled.

-- =============================================================
-- 1. rpc_rush_timer — finisher: applies effect instantly + cancels event
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_rush_timer(
  p_user_id uuid,
  p_planet_id uuid,
  p_timer_id text,
  p_timer_type text
) RETURNS json AS $$
DECLARE
  v_timer record;
  v_now bigint;
  v_remaining_seconds double precision;
  v_solar_cost integer;
  v_current_solar double precision;
  v_new_solar double precision;
  v_idempotency_key text;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  SELECT solar INTO v_current_solar
  FROM players WHERE user_id = p_user_id FOR UPDATE;

  SELECT id, target_id, target_level, end_time INTO v_timer
  FROM active_timers
  WHERE user_id = p_user_id AND target_id = p_timer_id AND timer_type = p_timer_type
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Timer not found');
  END IF;

  v_remaining_seconds := GREATEST(0, CEIL((v_timer.end_time - v_now) / 1000.0));
  v_solar_cost := calc_solar_cost(v_remaining_seconds);

  IF v_current_solar < v_solar_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient Solar');
  END IF;

  v_new_solar := v_current_solar - v_solar_cost;

  DELETE FROM active_timers WHERE id = v_timer.id;

  IF p_timer_type = 'building' THEN
    INSERT INTO planet_buildings (planet_id, building_id, level)
    VALUES (p_planet_id, p_timer_id, v_timer.target_level)
    ON CONFLICT (planet_id, building_id) DO UPDATE SET level = v_timer.target_level;

    v_idempotency_key := 'building:' || p_planet_id::text || ':' || p_timer_id;
  ELSIF p_timer_type = 'research' THEN
    INSERT INTO player_research (user_id, research_id, level)
    VALUES (p_user_id, p_timer_id, v_timer.target_level)
    ON CONFLICT (user_id, research_id) DO UPDATE SET level = v_timer.target_level;

    v_idempotency_key := 'research:' || p_user_id::text || ':' || p_timer_id;
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    UPDATE events
    SET status = 'cancelled', cancelled_at = NOW(), locked_until = NULL, worker_id = NULL
    WHERE idempotency_key = v_idempotency_key
      AND status IN ('pending', 'processing');
  END IF;

  PERFORM set_solar_tx_context(
    'rush_' || p_timer_type,
    'rush_' || p_timer_id || '_lvl' || v_timer.target_level || '_cost' || v_solar_cost
  );

  UPDATE players SET solar = v_new_solar WHERE user_id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'solar', v_new_solar,
    'completedId', p_timer_id,
    'completedType', p_timer_type,
    'completedLevel', v_timer.target_level
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 2. rpc_cancel_timer — cancels timer + refunds resources + cancels event
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_cancel_timer(
  p_user_id uuid,
  p_planet_id uuid,
  p_timer_id text,
  p_timer_type text
) RETURNS json AS $$
DECLARE
  v_timer record;
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_energy double precision;
  v_current_level int;
  v_refund_fer double precision := 0;
  v_refund_silice double precision := 0;
  v_refund_xenogas double precision := 0;
  v_bdef record;
  v_rdef record;
  v_refund_rate double precision := 0.8;
  v_idempotency_key text;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  SELECT id, target_id, target_level INTO v_timer
  FROM active_timers
  WHERE user_id = p_user_id AND target_id = p_timer_id AND timer_type = p_timer_type
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Timer not found');
  END IF;

  v_current_level := v_timer.target_level - 1;

  IF p_timer_type = 'building' THEN
    SELECT * INTO v_bdef FROM building_defs WHERE building_id = p_timer_id;
    IF FOUND THEN
      v_refund_fer := FLOOR(v_bdef.base_cost_fer * POWER(v_bdef.cost_factor, v_current_level)) * v_refund_rate;
      v_refund_silice := FLOOR(v_bdef.base_cost_silice * POWER(v_bdef.cost_factor, v_current_level)) * v_refund_rate;
      v_refund_xenogas := FLOOR(v_bdef.base_cost_xenogas * POWER(v_bdef.cost_factor, v_current_level)) * v_refund_rate;
    END IF;
    v_idempotency_key := 'building:' || p_planet_id::text || ':' || p_timer_id;
  ELSIF p_timer_type = 'research' THEN
    SELECT * INTO v_rdef FROM research_defs WHERE research_id = p_timer_id;
    IF FOUND THEN
      v_refund_fer := FLOOR(v_rdef.base_cost_fer * POWER(v_rdef.cost_factor, v_current_level)) * v_refund_rate;
      v_refund_silice := FLOOR(v_rdef.base_cost_silice * POWER(v_rdef.cost_factor, v_current_level)) * v_refund_rate;
      v_refund_xenogas := FLOOR(v_rdef.base_cost_xenogas * POWER(v_rdef.cost_factor, v_current_level)) * v_refund_rate;
    END IF;
    v_idempotency_key := 'research:' || p_user_id::text || ':' || p_timer_id;
  END IF;

  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  SELECT last_update INTO v_last_update FROM planets WHERE id = p_planet_id;

  SELECT mat_fer, mat_silice, mat_xenogas, mat_energy
  INTO v_fer, v_silice, v_xenogas, v_energy
  FROM safe_materialize_inline(
    p_planet_id, p_user_id,
    COALESCE(v_res.fer, 0), COALESCE(v_res.silice, 0), COALESCE(v_res.xenogas, 0),
    v_last_update, v_now
  );

  v_fer := v_fer + v_refund_fer;
  v_silice := v_silice + v_refund_silice;
  v_xenogas := v_xenogas + v_refund_xenogas;

  DELETE FROM active_timers WHERE id = v_timer.id;

  IF v_idempotency_key IS NOT NULL THEN
    UPDATE events
    SET status = 'cancelled', cancelled_at = NOW(), locked_until = NULL, worker_id = NULL
    WHERE idempotency_key = v_idempotency_key
      AND status IN ('pending', 'processing');
  END IF;

  PERFORM set_resource_tx_context('cancel_timer', p_timer_id || ':' || p_timer_type);

  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = v_energy
  WHERE planet_id = p_planet_id;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', v_energy)
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 3. rpc_recall_fleet — cancels fleet_arrival event (pending OR processing)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_recall_fleet(
  p_user_id uuid,
  p_mission_id uuid
) RETURNS json AS $fn$
DECLARE
  v_mission record;
  v_now bigint;
  v_elapsed bigint;
  v_total_travel bigint;
  v_return_duration bigint;
  v_new_return_time bigint;
  v_idempotency_key text;
  v_sender_planet_id uuid;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  SELECT * INTO v_mission
  FROM fleet_missions
  WHERE id = p_mission_id
    AND sender_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Mission introuvable');
  END IF;

  IF v_mission.mission_phase NOT IN ('en_route', 'arrived') THEN
    RETURN json_build_object('success', false, 'error', 'Mission non rappelable (phase: ' || v_mission.mission_phase || ')');
  END IF;

  IF v_mission.mission_type = 'attack' AND v_mission.mission_phase = 'arrived' THEN
    RETURN json_build_object('success', false, 'error', 'Impossible de rappeler une attaque en cours');
  END IF;

  v_total_travel := v_mission.arrival_time - v_mission.departure_time;

  IF v_mission.mission_phase = 'en_route' THEN
    v_elapsed := GREATEST(0, v_now - v_mission.departure_time);
    v_return_duration := v_elapsed;
  ELSE
    v_return_duration := v_total_travel;
  END IF;

  v_return_duration := GREATEST(v_return_duration, 1000);
  v_new_return_time := v_now + v_return_duration;

  UPDATE fleet_missions
  SET mission_phase = 'returning',
      status = 'returning',
      return_time = v_new_return_time,
      arrival_time = LEAST(arrival_time, v_now)
  WHERE id = p_mission_id;

  v_idempotency_key := 'fleet_arrival:' || p_mission_id::text;
  UPDATE events
  SET status = 'cancelled', cancelled_at = NOW(), locked_until = NULL, worker_id = NULL
  WHERE idempotency_key = v_idempotency_key
    AND status IN ('pending', 'processing');

  v_idempotency_key := 'fleet_return:' || p_mission_id::text;

  SELECT id INTO v_sender_planet_id
  FROM planets
  WHERE user_id = p_user_id
    AND coordinates = v_mission.sender_coords
  LIMIT 1;

  INSERT INTO events (
    event_type, entity_type, entity_id, payload, execute_at,
    idempotency_key, priority, version, status
  ) VALUES (
    'fleet_return',
    'planet',
    COALESCE(v_sender_planet_id, p_mission_id),
    jsonb_build_object('mission_id', p_mission_id),
    to_timestamp(v_new_return_time / 1000.0),
    v_idempotency_key,
    20,
    2,
    'pending'
  )
  ON CONFLICT (idempotency_key) WHERE status IN ('pending', 'processing')
  DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'return_time', v_new_return_time,
    'return_duration_sec', CEIL(v_return_duration / 1000.0)
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
