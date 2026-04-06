import { supabase } from './supabase';
import { GameState, UpgradeTimer } from '@/types/game';
import { calculateProduction, getResourceStorageCapacity } from './gameCalculations';
import { getMainPlanetId, loadStateFromTables } from './tableSync';
import { processShipyardQueue } from '@/utils/shipyardProcessor';
import { logger } from '@/utils/logger';

function materializeState(state: GameState): GameState {
  const now = Date.now();
  const elapsed = (now - (state.lastUpdate ?? now)) / 1000;

  if (elapsed < 2) {
    return state;
  }

  logger.log('[serverSync] Materializing state, offline for', Math.floor(elapsed), 'seconds');

  const completedTimers: UpgradeTimer[] = [];
  const activeTimers: UpgradeTimer[] = [];
  for (const timer of (state.activeTimers ?? [])) {
    if (now >= timer.endTime) {
      completedTimers.push(timer);
    } else {
      activeTimers.push(timer);
    }
  }

  let buildings = { ...state.buildings };
  let research = { ...state.research };
  for (const timer of completedTimers) {
    if (timer.type === 'building') {
      buildings[timer.id] = timer.targetLevel;
    } else if (timer.type === 'research') {
      research[timer.id] = timer.targetLevel;
    }
  }

  const shipyardResult = processShipyardQueue(
    state.shipyardQueue ?? [],
    state.ships ?? {},
    state.defenses ?? {},
    now,
  );

  const production = calculateProduction(buildings, research, shipyardResult.ships);
  const storageCap = getResourceStorageCapacity(buildings);

  const isOverFer = state.resources.fer >= storageCap.fer;
  const isOverSilice = state.resources.silice >= storageCap.silice;
  const isOverXenogas = state.resources.xenogas >= storageCap.xenogas;

  const newResources = {
    fer: isOverFer ? state.resources.fer : Math.min(state.resources.fer + (production.fer / 3600) * elapsed, storageCap.fer),
    silice: isOverSilice ? state.resources.silice : Math.min(state.resources.silice + (production.silice / 3600) * elapsed, storageCap.silice),
    xenogas: isOverXenogas ? state.resources.xenogas : Math.min(state.resources.xenogas + (production.xenogas / 3600) * elapsed, storageCap.xenogas),
    energy: production.energy,
  };

  const updatedColonies = (state.colonies ?? []).map(colony => {
    const colCompletedTimers: UpgradeTimer[] = [];
    const colActiveTimers: UpgradeTimer[] = [];
    for (const timer of (colony.activeTimers ?? [])) {
      if (now >= timer.endTime) colCompletedTimers.push(timer);
      else colActiveTimers.push(timer);
    }
    let colBuildings = { ...colony.buildings };
    for (const timer of colCompletedTimers) {
      if (timer.type === 'building') {
        colBuildings[timer.id] = timer.targetLevel;
      } else if (timer.type === 'research') {
        research = { ...research, [timer.id]: timer.targetLevel };
      }
    }
    const colShipyard = processShipyardQueue(colony.shipyardQueue ?? [], colony.ships ?? {}, colony.defenses ?? {}, now);
    const colProd = calculateProduction(colBuildings, research, colShipyard.ships);
    const colStorage = getResourceStorageCapacity(colBuildings);
    const colElapsed = (now - (colony.lastUpdate ?? now)) / 1000;
    return {
      ...colony,
      buildings: colBuildings,
      ships: colShipyard.ships,
      defenses: colShipyard.defenses,
      resources: {
        fer: colony.resources.fer >= colStorage.fer ? colony.resources.fer : Math.min(colony.resources.fer + (colProd.fer / 3600) * colElapsed, colStorage.fer),
        silice: colony.resources.silice >= colStorage.silice ? colony.resources.silice : Math.min(colony.resources.silice + (colProd.silice / 3600) * colElapsed, colStorage.silice),
        xenogas: colony.resources.xenogas >= colStorage.xenogas ? colony.resources.xenogas : Math.min(colony.resources.xenogas + (colProd.xenogas / 3600) * colElapsed, colStorage.xenogas),
        energy: colProd.energy,
      },
      activeTimers: colActiveTimers,
      shipyardQueue: colShipyard.queue,
      lastUpdate: now,
    };
  });

  return {
    ...state,
    buildings,
    research,
    ships: shipyardResult.ships,
    defenses: shipyardResult.defenses,
    resources: newResources,
    activeTimers,
    shipyardQueue: shipyardResult.queue,
    colonies: updatedColonies.length > 0 ? updatedColonies : state.colonies,
    lastUpdate: now,
  };
}

export async function materializeTargetState(targetPlayerId: string, saveToDb: boolean = false): Promise<GameState | null> {
  logger.log('[serverSync] Materializing state for player', targetPlayerId, saveToDb ? '(will save)' : '(read-only)');

  const tablesResult = await loadStateFromTables(targetPlayerId);
  if (!tablesResult) {
    logger.log('[serverSync] No state found for player', targetPlayerId);
    return null;
  }

  const rawState = tablesResult.state;

  const materialized = materializeState(rawState);

  return materialized;
}

export async function deductFromTargetState(
  targetPlayerId: string,
  loot: { fer: number; silice: number; xenogas: number },
  shipLosses: Record<string, number>,
  defenseLosses: Record<string, number>,
  defenseRebuilds: Record<string, number>,
): Promise<void> {
  logger.log('[serverSync] Deducting attack losses from target', targetPlayerId);

  const planetId = await getMainPlanetId(targetPlayerId);
  if (planetId) {
    const { error: rpcError } = await supabase.rpc('apply_attack_loot', {
      p_planet_id: planetId,
      p_loot_fer: loot.fer,
      p_loot_silice: loot.silice,
      p_loot_xenogas: loot.xenogas,
      p_ship_losses: shipLosses,
      p_defense_losses: defenseLosses,
      p_defense_rebuilds: defenseRebuilds,
    });

    if (rpcError) {
      logger.error('[serverSync] RPC apply_attack_loot error:', rpcError.message);
    }
  } else {
    logger.warn('[serverSync] No planet found in tables, skipping RPC');
  }
}

export async function addResourcesToTargetState(
  targetPlayerId: string,
  resources: { fer: number; silice: number; xenogas: number },
): Promise<void> {
  const planetId = await getMainPlanetId(targetPlayerId);
  if (planetId) {
    const { error: rpcError } = await supabase.rpc('add_resources_to_planet', {
      p_planet_id: planetId,
      p_fer: resources.fer,
      p_silice: resources.silice,
      p_xenogas: resources.xenogas,
    });

    if (rpcError) {
      logger.error('[serverSync] RPC add_resources error:', rpcError.message);
    } else {
      await supabase.from('planets').update({ last_update: Date.now() }).eq('id', planetId);
    }
  } else {
    logger.warn('[serverSync] No planet found in tables, skipping RPC');
  }
}

export async function addResourcesToPlanetByCoords(
  coords: number[],
  resources: { fer: number; silice: number; xenogas: number },
): Promise<void> {
  const { data: planet } = await supabase
    .from('planets')
    .select('id')
    .filter('coordinates->>0', 'eq', String(coords[0]))
    .filter('coordinates->>1', 'eq', String(coords[1]))
    .filter('coordinates->>2', 'eq', String(coords[2]))
    .single();

  if (planet) {
    const { error: rpcError } = await supabase.rpc('add_resources_to_planet', {
      p_planet_id: planet.id,
      p_fer: resources.fer,
      p_silice: resources.silice,
      p_xenogas: resources.xenogas,
    });

    if (rpcError) {
      logger.error('[serverSync] RPC add_resources_by_coords error:', rpcError.message);
    } else {
      await supabase.from('planets').update({ last_update: Date.now() }).eq('id', planet.id);
    }
  } else {
    logger.warn('[serverSync] No planet found at coords', coords);
  }
}
