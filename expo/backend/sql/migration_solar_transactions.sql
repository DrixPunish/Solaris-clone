-- =============================================================
-- MIGRATION: DROP materialize_debug + CREATE solar_transactions
-- =============================================================
-- Run AFTER: resource_security.sql, resource_hardening.sql
--
-- Changes:
-- 1. DROP materialize_debug (redundant with resource_transactions)
-- 2. CREATE solar_transactions audit table
-- 3. TRIGGER on players.solar for automatic logging
-- 4. Helper set_solar_tx_context
-- 5. Purge function for maintenance
-- 6. Anomaly detection view
-- =============================================================

-- =============================================================
-- 1. DROP materialize_debug (covered by resource_transactions)
-- =============================================================
DROP FUNCTION IF EXISTS purge_old_materialize_debug(integer);
DROP TABLE IF EXISTS materialize_debug CASCADE;

-- =============================================================
-- 2. CREATE solar_transactions
-- =============================================================
CREATE TABLE IF NOT EXISTS solar_transactions (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL DEFAULT 'unknown',
  reason TEXT,
  solar_before INTEGER,
  solar_after INTEGER,
  solar_delta INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solar_transactions_player_id
  ON solar_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_solar_transactions_created_at
  ON solar_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_solar_transactions_type
  ON solar_transactions(transaction_type);

-- =============================================================
-- 3. HELPER: set_solar_tx_context
-- =============================================================
CREATE OR REPLACE FUNCTION set_solar_tx_context(
  p_type TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.solar_tx.type', p_type, TRUE);
  PERFORM set_config('app.solar_tx.reason', COALESCE(p_reason, ''), TRUE);
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 4. TRIGGER FUNCTION: log_solar_changes
-- =============================================================
CREATE OR REPLACE FUNCTION log_solar_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_type TEXT;
  v_reason TEXT;
BEGIN
  IF COALESCE(OLD.solar, 0) IS NOT DISTINCT FROM COALESCE(NEW.solar, 0) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_type := current_setting('app.solar_tx.type', true);
  EXCEPTION WHEN OTHERS THEN
    v_type := NULL;
  END;

  BEGIN
    v_reason := current_setting('app.solar_tx.reason', true);
  EXCEPTION WHEN OTHERS THEN
    v_reason := NULL;
  END;

  IF v_type IS NULL OR v_type = '' THEN
    v_type := 'auto';
  END IF;

  INSERT INTO solar_transactions (
    player_id, transaction_type, reason,
    solar_before, solar_after, solar_delta
  ) VALUES (
    NEW.user_id,
    v_type,
    v_reason,
    COALESCE(OLD.solar, 0),
    COALESCE(NEW.solar, 0),
    COALESCE(NEW.solar, 0) - COALESCE(OLD.solar, 0)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_solar_changes ON players;
CREATE TRIGGER trg_log_solar_changes
  AFTER UPDATE OF solar ON players
  FOR EACH ROW EXECUTE FUNCTION log_solar_changes();

-- =============================================================
-- 5. VIEW: solar_audit (anomaly detection)
-- =============================================================
DROP VIEW IF EXISTS solar_audit;
CREATE VIEW solar_audit AS
SELECT
  st.player_id,
  p.username,
  st.transaction_type,
  st.reason,
  st.solar_before,
  st.solar_after,
  st.solar_delta,
  st.created_at,
  LAG(st.solar_after) OVER (
    PARTITION BY st.player_id ORDER BY st.created_at
  ) AS previous_solar,
  CASE
    WHEN st.solar_delta < -1000
      AND st.transaction_type NOT IN (
        'rush_building','rush_research','rush_shipyard','buy_shield'
      )
    THEN 'ANOMALY_LARGE_NEGATIVE'
    WHEN st.solar_after < 500
      AND st.transaction_type = 'auto'
    THEN 'ANOMALY_RESET_LOW'
    ELSE 'OK'
  END AS anomaly_flag
FROM solar_transactions st
JOIN players p ON st.player_id = p.user_id
ORDER BY st.player_id, st.created_at DESC;

-- =============================================================
-- 6. PURGE OLD solar_transactions (maintenance)
-- =============================================================
CREATE OR REPLACE FUNCTION purge_old_solar_transactions(
  p_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM solar_transactions
  WHERE created_at < NOW() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;
