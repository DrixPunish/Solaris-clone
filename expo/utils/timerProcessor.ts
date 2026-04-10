import { GameState, UpgradeTimer } from '@/types/game';
import { processShipyardQueue } from '@/utils/shipyardProcessor';

function clampCoordinates(coords: [number, number, number]): [number, number, number] {
  const galaxy = Math.min(Math.max(coords[0], 1), 5);
  const system = Math.min(Math.max(coords[1], 1), 20);
  const position = Math.min(Math.max(coords[2], 1), 15);
  return [galaxy, system, position];
}

export function processCompletedTimersAndQueue(parsed: GameState): GameState {
  const now = Date.now();

  const completedTimers: UpgradeTimer[] = [];
  const activeTimers: UpgradeTimer[] = [];
  for (const timer of (parsed.activeTimers ?? [])) {
    if (now >= timer.endTime) {
      completedTimers.push(timer);
    } else {
      activeTimers.push(timer);
    }
  }

  let buildings = { ...parsed.buildings };
  let research = { ...parsed.research };
  for (const timer of completedTimers) {
    if (timer.type === 'building') {
      buildings[timer.id] = timer.targetLevel;
    } else if (timer.type === 'research') {
      research[timer.id] = timer.targetLevel;
    }
  }

  const shipyardResult = processShipyardQueue(
    parsed.shipyardQueue ?? [],
    parsed.ships ?? {},
    parsed.defenses ?? {},
    now,
  );

  const updatedColonies = (parsed.colonies ?? []).map(colony => {
    const colCompleted: UpgradeTimer[] = [];
    const colActive: UpgradeTimer[] = [];
    for (const t of (colony.activeTimers ?? [])) {
      if (now >= t.endTime) colCompleted.push(t);
      else colActive.push(t);
    }
    let colBuildings = { ...colony.buildings };
    for (const t of colCompleted) {
      if (t.type === 'building') {
        colBuildings[t.id] = t.targetLevel;
      } else if (t.type === 'research') {
        research = { ...research, [t.id]: t.targetLevel };
      }
    }
    const colShipyard = processShipyardQueue(colony.shipyardQueue ?? [], colony.ships, colony.defenses, now);
    return {
      ...colony,
      buildings: colBuildings,
      ships: colShipyard.ships,
      defenses: colShipyard.defenses,
      activeTimers: colActive,
      shipyardQueue: colShipyard.queue,
    };
  });

  return {
    ...parsed,
    coordinates: clampCoordinates(parsed.coordinates),
    buildings,
    research,
    ships: shipyardResult.ships,
    defenses: shipyardResult.defenses,
    solar: parsed.solar ?? 500,
    activeTimers,
    shipyardQueue: shipyardResult.queue,
    colonies: updatedColonies.length > 0 ? updatedColonies : parsed.colonies,
    lastUpdate: now,
  };
}
