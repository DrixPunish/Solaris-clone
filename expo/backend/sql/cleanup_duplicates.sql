-- =============================================================
-- CLEANUP: Drop all duplicate/obsolete function signatures
-- =============================================================
-- Run this ONCE in Supabase SQL Editor to remove old function
-- overloads that were created when parameter signatures changed.
--
-- After running this, re-run the SQL files in order:
--   1. server_defs.sql
--   2. resource_hardening.sql
--   3. rpc_functions.sql
--   4. resource_security.sql
--   5. server_fleet_extras.sql
--   6. quantum_shields.sql
--   7. combat_engine.sql
--   8. combat_reports.sql
--   9. leaderboard.sql
-- =============================================================

-- =============================================
-- 1. rpc_send_fleet — old signature without p_speed_percent
--    (from migration_quantum_shields.sql, now deleted)
-- =============================================
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision, jsonb, jsonb, uuid, text, uuid);
-- Keep only: rpc_send_fleet(uuid, jsonb, double precision, double precision, double precision, jsonb, jsonb, uuid, text, uuid, double precision)

-- =============================================
-- 2. rpc_claim_tutorial_reward — old signature without p_reward_type
-- =============================================
DROP FUNCTION IF EXISTS rpc_claim_tutorial_reward(uuid, uuid, text, double precision, double precision, double precision, double precision);
-- Keep only: rpc_claim_tutorial_reward(uuid, uuid, text, text, double precision, double precision, double precision, double precision)

-- =============================================
-- 3. simulate_combat — old stub that did nothing
-- =============================================
DROP FUNCTION IF EXISTS simulate_combat(jsonb, jsonb, jsonb, jsonb, integer);
DROP FUNCTION IF EXISTS simulate_combat(jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS simulate_combat();

-- =============================================
-- 4. apply_attack_loot — old signatures (combat_engine.sql version)
--    resource_security.sql already has DROP + CREATE OR REPLACE
--    but in case old versions with different params remain:
-- =============================================
DROP FUNCTION IF EXISTS apply_attack_loot(uuid, double precision, double precision, double precision, jsonb, jsonb);
-- Keep only: apply_attack_loot(uuid, double precision, double precision, double precision, jsonb, jsonb, jsonb)

-- =============================================
-- 5. add_resources_to_planet — old signatures
-- =============================================
DROP FUNCTION IF EXISTS add_resources_to_planet(uuid, double precision, double precision, double precision, text);
-- Keep only: add_resources_to_planet(uuid, double precision, double precision, double precision)

-- =============================================
-- 6. materialize_planet_resources — check for old signatures
-- =============================================
DROP FUNCTION IF EXISTS materialize_planet_resources(uuid);
-- Keep only: materialize_planet_resources(uuid, uuid)

-- =============================================
-- 7. get_combat_boosts — no known duplicates but cleanup
-- =============================================
-- No action needed, same signature

-- =============================================
-- 8. calc_planet_economy — check for old signatures
-- =============================================
DROP FUNCTION IF EXISTS calc_planet_economy(uuid);
-- Keep only: calc_planet_economy(uuid, uuid)

-- =============================================
-- 9. safe_materialize_inline — check for old signatures
-- =============================================
DROP FUNCTION IF EXISTS safe_materialize_inline(uuid, uuid, double precision, double precision, double precision, bigint);
-- Keep only: safe_materialize_inline(uuid, uuid, double precision, double precision, double precision, bigint, bigint)

-- =============================================
-- 10. Verify: list all remaining functions to confirm no duplicates
-- =============================================
-- Run this query after the cleanup to verify:
-- SELECT proname, pg_get_function_arguments(oid) as args
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN (
--     'rpc_send_fleet', 'rpc_claim_tutorial_reward', 'simulate_combat',
--     'apply_attack_loot', 'add_resources_to_planet', 'materialize_planet_resources',
--     'calc_planet_economy', 'safe_materialize_inline', 'get_combat_boosts',
--     'rpc_build_structure', 'rpc_start_research', 'rpc_build_ships',
--     'rpc_build_defenses', 'rpc_rush_timer', 'rpc_cancel_timer',
--     'rpc_rush_shipyard', 'rpc_cancel_shipyard', 'rpc_recall_fleet',
--     'rpc_buy_quantum_shield', 'rpc_calculate_flight_time',
--     'rpc_process_fleet_returns', 'recalc_player_score'
--   )
-- ORDER BY proname;
