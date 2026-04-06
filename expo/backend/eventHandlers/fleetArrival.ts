import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import { dispatchMission, type FleetMission } from '@/backend/fleetProcessing';
import { scheduleFleetReturn } from '@/backend/eventScheduler';
import type { GameEvent } from './types';

export async function handleFleetArrival(event: GameEvent): Promise<void> {
  const { mission_id } = event.payload as { mission_id: string };

  logger.log('[EventHandler][FleetArrival] Processing event', event.id, 'mission:', mission_id);

  const { data: missionRow, error: fetchErr } = await supabase
    .from('fleet_missions')
    .select('*')
    .eq('id', mission_id)
    .maybeSingle();

  if (fetchErr) {
    logger.log('[EventHandler][FleetArrival] Error fetching mission:', fetchErr.message);
    throw new Error(`Failed to fetch mission: ${fetchErr.message}`);
  }

  if (!missionRow) {
    logger.log('[EventHandler][FleetArrival] Mission not found:', mission_id, '- idempotent skip (deleted or purged)');
    return;
  }

  const mission = missionRow as unknown as FleetMission;

  if (mission.mission_phase === 'completed') {
    logger.log('[EventHandler][FleetArrival] Mission already completed:', mission_id, '- idempotent skip');
    return;
  }

  if (mission.mission_phase === 'returning') {
    logger.log('[EventHandler][FleetArrival] Mission already in returning phase:', mission_id, '- idempotent skip (arrival already processed)');
    return;
  }

  if (mission.mission_phase !== 'en_route' && mission.mission_phase !== 'arrived') {
    logger.log('[EventHandler][FleetArrival] Mission in unexpected phase:', mission.mission_phase, '- skipping');
    return;
  }

  if (mission.processed && mission.mission_phase !== 'en_route') {
    logger.log('[EventHandler][FleetArrival] Mission already processed by world tick:', mission_id, '- idempotent skip');
    return;
  }

  const now = Date.now();
  if (mission.arrival_time > now + 2000) {
    logger.log('[EventHandler][FleetArrival] Mission arrival_time', mission.arrival_time, 'is still in the future (now:', now, ') - stale event, skipping');
    return;
  }

  const { data: claimed } = await supabase
    .from('fleet_missions')
    .update({ processed: true, mission_phase: 'arrived' })
    .eq('id', mission_id)
    .eq('mission_phase', 'en_route')
    .select();

  if (!claimed?.length) {
    logger.log('[EventHandler][FleetArrival] Mission already claimed by world tick or another worker:', mission_id, '- idempotent skip');

    const { data: currentState } = await supabase
      .from('fleet_missions')
      .select('mission_phase, processed')
      .eq('id', mission_id)
      .maybeSingle();

    if (currentState?.mission_phase === 'arrived' && currentState?.processed === true) {
      logger.log('[EventHandler][FleetArrival] Mission was claimed but not yet dispatched, proceeding with dispatch');
    } else {
      return;
    }
  }

  logger.log('[EventHandler][FleetArrival] Mission claimed, dispatching:', mission_id, 'type:', mission.mission_type);

  try {
    await dispatchMission(mission);
    logger.log('[EventHandler][FleetArrival] Mission dispatched successfully:', mission_id);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    logger.log('[EventHandler][FleetArrival] Error dispatching mission:', mission_id, errorMsg);

    try {
      await supabase
        .from('fleet_missions')
        .update({ processed: false, mission_phase: 'en_route' })
        .eq('id', mission_id)
        .eq('mission_phase', 'arrived');
    } catch (resetErr) {
      logger.log('[EventHandler][FleetArrival] Error resetting failed mission:', mission_id, resetErr);
    }

    throw new Error(`Fleet arrival dispatch failed: ${errorMsg}`);
  }

  const { data: updatedMission } = await supabase
    .from('fleet_missions')
    .select('mission_phase, return_time, sender_coords')
    .eq('id', mission_id)
    .maybeSingle();

  if (updatedMission?.mission_phase === 'returning' && updatedMission.return_time) {
    logger.log('[EventHandler][FleetArrival] Mission transitioning to returning, scheduling fleet_return event');

    const senderCoords = updatedMission.sender_coords as number[] | null;
    let senderPlanetId = '00000000-0000-0000-0000-000000000000';

    if (senderCoords) {
      const { data: senderPlanet } = await supabase
        .from('planets')
        .select('id')
        .eq('user_id', mission.sender_id)
        .filter('coordinates->>0', 'eq', String(senderCoords[0]))
        .filter('coordinates->>1', 'eq', String(senderCoords[1]))
        .filter('coordinates->>2', 'eq', String(senderCoords[2]))
        .maybeSingle();

      if (senderPlanet) {
        senderPlanetId = senderPlanet.id as string;
      }
    }

    try {
      const executeAt = new Date(updatedMission.return_time as number);
      const result = await scheduleFleetReturn(mission_id, senderPlanetId, executeAt);
      logger.log('[EventHandler][FleetArrival] fleet_return event scheduled:', result.eventId, 'execute_at:', executeAt.toISOString());
    } catch (e) {
      logger.log('[EventHandler][FleetArrival] Non-blocking: failed to schedule fleet_return event (world tick will catch it):', e instanceof Error ? e.message : String(e));
    }
  } else {
    logger.log('[EventHandler][FleetArrival] Mission phase after dispatch:', updatedMission?.mission_phase ?? 'unknown', '- no fleet_return needed');
  }

  logger.log('[EventHandler][FleetArrival] === DONE === mission', mission_id);
}
