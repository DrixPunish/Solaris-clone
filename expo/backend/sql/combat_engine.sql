-- =============================================================
-- COMBAT ENGINE - Helper functions for combat system
-- =============================================================
-- The primary combat engine runs in TypeScript
-- (utils/fleetCalculations.ts) called from worldTick.ts.
--
-- This file contains:
-- - get_combat_boosts(): tech multipliers for combat
-- - apply_attack_loot is in resource_security.sql (single source of truth)
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
