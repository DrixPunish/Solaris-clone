-- =============================================================
-- MIGRATION 004: Fix shipyard double events
-- =============================================================
-- Problem: rpc_build_ships/rpc_build_defenses created events with
-- key format 'shipyard:{planet}:{item_id}:{item_type}:0'
-- while actions.ts ensureEventForShipyardQueue created a second
-- event with key format 'shipyard:{planet}:{item_id}:0'
-- (or 'shipyard:{planet}:{item_id}:{item_id}:0' when queueItem.id
-- was incorrectly passed as queueId).
--
-- Fix: Remove event creation from SQL RPCs entirely.
-- actions.ts is now the single source of event scheduling for shipyard.
-- Also: cancel/rush shipyard now target 'processing' status too.
-- =============================================================

-- Step 1: Cancel orphaned duplicate shipyard events
-- Keep only the oldest pending/processing event per (planet, item_id, item_type)
WITH ranked AS (
  SELECT id,
         payload->>'planet_id' AS planet_id,
         payload->>'item_id' AS item_id,
         payload->>'item_type' AS item_type,
         ROW_NUMBER() OVER (
           PARTITION BY payload->>'planet_id', payload->>'item_id', payload->>'item_type'
           ORDER BY created_at ASC
         ) AS rn
  FROM events
  WHERE event_type = 'shipyard_unit_complete'
    AND status IN ('pending', 'processing')
)
UPDATE events
SET status = 'cancelled',
    cancelled_at = NOW(),
    locked_until = NULL,
    worker_id = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Recreate rpc_build_ships WITHOUT event INSERT
CREATE OR REPLACE FUNCTION rpc_build_ships(
  p_user_id uuid,
  p_planet_id uuid,
  p_ship_id text,
  p_quantity integer
) RETURNS json AS $$
DECLARE
  v_def record;
  v_cost_fer double precision;
  v_cost_silice double precision;
  v_cost_xenogas double precision;
  v_shipyard_level int;
  v_nanite int;
  v_build_time_per_unit double precision;
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_energy double precision;
  v_existing record;
  v_new_total integer;
  v_new_remaining integer;
  v_start_time bigint;
  v_end_time bigint;
  v_btp double precision;
  v_is_new_queue boolean;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  SELECT * INTO v_def FROM ship_defs WHERE ship_id = p_ship_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Unknown ship');
  END IF;

  v_cost_fer := v_def.cost_fer * p_quantity;
  v_cost_silice := v_def.cost_silice * p_quantity;
  v_cost_xenogas := v_def.cost_xenogas * p_quantity;

  v_shipyard_level := COALESCE((SELECT level FROM planet_buildings WHERE planet_id = p_planet_id AND building_id = 'shipyard'), 1);
  v_nanite := COALESCE((SELECT level FROM planet_buildings WHERE planet_id = p_planet_id AND building_id = 'naniteFactory'), 0);
  v_build_time_per_unit := GREATEST(5, FLOOR(v_def.build_time / (1.0 + (v_shipyard_level - 1) * 0.1) * (CASE WHEN v_nanite > 0 THEN 1.0 / POWER(2, v_nanite) ELSE 1.0 END)));

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

  IF v_fer < v_cost_fer OR v_silice < v_cost_silice OR v_xenogas < v_cost_xenogas THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_fer := v_fer - v_cost_fer;
  v_silice := v_silice - v_cost_silice;
  v_xenogas := v_xenogas - v_cost_xenogas;

  PERFORM set_resource_tx_context('build_ships', p_ship_id || 'x' || p_quantity);

  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = v_energy
  WHERE planet_id = p_planet_id;

  SELECT total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time
  INTO v_existing
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_ship_id AND item_type = 'ship'
  FOR UPDATE;

  v_is_new_queue := NOT FOUND;

  IF NOT v_is_new_queue THEN
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
    v_btp := v_build_time_per_unit;
    v_start_time := v_now;
    v_end_time := v_now + (v_build_time_per_unit * 1000)::bigint;

    INSERT INTO shipyard_queue (planet_id, item_id, item_type, total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time)
    VALUES (p_planet_id, p_ship_id, 'ship', v_new_total, v_new_remaining, v_build_time_per_unit, v_start_time, v_end_time);
  END IF;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', v_energy),
    'queueItem', json_build_object(
      'id', p_ship_id, 'type', 'ship',
      'totalQuantity', v_new_total, 'remainingQuantity', v_new_remaining,
      'buildTimePerUnit', v_btp,
      'currentUnitStartTime', v_start_time, 'currentUnitEndTime', v_end_time
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Step 3: Recreate rpc_build_defenses WITHOUT event INSERT
CREATE OR REPLACE FUNCTION rpc_build_defenses(
  p_user_id uuid,
  p_planet_id uuid,
  p_defense_id text,
  p_quantity integer
) RETURNS json AS $$
DECLARE
  v_def record;
  v_cost_fer double precision;
  v_cost_silice double precision;
  v_cost_xenogas double precision;
  v_shipyard_level int;
  v_nanite int;
  v_build_time_per_unit double precision;
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_energy double precision;
  v_existing record;
  v_new_total integer;
  v_new_remaining integer;
  v_start_time bigint;
  v_end_time bigint;
  v_btp double precision;
  v_is_new_queue boolean;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  SELECT * INTO v_def FROM defense_defs WHERE defense_id = p_defense_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Unknown defense');
  END IF;

  v_cost_fer := v_def.cost_fer * p_quantity;
  v_cost_silice := v_def.cost_silice * p_quantity;
  v_cost_xenogas := v_def.cost_xenogas * p_quantity;

  v_shipyard_level := COALESCE((SELECT level FROM planet_buildings WHERE planet_id = p_planet_id AND building_id = 'shipyard'), 1);
  v_nanite := COALESCE((SELECT level FROM planet_buildings WHERE planet_id = p_planet_id AND building_id = 'naniteFactory'), 0);
  v_build_time_per_unit := GREATEST(5, FLOOR(v_def.build_time / (1.0 + (v_shipyard_level - 1) * 0.1) * (CASE WHEN v_nanite > 0 THEN 1.0 / POWER(2, v_nanite) ELSE 1.0 END)));

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

  IF v_fer < v_cost_fer OR v_silice < v_cost_silice OR v_xenogas < v_cost_xenogas THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_fer := v_fer - v_cost_fer;
  v_silice := v_silice - v_cost_silice;
  v_xenogas := v_xenogas - v_cost_xenogas;

  PERFORM set_resource_tx_context('build_defenses', p_defense_id || 'x' || p_quantity);

  UPDATE planet_resources
  SET fer = v_fer, silice = v_silice, xenogas = v_xenogas, energy = v_energy
  WHERE planet_id = p_planet_id;

  SELECT total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time
  INTO v_existing
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_defense_id AND item_type = 'defense'
  FOR UPDATE;

  v_is_new_queue := NOT FOUND;

  IF NOT v_is_new_queue THEN
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
    v_btp := v_build_time_per_unit;
    v_start_time := v_now;
    v_end_time := v_now + (v_build_time_per_unit * 1000)::bigint;

    INSERT INTO shipyard_queue (planet_id, item_id, item_type, total_quantity, remaining_quantity, build_time_per_unit, current_unit_start_time, current_unit_end_time)
    VALUES (p_planet_id, p_defense_id, 'defense', v_new_total, v_new_remaining, v_build_time_per_unit, v_start_time, v_end_time);
  END IF;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'resources', json_build_object('fer', v_fer, 'silice', v_silice, 'xenogas', v_xenogas, 'energy', v_energy),
    'queueItem', json_build_object(
      'id', p_defense_id, 'type', 'defense',
      'totalQuantity', v_new_total, 'remainingQuantity', v_new_remaining,
      'buildTimePerUnit', v_btp,
      'currentUnitStartTime', v_start_time, 'currentUnitEndTime', v_end_time
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Step 4: Fix rpc_rush_shipyard to cancel 'processing' events too
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

  SELECT solar INTO v_current_solar
  FROM players WHERE user_id = p_user_id FOR UPDATE;

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

  DELETE FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_item_id AND item_type = p_item_type;

  UPDATE events
  SET status = 'cancelled', cancelled_at = NOW(), locked_until = NULL, worker_id = NULL
  WHERE entity_type = 'planet' AND entity_id = p_planet_id
    AND event_type = 'shipyard_unit_complete'
    AND status IN ('pending', 'processing')
    AND payload->>'item_id' = p_item_id
    AND payload->>'item_type' = p_item_type;

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

  PERFORM set_solar_tx_context(
    'rush_shipyard',
    'rush_' || p_item_type || '_' || p_item_id || '_x' || v_completed_qty || '_cost' || v_solar_cost
  );

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

-- Step 5: Fix rpc_cancel_shipyard to cancel 'processing' events too
CREATE OR REPLACE FUNCTION rpc_cancel_shipyard(
  p_user_id uuid,
  p_planet_id uuid,
  p_item_id text,
  p_item_type text
) RETURNS json AS $$
DECLARE
  v_queue record;
  v_res record;
  v_last_update bigint;
  v_now bigint;
  v_fer double precision;
  v_silice double precision;
  v_xenogas double precision;
  v_energy double precision;
  v_unit_fer double precision := 0;
  v_unit_silice double precision := 0;
  v_unit_xenogas double precision := 0;
  v_refund_qty int;
  v_refund_rate double precision := 0.8;
  v_sdef record;
  v_ddef record;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

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

  IF p_item_type = 'ship' THEN
    SELECT cost_fer, cost_silice, cost_xenogas INTO v_sdef FROM ship_defs WHERE ship_id = p_item_id;
    IF FOUND THEN
      v_unit_fer := v_sdef.cost_fer;
      v_unit_silice := v_sdef.cost_silice;
      v_unit_xenogas := v_sdef.cost_xenogas;
    END IF;
  ELSE
    SELECT cost_fer, cost_silice, cost_xenogas INTO v_ddef FROM defense_defs WHERE defense_id = p_item_id;
    IF FOUND THEN
      v_unit_fer := v_ddef.cost_fer;
      v_unit_silice := v_ddef.cost_silice;
      v_unit_xenogas := v_ddef.cost_xenogas;
    END IF;
  END IF;

  v_refund_qty := v_queue.remaining_quantity;

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

  v_fer := v_fer + v_unit_fer * v_refund_qty * v_refund_rate;
  v_silice := v_silice + v_unit_silice * v_refund_qty * v_refund_rate;
  v_xenogas := v_xenogas + v_unit_xenogas * v_refund_qty * v_refund_rate;

  DELETE FROM shipyard_queue
  WHERE planet_id = p_planet_id AND item_id = p_item_id AND item_type = p_item_type;

  UPDATE events
  SET status = 'cancelled', cancelled_at = NOW(), locked_until = NULL, worker_id = NULL
  WHERE entity_type = 'planet' AND entity_id = p_planet_id
    AND event_type = 'shipyard_unit_complete'
    AND status IN ('pending', 'processing')
    AND payload->>'item_id' = p_item_id
    AND payload->>'item_type' = p_item_type;

  PERFORM set_resource_tx_context('cancel_shipyard', p_item_id || ':' || p_item_type);

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
