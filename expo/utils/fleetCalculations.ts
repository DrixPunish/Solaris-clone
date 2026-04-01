import { SHIPS, DEFENSES } from '@/constants/gameData';
import { CombatUnit, CombatRoundLog as CombatRoundLogType, CombatLogEntry as CombatLogEntryType } from '@/types/fleet';
import { getCargoBoost, getBoostedShipStats, getBoostedDefenseStats } from '@/utils/gameCalculations';
import { logger } from '@/utils/logger';

const COMBAT_ENGINE_VERSION = 'v3.1-2026-04-01';
const MAX_COMBAT_ROUNDS = 6;
const EXPLOSION_THRESHOLD = 0.7;

export const RAPIDFIRE_TABLE: Record<string, Record<string, number>> = {
  novaScout: {
    spectreSonde: 5,
    heliosRemorqueur: 5,
  },
  ferDeLance: {
    atlasCargo: 3,
    spectreSonde: 5,
    heliosRemorqueur: 5,
  },
  cyclone: {
    novaScout: 6,
    spectreSonde: 5,
    heliosRemorqueur: 5,
    kineticTurret: 10,
  },
  bastion: {
    spectreSonde: 5,
    heliosRemorqueur: 5,
  },
  pyro: {
    spectreSonde: 5,
    heliosRemorqueur: 5,
    kineticTurret: 20,
    pulseCannon: 20,
    beamCannon: 10,
    ionProjector: 10,
    massDriver: 5,
    solarCannon: 5,
  },
  nemesis: {
    atlasCargo: 3,
    atlasCargoXL: 3,
    novaScout: 4,
    ferDeLance: 4,
    cyclone: 4,
    bastion: 7,
    spectreSonde: 5,
    heliosRemorqueur: 5,
  },
  fulgurant: {
    spectreSonde: 5,
    heliosRemorqueur: 5,
    nemesis: 2,
    pulseCannon: 10,
  },
  titanAstral: {
    atlasCargo: 250,
    atlasCargoXL: 250,
    novaScout: 200,
    ferDeLance: 100,
    cyclone: 33,
    bastion: 30,
    pyro: 25,
    fulgurant: 5,
    spectreSonde: 1250,
    heliosRemorqueur: 1250,
    colonyShip: 250,
    mantaRecup: 250,
    nemesis: 15,
    kineticTurret: 200,
    pulseCannon: 200,
    beamCannon: 100,
    ionProjector: 100,
    massDriver: 50,
  },
};

const BASE_SHIP_DRIVE_TYPE: Record<string, 'chemical' | 'impulse' | 'void'> = {
  novaScout: 'chemical',
  ferDeLance: 'impulse',
  cyclone: 'impulse',
  bastion: 'void',
  pyro: 'impulse',
  nemesis: 'void',
  fulgurant: 'void',
  titanAstral: 'void',
  atlasCargo: 'chemical',
  atlasCargoXL: 'chemical',
  colonyShip: 'impulse',
  mantaRecup: 'chemical',
  spectreSonde: 'chemical',
  heliosRemorqueur: 'chemical',
};

export function getShipDriveType(shipId: string, research: Record<string, number>): 'chemical' | 'impulse' | 'void' {
  const impulseLevel = research.impulseReactor ?? 0;
  const voidLevel = research.voidDrive ?? 0;

  switch (shipId) {
    case 'mantaRecup':
      if (voidLevel >= 15) return 'void';
      if (impulseLevel >= 17) return 'impulse';
      return 'chemical';
    case 'pyro':
      if (voidLevel >= 8) return 'void';
      return 'impulse';
    case 'atlasCargo':
      if (impulseLevel >= 5) return 'impulse';
      return 'chemical';
    default:
      return BASE_SHIP_DRIVE_TYPE[shipId] ?? 'chemical';
  }
}

export const CHEMICAL_DRIVE_SHIPS = ['novaScout', 'atlasCargo', 'atlasCargoXL', 'mantaRecup', 'spectreSonde'];
export const IMPULSE_DRIVE_SHIPS = ['ferDeLance', 'cyclone', 'pyro', 'colonyShip'];
export const VOID_DRIVE_SHIPS = ['bastion', 'nemesis', 'fulgurant', 'titanAstral'];

export const DRIVE_UPGRADE_RULES: { shipId: string; fromDrive: string; toDrive: string; atLevel: number; researchId: string }[] = [
  { shipId: 'atlasCargo', fromDrive: 'Propulsion Chimique', toDrive: 'Réacteur à Impulsions', atLevel: 5, researchId: 'impulseReactor' },
  { shipId: 'mantaRecup', fromDrive: 'Propulsion Chimique', toDrive: 'Réacteur à Impulsions', atLevel: 17, researchId: 'impulseReactor' },
  { shipId: 'mantaRecup', fromDrive: 'Réacteur à Impulsions', toDrive: 'Voile Hyperspatial', atLevel: 15, researchId: 'voidDrive' },
  { shipId: 'pyro', fromDrive: 'Réacteur à Impulsions', toDrive: 'Voile Hyperspatial', atLevel: 8, researchId: 'voidDrive' },
];

export function getShipSpeed(shipId: string, research: Record<string, number>): number {
  const ship = SHIPS.find(s => s.id === shipId);
  if (!ship) return 0;

  const driveType = getShipDriveType(shipId, research);
  let bonus = 0;
  switch (driveType) {
    case 'chemical':
      bonus = (research.chemicalDrive ?? 0) * 0.10;
      break;
    case 'impulse':
      bonus = (research.impulseReactor ?? 0) * 0.20;
      break;
    case 'void':
      bonus = (research.voidDrive ?? 0) * 0.30;
      break;
  }

  return Math.floor(ship.stats.speed * (1 + bonus));
}

export function getSlowestSpeed(ships: Record<string, number>, research: Record<string, number>): number {
  let slowest = Infinity;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count <= 0) continue;
    const speed = getShipSpeed(shipId, research);
    if (speed > 0 && speed < slowest) {
      slowest = speed;
    }
  }
  return slowest === Infinity ? 1000 : slowest;
}

export function getMantaRecupCargoCapacity(mantaCount: number, research: Record<string, number>): number {
  const cargoMult = getCargoBoost(research.subspacialNodes ?? 0);
  const manta = SHIPS.find(s => s.id === 'mantaRecup');
  if (!manta || mantaCount <= 0) return 0;
  return Math.floor(manta.stats.cargo * cargoMult) * mantaCount;
}

export function getFleetCargoCapacity(ships: Record<string, number>, research: Record<string, number>): number {
  const cargoMult = getCargoBoost(research.subspacialNodes ?? 0);
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count <= 0) continue;
    const ship = SHIPS.find(s => s.id === shipId);
    if (ship) {
      total += Math.floor(ship.stats.cargo * cargoMult) * count;
    }
  }
  return total;
}

export function processEspionage(
  attackerEspionageLevel: number,
  defenderEspionageLevel: number,
  probesSent: number,
  defenderState: {
    resources: { fer: number; silice: number; xenogas: number };
    buildings: Record<string, number>;
    research: Record<string, number>;
    ships: Record<string, number>;
    defenses: Record<string, number>;
    planetName: string;
  },
): {
  resources: { fer: number; silice: number; xenogas: number } | null;
  buildings: Record<string, number> | null;
  research: Record<string, number> | null;
  ships: Record<string, number> | null;
  defenses: Record<string, number> | null;
  probesLost: number;
  planetName: string;
} {
  const techDiff = attackerEspionageLevel - defenderEspionageLevel;
  const rawInfoLevel = probesSent + techDiff * 2;
  const infoLevel = probesSent >= 1 ? Math.max(1, rawInfoLevel) : Math.max(0, rawInfoLevel);

  const detectionChancePerProbe = Math.max(0, (defenderEspionageLevel - attackerEspionageLevel) * 0.04 + 0.02);
  let probesLost = 0;
  for (let i = 0; i < probesSent; i++) {
    if (Math.random() < detectionChancePerProbe) {
      probesLost++;
    }
  }

  const resources = infoLevel >= 1 ? {
    fer: Math.floor(defenderState.resources.fer),
    silice: Math.floor(defenderState.resources.silice),
    xenogas: Math.floor(defenderState.resources.xenogas),
  } : null;

  const buildings = infoLevel >= 3 ? { ...defenderState.buildings } : null;
  const research = infoLevel >= 5 ? { ...defenderState.research } : null;
  const ships = infoLevel >= 7 ? { ...defenderState.ships } : null;
  const defenses = infoLevel >= 9 ? { ...defenderState.defenses } : null;

  return {
    resources,
    buildings,
    research,
    ships,
    defenses,
    probesLost,
    planetName: defenderState.planetName,
  };
}

function createAttackerUnits(
  ships: Record<string, number>,
  research: Record<string, number>,
): CombatUnit[] {
  const units: CombatUnit[] = [];
  logger.debug('[Combat] createAttackerUnits input:', JSON.stringify(ships), 'research:', JSON.stringify(research));
  for (const [shipId, count] of Object.entries(ships)) {
    if (count <= 0) continue;
    const shipDef = SHIPS.find(s => s.id === shipId);
    if (!shipDef) {
      logger.debug('[Combat] WARNING: ship not found in SHIPS:', shipId, 'SHIPS count:', SHIPS.length);
      continue;
    }
    const boosted = getBoostedShipStats(shipDef.stats, research);
    logger.debug('[Combat] Attacker unit:', shipId, 'x', count, 'baseStats:', JSON.stringify(shipDef.stats), 'boosted:', JSON.stringify(boosted), 'combatHull:', Math.floor(boosted.hull / 10));
    const combatHull = Math.floor(boosted.hull / 10);
    for (let i = 0; i < count; i++) {
      units.push({
        id: `${shipId}_${i}`,
        unitId: shipId,
        type: 'ship',
        attack: boosted.attack,
        shield: boosted.shield,
        maxShield: boosted.shield,
        hull: combatHull,
        maxHull: combatHull,
      });
    }
  }
  return units;
}

function createDefenderUnits(
  ships: Record<string, number>,
  defenses: Record<string, number>,
  research: Record<string, number>,
): CombatUnit[] {
  const units: CombatUnit[] = [];
  logger.debug('[Combat] createDefenderUnits ships:', JSON.stringify(ships), 'defenses:', JSON.stringify(defenses), 'research:', JSON.stringify(research));
  for (const [shipId, count] of Object.entries(ships)) {
    if (count <= 0) continue;
    const shipDef = SHIPS.find(s => s.id === shipId);
    if (!shipDef) continue;
    const boosted = getBoostedShipStats(shipDef.stats, research);
    const combatHull = Math.floor(boosted.hull / 10);
    for (let i = 0; i < count; i++) {
      units.push({
        id: `ship_${shipId}_${i}`,
        unitId: shipId,
        type: 'ship',
        attack: boosted.attack,
        shield: boosted.shield,
        maxShield: boosted.shield,
        hull: combatHull,
        maxHull: combatHull,
      });
    }
  }
  for (const [defId, count] of Object.entries(defenses)) {
    if (count <= 0) continue;
    const defDef = DEFENSES.find(d => d.id === defId);
    if (!defDef) {
      logger.debug('[Combat] WARNING: defense not found in DEFENSES:', defId, 'DEFENSES count:', DEFENSES.length);
      continue;
    }
    const boosted = getBoostedDefenseStats(defDef.stats, research);
    logger.debug('[Combat] Defender defense:', defId, 'x', count, 'baseStats:', JSON.stringify(defDef.stats), 'boosted:', JSON.stringify(boosted), 'combatHull:', Math.floor(boosted.hull / 10));
    const combatHull = Math.floor(boosted.hull / 10);
    for (let i = 0; i < count; i++) {
      units.push({
        id: `def_${defId}_${i}`,
        unitId: defId,
        type: 'defense',
        attack: boosted.attack,
        shield: boosted.shield,
        maxShield: boosted.shield,
        hull: combatHull,
        maxHull: combatHull,
      });
    }
  }
  return units;
}


function fireOneShot(
  unit: CombatUnit,
  targets: CombatUnit[],
  pendingDamage: Map<string, { shield: number; hull: number }>,
): string | null {
  const aliveTargets = targets.filter(t => t.hull > 0);
  if (aliveTargets.length === 0) return null;

  const target = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];

  let damage = unit.attack;
  const pending = pendingDamage.get(target.id) ?? { shield: 0, hull: 0 };
  const effectiveShield = Math.max(0, target.shield - pending.shield);

  if (damage <= target.maxShield * 0.01) {
    return target.unitId;
  }

  if (effectiveShield > 0) {
    const absorbed = Math.min(effectiveShield, damage);
    pending.shield += absorbed;
    damage -= absorbed;
  }
  if (damage > 0) {
    pending.hull += damage;
  }
  pendingDamage.set(target.id, pending);
  return target.unitId;
}

function fireOneUnit(
  unit: CombatUnit,
  targets: CombatUnit[],
  pendingDamage: Map<string, { shield: number; hull: number }>,
): void {
  const rfTable = RAPIDFIRE_TABLE[unit.unitId];
  let keepFiring = true;
  let maxShots = 0;

  while (keepFiring) {
    maxShots++;
    if (maxShots > 2000) break;

    const hitTargetId = fireOneShot(unit, targets, pendingDamage);
    if (hitTargetId === null) break;

    const rf = rfTable?.[hitTargetId] ?? 0;
    if (rf <= 1) {
      break;
    }
    const continueChance = 1 - (1 / rf);
    if (Math.random() >= continueChance) {
      break;
    }
  }
}

interface RoundDamageStats {
  atkShotsFired: number;
  defShotsFired: number;
  totalShieldDmgOnDef: number;
  totalHullDmgOnDef: number;
  totalShieldDmgOnAtk: number;
  totalHullDmgOnAtk: number;
  explosions: number;
  explosionChecks: number;
}

function fireRoundSimultaneous(attackers: CombatUnit[], defenders: CombatUnit[], roundNum: number): RoundDamageStats {
  const pendingDmgOnDef = new Map<string, { shield: number; hull: number }>();
  const pendingDmgOnAtt = new Map<string, { shield: number; hull: number }>();

  let atkShotsFired = 0;
  let defShotsFired = 0;

  for (const unit of attackers) {
    if (unit.hull <= 0) continue;
    atkShotsFired++;
    fireOneUnit(unit, defenders, pendingDmgOnDef);
  }

  for (const unit of defenders) {
    if (unit.hull <= 0) continue;
    defShotsFired++;
    fireOneUnit(unit, attackers, pendingDmgOnAtt);
  }

  let totalHullDmgOnDef = 0;
  let totalShieldDmgOnDef = 0;
  let defUnitsHit = 0;

  for (const unit of defenders) {
    const pending = pendingDmgOnDef.get(unit.id);
    if (!pending) continue;
    defUnitsHit++;
    const shieldDmg = Math.min(unit.shield, pending.shield);
    unit.shield -= shieldDmg;
    const hullDmg = pending.hull + (pending.shield - shieldDmg);
    totalShieldDmgOnDef += shieldDmg;
    if (hullDmg > 0) {
      unit.hull -= hullDmg;
      totalHullDmgOnDef += hullDmg;
    }
  }

  let totalHullDmgOnAtk = 0;
  let totalShieldDmgOnAtk = 0;

  for (const unit of attackers) {
    const pending = pendingDmgOnAtt.get(unit.id);
    if (!pending) continue;
    const shieldDmg = Math.min(unit.shield, pending.shield);
    unit.shield -= shieldDmg;
    const hullDmg = pending.hull + (pending.shield - shieldDmg);
    totalShieldDmgOnAtk += shieldDmg;
    if (hullDmg > 0) {
      unit.hull -= hullDmg;
      totalHullDmgOnAtk += hullDmg;
    }
  }

  logger.debug(`[Combat] R${roundNum} DAMAGE: atkShooters=${atkShotsFired} defShooters=${defShotsFired} | dmgOnDef: shield=${totalShieldDmgOnDef} hull=${totalHullDmgOnDef} unitsHit=${defUnitsHit}/${pendingDmgOnDef.size} | dmgOnAtk: shield=${totalShieldDmgOnAtk} hull=${totalHullDmgOnAtk}`);

  let explosionChecks = 0;
  let explosions = 0;
  for (const unit of [...attackers, ...defenders]) {
    if (unit.hull > 0 && unit.hull < unit.maxHull * EXPLOSION_THRESHOLD) {
      explosionChecks++;
      const explosionChance = 1 - (unit.hull / unit.maxHull);
      const roll = Math.random();
      if (roll < explosionChance) {
        logger.debug(`[Combat] EXPLOSION: ${unit.id} hull=${unit.hull}/${unit.maxHull} chance=${(explosionChance*100).toFixed(1)}% roll=${(roll*100).toFixed(1)}%`);
        unit.hull = 0;
        explosions++;
        continue;
      }
    }
    if (unit.hull > 0) {
      unit.shield = unit.maxShield;
    }
  }
  if (explosionChecks > 0) {
    logger.debug(`[Combat] R${roundNum} Explosions: ${explosions}/${explosionChecks} (threshold=${EXPLOSION_THRESHOLD*100}%)`);
  }

  return {
    atkShotsFired,
    defShotsFired,
    totalShieldDmgOnDef,
    totalHullDmgOnDef,
    totalShieldDmgOnAtk,
    totalHullDmgOnAtk,
    explosions,
    explosionChecks,
  };
}

function countLosses(
  originalShips: Record<string, number>,
  units: CombatUnit[],
  prefix: string,
): Record<string, number> {
  const surviving: Record<string, number> = {};
  for (const unit of units) {
    if (unit.hull <= 0) continue;
    const parts = unit.id.replace(prefix, '').split('_');
    const shipId = parts.slice(0, -1).join('_') || parts[0];
    surviving[shipId] = (surviving[shipId] ?? 0) + 1;
  }

  const losses: Record<string, number> = {};
  for (const [id, count] of Object.entries(originalShips)) {
    const survived = surviving[id] ?? 0;
    const lost = count - survived;
    if (lost > 0) {
      losses[id] = lost;
    }
  }
  return losses;
}

export type CombatRoundLog = CombatRoundLogType;
export type CombatLogEntry = CombatLogEntryType;

export interface CombatSimResult {
  result: 'attacker_wins' | 'defender_wins' | 'draw';
  rounds: number;
  attackerLosses: Record<string, number>;
  defenderShipLosses: Record<string, number>;
  defenderDefenseLosses: Record<string, number>;
  loot: { fer: number; silice: number; xenogas: number };
  debris: { fer: number; silice: number };
  attackerSurvivingShips: Record<string, number>;
  combatLog: CombatLogEntry[];
  roundLogs: CombatRoundLog[];
}

export function simulateCombat(
  attackerShips: Record<string, number>,
  attackerResearch: Record<string, number>,
  defenderShips: Record<string, number>,
  defenderDefenses: Record<string, number>,
  defenderResearch: Record<string, number>,
  defenderResources: { fer: number; silice: number; xenogas: number },
): CombatSimResult {
  const combatLog: CombatLogEntry[] = [];
  const roundLogs: CombatRoundLog[] = [];

  logger.debug(`[Combat] ========== COMBAT START ========== ENGINE=${COMBAT_ENGINE_VERSION} THRESHOLD=${EXPLOSION_THRESHOLD}`);
  logger.debug('[Combat] INPUT attackerShips:', JSON.stringify(attackerShips));
  logger.debug('[Combat] INPUT attackerResearch:', JSON.stringify(attackerResearch));
  logger.debug('[Combat] INPUT defenderShips:', JSON.stringify(defenderShips));
  logger.debug('[Combat] INPUT defenderDefenses:', JSON.stringify(defenderDefenses));
  logger.debug('[Combat] INPUT defenderResearch:', JSON.stringify(defenderResearch));
  logger.debug('[Combat] SHIPS_ARRAY length:', SHIPS.length, 'ids:', SHIPS.map(s => s.id).join(','));
  logger.debug('[Combat] DEFENSES_ARRAY length:', DEFENSES.length, 'ids:', DEFENSES.map(d => d.id).join(','));

  const attackerUnits = createAttackerUnits(attackerShips, attackerResearch);
  const defenderUnits = createDefenderUnits(defenderShips, defenderDefenses, defenderResearch);

  const totalAtkInput = Object.values(attackerShips).reduce((s, c) => s + c, 0);
  const totalDefInput = Object.values(defenderShips).reduce((s, c) => s + c, 0) + Object.values(defenderDefenses).reduce((s, c) => s + c, 0);

  if (attackerUnits.length !== totalAtkInput) {
    logger.debug(`[Combat] CRITICAL: Attacker unit count mismatch! Expected ${totalAtkInput} got ${attackerUnits.length}`);
    combatLog.push({ type: 'init', message: `CRITICAL: Attacker unit mismatch! Expected ${totalAtkInput}, got ${attackerUnits.length}` });
  }
  if (defenderUnits.length !== totalDefInput) {
    logger.debug(`[Combat] CRITICAL: Defender unit count mismatch! Expected ${totalDefInput} got ${defenderUnits.length}`);
    combatLog.push({ type: 'init', message: `CRITICAL: Defender unit mismatch! Expected ${totalDefInput}, got ${defenderUnits.length}` });
  }

  const totalAtkFirepower = attackerUnits.reduce((s, u) => s + u.attack, 0);
  const totalDefHP = defenderUnits.reduce((s, u) => s + u.hull + u.shield, 0);
  const totalDefFirepower = defenderUnits.reduce((s, u) => s + u.attack, 0);
  const totalAtkHP = attackerUnits.reduce((s, u) => s + u.hull + u.shield, 0);

  logger.debug(`[Combat] FORCE ANALYSIS: atkFire=${totalAtkFirepower} vs defHP=${totalDefHP} (ratio=${(totalAtkFirepower/Math.max(1,totalDefHP)).toFixed(2)}) | defFire=${totalDefFirepower} vs atkHP=${totalAtkHP} (ratio=${(totalDefFirepower/Math.max(1,totalAtkHP)).toFixed(2)})`);
  logger.debug('[Combat] Attacker units:', attackerUnits.map(u => `${u.id}(atk=${u.attack},shd=${u.shield},hull=${u.hull})`).join(' | '));
  logger.debug('[Combat] Defender units:', defenderUnits.map(u => `${u.id}(atk=${u.attack},shd=${u.shield},hull=${u.hull})`).join(' | '));

  combatLog.push({
    type: 'init',
    message: `Combat START - Engine ${COMBAT_ENGINE_VERSION} - Explosion threshold ${EXPLOSION_THRESHOLD * 100}%`,
    data: {
      attackerShips,
      defenderShips,
      defenderDefenses,
      atkUnits: attackerUnits.length,
      defUnits: defenderUnits.length,
      atkFirepower: totalAtkFirepower,
      defHP: totalDefHP,
      defFirepower: totalDefFirepower,
      atkHP: totalAtkHP,
      atkFireToDefHPRatio: parseFloat((totalAtkFirepower / Math.max(1, totalDefHP)).toFixed(2)),
      defFireToAtkHPRatio: parseFloat((totalDefFirepower / Math.max(1, totalAtkHP)).toFixed(2)),
    },
  });

  const MAX_ROUNDS = MAX_COMBAT_ROUNDS;
  let roundCount = 0;

  while (roundCount < MAX_ROUNDS) {
    roundCount++;

    const atkHullBefore = attackerUnits.map(u => u.hull);
    const defHullBefore = defenderUnits.map(u => u.hull);

    const roundStats = fireRoundSimultaneous(attackerUnits, defenderUnits, roundCount);

    const atkHullAfter = attackerUnits.map(u => u.hull);
    const defHullAfter = defenderUnits.map(u => u.hull);

    const attackerAlive = attackerUnits.filter(u => u.hull > 0).length;
    const defenderAlive = defenderUnits.filter(u => u.hull > 0).length;

    const atkKilled = atkHullBefore.filter((h, i) => h > 0 && atkHullAfter[i] <= 0).length;
    const defKilled = defHullBefore.filter((h, i) => h > 0 && defHullAfter[i] <= 0).length;
    logger.debug(`[Combat] Round ${roundCount}: atk alive=${attackerAlive}/${attackerUnits.length} (killed=${atkKilled}), def alive=${defenderAlive}/${defenderUnits.length} (killed=${defKilled})`);
    logger.debug(`[Combat] Round ${roundCount} def hull:`, defHullBefore.map((h, i) => `${h}->${defHullAfter[i]}`).join(', '));

    const rLog: CombatRoundLog = {
      round: roundCount,
      attackerShooters: roundStats.atkShotsFired,
      defenderShooters: roundStats.defShotsFired,
      dmgOnDefShield: roundStats.totalShieldDmgOnDef,
      dmgOnDefHull: roundStats.totalHullDmgOnDef,
      dmgOnAtkShield: roundStats.totalShieldDmgOnAtk,
      dmgOnAtkHull: roundStats.totalHullDmgOnAtk,
      attackerAlive,
      attackerTotal: attackerUnits.length,
      defenderAlive,
      defenderTotal: defenderUnits.length,
      attackerKilled: atkKilled,
      defenderKilled: defKilled,
      explosions: roundStats.explosions,
      explosionChecks: roundStats.explosionChecks,
    };
    roundLogs.push(rLog);

    combatLog.push({
      type: 'round',
      message: `Round ${roundCount}: Atk ${attackerAlive}/${attackerUnits.length} (-${atkKilled}) | Def ${defenderAlive}/${defenderUnits.length} (-${defKilled}) | Explosions ${roundStats.explosions}/${roundStats.explosionChecks}`,
      data: rLog as unknown as Record<string, unknown>,
    });

    if (attackerAlive === 0 || defenderAlive === 0) break;
  }

  const attackerAlive = attackerUnits.filter(u => u.hull > 0).length;
  const defenderAlive = defenderUnits.filter(u => u.hull > 0).length;

  let result: 'attacker_wins' | 'defender_wins' | 'draw';
  if (attackerAlive === 0 && defenderAlive === 0) result = 'draw';
  else if (attackerAlive === 0) result = 'defender_wins';
  else if (defenderAlive === 0) result = 'attacker_wins';
  else result = 'draw';

  logger.debug(`[Combat] ========== COMBAT END ========== ENGINE=${COMBAT_ENGINE_VERSION} result=${result} rounds=${roundCount} atkAlive=${attackerAlive} defAlive=${defenderAlive}`);

  combatLog.push({
    type: 'end',
    message: `Combat END - ${result} after ${roundCount} rounds (atk: ${attackerAlive} alive, def: ${defenderAlive} alive)`,
    data: { result, rounds: roundCount, attackerAlive, defenderAlive },
  });

  if (result === 'draw' && totalAtkFirepower > totalDefHP * 2) {
    logger.debug(`[Combat] ANOMALY DETECTED: attacker firepower (${totalAtkFirepower}) >> defender HP (${totalDefHP}) but result is DRAW!`);
    logger.debug('[Combat] ANOMALY final attacker hulls:', attackerUnits.map(u => `${u.id}:${u.hull}`).join(','));
    logger.debug('[Combat] ANOMALY final defender hulls:', defenderUnits.map(u => `${u.id}:${u.hull}`).join(','));
    combatLog.push({
      type: 'anomaly',
      message: `ANOMALY: atkFirepower(${totalAtkFirepower}) >> defHP(${totalDefHP}) but DRAW`,
      data: {
        finalAtkHulls: attackerUnits.map(u => ({ id: u.id, hull: u.hull, maxHull: u.maxHull })),
        finalDefHulls: defenderUnits.map(u => ({ id: u.id, hull: u.hull, maxHull: u.maxHull })),
      },
    });
  }

  const attackerLosses = countLosses(attackerShips, attackerUnits, '');
  const defenderShipLosses = countLosses(defenderShips, defenderUnits.filter(u => u.type === 'ship'), 'ship_');
  const defenderDefenseLosses = countLosses(defenderDefenses, defenderUnits.filter(u => u.type === 'defense'), 'def_');

  let debrisFer = 0;
  let debrisSilice = 0;
  for (const [shipId, lost] of Object.entries(attackerLosses)) {
    const ship = SHIPS.find(s => s.id === shipId);
    if (ship) {
      debrisFer += Math.floor((ship.cost.fer ?? 0) * lost * 0.3);
      debrisSilice += Math.floor((ship.cost.silice ?? 0) * lost * 0.3);
    }
  }
  for (const [shipId, lost] of Object.entries(defenderShipLosses)) {
    const ship = SHIPS.find(s => s.id === shipId);
    if (ship) {
      debrisFer += Math.floor((ship.cost.fer ?? 0) * lost * 0.3);
      debrisSilice += Math.floor((ship.cost.silice ?? 0) * lost * 0.3);
    }
  }

  const attackerSurvivingShips: Record<string, number> = {};
  for (const [id, count] of Object.entries(attackerShips)) {
    const lost = attackerLosses[id] ?? 0;
    const remaining = count - lost;
    if (remaining > 0) {
      attackerSurvivingShips[id] = remaining;
    }
  }

  let loot = { fer: 0, silice: 0, xenogas: 0 };
  if (result === 'attacker_wins') {
    const cargoCapacity = getFleetCargoCapacity(attackerSurvivingShips, attackerResearch);
    const maxLootFer = Math.floor(defenderResources.fer * 0.5);
    const maxLootSilice = Math.floor(defenderResources.silice * 0.5);
    const maxLootXenogas = Math.floor(defenderResources.xenogas * 0.5);
    const totalAvailable = maxLootFer + maxLootSilice + maxLootXenogas;

    if (totalAvailable <= cargoCapacity) {
      loot = { fer: maxLootFer, silice: maxLootSilice, xenogas: maxLootXenogas };
    } else {
      const ratio = cargoCapacity / totalAvailable;
      loot = {
        fer: Math.floor(maxLootFer * ratio),
        silice: Math.floor(maxLootSilice * ratio),
        xenogas: Math.floor(maxLootXenogas * ratio),
      };
    }
  }

  return {
    result,
    rounds: roundCount,
    attackerLosses,
    defenderShipLosses,
    defenderDefenseLosses,
    loot,
    debris: { fer: debrisFer, silice: debrisSilice },
    attackerSurvivingShips,
    combatLog,
    roundLogs,
  };
}

export function getDefenseRebuildCount(lost: number): number {
  return Math.floor(lost * 0.7);
}
