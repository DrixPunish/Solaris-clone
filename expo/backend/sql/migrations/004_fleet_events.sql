-- =============================================================
-- MIGRATION 004: Fleet events (fleet_arrival + fleet_return)
-- =============================================================
-- rpc_send_fleet now schedules a fleet_arrival event.
-- rpc_recall_fleet now cancels fleet_arrival + schedules fleet_return.
-- Both the world tick AND event worker process fleets (idempotent).
-- =============================================================

-- =============================================================
-- 1. rpc_send_fleet V3 (schedules fleet_arrival event)
-- =============================================================
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision, jsonb, jsonb, uuid, text, uuid);
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision, jsonb, jsonb, uuid, text, uuid, double precision);
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision, jsonb, jsonb, uuid, text, uuid, double precision, text, text, text, text);

CREATE OR REPLACE FUNCTION rpc_send_fleet(
  p_planet_id uuid,
  p_ships jsonb,
  p_cargo_fer double precision DEFAULT 0,
  p_cargo_silice double precision DEFAULT 0,
  p_cargo_xenogas double precision DEFAULT 0,
  p_sender_coords jsonb DEFAULT NULL,
  p_target_coords jsonb DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_mission_type text DEFAULT NULL,
  p_target_player_id uuid DEFAULT NULL,
  p_speed_percent double precision DEFAULT 1.0,
  p_sender_username text DEFAULT '',
  p_sender_planet text DEFAULT '',
  p_target_username text DEFAULT NULL,
  p_target_planet text DEFAULT NULL
) RETURNS json AS $fn$
DECLARE
  v_key text;
  v_val jsonb;
  v_ship_qty integer;
  v_current_qty integer;
  v_res record;
  v_now bigint;
  v_flight_result json;
  v_flight_time_sec int;
  v_fuel_cost double precision := 0;
  v_total_xenogas_needed double precision;
  v_attacker_pts double precision;
  v_defender_pts double precision;
  v_defender_shield record;
  v_attacker_shield_result json;
  v_active_fleets integer;
  v_fleet_limit integer;
  v_computer_level integer;
  v_departure_time bigint;
  v_arrival_time bigint;
  v_return_time bigint;
  v_is_station boolean;
  v_mission_id uuid;
  v_cargo jsonb;
  v_execute_at timestamptz;
  v_idempotency_key text;
  v_target_planet_id uuid;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF p_user_id IS NOT NULL THEN
    IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
      RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
    END IF;
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_active_fleets
    FROM fleet_missions
    WHERE sender_id = p_user_id
      AND mission_phase IN ('en_route', 'arrived', 'returning');

    SELECT COALESCE((
      SELECT level FROM player_research
      WHERE user_id = p_user_id AND research_id = 'computerTech'
    ), 0) INTO v_computer_level;
    v_fleet_limit := 1 + v_computer_level;

    IF v_active_fleets >= v_fleet_limit THEN
      RETURN json_build_object('success', false, 'error',
        'Limite de flottes atteinte (' || v_active_fleets || '/' || v_fleet_limit || '). Recherchez IA Strategique pour +1 flotte.');
    END IF;
  END IF;

  IF p_mission_type = 'attack' AND p_user_id IS NOT NULL AND p_target_player_id IS NOT NULL THEN
    v_attacker_shield_result := reduce_quantum_shield_on_attack(p_user_id);

    SELECT * INTO v_defender_shield
    FROM refresh_quantum_shield_state(p_target_player_id);

    IF v_defender_shield.shield_active = true THEN
      RETURN json_build_object('success', false, 'error',
        'Bouclier quantique actif: le defenseur est protege par un bouclier quantique.');
    END IF;

    SELECT COALESCE(total_points, 0) INTO v_attacker_pts
    FROM player_scores WHERE player_id = p_user_id;
    IF NOT FOUND THEN v_attacker_pts := 0; END IF;

    SELECT COALESCE(total_points, 0) INTO v_defender_pts
    FROM player_scores WHERE player_id = p_target_player_id;
    IF NOT FOUND THEN v_defender_pts := 0; END IF;

    IF v_attacker_pts < 100 THEN
      RETURN json_build_object('success', false, 'error',
        'Noob shield: vous devez avoir au moins 100 points pour attaquer (actuel: ' || FLOOR(v_attacker_pts) || ')');
    END IF;

    IF v_defender_pts < 100 THEN
      RETURN json_build_object('success', false, 'error',
        'Noob shield: le defenseur est protege (moins de 100 points)');
    END IF;

    IF v_defender_pts <= v_attacker_pts * 0.5 THEN
      RETURN json_build_object('success', false, 'error',
        'Ecart trop grand: le defenseur (' || FLOOR(v_defender_pts) || ' pts) a moins de 50% de vos points (' || FLOOR(v_attacker_pts) || ' pts)');
    END IF;
  END IF;

  IF p_sender_coords IS NOT NULL AND p_target_coords IS NOT NULL AND p_user_id IS NOT NULL THEN
    v_flight_result := rpc_calculate_flight_time(p_sender_coords, p_target_coords, p_ships, p_user_id, p_speed_percent);
    IF NOT (v_flight_result->>'success')::boolean THEN
      RETURN json_build_object('success', false, 'error', v_flight_result->>'error');
    END IF;
    v_flight_time_sec := (v_flight_result->>'flight_time_sec')::int;
    v_fuel_cost := COALESCE((v_flight_result->>'fuel_cost')::double precision, 0);
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_ships)
  LOOP
    v_ship_qty := (v_val::text)::integer;
    IF v_ship_qty <= 0 THEN CONTINUE; END IF;

    SELECT quantity INTO v_current_qty
    FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_id = v_key
    FOR UPDATE;

    IF v_current_qty IS NULL OR v_current_qty < v_ship_qty THEN
      RETURN json_build_object('success', false, 'error', 'Vaisseaux insuffisants: ' || v_key);
    END IF;

    UPDATE planet_ships
    SET quantity = quantity - v_ship_qty
    WHERE planet_id = p_planet_id AND ship_id = v_key;
  END LOOP;

  v_total_xenogas_needed := p_cargo_xenogas + v_fuel_cost;

  PERFORM set_resource_tx_context('fleet_send', 'cargo_and_fuel_deduction');

  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources
  WHERE planet_id = p_planet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  IF v_res.fer < p_cargo_fer THEN
    RETURN json_build_object('success', false, 'error', 'Fer insuffisant pour le cargo');
  END IF;
  IF v_res.silice < p_cargo_silice THEN
    RETURN json_build_object('success', false, 'error', 'Silice insuffisante pour le cargo');
  END IF;
  IF v_res.xenogas < v_total_xenogas_needed THEN
    RETURN json_build_object('success', false, 'error', 'Xenogas insuffisant (cargo + carburant: ' || CEIL(v_total_xenogas_needed) || ')');
  END IF;

  UPDATE planet_resources
  SET fer = GREATEST(0, v_res.fer - p_cargo_fer),
      silice = GREATEST(0, v_res.silice - p_cargo_silice),
      xenogas = GREATEST(0, v_res.xenogas - v_total_xenogas_needed)
  WHERE planet_id = p_planet_id;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  v_departure_time := v_now;
  IF v_flight_time_sec IS NOT NULL THEN
    v_arrival_time := v_now + (v_flight_time_sec::bigint * 1000);
    v_is_station := (p_mission_type = 'station');
    IF v_is_station THEN
      v_return_time := NULL;
    ELSE
      v_return_time := v_now + (v_flight_time_sec::bigint * 2000);
    END IF;
  ELSE
    v_arrival_time := v_now + 30000;
    v_return_time := v_now + 60000;
    v_flight_time_sec := 30;
  END IF;

  v_cargo := json_build_object('fer', p_cargo_fer, 'silice', p_cargo_silice, 'xenogas', p_cargo_xenogas)::jsonb;

  INSERT INTO fleet_missions (
    sender_id, sender_username, sender_planet, sender_coords,
    target_coords, target_player_id, target_username, target_planet,
    mission_type, ships, resources,
    departure_time, arrival_time, return_time,
    status, processed, mission_phase, fuel_consumed
  ) VALUES (
    p_user_id, p_sender_username, p_sender_planet, p_sender_coords,
    p_target_coords, p_target_player_id, p_target_username, p_target_planet,
    p_mission_type, p_ships, v_cargo,
    v_departure_time, v_arrival_time, v_return_time,
    'en_route', false, 'en_route', CEIL(v_fuel_cost)
  )
  RETURNING id INTO v_mission_id;

  -- Schedule fleet_arrival event
  v_execute_at := to_timestamp(v_arrival_time / 1000.0);
  v_idempotency_key := 'fleet_arrival:' || v_mission_id::text;

  -- Resolve target planet id for entity_id (best effort)
  IF p_target_coords IS NOT NULL THEN
    SELECT id INTO v_target_planet_id
    FROM planets
    WHERE coordinates->>0 = (p_target_coords->>0)
      AND coordinates->>1 = (p_target_coords->>1)
      AND coordinates->>2 = (p_target_coords->>2)
    LIMIT 1;
  END IF;

  INSERT INTO events (
    event_type, entity_type, entity_id, payload, execute_at,
    idempotency_key, priority, version, status
  ) VALUES (
    'fleet_arrival',
    'planet',
    COALESCE(v_target_planet_id, p_planet_id),
    jsonb_build_object('mission_id', v_mission_id),
    v_execute_at,
    v_idempotency_key,
    20,
    2,
    'pending'
  )
  ON CONFLICT (idempotency_key) WHERE status IN ('pending', 'processing')
  DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'mission_id', v_mission_id,
    'flight_time_sec', v_flight_time_sec,
    'departure_time', v_departure_time,
    'arrival_time', v_arrival_time,
    'return_time', v_return_time,
    'fuel_consumed', CEIL(v_fuel_cost)
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 2. rpc_recall_fleet V2 (cancels fleet_arrival + schedules fleet_return)
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

  -- Cancel fleet_arrival event
  v_idempotency_key := 'fleet_arrival:' || p_mission_id::text;
  UPDATE events
  SET status = 'cancelled', cancelled_at = NOW(), locked_until = NULL, worker_id = NULL
  WHERE idempotency_key = v_idempotency_key
    AND status IN ('pending');

  -- Schedule fleet_return event
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
