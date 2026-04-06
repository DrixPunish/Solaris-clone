import { supabase } from '@/backend/supabase';
import { dispatchEvent } from '@/backend/eventHandlers';
import type { GameEvent } from '@/backend/eventHandlers/types';
import { logger } from '@/utils/logger';

const WORKER_ID = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 2000;

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let processedCount = 0;
let failedCount = 0;
let lastProcessTime = 0;

async function processEventBatch(): Promise<number> {
  if (isProcessing) {
    logger.log('[EventWorker] Already processing, skipping cycle');
    return 0;
  }

  isProcessing = true;
  const start = Date.now();

  try {
    const { data: events, error } = await supabase.rpc('rpc_claim_pending_events', {
      p_worker_id: WORKER_ID,
      p_limit: BATCH_SIZE,
    });

    if (error) {
      logger.log('[EventWorker] Error claiming events:', error.message);
      return 0;
    }

    const claimed = (events ?? []) as GameEvent[];
    if (claimed.length === 0) return 0;

    logger.log('[EventWorker] Claimed', claimed.length, 'events to process');

    let completed = 0;
    for (const event of claimed) {
      try {
        await dispatchEvent(event);

        const { error: completeErr } = await supabase.rpc('rpc_complete_event', {
          p_event_id: event.id,
        });

        if (completeErr) {
          logger.log('[EventWorker] Error marking event completed:', event.id, completeErr.message);
        }

        completed++;
        processedCount++;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logger.log('[EventWorker] Error processing event', event.id, '(', event.event_type, '):', errorMsg);

        const { error: failErr } = await supabase.rpc('rpc_fail_event', {
          p_event_id: event.id,
          p_error: errorMsg,
        });

        if (failErr) {
          logger.log('[EventWorker] Error marking event failed:', event.id, failErr.message);
        }

        failedCount++;
      }
    }

    const duration = Date.now() - start;
    lastProcessTime = duration;

    if (completed > 0 || failedCount > 0) {
      logger.log(`[EventWorker] Batch complete in ${duration}ms: ${completed}/${claimed.length} succeeded, total processed: ${processedCount}, total failed: ${failedCount}`);
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

  logger.log(`[EventWorker] Starting event worker loop (${intervalMs}ms interval, worker: ${WORKER_ID})`);

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
  lastProcessTime: number;
} {
  return {
    workerId: WORKER_ID,
    isRunning: workerInterval !== null,
    isProcessing,
    processedCount,
    failedCount,
    lastProcessTime,
  };
}
