import { ShipyardQueueItem } from '@/types/game';

export interface ShipyardProcessResult {
  queue: ShipyardQueueItem[];
  ships: Record<string, number>;
  defenses: Record<string, number>;
  changed: boolean;
}

export function processShipyardQueue(
  queue: ShipyardQueueItem[],
  ships: Record<string, number>,
  defenses: Record<string, number>,
  now: number,
): ShipyardProcessResult {
  let changed = false;
  const newShips = { ...ships };
  const newDefenses = { ...defenses };
  const newQueue: ShipyardQueueItem[] = [];

  for (const item of queue) {
    const current = { ...item };
    while (now >= current.currentUnitEndTime && current.remainingQuantity > 0) {
      changed = true;
      if (current.type === 'ship') {
        newShips[current.id] = (newShips[current.id] ?? 0) + 1;
      } else {
        newDefenses[current.id] = (newDefenses[current.id] ?? 0) + 1;
      }
      current.remainingQuantity -= 1;
      if (current.remainingQuantity > 0) {
        current.currentUnitStartTime = current.currentUnitEndTime;
        current.currentUnitEndTime = current.currentUnitStartTime + current.buildTimePerUnit * 1000;
      }
    }
    if (current.remainingQuantity > 0) {
      newQueue.push(current);
    }
  }

  return { queue: newQueue, ships: newShips, defenses: newDefenses, changed };
}
