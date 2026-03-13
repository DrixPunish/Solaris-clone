import { GameState } from '@/types/game';
import { BUILDINGS, RESEARCH, SHIPS, DEFENSES } from '@/constants/gameData';
import { calculateCost } from '@/utils/gameCalculations';

function sumResources(cost: { fer: number; silice: number; xenogas: number; energy: number }): number {
  return cost.fer + cost.silice + cost.xenogas;
}

export function calculateBuildingPoints(buildings: Record<string, number>): number {
  let total = 0;
  for (const building of BUILDINGS) {
    const level = buildings[building.id] ?? 0;
    for (let i = 0; i < level; i++) {
      const cost = calculateCost(building.baseCost, building.costFactor, i);
      total += sumResources(cost);
    }
  }
  return total;
}

export function calculateResearchPoints(research: Record<string, number>): number {
  let total = 0;
  for (const res of RESEARCH) {
    const level = research[res.id] ?? 0;
    for (let i = 0; i < level; i++) {
      const cost = calculateCost(res.baseCost, res.costFactor, i);
      total += sumResources(cost);
    }
  }
  return total;
}

export function calculateFleetPoints(ships: Record<string, number>): number {
  let total = 0;
  for (const ship of SHIPS) {
    const count = ships[ship.id] ?? 0;
    const unitCost = (ship.cost.fer ?? 0) + (ship.cost.silice ?? 0) + (ship.cost.xenogas ?? 0);
    total += unitCost * count;
  }
  return total;
}

export function calculateDefensePoints(defenses: Record<string, number>): number {
  let total = 0;
  for (const def of DEFENSES) {
    const count = defenses[def.id] ?? 0;
    const unitCost = (def.cost.fer ?? 0) + (def.cost.silice ?? 0) + (def.cost.xenogas ?? 0);
    total += unitCost * count;
  }
  return total;
}

export function calculateTotalPoints(state: GameState): number {
  const buildingRaw = calculateBuildingPoints(state.buildings);
  const researchRaw = calculateResearchPoints(state.research);
  const fleetRaw = calculateFleetPoints(state.ships);
  const defenseRaw = calculateDefensePoints(state.defenses);
  return Math.floor(buildingRaw / 1000) + Math.floor(researchRaw / 1000) + Math.floor(fleetRaw / 1000) + Math.floor(defenseRaw / 1000);
}

export interface PlayerScore {
  user_id: string;
  username: string;
  coordinates: [number, number, number];
  totalPoints: number;
  buildingPoints: number;
  researchPoints: number;
  fleetPoints: number;
  defensePoints: number;
}

export function calculatePlayerScore(
  userId: string,
  username: string,
  coordinates: [number, number, number],
  state: GameState,
): PlayerScore {
  const buildingRaw = calculateBuildingPoints(state.buildings);
  const researchRaw = calculateResearchPoints(state.research);
  const fleetRaw = calculateFleetPoints(state.ships);
  const defenseRaw = calculateDefensePoints(state.defenses);
  const buildingPoints = Math.floor(buildingRaw / 1000);
  const researchPoints = Math.floor(researchRaw / 1000);
  const fleetPoints = Math.floor(fleetRaw / 1000);
  const defensePoints = Math.floor(defenseRaw / 1000);
  return {
    user_id: userId,
    username,
    coordinates,
    totalPoints: buildingPoints + researchPoints + fleetPoints + defensePoints,
    buildingPoints,
    researchPoints,
    fleetPoints,
    defensePoints,
  };
}
