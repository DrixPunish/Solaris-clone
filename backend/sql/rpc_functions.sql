-- =============================================================
-- ATOMIC RPC FUNCTIONS FOR SOLARIS GAME ACTIONS
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- =============================================================

-- Helper: solar cost calculation (same as TypeScript: Math.max(1, Math.ceil(remainingSeconds / 30)))
CREATE OR REPLACE FUNCTION calc_solar_cost(remaining_seconds double precision)
RETURNS integer AS $$
BEGIN
  IF remaining_seconds <= 0 THEN RETURN 0; END IF;
  RETURN GREATEST(1, CEIL(remaining_seconds / 30.0))::integer;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION assert_planet_owner(
  p_user_id uuid,
  p_planet_id uuid
) RETURNS boolean AS $$
DECLARE
  v_planet_owner uuid;
BEGIN
  SELECT user_id INTO v_planet_owner
  FROM planets
  WHERE id = p_planet_id
  FOR UPDATE;

  RETURN FOUND AND v_planet_owner = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_timers_unique_owner_target_type
ON active_timers (
  user_id,
  COALESCE(planet_id, '00000000-0000-0000-0000-000000000000'::uuid),
  target_id,
  timer_type
);

CREATE INDEX IF NOT EXISTS idx_planets_user_id ON planets(user_id);
CREATE INDEX IF NOT EXISTS idx_planet_resources_planet_id ON planet_resources(planet_id);
CREATE INDEX IF NOT EXISTS idx_planet_buildings_planet_building ON planet_buildings(planet_id, building_id);
CREATE INDEX IF NOT EXISTS idx_player_research_user_research ON player_research(user_id, research_id);
CREATE INDEX IF NOT EXISTS idx_active_timers_user_end_time ON active_timers(user_id, end_time);
CREATE INDEX IF NOT EXISTS idx_active_timers_planet_end_time ON active_timers(planet_id, end_time);
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_planet_id ON shipyard_queue(planet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_sender_id ON fleet_missions(sender_id);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_target_player_id ON fleet_missions(target_player_id);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_status_arrival_time ON fleet_missions(status, arrival_time);
CREATE INDEX IF NOT EXISTS idx_espionage_reports_player_id ON espionage_reports(player_id);
CREATE INDEX IF NOT EXISTS idx_combat_reports_attacker_id ON combat_reports(attacker_id);
CREATE INDEX IF NOT EXISTS idx_combat_reports_defender_id ON combat_reports(defender_id);
CREATE INDEX IF NOT EXISTS idx_transport_reports_player_id ON transport_reports(player_id);
CREATE INDEX IF NOT EXISTS idx_planets_coordinates_gin ON planets USING gin (coordinates);

-- =============================================================
-- 1. BUILD STRUCTURE (building upgrade)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_build_structure(
  p_user_id uuid,
  p_planet_id uuid,
  p_building_id text,
  p_target_level integer,
  p_cost_fer double precision,
  p_cost_silice double precision,
  p_cost_xenogas double precision,
  p_duration_ms bigint,
  p_prod_fer_h double precision,
  p_prod_silice_h double precision,
  p_prod_xenogas_h double precision,
  p_storage_fer double precision,
  p_storage_silice double precision,
  p_storage_xenogas double precision,
  p_energy double precision
) RETURNS json AS $$
DECLARE
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_elapsed double precision;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_already boolean;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  -- Lock planet_resources row
  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources
  WHERE planet_id = p_planet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  -- Get last_update with lock
  SELECT last_update INTO v_last_update
  FROM planets
  WHERE id = p_planet_id
  FOR UPDATE;

  -- Recalculate resources based on elapsed time
  v_elapsed := GREATEST(0, (v_now - COALESCE(v_last_update, v_now)) / 1000.0);
  v_fer := CASE WHEN v_res.fer >= p_storage_fer THEN v_res.fer
           ELSE LEAST(v_res.fer + (p_prod_fer_h / 3600.0) * v_elapsed, p_storage_fer) END;
  v_silice := CASE WHEN v_res.silice >= p_storage_silice THEN v_res.silice
              ELSE LEAST(v_res.silice + (p_prod_silice_h / 3600.0) * v_elapsed, p_storage_silice) END;
  v_xenogas := CASE WHEN v_res.xenogas >= p_storage_xenogas THEN v_res.xenogas
               ELSE LEAST(v_res.xenogas + (p_prod_xenogas_h / 3600.0) * v_elapsed, p_storage_xenogas) END;

  -- Check no duplicate timer (with row lock to prevent race conditions)
  PERFORM 1 FROM active_timers
    WHERE user_id = p_user_id AND target_id = p_building_id AND timer_type = 'building'
      AND planet_id = p_planet_id
    FOR UPDATE;
  v_already := FOUND;

  IF v_already THEN
    RETURN json_build_object('success', false, 'error', 'Already upgrading');
  END IF;

  -- Check resources
  IF v_fer < p_cost_fer OR v_silice < p_cost_silice OR v_xenogas < p_cost_xenogas THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  -- Deduct resources
  v_fer := v_fer - p_cost_fer;
  v_silice := v_silice - p_cost_silice;
  v_xenogas := v_xenogas - p_cost_xenogas;

  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = p_energy
  WHERE planet_id = p_planet_id;

  -- Create timer
  INSERT INTO active_timers (user_id, planet_id, timer_type, target_id, target_level, start_time, end_time)
  VALUES (p_user_id, p_planet_id, 'building', p_building_id, p_target_level, v_now, v_now + p_duration_ms);

  -- Update last_update
  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', p_energy),
    'timer', json_build_object('id', p_building_id, 'type', 'building', 'targetLevel', p_target_level, 'startTime', v_now, 'endTime', v_now + p_duration_ms)
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 2. START RESEARCH
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_start_research(
  p_user_id uuid,
  p_planet_id uuid,
  p_research_id text,
  p_target_level integer,
  p_cost_fer double precision,
  p_cost_silice double precision,
  p_cost_xenogas double precision,
  p_duration_ms bigint,
  p_prod_fer_h double precision,
  p_prod_silice_h double precision,
  p_prod_xenogas_h double precision,
  p_storage_fer double precision,
  p_storage_silice double precision,
  p_storage_xenogas double precision,
  p_energy double precision
) RETURNS json AS $$
DECLARE
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_elapsed double precision;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_already boolean;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources
  WHERE planet_id = p_planet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  SELECT last_update INTO v_last_update
  FROM planets WHERE id = p_planet_id FOR UPDATE;

  v_elapsed := GREATEST(0, (v_now - COALESCE(v_last_update, v_now)) / 1000.0);
  v_fer := CASE WHEN v_res.fer >= p_storage_fer THEN v_res.fer
           ELSE LEAST(v_res.fer + (p_prod_fer_h / 3600.0) * v_elapsed, p_storage_fer) END;
  v_silice := CASE WHEN v_res.silice >= p_storage_silice THEN v_res.silice
              ELSE LEAST(v_res.silice + (p_prod_silice_h / 3600.0) * v_elapsed, p_storage_silice) END;
  v_xenogas := CASE WHEN v_res.xenogas >= p_storage_xenogas THEN v_res.xenogas
               ELSE LEAST(v_res.xenogas + (p_prod_xenogas_h / 3600.0) * v_elapsed, p_storage_xenogas) END;

  -- Check no duplicate research timer (global, not per planet, with row lock)
  PERFORM 1 FROM active_timers
    WHERE user_id = p_user_id AND target_id = p_research_id AND timer_type = 'research'
    FOR UPDATE;
  v_already := FOUND;

  IF v_already THEN
    RETURN json_build_object('success', false, 'error', 'Already researching');
  END IF;

  IF v_fer < p_cost_fer OR v_silice < p_cost_silice OR v_xenogas < p_cost_xenogas THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_fer := v_fer - p_cost_fer;
  v_silice := v_silice - p_cost_silice;
  v_xenogas := v_xenogas - p_cost_xenogas;

  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = p_energy
  WHERE planet_id = p_planet_id;

  -- Research timers have planet_id = NULL (global)
  INSERT INTO active_timers (user_id, planet_id, timer_type, target_id, target_level, start_time, end_time)
  VALUES (p_user_id, NULL, 'research', p_research_id, p_target_level, v_now, v_now + p_duration_ms);

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', p_energy),
    'timer', json_build_object('id', p_research_id, 'type', 'research', 'targetLevel', p_target_level, 'startTime', v_now, 'endTime', v_now + p_duration_ms)
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 3. BUILD SHIPS
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_build_ships(
  p_user_id uuid,
  p_planet_id uuid,
  p_ship_id text,
  p_quantity integer,
  p_cost_fer double precision,
  p_cost_silice double precision,
  p_cost_xenogas double precision,
  p_build_time_per_unit double precision,
  p_prod_fer_h double precision,
  p_prod_silice_h double precision,
  p_prod_xenogas_h double precision,
  p_storage_fer double precision,
  p_storage_silice double precision,
  p_storage_xenogas double precision,
  p_energy double precision
) RETURNS json AS $$
DECLARE
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_elapsed double precision;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_existing record;
  v_new_total integer;
  v_new_remaining integer;
  v_start_time bigint;
  v_end_time bigint;
  v_btp double precision;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  SELECT last_update INTO v_last_update FROM planets WHERE id = p_planet_id FOR UPDATE;

  v_elapsed := GREATEST(0, (v_now - COALESCE(v_last_update, v_now)) / 1000.0);
  v_fer := CASE WHEN v_res.fer >= p_storage_fer THEN v_res.fer
           ELSE LEAST(v_res.fer + (p_prod_fer_h / 3600.0) * v_elapsed, p_storage_fer) END;
  v_silice := CASE WHEN v_res.silice >= p_storage_silice THEN v_res.silice
              ELSE LEAST(v_res.silice + (p_prod_silice_h / 3600.0) * v_elapsed, p_storage_silice) END;
  v_xenogas := CASE WHEN v_res.xenogas >= p_storage_xenogas THEN v_res.xenogas
               ELSE LEAST(v_res.xenogas + (p_prod_xenogas_h / 3600.0) * v_elapsed, p_storage_xenogas) END;

  IF v_fer < p_cost_fer OR v_silice < p_cost_silice OR v_xenogas < p_cost_xenogas THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_fer := v_fer - p_cost_fer;
  v_silice := v_silice - p_cost_silice;
  v_xenogas := v_xenogas - p_cost_xenogas;

  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = p_energy
  WHERE planet_id = p_planet_id;

  -- Check existing queue item
  SELECT total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time
  INTO v_existing
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_ship_id AND item_type = 'ship'
  FOR UPDATE;

  IF FOUND THEN
    v_new_total := v_existing.total_quantity + p_quantity;
    v_new_remaining := v_existing.remaining_quantity + p_quantity;
    UPDATE shipyard_queue
    SET total_quantity = v_new_total, remaining_quantity = v_new_remaining
    WHERE planet_id = p_planet_id AND item_id = p_ship_id AND item_type = 'ship';

    v_btp := v_existing.build_time_per_unit;
    v_start_time := v_existing.current_unit_start_time;
    v_end_time := v_existing.current_unit_end_time;
  ELSE
    v_new_total := p_quantity;
    v_new_remaining := p_quantity;
    v_btp := p_build_time_per_unit;
    v_start_time := v_now;
    v_end_time := v_now + (p_build_time_per_unit * 1000)::bigint;

    INSERT INTO shipyard_queue (planet_id, item_id, item_type, total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time)
    VALUES (p_planet_id, p_ship_id, 'ship', v_new_total, v_new_remaining, p_build_time_per_unit, v_start_time, v_end_time);
  END IF;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', p_energy),
    'queueItem', json_build_object(
      'id', p_ship_id, 'type', 'ship',
      'totalQuantity', v_new_total, 'remainingQuantity', v_new_remaining,
      'buildTimePerUnit', v_btp,
      'currentUnitStartTime', v_start_time, 'currentUnitEndTime', v_end_time
    )
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 4. BUILD DEFENSES
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_build_defenses(
  p_user_id uuid,
  p_planet_id uuid,
  p_defense_id text,
  p_quantity integer,
  p_cost_fer double precision,
  p_cost_silice double precision,
  p_cost_xenogas double precision,
  p_build_time_per_unit double precision,
  p_prod_fer_h double precision,
  p_prod_silice_h double precision,
  p_prod_xenogas_h double precision,
  p_storage_fer double precision,
  p_storage_silice double precision,
  p_storage_xenogas double precision,
  p_energy double precision
) RETURNS json AS $$
DECLARE
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_elapsed double precision;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_existing record;
  v_new_total integer;
  v_new_remaining integer;
  v_start_time bigint;
  v_end_time bigint;
  v_btp double precision;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  SELECT last_update INTO v_last_update FROM planets WHERE id = p_planet_id FOR UPDATE;

  v_elapsed := GREATEST(0, (v_now - COALESCE(v_last_update, v_now)) / 1000.0);
  v_fer := CASE WHEN v_res.fer >= p_storage_fer THEN v_res.fer
           ELSE LEAST(v_res.fer + (p_prod_fer_h / 3600.0) * v_elapsed, p_storage_fer) END;
  v_silice := CASE WHEN v_res.silice >= p_storage_silice THEN v_res.silice
              ELSE LEAST(v_res.silice + (p_prod_silice_h / 3600.0) * v_elapsed, p_storage_silice) END;
  v_xenogas := CASE WHEN v_res.xenogas >= p_storage_xenogas THEN v_res.xenogas
               ELSE LEAST(v_res.xenogas + (p_prod_xenogas_h / 3600.0) * v_elapsed, p_storage_xenogas) END;

  IF v_fer < p_cost_fer OR v_silice < p_cost_silice OR v_xenogas < p_cost_xenogas THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_fer := v_fer - p_cost_fer;
  v_silice := v_silice - p_cost_silice;
  v_xenogas := v_xenogas - p_cost_xenogas;

  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = p_energy
  WHERE planet_id = p_planet_id;

  SELECT total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time
  INTO v_existing
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_defense_id AND item_type = 'defense'
  FOR UPDATE;

  IF FOUND THEN
    v_new_total := v_existing.total_quantity + p_quantity;
    v_new_remaining := v_existing.remaining_quantity + p_quantity;
    UPDATE shipyard_queue
    SET total_quantity = v_new_total, remaining_quantity = v_new_remaining
    WHERE planet_id = p_planet_id AND item_id = p_defense_id AND item_type = 'defense';

    v_btp := v_existing.build_time_per_unit;
    v_start_time := v_existing.current_unit_start_time;
    v_end_time := v_existing.current_unit_end_time;
  ELSE
    v_new_total := p_quantity;
    v_new_remaining := p_quantity;
    v_btp := p_build_time_per_unit;
    v_start_time := v_now;
    v_end_time := v_now + (p_build_time_per_unit * 1000)::bigint;

    INSERT INTO shipyard_queue (planet_id, item_id, item_type, total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time)
    VALUES (p_planet_id, p_defense_id, 'defense', v_new_total, v_new_remaining, p_build_time_per_unit, v_start_time, v_end_time);
  END IF;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', p_energy),
    'queueItem', json_build_object(
      'id', p_defense_id, 'type', 'defense',
      'totalQuantity', v_new_total, 'remainingQuantity', v_new_remaining,
      'buildTimePerUnit', v_btp,
      'currentUnitStartTime', v_start_time, 'currentUnitEndTime', v_end_time
    )
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 5. RUSH TIMER (building or research)
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
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  -- Lock player row for solar
  SELECT solar INTO v_current_solar
  FROM players WHERE user_id = p_user_id FOR UPDATE;

  -- Find timer
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

  -- Delete timer
  DELETE FROM active_timers WHERE id = v_timer.id;

  -- Apply completion
  IF p_timer_type = 'building' THEN
    INSERT INTO planet_buildings (planet_id, building_id, level)
    VALUES (p_planet_id, p_timer_id, v_timer.target_level)
    ON CONFLICT (planet_id, building_id) DO UPDATE SET level = v_timer.target_level;
  ELSIF p_timer_type = 'research' THEN
    INSERT INTO player_research (user_id, research_id, level)
    VALUES (p_user_id, p_timer_id, v_timer.target_level)
    ON CONFLICT (user_id, research_id) DO UPDATE SET level = v_timer.target_level;
  END IF;

  -- Deduct solar
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
-- 6. CANCEL TIMER (building or research) with 80% refund
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_cancel_timer(
  p_user_id uuid,
  p_planet_id uuid,
  p_timer_id text,
  p_timer_type text,
  p_refund_fer double precision,
  p_refund_silice double precision,
  p_refund_xenogas double precision,
  p_prod_fer_h double precision,
  p_prod_silice_h double precision,
  p_prod_xenogas_h double precision,
  p_storage_fer double precision,
  p_storage_silice double precision,
  p_storage_xenogas double precision,
  p_energy double precision
) RETURNS json AS $$
DECLARE
  v_timer record;
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_elapsed double precision;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  -- Find timer
  SELECT id, target_id, target_level INTO v_timer
  FROM active_timers
  WHERE user_id = p_user_id AND target_id = p_timer_id AND timer_type = p_timer_type
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Timer not found');
  END IF;

  -- Lock resources
  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  SELECT last_update INTO v_last_update FROM planets WHERE id = p_planet_id FOR UPDATE;

  -- Recalc resources
  v_elapsed := GREATEST(0, (v_now - COALESCE(v_last_update, v_now)) / 1000.0);
  v_fer := CASE WHEN v_res.fer >= p_storage_fer THEN v_res.fer
           ELSE LEAST(v_res.fer + (p_prod_fer_h / 3600.0) * v_elapsed, p_storage_fer) END;
  v_silice := CASE WHEN v_res.silice >= p_storage_silice THEN v_res.silice
              ELSE LEAST(v_res.silice + (p_prod_silice_h / 3600.0) * v_elapsed, p_storage_silice) END;
  v_xenogas := CASE WHEN v_res.xenogas >= p_storage_xenogas THEN v_res.xenogas
               ELSE LEAST(v_res.xenogas + (p_prod_xenogas_h / 3600.0) * v_elapsed, p_storage_xenogas) END;

  -- Add refund (already calculated at 80% by caller)
  v_fer := v_fer + p_refund_fer;
  v_silice := v_silice + p_refund_silice;
  v_xenogas := v_xenogas + p_refund_xenogas;

  -- Delete timer
  DELETE FROM active_timers WHERE id = v_timer.id;

  -- Update resources
  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = p_energy
  WHERE planet_id = p_planet_id;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', p_energy)
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 7. RUSH SHIPYARD (complete all remaining units instantly)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_rush_shipyard(
  p_user_id uuid,
  p_planet_id uuid,
  p_item_id text,
  p_item_type text
) RETURNS json AS $$
DECLARE
  v_queue record;
  v_now bigint;
  v_current_remaining double precision;
  v_future_time double precision;
  v_total_remaining double precision;
  v_solar_cost integer;
  v_current_solar double precision;
  v_new_solar double precision;
  v_completed_qty integer;
  v_existing_qty integer;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  -- Lock player for solar
  SELECT solar INTO v_current_solar
  FROM players WHERE user_id = p_user_id FOR UPDATE;

  -- Find queue item
  SELECT remaining_quantity, build_time_per_unit, current_unit_end_time
  INTO v_queue
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_item_id AND item_type = p_item_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  v_current_remaining := GREATEST(0, CEIL((v_queue.current_unit_end_time - v_now) / 1000.0));
  v_future_time := (v_queue.remaining_quantity - 1) * v_queue.build_time_per_unit;
  v_total_remaining := v_current_remaining + v_future_time;
  v_solar_cost := calc_solar_cost(v_total_remaining);

  IF v_current_solar < v_solar_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient Solar');
  END IF;

  v_new_solar := v_current_solar - v_solar_cost;
  v_completed_qty := v_queue.remaining_quantity;

  -- Delete queue item
  DELETE FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_item_id AND item_type = p_item_type;

  -- Add completed units
  IF p_item_type = 'ship' THEN
    SELECT COALESCE(quantity, 0) INTO v_existing_qty
    FROM planet_ships WHERE planet_id = p_planet_id AND ship_id = p_item_id;

    IF v_existing_qty IS NULL THEN
      INSERT INTO planet_ships (planet_id, ship_id, quantity) VALUES (p_planet_id, p_item_id, v_completed_qty);
    ELSE
      UPDATE planet_ships SET quantity = v_existing_qty + v_completed_qty
      WHERE planet_id = p_planet_id AND ship_id = p_item_id;
    END IF;
  ELSE
    SELECT COALESCE(quantity, 0) INTO v_existing_qty
    FROM planet_defenses WHERE planet_id = p_planet_id AND defense_id = p_item_id;

    IF v_existing_qty IS NULL THEN
      INSERT INTO planet_defenses (planet_id, defense_id, quantity) VALUES (p_planet_id, p_item_id, v_completed_qty);
    ELSE
      UPDATE planet_defenses SET quantity = v_existing_qty + v_completed_qty
      WHERE planet_id = p_planet_id AND defense_id = p_item_id;
    END IF;
  END IF;

  -- Deduct solar
  UPDATE players SET solar = v_new_solar WHERE user_id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'solar', v_new_solar,
    'completedId', p_item_id,
    'completedType', p_item_type,
    'completedQuantity', v_completed_qty
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 8. CANCEL SHIPYARD (with 80% refund)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_cancel_shipyard(
  p_user_id uuid,
  p_planet_id uuid,
  p_item_id text,
  p_item_type text,
  p_refund_fer double precision,
  p_refund_silice double precision,
  p_refund_xenogas double precision,
  p_prod_fer_h double precision,
  p_prod_silice_h double precision,
  p_prod_xenogas_h double precision,
  p_storage_fer double precision,
  p_storage_silice double precision,
  p_storage_xenogas double precision,
  p_energy double precision
) RETURNS json AS $$
DECLARE
  v_queue record;
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_elapsed double precision;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  -- Find queue item
  SELECT remaining_quantity, build_time_per_unit, current_unit_end_time
  INTO v_queue
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_item_id AND item_type = p_item_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  IF v_queue.remaining_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing to cancel');
  END IF;

  -- Lock resources
  SELECT fer, silice, xenogas INTO v_res
  FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  SELECT last_update INTO v_last_update FROM planets WHERE id = p_planet_id FOR UPDATE;

  -- Recalc resources
  v_elapsed := GREATEST(0, (v_now - COALESCE(v_last_update, v_now)) / 1000.0);
  v_fer := CASE WHEN v_res.fer >= p_storage_fer THEN v_res.fer
           ELSE LEAST(v_res.fer + (p_prod_fer_h / 3600.0) * v_elapsed, p_storage_fer) END;
  v_silice := CASE WHEN v_res.silice >= p_storage_silice THEN v_res.silice
              ELSE LEAST(v_res.silice + (p_prod_silice_h / 3600.0) * v_elapsed, p_storage_silice) END;
  v_xenogas := CASE WHEN v_res.xenogas >= p_storage_xenogas THEN v_res.xenogas
               ELSE LEAST(v_res.xenogas + (p_prod_xenogas_h / 3600.0) * v_elapsed, p_storage_xenogas) END;

  -- Add refund (already calculated by caller with refund rate applied)
  v_fer := v_fer + p_refund_fer;
  v_silice := v_silice + p_refund_silice;
  v_xenogas := v_xenogas + p_refund_xenogas;

  -- Delete queue item
  DELETE FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_item_id AND item_type = p_item_type;

  -- Update resources
  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = p_energy
  WHERE planet_id = p_planet_id;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', p_energy)
  );
END;
$$ LANGUAGE plpgsql;
