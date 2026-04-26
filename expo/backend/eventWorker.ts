import { supabase } from '@/backend/supabase';
import { dispatchEvent } from '@/backend/eventHandlers';
import type { GameEvent } from '@/backend/eventHandlers/types';
import { logger } from '@/utils/logger';

const WORKER_ID = `railway_worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 1000;
const LOCK_DURATION_SECONDS = 120;

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let processedCount = 0;
let failedCount = 0;
let recoveredCount = 0;
let lastProcessTime = 0;

async function processEventBatch(): Promise<number> {
  if (isProcessing) {
    logger.log('[EventWorker] Already processing, skipping cycle');
    return 0;
  }

  isProcessing = true;
  const start = Date.now();

  try {
    const { data: events, error } = await supabase.rpc('rpc_claim_pending_events_v2', {
      p_worker_id: WORKER_ID,
      p_limit: BATCH_SIZE,
      p_lock_duration_seconds: LOCK_DURATION_SECONDS,
    });

    if (error) {
      logger.log('[EventWorker] Error claiming events:', error.message);
      return 0;
    }

    const claimed = (events ?? []) as GameEvent[];
    if (claimed.length === 0) return 0;

    const freshClaimed = claimed.filter(e => e.version >= 2 || e.version === 1);
    const recoveredEvents = claimed.filter(e =>
      e.last_error?.includes('[auto-recovered from stuck processing')
    );

    if (recoveredEvents.length > 0) {
      recoveredCount += recoveredEvents.length;
      logger.log('[EventWorker] Recovered', recoveredEvents.length, 'stuck events');
    }

    logger.log('[EventWorker] Claimed', freshClaimed.length, 'events to process');

    let completed = 0;
    for (const event of freshClaimed) {
      try {
        await dispatchEvent(event);

        const { data: success, error: completeErr } = await supabase.rpc('rpc_complete_event_v2', {
          p_event_id: event.id,
          p_worker_id: WORKER_ID,
        });

        if (completeErr) {
          logger.log('[EventWorker] Error marking event completed:', event.id, completeErr.message);
        } else if (!success) {
          logger.log('[EventWorker] Event was not in processing state (possibly reclaimed):', event.id);
        }

        completed++;
        processedCount++;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logger.log('[EventWorker] Error processing event', event.id, '(', event.event_type, '):', errorMsg);

        const { data: newStatus, error: failErr } = await supabase.rpc('rpc_fail_event_v2', {
          p_event_id: event.id,
          p_error: errorMsg,
          p_worker_id: WORKER_ID,
        });

        if (failErr) {
          logger.log('[EventWorker] Error marking event failed:', event.id, failErr.message);
        } else {
          logger.log('[EventWorker] Event', event.id, 'new status after failure:', newStatus);
        }

        failedCount++;
      }
    }

    const duration = Date.now() - start;
    lastProcessTime = duration;

    if (completed > 0 || failedCount > 0) {
      logger.log(`[EventWorker] Batch complete in ${duration}ms: ${completed}/${freshClaimed.length} succeeded, total processed: ${processedCount}, total failed: ${failedCount}, total recovered: ${recoveredCount}`);
    }

    return completed;
  } catch (e) {
    logger.log('[EventWorker] Critical error in batch processing:', e);
    return 0;
  } finally {
    isProcessing = false;
  }
}

export function startEventWorkerLoop(intervalMs: number = POLL_INTERVAL_MS): void {
  if (workerInterval) {
    logger.log('[EventWorker] Worker loop already running');
    return;
  }

  logger.log(`[EventWorker] Starting event worker loop (${intervalMs}ms interval, worker: ${WORKER_ID}, lock: ${LOCK_DURATION_SECONDS}s)`);

  workerInterval = setInterval(() => {
    void processEventBatch();
  }, intervalMs);

  void processEventBatch();
}

export function stopEventWorkerLoop(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.log('[EventWorker] Worker loop stopped');
  }
}

export function getEventWorkerStats(): {
  workerId: string;
  isRunning: boolean;
  isProcessing: boolean;
  processedCount: number;
  failedCount: number;
  recoveredCount: number;
  lastProcessTime: number;
  lockDurationSeconds: number;
} {
  return {
    workerId: WORKER_ID,
    isRunning: workerInterval !== null,
    isProcessing,
    processedCount,
    failedCount,
    recoveredCount,
    lastProcessTime,
    lockDurationSeconds: LOCK_DURATION_SECONDS,
  };
}
