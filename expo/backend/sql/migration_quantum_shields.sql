-- =============================================================
-- MIGRATION: Bouclier Quantique Global
-- Execute this SINGLE script in Supabase SQL Editor
-- AFTER all previous migrations (rpc_functions, server_fleet_extras, etc.)
-- =============================================================

-- =============================================================
-- 1. TABLE: quantum_shields
-- =============================================================
CREATE TABLE IF NOT EXISTS quantum_shields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shield_active boolean NOT NULL DEFAULT false,
  shield_expires_at timestamptz DEFAULT NULL,
  shield_last_activated_at timestamptz DEFAULT NULL,
  cooldown_expires_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_quantum_shields_player UNIQUE (player_id)
);

CREATE INDEX IF NOT EXISTS idx_quantum_shields_player
  ON quantum_shields (player_id);

CREATE INDEX IF NOT EXISTS idx_quantum_shields_active
  ON quantum_shields (shield_active, shield_expires_at)
  WHERE shield_active = true;

-- =============================================================
-- 2. refresh_quantum_shield_state(player_id)
-- =============================================================
CREATE OR REPLACE FUNCTION refresh_quantum_shield_state(
  p_player_id uuid
) RETURNS TABLE (
  shield_active boolean,
  shield_expires_at timestamptz,
  cooldown_expires_at timestamptz
) AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT qs.shield_active, qs.shield_expires_at, qs.cooldown_expires_at
  INTO v_rec
  FROM quantum_shields qs
  WHERE qs.player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_rec.shield_active = true AND v_rec.shield_expires_at IS NOT NULL AND v_rec.shield_expires_at <= now() THEN
    UPDATE quantum_shields qs
    SET shield_active = false,
        shield_expires_at = NULL,
        cooldown_expires_at = now() + interval '24 hours',
        updated_at = now()
    WHERE qs.player_id = p_player_id;

    RETURN QUERY SELECT false::boolean, NULL::timestamptz, (now() + interval '24 hours')::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_rec.shield_active, v_rec.shield_expires_at, v_rec.cooldown_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 3. rpc_buy_quantum_shield(player_id)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_buy_quantum_shield(
  p_player_id uuid
) RETURNS json AS $$
DECLARE
  v_state record;
  v_solar double precision;
  v_shield_active boolean;
  v_shield_expires timestamptz;
  v_cooldown_expires timestamptz;
BEGIN
  SELECT * INTO v_state
  FROM refresh_quantum_shield_state(p_player_id);

  v_shield_active := v_state.shield_active;
  v_shield_expires := v_state.shield_expires_at;
  v_cooldown_expires := v_state.cooldown_expires_at;

  IF v_shield_active = true THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bouclier quantique deja actif'
    );
  END IF;

  IF v_cooldown_expires IS NOT NULL AND v_cooldown_expires > now() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cooldown en cours. Disponible dans ' ||
        CEIL(EXTRACT(EPOCH FROM (v_cooldown_expires - now())) / 3600) || 'h',
      'cooldown_expires_at', v_cooldown_expires
    );
  END IF;

  SELECT solar INTO v_solar
  FROM players
  WHERE user_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Joueur introuvable');
  END IF;

  IF v_solar < 500 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Solar insuffisant (500 requis, disponible: ' || FLOOR(v_solar) || ')'
    );
  END IF;

  UPDATE players
  SET solar = solar - 500
  WHERE user_id = p_player_id
  RETURNING solar INTO v_solar;

  INSERT INTO quantum_shields (player_id, shield_active, shield_expires_at, shield_last_activated_at, cooldown_expires_at, updated_at)
  VALUES (
    p_player_id,
    true,
    now() + interval '24 hours',
    now(),
    NULL,
    now()
  )
  ON CONFLICT (player_id) DO UPDATE SET
    shield_active = true,
    shield_expires_at = now() + interval '24 hours',
    shield_last_activated_at = now(),
    cooldown_expires_at = NULL,
    updated_at = now();

  RETURN json_build_object(
    'success', true,
    'shield_active', true,
    'shield_expires_at', (now() + interval '24 hours'),
    'cooldown_expires_at', NULL,
    'remaining_solar', v_solar
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 4. reduce_quantum_shield_on_attack(attacker_id)
-- =============================================================
CREATE OR REPLACE FUNCTION reduce_quantum_shield_on_attack(
  p_attacker_id uuid
) RETURNS json AS $$
DECLARE
  v_state record;
  v_new_expiry timestamptz;
BEGIN
  SELECT * INTO v_state
  FROM refresh_quantum_shield_state(p_attacker_id);

  IF v_state.shield_active IS NOT TRUE THEN
    RETURN json_build_object('reduced', false, 'shield_active', false);
  END IF;

  v_new_expiry := v_state.shield_expires_at - interval '12 hours';

  IF v_new_expiry <= now() THEN
    UPDATE quantum_shields
    SET shield_active = false,
        shield_expires_at = NULL,
        cooldown_expires_at = now() + interval '24 hours',
        updated_at = now()
    WHERE player_id = p_attacker_id;

    RETURN json_build_object(
      'reduced', true,
      'shield_active', false,
      'message', 'Bouclier desactive suite a attaque'
    );
  ELSE
    UPDATE quantum_shields
    SET shield_expires_at = v_new_expiry,
        updated_at = now()
    WHERE player_id = p_attacker_id;

    RETURN json_build_object(
      'reduced', true,
      'shield_active', true,
      'new_expires_at', v_new_expiry,
      'message', 'Bouclier reduit de 12h'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 5. get_quantum_shield_status(player_id)
-- =============================================================
CREATE OR REPLACE FUNCTION get_quantum_shield_status(
  p_player_id uuid
) RETURNS json AS $$
DECLARE
  v_state record;
  v_remaining_seconds double precision;
  v_cooldown_remaining double precision;
  v_can_buy boolean;
BEGIN
  SELECT * INTO v_state
  FROM refresh_quantum_shield_state(p_player_id);

  IF v_state.shield_active = true AND v_state.shield_expires_at IS NOT NULL THEN
    v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_state.shield_expires_at - now())));
  ELSE
    v_remaining_seconds := 0;
  END IF;

  IF v_state.cooldown_expires_at IS NOT NULL AND v_state.cooldown_expires_at > now() THEN
    v_cooldown_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_state.cooldown_expires_at - now())));
  ELSE
    v_cooldown_remaining := 0;
  END IF;

  v_can_buy := (v_state.shield_active IS NOT TRUE)
    AND (v_state.cooldown_expires_at IS NULL OR v_state.cooldown_expires_at <= now());

  RETURN json_build_object(
    'shield_active', COALESCE(v_state.shield_active, false),
    'shield_expires_at', v_state.shield_expires_at,
    'cooldown_expires_at', v_state.cooldown_expires_at,
    'remaining_seconds', FLOOR(v_remaining_seconds),
    'cooldown_remaining_seconds', FLOOR(v_cooldown_remaining),
    'can_buy', v_can_buy,
    'cost_solar', 500
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 6. UPDATE rpc_send_fleet: quantum shield checks
-- =============================================================
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
  p_target_player_id uuid DEFAULT NULL
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
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  IF p_user_id IS NOT NULL THEN
    IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
      RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
    END IF;
  END IF;

  IF p_mission_type = 'attack' AND p_user_id IS NOT NULL AND p_target_player_id IS NOT NULL THEN
    -- 1. Reduce attacker shield by 12h if active
    v_attacker_shield_result := reduce_quantum_shield_on_attack(p_user_id);

    -- 2. Check defender quantum shield
    SELECT * INTO v_defender_shield
    FROM refresh_quantum_shield_state(p_target_player_id);

    IF v_defender_shield.shield_active = true THEN
      RETURN json_build_object('success', false, 'error',
        'Bouclier quantique actif: le defenseur est protege par un bouclier quantique.');
    END IF;

    -- 3. Noob shield checks
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
    v_flight_result := rpc_calculate_flight_time(p_sender_coords, p_target_coords, p_ships, p_user_id);
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

  IF v_flight_time_sec IS NOT NULL THEN
    RETURN json_build_object(
      'success', true,
      'flight_time_sec', v_flight_time_sec,
      'departure_time', v_now,
      'arrival_time', v_now + (v_flight_time_sec::bigint * 1000),
      'return_time', v_now + (v_flight_time_sec::bigint * 2000),
      'fuel_consumed', CEIL(v_fuel_cost)
    );
  END IF;

  RETURN json_build_object('success', true);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 7. RLS: Allow players to read their own shield status
-- =============================================================
ALTER TABLE quantum_shields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can read own shield" ON quantum_shields;
CREATE POLICY "Players can read own shield" ON quantum_shields
  FOR SELECT USING (player_id = auth.uid());

DROP POLICY IF EXISTS "Players can read all shields for galaxy" ON quantum_shields;
CREATE POLICY "Players can read all shields for galaxy" ON quantum_shields
  FOR SELECT USING (true);

-- =============================================================
-- DONE. Quantum Shield system is ready.
-- =============================================================
