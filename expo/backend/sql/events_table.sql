-- =============================================================
-- EVENT QUEUE TABLE FOR EVENT-DRIVEN ARCHITECTURE
-- =============================================================
-- This table replaces the global tick system.
-- All timed actions (building, research, shipyard, fleet)
-- are scheduled as events with execute_at timestamps.
-- Workers poll this table and process events when they're due.
-- =============================================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  execute_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  worker_id TEXT,

  CONSTRAINT chk_event_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_events_pending
  ON events (execute_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_events_entity
  ON events (entity_type, entity_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_events_status_type
  ON events (status, event_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_pending
  ON events (entity_type, entity_id, event_type)
  WHERE status = 'pending';

-- =============================================================
-- RPC: Claim and process a batch of pending events
-- Used by the event worker to atomically claim events
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_claim_pending_events(
  p_worker_id TEXT,
  p_limit INT DEFAULT 10
) RETURNS SETOF events AS $$
BEGIN
  RETURN QUERY
  UPDATE events
  SET status = 'processing',
      worker_id = p_worker_id
  WHERE id IN (
    SELECT id FROM events
    WHERE status = 'pending'
      AND execute_at <= NOW()
    ORDER BY execute_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- RPC: Mark event as completed
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_complete_event(
  p_event_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE events
  SET status = 'completed',
      processed_at = NOW()
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- RPC: Mark event as failed with error
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_fail_event(
  p_event_id UUID,
  p_error TEXT
) RETURNS void AS $$
DECLARE
  v_retry_count INT;
  v_max_retries INT;
BEGIN
  SELECT retry_count, max_retries INTO v_retry_count, v_max_retries
  FROM events WHERE id = p_event_id;

  IF v_retry_count + 1 >= v_max_retries THEN
    UPDATE events
    SET status = 'failed',
        retry_count = v_retry_count + 1,
        last_error = p_error,
        processed_at = NOW()
    WHERE id = p_event_id;
  ELSE
    UPDATE events
    SET status = 'pending',
        retry_count = v_retry_count + 1,
        last_error = p_error,
        worker_id = NULL
    WHERE id = p_event_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- RPC: Cancel a pending event (e.g. when a timer is rushed/cancelled)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_cancel_event(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_event_type TEXT
) RETURNS void AS $$
BEGIN
  DELETE FROM events
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND event_type = p_event_type
    AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- RPC: Insert a new event (used by action RPCs)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_schedule_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_payload JSONB,
  p_execute_at TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO events (event_type, entity_type, entity_id, payload, execute_at)
  VALUES (p_event_type, p_entity_type, p_entity_id, p_payload, p_execute_at)
  ON CONFLICT (entity_type, entity_id, event_type)
    WHERE status = 'pending'
  DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
