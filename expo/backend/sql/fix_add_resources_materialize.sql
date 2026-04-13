-- =============================================================
-- FIX: add_resources_to_planet must materialize production BEFORE adding resources
-- =============================================================
-- PROBLEM: When a transport/return/station adds resources to a planet,
-- the function directly adds to raw DB values and resets last_update to NOW.
-- This skips all accumulated production since the planet's last action,
-- causing hours of production to be lost.
--
-- FIX: Look up the planet owner and call materialize_planet_resources()
-- BEFORE adding the new resources. This ensures pending production is
-- calculated and applied first, then transport resources are added on top.
-- =============================================================

DROP FUNCTION IF EXISTS add_resources_to_planet(uuid, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION add_resources_to_planet(
  p_planet_id uuid,
  p_fer double precision DEFAULT 0,
  p_silice double precision DEFAULT 0,
  p_xenogas double precision DEFAULT 0
) RETURNS json AS $$
DECLARE
  v_res record;
  v_now bigint;
  v_user_id uuid;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  -- Step 1: Look up planet owner
  SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;

  -- Step 2: Materialize pending production BEFORE adding new resources
  -- This ensures accumulated production since last_update is not lost
  IF v_user_id IS NOT NULL THEN
    PERFORM materialize_planet_resources(p_planet_id, v_user_id);
  END IF;

  -- Step 3: Now set context for the add_resources transaction log
  PERFORM set_resource_tx_context('add_resources', 'transport/return/station');

  -- Step 4: Lock and read current (now materialized) resources
  SELECT fer, silice, xenogas, energy INTO v_res
  FROM planet_resources
  WHERE planet_id = p_planet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  -- Step 5: Add the new resources on top of materialized values
  UPDATE planet_resources
  SET fer = COALESCE(v_res.fer, 0) + GREATEST(0, p_fer),
      silice = COALESCE(v_res.silice, 0) + GREATEST(0, p_silice),
      xenogas = COALESCE(v_res.xenogas, 0) + GREATEST(0, p_xenogas)
  WHERE planet_id = p_planet_id;

  -- Step 6: Update last_update (materialize already set it, but we refresh to current instant)
  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object(
    'success', true,
    'fer', COALESCE(v_res.fer, 0) + GREATEST(0, p_fer),
    'silice', COALESCE(v_res.silice, 0) + GREATEST(0, p_silice),
    'xenogas', COALESCE(v_res.xenogas, 0) + GREATEST(0, p_xenogas)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FIX: apply_attack_loot must also materialize production first
-- =============================================================
-- Same issue: when an attack deducts loot, it should first materialize
-- production so the defender doesn't lose accumulated resources.
-- Note: loadPlanetState already calls materialize for the attacker's
-- combat calculation, but there's a race window. This makes it airtight.
-- =============================================================

DROP FUNCTION IF EXISTS apply_attack_loot(uuid, double precision, double precision, double precision, jsonb, jsonb, jsonb);
CREATE OR REPLACE FUNCTION apply_attack_loot(
  p_planet_id uuid,
  p_loot_fer double precision DEFAULT 0,
  p_loot_silice double precision DEFAULT 0,
  p_loot_xenogas double precision DEFAULT 0,
  p_ship_losses jsonb DEFAULT '{}'::jsonb,
  p_defense_losses jsonb DEFAULT '{}'::jsonb,
  p_defense_rebuilds jsonb DEFAULT '{}'::jsonb
) RETURNS json AS $$
DECLARE
  v_res record;
  v_now bigint;
  v_user_id uuid;
  v_key text;
  v_val jsonb;
  v_loss_qty integer;
  v_rebuild_qty integer;
  v_current_qty integer;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  -- Materialize pending production first
  SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;
  IF v_user_id IS NOT NULL THEN
    PERFORM materialize_planet_resources(p_planet_id, v_user_id);
  END IF;

  PERFORM set_resource_tx_context('attack_loot', 'combat_deduction');

  SELECT fer, silice, xenogas, energy INTO v_res
  FROM planet_resources
  WHERE planet_id = p_planet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Planet resources not found');
  END IF;

  UPDATE planet_resources
  SET fer = GREATEST(0, COALESCE(v_res.fer, 0) - GREATEST(0, p_loot_fer)),
      silice = GREATEST(0, COALESCE(v_res.silice, 0) - GREATEST(0, p_loot_silice)),
      xenogas = GREATEST(0, COALESCE(v_res.xenogas, 0) - GREATEST(0, p_loot_xenogas))
  WHERE planet_id = p_planet_id;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_ship_losses)
  LOOP
    v_loss_qty := (v_val::text)::integer;
    IF v_loss_qty <= 0 THEN CONTINUE; END IF;

    SELECT quantity INTO v_current_qty
    FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_id = v_key
    FOR UPDATE;

    IF v_current_qty IS NOT NULL THEN
      UPDATE planet_ships
      SET quantity = GREATEST(0, v_current_qty - v_loss_qty)
      WHERE planet_id = p_planet_id AND ship_id = v_key;
    END IF;
  END LOOP;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_defense_losses)
  LOOP
    v_loss_qty := (v_val::text)::integer;
    IF v_loss_qty <= 0 THEN CONTINUE; END IF;

    v_rebuild_qty := COALESCE((p_defense_rebuilds->>v_key)::integer, 0);

    SELECT quantity INTO v_current_qty
    FROM planet_defenses
    WHERE planet_id = p_planet_id AND defense_id = v_key
    FOR UPDATE;

    IF v_current_qty IS NOT NULL THEN
      UPDATE planet_defenses
      SET quantity = GREATEST(0, v_current_qty - v_loss_qty + v_rebuild_qty)
      WHERE planet_id = p_planet_id AND defense_id = v_key;
    END IF;
  END LOOP;

  UPDATE planets SET last_update = v_now WHERE id = p_planet_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
