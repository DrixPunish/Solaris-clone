-- =============================================================
-- COMBAT ENGINE - simulate_combat() SQL function
-- =============================================================
-- OGame-like combat with Solaris rules:
--   - MAX 6 rounds
--   - Simultaneous fire (no rapidfire)
--   - Ricochet: attack <= 1% base_shield => 0 damage
--   - Shield absorbs first, overflow to hull
--   - Shields reset to max each round
--   - Hull persistent across rounds
--   - Victory: one side = 0 units OR 6 rounds = draw
--   - Loot: 50% defender resources
--   - Debris: 30% fer/silice cost of destroyed ships
--   - Defense rebuild: deterministic 70%
--
-- NOTE: The primary combat engine runs in TypeScript
-- (utils/fleetCalculations.ts) called from worldTick.ts.
-- This SQL version is provided as a reference / future
-- migration path for fully server-side combat.
-- =============================================================

-- Helper: get combat tech boosts for a player
CREATE OR REPLACE FUNCTION get_combat_boosts(p_user_id UUID)
RETURNS TABLE(attack_mult DOUBLE PRECISION, shield_mult DOUBLE PRECISION, hull_mult DOUBLE PRECISION)
AS $$
DECLARE
  v_weapons INT := 0;
  v_shield INT := 0;
  v_armor INT := 0;
BEGIN
  SELECT
    COALESCE(MAX(CASE WHEN research_id = 'weaponsTech' THEN level END), 0),
    COALESCE(MAX(CASE WHEN research_id = 'shieldTech' THEN level END), 0),
    COALESCE(MAX(CASE WHEN research_id = 'armorTech' THEN level END), 0)
  INTO v_weapons, v_shield, v_armor
  FROM player_research
  WHERE user_id = p_user_id
    AND research_id IN ('weaponsTech', 'shieldTech', 'armorTech');

  attack_mult := 1.0 + COALESCE(v_weapons, 0) * 0.10;
  shield_mult := 1.0 + COALESCE(v_shield, 0) * 0.10;
  hull_mult := 1.0 + COALESCE(v_armor, 0) * 0.10;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Main simulate_combat function
-- p_attacker_ships: {"novaScout": 10, "pyro": 5}
-- p_defender_ships: {"ferDeLance": 20}
-- p_defender_defenses: {"kineticTurret": 30}
-- p_defender_resources: {"fer": 10000, "silice": 5000, "xenogas": 2000}
-- p_attacker_research / p_defender_research: {"weaponsTech": 5, "shieldTech": 3, "armorTech": 4}
CREATE OR REPLACE FUNCTION simulate_combat(
  p_attacker_ships JSONB,
  p_defender_ships JSONB,
  p_defender_defenses JSONB,
  p_defender_resources JSONB,
  p_attacker_research JSONB DEFAULT '{}'::jsonb,
  p_defender_research JSONB DEFAULT '{}'::jsonb,
  p_max_rounds INT DEFAULT 6
) RETURNS JSON AS $$
DECLARE
  v_round INT := 0;
  v_att_boosts RECORD;
  v_def_boosts RECORD;
  v_result TEXT;
  v_att_alive INT;
  v_def_alive INT;
BEGIN
  -- This is a reference implementation stub.
  -- The full combat simulation runs in TypeScript (fleetCalculations.ts)
  -- because PL/pgSQL is not ideal for per-unit random targeting loops
  -- with potentially thousands of units.
  --
  -- The TypeScript engine in worldTick.ts handles:
  -- 1. Unit creation with boosted stats
  -- 2. Simultaneous fire rounds (max 6)
  -- 3. Ricochet check (attack <= 1% base_shield)
  -- 4. Shield absorption + hull damage
  -- 5. Shield reset per round
  -- 6. Loss counting, loot calc, debris calc
  -- 7. Defense rebuild (70% deterministic)
  --
  -- See: expo/utils/fleetCalculations.ts :: simulateCombat()

  RETURN json_build_object(
    'note', 'Combat runs in TypeScript engine. See fleetCalculations.ts',
    'max_rounds', p_max_rounds
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- apply_attack_loot RPC
-- =============================================================
-- Applied after combat by worldTick.ts to:
-- 1. Subtract looted resources from defender planet
-- 2. Subtract destroyed ships from defender
-- 3. Subtract destroyed defenses from defender
-- 4. Rebuild 70% of destroyed defenses (deterministic)
-- =============================================================
CREATE OR REPLACE FUNCTION apply_attack_loot(
  p_planet_id UUID,
  p_loot_fer DOUBLE PRECISION DEFAULT 0,
  p_loot_silice DOUBLE PRECISION DEFAULT 0,
  p_loot_xenogas DOUBLE PRECISION DEFAULT 0,
  p_ship_losses JSONB DEFAULT '{}'::jsonb,
  p_defense_losses JSONB DEFAULT '{}'::jsonb,
  p_defense_rebuilds JSONB DEFAULT '{}'::jsonb
) RETURNS JSON AS $$
DECLARE
  v_key TEXT;
  v_lost INT;
  v_rebuild INT;
  v_current INT;
BEGIN
  PERFORM set_resource_tx_context('combat_loot', 'attack_loot');

  UPDATE planet_resources
  SET
    fer = GREATEST(0, fer - p_loot_fer),
    silice = GREATEST(0, silice - p_loot_silice),
    xenogas = GREATEST(0, xenogas - p_loot_xenogas)
  WHERE planet_id = p_planet_id;

  FOR v_key, v_lost IN SELECT * FROM jsonb_each_text(p_ship_losses) LOOP
    UPDATE planet_ships
    SET quantity = GREATEST(0, quantity - v_lost::INT)
    WHERE planet_id = p_planet_id AND ship_id = v_key;
  END LOOP;

  FOR v_key, v_lost IN SELECT * FROM jsonb_each_text(p_defense_losses) LOOP
    v_rebuild := COALESCE((p_defense_rebuilds->>v_key)::INT, 0);

    UPDATE planet_defenses
    SET quantity = GREATEST(0, quantity - v_lost::INT + v_rebuild)
    WHERE planet_id = p_planet_id AND defense_id = v_key;
  END LOOP;

  DELETE FROM planet_ships WHERE planet_id = p_planet_id AND quantity <= 0;
  DELETE FROM planet_defenses WHERE planet_id = p_planet_id AND quantity <= 0;

  UPDATE planets SET last_update = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE id = p_planet_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
