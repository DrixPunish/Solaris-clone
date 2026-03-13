-- =============================================================
-- NEW RPC FUNCTIONS FOR SERVER-SIDE FLEET & EXTRAS
-- Run this in Supabase SQL Editor AFTER the existing rpc_functions.sql
-- =============================================================

-- 1. Atomic fleet ship/resource deduction when sending fleet
CREATE OR REPLACE FUNCTION rpc_send_fleet(
  p_planet_id uuid,
  p_ships jsonb,
  p_cargo_fer double precision DEFAULT 0,
  p_cargo_silice double precision DEFAULT 0,
  p_cargo_xenogas double precision DEFAULT 0
) RETURNS json AS $$
DECLARE
  v_key text;
  v_val jsonb;
  v_ship_qty integer;
  v_current_qty integer;
BEGIN
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

  IF p_cargo_fer > 0 OR p_cargo_silice > 0 OR p_cargo_xenogas > 0 THEN
    UPDATE planet_resources
    SET fer = GREATEST(0, fer - p_cargo_fer),
        silice = GREATEST(0, silice - p_cargo_silice),
        xenogas = GREATEST(0, xenogas - p_cargo_xenogas)
    WHERE planet_id = p_planet_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 2. Claim tutorial reward atomically
CREATE OR REPLACE FUNCTION rpc_claim_tutorial_reward(
  p_user_id uuid,
  p_planet_id uuid,
  p_reward_type text,
  p_fer double precision DEFAULT 0,
  p_silice double precision DEFAULT 0,
  p_xenogas double precision DEFAULT 0,
  p_solar double precision DEFAULT 0
) RETURNS json AS $$
DECLARE
  v_new_solar double precision;
BEGIN
  IF p_reward_type = 'resources' THEN
    UPDATE planet_resources
    SET fer = fer + p_fer,
        silice = silice + p_silice,
        xenogas = xenogas + p_xenogas
    WHERE planet_id = p_planet_id;
  ELSIF p_reward_type = 'solar' THEN
    UPDATE players
    SET solar = solar + p_solar
    WHERE user_id = p_user_id
    RETURNING solar INTO v_new_solar;
  END IF;

  RETURN json_build_object('success', true, 'solar', v_new_solar);
END;
$$ LANGUAGE plpgsql;

-- 3. Add production_percentages column to planets table
ALTER TABLE planets ADD COLUMN IF NOT EXISTS production_percentages jsonb DEFAULT NULL;
