import { logger } from '@/utils/logger';
import type { GameEvent } from './types';

export async function handleFleetArrival(event: GameEvent): Promise<void> {
  const { mission_id } = event.payload as { mission_id: string };

  logger.log('[EventHandler][FleetArrival] Processing event', event.id, 'mission:', mission_id);

  // TODO Phase 3: Extract fleet arrival logic from worldTick.ts
  // This handler will:
  // 1. Lock target planet (SELECT FOR UPDATE)
  // 2. Materialize target planet resources
  // 3. Dispatch by mission_type (espionage, attack, transport, recycle, colonize, station)
  // 4. Create fleet_return event if ships survive
  // 5. Mark mission as processed

  logger.log('[EventHandler][FleetArrival] STUB - not yet implemented. mission:', mission_id);
  throw new Error('FleetArrival handler not yet implemented - will be added in Phase 3');
}
