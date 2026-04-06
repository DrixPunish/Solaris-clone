-- =============================================================
-- MIGRATION 002: events V1 -> V2
-- Adds: idempotency_key, locked_until, version, priority
-- Fixes: unique constraint, recovery of stuck events,
--        silent schedule failures
-- =============================================================
-- This migration is INCREMENTAL and safe to run on a live V1 table.
-- It does NOT drop the table. It alters in place.
-- =============================================================

-- ---------------------------------------------------------
-- Step 1: Add new columns with safe defaults
-- ---------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Update status constraint to include 'cancelled'
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_event_status;
ALTER TABLE events ADD CONSTRAINT chk_event_status
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- ---------------------------------------------------------
-- Step 2: Backfill idempotency_key for existing events
-- Uses the old unique constraint logic as fallback
-- ---------------------------------------------------------
UPDATE events
SET idempotency_key = entity_type || ':' || entity_id || ':' || event_type
WHERE idempotency_key IS NULL;

-- ---------------------------------------------------------
-- Step 3: Make idempotency_key NOT NULL after backfill
-- ---------------------------------------------------------
ALTER TABLE events ALTER COLUMN idempotency_key SET NOT NULL;

-- ---------------------------------------------------------
-- Step 4: Drop old unique index (too restrictive)
-- ---------------------------------------------------------
DROP INDEX IF EXISTS idx_events_unique_pending;

-- ---------------------------------------------------------
-- Step 5: Create new unique index on idempotency_key
-- Only one pending or processing event per idempotency_key
-- ---------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency_active
  ON events (idempotency_key)
  WHERE status IN ('pending', 'processing');

-- ---------------------------------------------------------
-- Step 6: Add index for stuck event recovery
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_stuck_processing
  ON events (locked_until)
  WHERE status = 'processing';

-- ---------------------------------------------------------
-- Step 7: Add priority to pending index for ordered claim
-- ---------------------------------------------------------
DROP INDEX IF EXISTS idx_events_pending;
CREATE INDEX IF NOT EXISTS idx_events_pending_v2
  ON events (priority DESC, execute_at ASC)
  WHERE status = 'pending';

-- ---------------------------------------------------------
-- Step 8: Keep entity lookup index (useful for cancellation)
-- ---------------------------------------------------------
-- idx_events_entity already exists, keep it.

-- =============================================================
-- V2 RPCs (versioned with _v2 suffix)
-- Old RPCs remain untouched for backward compat during migration.
-- Once all callers are migrated, drop the old ones.
-- =============================================================

-- =============================================================
-- rpc_schedule_event_v2
-- CHANGES vs V1:
-- - Uses idempotency_key instead of entity composite unique
-- - Returns a composite type with (event_id, already_existed)
-- - NEVER fails silently: always returns info about what happened
-- - Sets locked_until to NULL, version to 1
-- =============================================================
DROP TYPE IF EXISTS schedule_event_result CASCADE;
CREATE TYPE schedule_event_result AS (
  event_id UUID,
  already_existed BOOLEAN,
  existing_execute_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION rpc_schedule_event_v2(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_payload JSONB,
  p_execute_at TIMESTAMPTZ,
  p_idempotency_key TEXT,
  p_priority INT DEFAULT 0
) RETURNS schedule_event_result AS $$
DECLARE
  v_result schedule_event_result;
  v_existing RECORD;
BEGIN
  -- Check for existing active event with same idempotency_key
  SELECT id, execute_at INTO v_existing
  FROM events
  WHERE idempotency_key = p_idempotency_key
    AND status IN ('pending', 'processing')
  FOR UPDATE;

  IF FOUND THEN
    v_result.event_id := v_existing.id;
    v_result.already_existed := TRUE;
    v_result.existing_execute_at := v_existing.execute_at;
    RETURN v_result;
  END IF;

  INSERT INTO events (
    event_type, entity_type, entity_id, payload,
    execute_at, idempotency_key, priority, version
  ) VALUES (
    p_event_type, p_entity_type, p_entity_id, p_payload,
    p_execute_at, p_idempotency_key, p_priority, 2
  )
  RETURNING id INTO v_result.event_id;

  v_result.already_existed := FALSE;
  v_result.existing_execute_at := NULL;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- rpc_claim_pending_events_v2
-- CHANGES vs V1:
-- - Sets locked_until = NOW() + lock_duration
-- - Also reclaims stuck events (processing but locked_until expired)
-- - Respects priority ordering
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_claim_pending_events_v2(
  p_worker_id TEXT,
  p_limit INT DEFAULT 10,
  p_lock_duration_seconds INT DEFAULT 120
) RETURNS SETOF events AS $$
DECLARE
  v_lock_until TIMESTAMPTZ;
BEGIN
  v_lock_until := NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL;

  -- First: reclaim stuck events whose lock expired
  UPDATE events
  SET status = 'pending',
      worker_id = NULL,
      locked_until = NULL,
      last_error = COALESCE(last_error, '') || ' [auto-recovered from stuck processing at ' || NOW()::TEXT || ']'
  WHERE status = 'processing'
    AND locked_until IS NOT NULL
    AND locked_until < NOW()
    AND retry_count < max_retries;

  -- Then: claim pending events
  RETURN QUERY
  UPDATE events
  SET status = 'processing',
      worker_id = p_worker_id,
      locked_until = v_lock_until
  WHERE id IN (
    SELECT id FROM events
    WHERE status = 'pending'
      AND execute_at <= NOW()
    ORDER BY priority DESC, execute_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- rpc_complete_event_v2
-- CHANGES vs V1:
-- - Clears locked_until and worker_id
-- - Validates the event is actually in processing state
-- - Returns boolean success
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_complete_event_v2(
  p_event_id UUID,
  p_worker_id TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE events
  SET status = 'completed',
      processed_at = NOW(),
      locked_until = NULL
  WHERE id = p_event_id
    AND status = 'processing'
    AND (p_worker_id IS NULL OR worker_id = p_worker_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- rpc_fail_event_v2
-- CHANGES vs V1:
-- - Clears locked_until on retry (so recovery can reclaim it)
-- - Appends error history instead of overwriting
-- - Returns new status for caller awareness
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_fail_event_v2(
  p_event_id UUID,
  p_error TEXT,
  p_worker_id TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_retry_count INT;
  v_max_retries INT;
  v_new_status TEXT;
BEGIN
  SELECT retry_count, max_retries INTO v_retry_count, v_max_retries
  FROM events
  WHERE id = p_event_id
    AND status = 'processing'
    AND (p_worker_id IS NULL OR worker_id = p_worker_id);

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_retry_count + 1 >= v_max_retries THEN
    v_new_status := 'failed';
    UPDATE events
    SET status = 'failed',
        retry_count = v_retry_count + 1,
        last_error = COALESCE(last_error || E'\n', '') || '[' || NOW()::TEXT || '] ' || p_error,
        processed_at = NOW(),
        locked_until = NULL,
        worker_id = NULL
    WHERE id = p_event_id;
  ELSE
    v_new_status := 'pending';
    UPDATE events
    SET status = 'pending',
        retry_count = v_retry_count + 1,
        last_error = COALESCE(last_error || E'\n', '') || '[' || NOW()::TEXT || '] ' || p_error,
        locked_until = NULL,
        worker_id = NULL
    WHERE id = p_event_id;
  END IF;

  RETURN v_new_status;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- rpc_cancel_event_v2
-- CHANGES vs V1:
-- - Uses idempotency_key instead of entity triplet
-- - Soft delete (status=cancelled) instead of hard DELETE
-- - Also supports cancel by entity for bulk operations
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_cancel_event_by_key(
  p_idempotency_key TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE events
  SET status = 'cancelled',
      cancelled_at = NOW(),
      locked_until = NULL,
      worker_id = NULL
  WHERE idempotency_key = p_idempotency_key
    AND status IN ('pending');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rpc_cancel_events_for_entity(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_event_type TEXT DEFAULT NULL
) RETURNS INT AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE events
  SET status = 'cancelled',
      cancelled_at = NOW(),
      locked_until = NULL,
      worker_id = NULL
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND (p_event_type IS NULL OR event_type = p_event_type)
    AND status IN ('pending');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- Utility: Query active events for an entity (for UI display)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_get_active_events(
  p_entity_type TEXT,
  p_entity_id UUID
) RETURNS SETOF events AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM events
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND status IN ('pending', 'processing')
  ORDER BY execute_at ASC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- Utility: Cleanup old completed/failed/cancelled events
-- Run periodically (e.g. daily) to keep table small
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_cleanup_old_events(
  p_older_than_days INT DEFAULT 7
) RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM events
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND processed_at < NOW() - (p_older_than_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;
