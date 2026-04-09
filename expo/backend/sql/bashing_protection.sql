-- =============================================================
-- BASHING PROTECTION SYSTEM
-- Anti-bashing rule: max 6 attacks per attacker on same planet
-- within a sliding 24-hour window (OGame faithful)
-- Run in Supabase SQL Editor AFTER server_fleet_extras.sql
-- =============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS bashing_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id      uuid NOT NULL,
  defender_id      uuid NOT NULL,
  target_planet_id uuid NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  target_type      text NOT NULL DEFAULT 'planet' CHECK (target_type IN ('planet', 'moon')),
  fleet_mission_id uuid REFERENCES fleet_missions(id) ON DELETE SET NULL,
  mission_type     text NOT NULL DEFAULT 'attack' CHECK (mission_type IN ('attack', 'moon_destroy')),
  counted          boolean NOT NULL DEFAULT true,
  launched_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_bashing_log_lookup
  ON bashing_log (attacker_id, target_planet_id, launched_at DESC)
  WHERE counted = true;

CREATE INDEX IF NOT EXISTS idx_bashing_log_launched_at
  ON bashing_log (launched_at);

CREATE INDEX IF NOT EXISTS idx_bashing_log_defender
  ON bashing_log (defender_id, launched_at DESC);

-- 3. RLS (table protegee, acces uniquement via SECURITY DEFINER)
ALTER TABLE bashing_log ENABLE ROW LEVEL SECURITY;

-- 4. Fonction de comptage (utilisee par le frontend via RPC)
CREATE OR REPLACE FUNCTION get_bashing_count(
  p_attacker_id uuid,
  p_target_planet_id uuid
) RETURNS integer AS $$
  SELECT COUNT(*)::integer
  FROM bashing_log
  WHERE attacker_id = p_attacker_id
    AND target_planet_id = p_target_planet_id
    AND counted = true
    AND launched_at > now() - interval '24 hours';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. Nettoyage periodique (garder 3 jours pour audit)
CREATE OR REPLACE FUNCTION purge_old_bashing_logs(p_days integer DEFAULT 3)
RETURNS integer AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM bashing_log WHERE launched_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
