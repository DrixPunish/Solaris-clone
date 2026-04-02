-- =============================================================
-- COMBAT REPORTS TABLE
-- =============================================================
-- Stores full combat report data for attacker and defender.
-- Each combat creates 2 rows: one viewer_role='attacker', one viewer_role='defender'
-- =============================================================

CREATE TABLE IF NOT EXISTS combat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id UUID NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  defender_id UUID REFERENCES players(user_id) ON DELETE SET NULL,
  viewer_role TEXT NOT NULL DEFAULT 'attacker' CHECK (viewer_role IN ('attacker', 'defender')),
  attacker_username TEXT,
  defender_username TEXT,
  attacker_coords JSONB,
  target_coords JSONB NOT NULL,
  attacker_fleet JSONB NOT NULL DEFAULT '{}'::jsonb,
  defender_fleet JSONB DEFAULT '{}'::jsonb,
  defender_defenses_initial JSONB DEFAULT '{}'::jsonb,
  rounds INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL CHECK (result IN ('attacker_wins', 'defender_wins', 'draw')),
  attacker_losses JSONB DEFAULT '{}'::jsonb,
  defender_losses JSONB DEFAULT '{}'::jsonb,
  loot JSONB DEFAULT '{"fer":0,"silice":0,"xenogas":0}'::jsonb,
  debris JSONB DEFAULT '{"fer":0,"silice":0}'::jsonb,
  combat_log JSONB DEFAULT NULL,
  round_logs JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combat_reports_attacker ON combat_reports(attacker_id);
CREATE INDEX IF NOT EXISTS idx_combat_reports_defender ON combat_reports(defender_id);
CREATE INDEX IF NOT EXISTS idx_combat_reports_created ON combat_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_combat_reports_viewer_role ON combat_reports(viewer_role);

-- =============================================================
-- RLS POLICIES
-- =============================================================
ALTER TABLE combat_reports ENABLE ROW LEVEL SECURITY;

-- Service role full access (for worldTick backend inserts)
CREATE POLICY service_role_all ON combat_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Attacker can read their own reports
CREATE POLICY attacker_select ON combat_reports
  FOR SELECT
  USING (auth.uid() = attacker_id AND viewer_role = 'attacker');

-- Defender can read their own reports
CREATE POLICY defender_select ON combat_reports
  FOR SELECT
  USING (auth.uid() = defender_id AND viewer_role = 'defender');

-- Attacker can delete their own reports
CREATE POLICY attacker_delete ON combat_reports
  FOR DELETE
  USING (auth.uid() = attacker_id AND viewer_role = 'attacker');

-- Defender can delete their own reports
CREATE POLICY defender_delete ON combat_reports
  FOR DELETE
  USING (auth.uid() = defender_id AND viewer_role = 'defender');
