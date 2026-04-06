import { logger } from '@/utils/logger';
import type { GameEvent } from './types';

export async function handleFleetReturn(event: GameEvent): Promise<void> {
  const { mission_id } = event.payload as { mission_id: string };

  logger.log('[EventHandler][FleetReturn] Processing event', event.id, 'mission:', mission_id);

  // TODO Phase 3: Extract fleet return logic from worldTick.ts / rpc_process_fleet_returns
  // This handler will:
  // 1. Lock origin planet (SELECT FOR UPDATE)
  // 2. Restore ships to planet_ships
  // 3. Deposit carried resources (loot, collected debris)
  // 4. Mark mission as completed

  logger.log('[EventHandler][FleetReturn] STUB - not yet implemented. mission:', mission_id);
  throw new Error('FleetReturn handler not yet implemented - will be added in Phase 3');
}
