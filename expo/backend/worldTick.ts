import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import {
  scheduleBuildingComplete,
  scheduleResearchComplete,
  ensureEventForShipyardQueue,
  scheduleFleetArrival,
  scheduleFleetReturn,
} from '@/backend/eventScheduler';

interface PlanetRow {
  id: string;
  user_id: string;
  planet_name: string;
  coordinates: [number, number, number];
  is_main: boolean;
  last_update: number;
}

// ── Resource Production Update ──

const RESOURCE_BATCH_SIZE = 5;

async function updateSinglePlanetResources(
  planet: PlanetRow,
  _now: number,
): Promise<boolean> {
  const lastUpdate = planet.last_update ?? _now;
  const elapsed = (_now - lastUpdate) / 1000;
  if (elapsed < 30) return false;

  const { data: result, error: rpcErr } = await supabase.rpc('materialize_planet_resources', {
    p_planet_id: planet.id,
    p_user_id: planet.user_id,
  });

  if (rpcErr) {
    logger.log('[WorldTick] materialize_planet_resources error for planet', planet.id, ':', rpcErr.message);
    return false;
  }

  const matResult = result as { success?: boolean; skipped?: boolean; created?: boolean } | null;
  if (matResult?.skipped) return false;

  return true;
}

async function updateAllPlanetResources(): Promise<number> {
  const now = Date.now();
  const staleThreshold = now - 60_000;

  const { data: planets, error } = await supabase
    .from('planets')
    .select('id, user_id, last_update')
    .lt('last_update', staleThreshold)
    .limit(100);

  if (error) {
    logger.log('[WorldTick] Error fetching stale planets:', error.message);
    return 0;
  }
  if (!planets?.length) return 0;

  let count = 0;

  for (let i = 0; i < planets.length; i += RESOURCE_BATCH_SIZE) {
    const batch = (planets as PlanetRow[]).slice(i, i + RESOURCE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(planet => updateSinglePlanetResources(planet, now).catch(e => {
        logger.log('[WorldTick] Error updating planet', planet.id, ':', e);
        return false;
      }))
    );
    count += results.filter(Boolean).length;
  }

  if (count > 0) logger.log('[WorldTick] Updated resources for', count, 'planets');
  return count;
}

// ── Score Recalculation ──

let lastScoreRecalcTime = 0;
const SCORE_RECALC_INTERVAL = 60_000;

async function recalcAllScores(): Promise<number> {
  const now = Date.now();
  if (now - lastScoreRecalcTime < SCORE_RECALC_INTERVAL) return 0;

  lastScoreRecalcTime = now;

  const { data, error } = await supabase.rpc('recalc_all_player_scores');

  if (error) {
    logger.log('[WorldTick] recalc_all_player_scores error:', error.message);
    return 0;
  }

  const res = data as { success?: boolean; players_updated?: number } | null;
  const count = res?.players_updated ?? 0;

  if (count > 0) {
    logger.log('[WorldTick] Recalculated scores for', count, 'players');
  }

  return count;
}

// ── Orphan Recovery Sweep ──
// Safety net: find timers, queues, and fleet missions that have no
// corresponding pending/processing event and schedule recovery events.

let lastOrphanSweepTime = 0;
const ORPHAN_SWEEP_INTERVAL = 30_000;

async function sweepOrphanTimers(): Promise<number> {
  const now = Date.now();

  const { data: expiredTimers, error } = await supabase
    .from('active_timers')
    .select('id, user_id, planet_id, timer_type, target_id, target_level, end_time')
    .lte('end_time', now)
    .limit(50);

  if (error || !expiredTimers?.length) return 0;

  let recovered = 0;

  for (const timer of expiredTimers as Array<{
    id: string;
    user_id: string;
    planet_id: string | null;
    timer_type: string;
    target_id: string;
    target_level: number;
    end_time: number;
  }>) {
    const executeAt = new Date(timer.end_time);

    try {
      if (timer.timer_type === 'building' && timer.planet_id) {
        const key = `building:${timer.planet_id}:${timer.target_id}`;
        const { data: existingEvent } = await supabase
          .from('events')
          .select('id')
          .eq('idempotency_key', key)
          .in('status', ['pending', 'processing'])
          .maybeSingle();

        if (!existingEvent) {
          logger.log('[WorldTick][Orphan] Expired building timer with no event, scheduling recovery:', timer.id, timer.target_id, 'lv', timer.target_level);
          await scheduleBuildingComplete(timer.planet_id, timer.target_id, timer.target_level, executeAt, timer.id);
          recovered++;
        }
      } else if (timer.timer_type === 'research') {
        const key = `research:${timer.user_id}:${timer.target_id}`;
        const { data: existingEvent } = await supabase
          .from('events')
          .select('id')
          .eq('idempotency_key', key)
          .in('status', ['pending', 'processing'])
          .maybeSingle();

        if (!existingEvent) {
          logger.log('[WorldTick][Orphan] Expired research timer with no event, scheduling recovery:', timer.id, timer.target_id, 'lv', timer.target_level);
          await scheduleResearchComplete(timer.user_id, timer.target_id, timer.target_level, executeAt, timer.id);
          recovered++;
        }
      }
    } catch (e) {
      logger.log('[WorldTick][Orphan] Error recovering timer:', timer.id, e instanceof Error ? e.message : String(e));
    }
  }

  if (recovered > 0) {
    logger.log('[WorldTick][Orphan] Recovered', recovered, 'orphan timers');
  }

  return recovered;
}

async function sweepOrphanShipyardQueues(): Promise<number> {
  const now = Date.now();

  const { data: expiredQueues, error } = await supabase
    .from('shipyard_queue')
    .select('id, planet_id, item_id, item_type, remaining_quantity, current_unit_end_time')
    .lte('current_unit_end_time', now)
    .gt('remaining_quantity', 0)
    .limit(50);

  if (error || !expiredQueues?.length) return 0;

  let recovered = 0;

  for (const queue of expiredQueues as Array<{
    id: string;
    planet_id: string;
    item_id: string;
    item_type: string;
    remaining_quantity: number;
    current_unit_end_time: number;
  }>) {
    try {
      const didSchedule = await ensureEventForShipyardQueue(
        queue.planet_id,
        queue.item_id,
        queue.item_type as 'ship' | 'defense',
        queue.current_unit_end_time,
        queue.id,
      );
      if (didSchedule) recovered++;
    } catch (e) {
      logger.log('[WorldTick][Orphan] Error recovering shipyard queue:', queue.id, e instanceof Error ? e.message : String(e));
    }
  }

  if (recovered > 0) {
    logger.log('[WorldTick][Orphan] Recovered', recovered, 'orphan shipyard queues');
  }

  return recovered;
}

async function sweepOrphanFleetMissions(): Promise<number> {
  const now = Date.now();
  let recovered = 0;

  const { data: arrivedMissions, error: arrErr } = await supabase
    .from('fleet_missions')
    .select('id, target_coords, arrival_time')
    .eq('mission_phase', 'en_route')
    .eq('processed', false)
    .lte('arrival_time', now)
    .limit(50);

  if (!arrErr && arrivedMissions?.length) {
    for (const mission of arrivedMissions as Array<{ id: string; target_coords: number[]; arrival_time: number }>) {
      const key = `fleet_arrival:${mission.id}`;
      const { data: existingEvent } = await supabase
        .from('events')
        .select('id')
        .eq('idempotency_key', key)
        .in('status', ['pending', 'processing'])
        .maybeSingle();

      if (!existingEvent) {
        try {
          let targetPlanetId = '00000000-0000-0000-0000-000000000000';
          if (mission.target_coords) {
            const coords = mission.target_coords;
            const { data: planet } = await supabase
              .from('planets')
              .select('id')
              .filter('coordinates->>0', 'eq', String(coords[0]))
              .filter('coordinates->>1', 'eq', String(coords[1]))
              .filter('coordinates->>2', 'eq', String(coords[2]))
              .maybeSingle();
            if (planet) targetPlanetId = planet.id as string;
          }

          logger.log('[WorldTick][Orphan] Arrived fleet mission with no event, scheduling recovery:', mission.id);
          await scheduleFleetArrival(mission.id, targetPlanetId, new Date(mission.arrival_time));
          recovered++;
        } catch (e) {
          logger.log('[WorldTick][Orphan] Error recovering fleet arrival:', mission.id, e instanceof Error ? e.message : String(e));
        }
      }
    }
  }

  const { data: returningMissions, error: retErr } = await supabase
    .from('fleet_missions')
    .select('id, sender_id, sender_coords, return_time')
    .eq('mission_phase', 'returning')
    .lte('return_time', now)
    .limit(50);

  if (!retErr && returningMissions?.length) {
    for (const mission of returningMissions as Array<{ id: string; sender_id: string; sender_coords: number[] | null; return_time: number }>) {
      const key = `fleet_return:${mission.id}`;
      const { data: existingEvent } = await supabase
        .from('events')
        .select('id')
        .eq('idempotency_key', key)
        .in('status', ['pending', 'processing'])
        .maybeSingle();

      if (!existingEvent) {
        try {
          let senderPlanetId = '00000000-0000-0000-0000-000000000000';
          if (mission.sender_coords) {
            const coords = mission.sender_coords;
            const { data: planet } = await supabase
              .from('planets')
              .select('id')
              .eq('user_id', mission.sender_id)
              .filter('coordinates->>0', 'eq', String(coords[0]))
              .filter('coordinates->>1', 'eq', String(coords[1]))
              .filter('coordinates->>2', 'eq', String(coords[2]))
              .maybeSingle();
            if (planet) senderPlanetId = planet.id as string;
          }

          logger.log('[WorldTick][Orphan] Returning fleet mission with no event, scheduling recovery:', mission.id);
          await scheduleFleetReturn(mission.id, senderPlanetId, new Date(mission.return_time));
          recovered++;
        } catch (e) {
          logger.log('[WorldTick][Orphan] Error recovering fleet return:', mission.id, e instanceof Error ? e.message : String(e));
        }
      }
    }
  }

  if (recovered > 0) {
    logger.log('[WorldTick][Orphan] Recovered', recovered, 'orphan fleet missions');
  }

  return recovered;
}

async function runOrphanRecoverySweep(): Promise<number> {
  const now = Date.now();
  if (now - lastOrphanSweepTime < ORPHAN_SWEEP_INTERVAL) return 0;
  lastOrphanSweepTime = now;

  const [timers, queues, fleets] = await Promise.all([
    sweepOrphanTimers().catch(e => { logger.log('[WorldTick][Orphan] Timer sweep error:', e); return 0; }),
    sweepOrphanShipyardQueues().catch(e => { logger.log('[WorldTick][Orphan] Queue sweep error:', e); return 0; }),
    sweepOrphanFleetMissions().catch(e => { logger.log('[WorldTick][Orphan] Fleet sweep error:', e); return 0; }),
  ]);

  const total = timers + queues + fleets;
  if (total > 0) {
    logger.log('[WorldTick][Orphan] Recovery sweep: timers=', timers, 'queues=', queues, 'fleets=', fleets);
  }

  return total;
}

// ── Main Tick ──

let isRunning = false;
let skippedTicks = 0;
let lastTickDuration = 0;
let lastSuccessfulTickTime = Date.now();

export async function runWorldTick(): Promise<{
  resources: number;
  scores: number;
  orphans: number;
}> {
  if (isRunning) {
    skippedTicks++;
    const timeSinceLastTick = Date.now() - lastSuccessfulTickTime;
    logger.log(`[WorldTick] Already running, skipping (skipped=${skippedTicks}, lastDuration=${lastTickDuration}ms, timeSinceLastSuccess=${timeSinceLastTick}ms)`);
    return { resources: 0, scores: 0, orphans: 0 };
  }

  isRunning = true;
  const start = Date.now();
  const currentSkipped = skippedTicks;
  skippedTicks = 0;

  try {
    if (currentSkipped > 0) {
      logger.log(`[WorldTick] Resuming after ${currentSkipped} skipped ticks`);
    }

    const resources = await updateAllPlanetResources().catch(e => { logger.log('[WorldTick] Resource error:', e); return 0; });

    const scores = await recalcAllScores().catch(e => { logger.log('[WorldTick] Score recalc error:', e); return 0; });

    const orphans = await runOrphanRecoverySweep().catch(e => { logger.log('[WorldTick] Orphan sweep error:', e); return 0; });

    const duration = Date.now() - start;
    lastTickDuration = duration;
    lastSuccessfulTickTime = Date.now();

    const total = resources + scores + orphans;
    if (total > 0 || duration > 3000) {
      logger.log(`[WorldTick] Tick complete in ${duration}ms: resources=${resources} scores=${scores} orphans=${orphans}${currentSkipped > 0 ? ` (after ${currentSkipped} skipped)` : ''}`);
    }

    if (duration > 4000) {
      logger.log(`[WorldTick] WARNING: Tick took ${duration}ms, exceeding safe threshold.`);
    }

    return { resources, scores, orphans };
  } catch (e) {
    logger.log('[WorldTick] Critical tick error:', e);
    return { resources: 0, scores: 0, orphans: 0 };
  } finally {
    isRunning = false;
  }
}

// ── Auto-Scheduler ──

let tickInterval: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;
let lastHeartbeat = Date.now();

export function startWorldTickLoop(intervalMs: number = 10000): void {
  if (tickInterval) {
    logger.log('[WorldTick] Loop already running');
    return;
  }

  logger.log(`[WorldTick] Starting world tick loop every ${intervalMs}ms (resources + scores + orphan recovery only)`);
  tickInterval = setInterval(() => {
    tickCount++;
    const now = Date.now();
    if (now - lastHeartbeat >= 300_000) {
      logger.log(`[WorldTick] Heartbeat: ${tickCount} ticks executed, skipped=${skippedTicks}, lastDuration=${lastTickDuration}ms, uptime ${Math.round((now - startedAt) / 60_000)}min`);
      lastHeartbeat = now;
    }
    void runWorldTick();
  }, intervalMs);

  void runWorldTick();
}

const startedAt = Date.now();

export function stopWorldTickLoop(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    logger.log('[WorldTick] Loop stopped');
  }
}
