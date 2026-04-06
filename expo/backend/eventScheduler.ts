import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import type { EventType, ScheduleEventResult } from '@/backend/eventHandlers/types';

export const IdempotencyKeys = {
  buildingComplete(planetId: string, buildingId: string): string {
    return `building:${planetId}:${buildingId}`;
  },

  researchComplete(playerId: string, researchId: string): string {
    return `research:${playerId}:${researchId}`;
  },

  shipyardUnitComplete(planetId: string, itemId: string, queueId?: string, queuePosition?: number): string {
    if (queueId) {
      return `shipyard:${planetId}:${itemId}:${queueId}:${queuePosition ?? 0}`;
    }
    return `shipyard:${planetId}:${itemId}:${queuePosition ?? 0}`;
  },

  fleetArrival(missionId: string): string {
    return `fleet_arrival:${missionId}`;
  },

  fleetReturn(missionId: string): string {
    return `fleet_return:${missionId}`;
  },

  scoreRecalc(playerId: string | null, dateBucket?: string): string {
    const target = playerId ?? 'all';
    const bucket = dateBucket ?? new Date().toISOString().slice(0, 13);
    return `score_recalc:${target}:${bucket}`;
  },
} as const;

export enum EventPriority {
  LOW = 0,
  NORMAL = 10,
  HIGH = 20,
  CRITICAL = 30,
}

interface ScheduleParams {
  eventType: EventType;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  executeAt: Date | string;
  idempotencyKey: string;
  priority?: EventPriority;
}

export async function scheduleEvent(params: ScheduleParams): Promise<{
  eventId: string;
  alreadyExisted: boolean;
  existingExecuteAt: string | null;
}> {
  const executeAtStr = params.executeAt instanceof Date
    ? params.executeAt.toISOString()
    : params.executeAt;

  logger.log(
    '[EventScheduler] Scheduling event:',
    params.eventType,
    'entity:', params.entityType, '/', params.entityId,
    'key:', params.idempotencyKey,
    'execute_at:', executeAtStr
  );

  const { data, error } = await supabase.rpc('rpc_schedule_event_v2', {
    p_event_type: params.eventType,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_payload: params.payload,
    p_execute_at: executeAtStr,
    p_idempotency_key: params.idempotencyKey,
    p_priority: params.priority ?? EventPriority.NORMAL,
  });

  if (error) {
    logger.log('[EventScheduler] Error scheduling event:', error.message);
    throw new Error(`Failed to schedule event: ${error.message}`);
  }

  const result = data as ScheduleEventResult;

  if (result.already_existed) {
    logger.log(
      '[EventScheduler] Event already exists for key:', params.idempotencyKey,
      'existing event:', result.event_id,
      'existing execute_at:', result.existing_execute_at
    );
  } else {
    logger.log('[EventScheduler] Event scheduled:', result.event_id);
  }

  return {
    eventId: result.event_id,
    alreadyExisted: result.already_existed,
    existingExecuteAt: result.existing_execute_at,
  };
}

export async function cancelEventByKey(idempotencyKey: string, includeProcessing: boolean = true): Promise<boolean> {
  logger.log('[EventScheduler] Cancelling event by key:', idempotencyKey, 'includeProcessing:', includeProcessing);

  const { data, error } = await supabase.rpc('rpc_cancel_event_by_key', {
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    logger.log('[EventScheduler] Error cancelling event:', error.message);
    throw new Error(`Failed to cancel event: ${error.message}`);
  }

  const cancelled = data as boolean;

  if (!cancelled && includeProcessing) {
    const { data: processingEvent } = await supabase
      .from('events')
      .select('id, status')
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'processing')
      .maybeSingle();

    if (processingEvent) {
      logger.log('[EventScheduler] Event in processing state, marking as cancelled:', processingEvent.id);
      const { error: updateErr } = await supabase
        .from('events')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', processingEvent.id)
        .eq('status', 'processing');

      if (updateErr) {
        logger.log('[EventScheduler] Error force-cancelling processing event:', updateErr.message);
      } else {
        logger.log('[EventScheduler] Processing event force-cancelled:', processingEvent.id);
        return true;
      }
    }
  }

  logger.log('[EventScheduler] Cancel result for key:', idempotencyKey, '->', cancelled);
  return cancelled;
}

export async function cancelEventsForEntity(
  entityType: string,
  entityId: string,
  eventType?: EventType,
  includeProcessing: boolean = true
): Promise<number> {
  logger.log('[EventScheduler] Cancelling events for entity:', entityType, '/', entityId, eventType ? `type: ${eventType}` : '(all types)', 'includeProcessing:', includeProcessing);

  const { data, error } = await supabase.rpc('rpc_cancel_events_for_entity', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_event_type: eventType ?? null,
  });

  if (error) {
    logger.log('[EventScheduler] Error cancelling entity events:', error.message);
    throw new Error(`Failed to cancel entity events: ${error.message}`);
  }

  let count = data as number;

  if (includeProcessing) {
    let processingQuery = supabase
      .from('events')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'processing');

    if (eventType) {
      processingQuery = processingQuery.eq('event_type', eventType);
    }

    const { data: processingEvents } = await processingQuery;

    if (processingEvents && processingEvents.length > 0) {
      const ids = processingEvents.map(e => e.id as string);
      logger.log('[EventScheduler] Force-cancelling', ids.length, 'processing events for entity:', entityType, '/', entityId);

      const { error: updateErr } = await supabase
        .from('events')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .in('id', ids)
        .eq('status', 'processing');

      if (updateErr) {
        logger.log('[EventScheduler] Error force-cancelling processing events:', updateErr.message);
      } else {
        count += ids.length;
      }
    }
  }

  logger.log('[EventScheduler] Cancelled', count, 'events for entity:', entityType, '/', entityId);
  return count;
}

export async function getActiveEventsForEntity(
  entityType: string,
  entityId: string
): Promise<import('@/backend/eventHandlers/types').GameEvent[]> {
  const { data, error } = await supabase.rpc('rpc_get_active_events', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });

  if (error) {
    logger.log('[EventScheduler] Error fetching active events:', error.message);
    throw new Error(`Failed to fetch active events: ${error.message}`);
  }

  return (data ?? []) as import('@/backend/eventHandlers/types').GameEvent[];
}

export function scheduleBuildingComplete(
  planetId: string,
  buildingId: string,
  targetLevel: number,
  executeAt: Date | string,
  timerId?: string
) {
  return scheduleEvent({
    eventType: 'building_complete',
    entityType: 'planet',
    entityId: planetId,
    payload: {
      planet_id: planetId,
      building_id: buildingId,
      target_level: targetLevel,
      ...(timerId ? { timer_id: timerId } : {}),
    },
    executeAt,
    idempotencyKey: IdempotencyKeys.buildingComplete(planetId, buildingId),
    priority: EventPriority.NORMAL,
  });
}

export function scheduleResearchComplete(
  playerId: string,
  researchId: string,
  targetLevel: number,
  executeAt: Date | string,
  timerId?: string
) {
  return scheduleEvent({
    eventType: 'research_complete',
    entityType: 'player',
    entityId: playerId,
    payload: {
      player_id: playerId,
      research_id: researchId,
      target_level: targetLevel,
      ...(timerId ? { timer_id: timerId } : {}),
    },
    executeAt,
    idempotencyKey: IdempotencyKeys.researchComplete(playerId, researchId),
    priority: EventPriority.NORMAL,
  });
}

export function scheduleShipyardUnitComplete(
  planetId: string,
  itemId: string,
  itemType: 'ship' | 'defense',
  queuePosition: number,
  executeAt: Date | string,
  queueId?: string
) {
  return scheduleEvent({
    eventType: 'shipyard_unit_complete',
    entityType: 'planet',
    entityId: planetId,
    payload: {
      planet_id: planetId,
      item_id: itemId,
      item_type: itemType,
      queue_position: queuePosition,
      ...(queueId ? { queue_id: queueId } : {}),
    },
    executeAt,
    idempotencyKey: IdempotencyKeys.shipyardUnitComplete(planetId, itemId, queueId, queuePosition),
    priority: EventPriority.NORMAL,
  });
}

export function scheduleFleetArrival(
  missionId: string,
  targetPlanetId: string,
  executeAt: Date | string
) {
  return scheduleEvent({
    eventType: 'fleet_arrival',
    entityType: 'planet',
    entityId: targetPlanetId,
    payload: { mission_id: missionId },
    executeAt,
    idempotencyKey: IdempotencyKeys.fleetArrival(missionId),
    priority: EventPriority.HIGH,
  });
}

export function scheduleFleetReturn(
  missionId: string,
  originPlanetId: string,
  executeAt: Date | string
) {
  return scheduleEvent({
    eventType: 'fleet_return',
    entityType: 'planet',
    entityId: originPlanetId,
    payload: { mission_id: missionId },
    executeAt,
    idempotencyKey: IdempotencyKeys.fleetReturn(missionId),
    priority: EventPriority.HIGH,
  });
}

export function scheduleScoreRecalc(
  playerId: string | null,
  executeAt?: Date | string
) {
  return scheduleEvent({
    eventType: 'score_recalc',
    entityType: playerId ? 'player' : 'system',
    entityId: playerId ?? '00000000-0000-0000-0000-000000000000',
    payload: { player_id: playerId },
    executeAt: executeAt ?? new Date(),
    idempotencyKey: IdempotencyKeys.scoreRecalc(playerId),
    priority: EventPriority.LOW,
  });
}

export async function ensureEventForShipyardQueue(
  planetId: string,
  itemId: string,
  itemType: 'ship' | 'defense',
  currentUnitEndTime: number,
  queueId?: string
): Promise<boolean> {
  logger.log('[EventScheduler] Checking event coherence for shipyard queue:', planetId, itemId, itemType);

  const keyPrefix = queueId
    ? `shipyard:${planetId}:${itemId}:${queueId}`
    : `shipyard:${planetId}:${itemId}`;

  const { data: activeEvents } = await supabase
    .from('events')
    .select('id, status, idempotency_key')
    .like('idempotency_key', `${keyPrefix}%`)
    .in('status', ['pending', 'processing']);

  if (activeEvents && activeEvents.length > 0) {
    logger.log('[EventScheduler] Active event already exists for shipyard queue:', activeEvents[0].id);
    return false;
  }

  logger.log('[EventScheduler] No active event found for shipyard queue - scheduling recovery event');

  try {
    await scheduleShipyardUnitComplete(
      planetId,
      itemId,
      itemType,
      0,
      new Date(currentUnitEndTime),
      queueId,
    );
    logger.log('[EventScheduler] Recovery event scheduled for orphaned shipyard queue');
    return true;
  } catch (e) {
    logger.log('[EventScheduler] Error scheduling recovery event:', e instanceof Error ? e.message : String(e));
    return false;
  }
}
