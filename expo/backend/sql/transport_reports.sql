-- =============================================================
-- TRANSPORT REPORTS TABLE
-- =============================================================
-- Stores transport & recycle reports, decoupled from fleet_missions.
-- Same model as combat_reports: one row per viewer.
--   viewer_role = 'sender'   -> row visible to the sender
--   viewer_role = 'receiver' -> row visible to the target player
--
-- A self-transport (sender == receiver) produces ONE row only
-- (viewer_role = 'sender', receiver_id = sender_id).
--
-- A recycle mission produces ONE row (sender only).
--
-- IMPORTANT:
--   fleet_mission_id is ON DELETE SET NULL (not CASCADE).
--   Deleting a report must NEVER cascade to fleet_missions.
--   Deleting a fleet_mission must NEVER cascade to transport_reports.
-- =============================================================

CREATE TABLE IF NOT EXISTS transport_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_mission_id UUID REFERENCES fleet_missions(id) ON DELETE SET NULL,
  viewer_id UUID NOT NULL,
  viewer_role TEXT NOT NULL CHECK (viewer_role IN ('sender', 'receiver')),
  sender_id UUID NOT NULL,
  sender_username TEXT NOT NULL DEFAULT 'Inconnu',
  sender_coords JSONB NOT NULL,
  receiver_id UUID,
  receiver_username TEXT,
  receiver_coords JSONB NOT NULL,
  ships JSONB NOT NULL DEFAULT '{}'::jsonb,
  resources JSONB NOT NULL DEFAULT '{"fer":0,"silice":0,"xenogas":0}'::jsonb,
  mission_type TEXT NOT NULL CHECK (mission_type IN ('transport', 'recycle', 'station')),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_reports_viewer
  ON transport_reports (viewer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transport_reports_mission
  ON transport_reports (fleet_mission_id);

-- Migration: extend mission_type to accept 'station'
DO $
BEGIN
  ALTER TABLE transport_reports DROP CONSTRAINT IF EXISTS transport_reports_mission_type_check;
  ALTER TABLE transport_reports
    ADD CONSTRAINT transport_reports_mission_type_check
    CHECK (mission_type IN ('transport', 'recycle', 'station'));
END $;

-- =============================================================
-- RLS POLICIES
-- =============================================================
ALTER TABLE transport_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON transport_reports;
CREATE POLICY service_role_all ON transport_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS viewer_select ON transport_reports;
CREATE POLICY viewer_select ON transport_reports
  FOR SELECT
  USING (auth.uid() = viewer_id);

DROP POLICY IF EXISTS viewer_delete ON transport_reports;
CREATE POLICY viewer_delete ON transport_reports
  FOR DELETE
  USING (auth.uid() = viewer_id);

-- =============================================================
-- Defensive: forbid direct DELETE on fleet_missions from clients
-- (backend uses service-role and bypasses RLS)
-- =============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fleet_missions'
      AND policyname = 'no_client_delete_fleet_missions'
  ) THEN
    DROP POLICY no_client_delete_fleet_missions ON fleet_missions;
  END IF;
END $$;

CREATE POLICY no_client_delete_fleet_missions ON fleet_missions
  FOR DELETE
  USING (auth.role() = 'service_role');
