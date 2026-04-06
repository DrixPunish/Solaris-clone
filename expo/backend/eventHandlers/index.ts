import { logger } from '@/utils/logger';
import type { GameEvent, EventHandler, EventType } from './types';
import { handleBuildingComplete } from './buildingComplete';
import { handleResearchComplete } from './researchComplete';
import { handleShipyardUnitComplete } from './shipyardComplete';
import { handleFleetArrival } from './fleetArrival';
import { handleFleetReturn } from './fleetReturn';
import { handleScoreRecalc } from './scoreRecalc';

const handlers: Record<string, EventHandler> = {
  building_complete: handleBuildingComplete,
  research_complete: handleResearchComplete,
  shipyard_unit_complete: handleShipyardUnitComplete,
  fleet_arrival: handleFleetArrival,
  fleet_return: handleFleetReturn,
  score_recalc: handleScoreRecalc,
};

export async function dispatchEvent(event: GameEvent): Promise<void> {
  const handler = handlers[event.event_type];

  if (!handler) {
    logger.log('[EventDispatch] Unknown event type:', event.event_type, 'for event:', event.id);
    throw new Error(`Unknown event type: ${event.event_type}`);
  }

  logger.log('[EventDispatch] Dispatching', event.event_type, 'event:', event.id, 'entity:', event.entity_type, '/', event.entity_id);
  await handler(event);
}

export type { GameEvent, EventHandler, EventType };
