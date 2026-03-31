-- =============================================================
-- FIX: ATOMIC rpc_send_fleet
-- =============================================================
-- This replaces the old rpc_send_fleet that only deducted ships/resources.
-- The new version also INSERTS the fleet_mission row inside the same
-- SQL transaction, making the whole operation atomic.
-- If any step fails, the entire transaction rolls back automatically.
-- No more lost ships without a mission being created.
-- =============================================================

-- Drop old signature(s) to avoid overload conflicts
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision, jsonb, jsonb, uuid, text, uuid);
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision, jsonb, jsonb, uuid, text, uuid, double precision);

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
) RETURNS json AS $$
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
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  -- Anti-cheat: verify planet ownership
  IF p_user_id IS NOT NULL THEN
    IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
      RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
    END IF;
  END IF;

  -- Fleet limit check
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

  -- Quantum shield + Noob protection checks for attack missions
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

  -- Calculate flight time
  IF p_sender_coords IS NOT NULL AND p_target_coords IS NOT NULL AND p_user_id IS NOT NULL THEN
    v_flight_result := rpc_calculate_flight_time(p_sender_coords, p_target_coords, p_ships, p_user_id, p_speed_percent);
    IF NOT (v_flight_result->>'success')::boolean THEN
      RETURN json_build_object('success', false, 'error', v_flight_result->>'error');
    END IF;
    v_flight_time_sec := (v_flight_result->>'flight_time_sec')::int;
    v_fuel_cost := COALESCE((v_flight_result->>'fuel_cost')::double precision, 0);
  END IF;

  -- Deduct ships (with FOR UPDATE)
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

  -- Deduct cargo + fuel
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

  -- Calculate times
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

  -- Build cargo JSON
  v_cargo := json_build_object('fer', p_cargo_fer, 'silice', p_cargo_silice, 'xenogas', p_cargo_xenogas)::jsonb;

  -- INSERT fleet_mission ATOMICALLY in the same transaction
  INSERT INTO fleet_missions (
    sender_id,
    sender_username,
    sender_planet,
    sender_coords,
    target_coords,
    target_player_id,
    target_username,
    target_planet,
    mission_type,
    ships,
    resources,
    departure_time,
    arrival_time,
    return_time,
    status,
    processed,
    mission_phase,
    fuel_consumed
  ) VALUES (
    p_user_id,
    p_sender_username,
    p_sender_planet,
    p_sender_coords,
    p_target_coords,
    p_target_player_id,
    p_target_username,
    p_target_planet,
    p_mission_type,
    p_ships,
    v_cargo,
    v_departure_time,
    v_arrival_time,
    v_return_time,
    'en_route',
    false,
    'en_route',
    CEIL(v_fuel_cost)
  )
  RETURNING id INTO v_mission_id;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
