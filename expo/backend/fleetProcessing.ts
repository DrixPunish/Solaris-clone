import { supabase } from '@/backend/supabase';
import {
  processEspionage,
  simulateCombat,
  getDefenseRebuildCount,
  getMantaRecupCargoCapacity,
} from '@/utils/fleetCalculations';
import {
  calculateProduction,
  getResourceStorageCapacity,
} from '@/utils/gameCalculations';
import { logger } from '@/utils/logger';
import { tryValidateTutorialStep } from '@/backend/tutorialValidation';

export interface FleetMission {
  id: string;
  sender_id: string;
  sender_username?: string;
  sender_planet?: string;
  sender_coords: number[];
  target_coords: number[];
  target_player_id: string | null;
  target_username?: string | null;
  target_planet?: string | null;
  mission_type: string;
  ships: Record<string, number>;
  resources: { fer?: number; silice?: number; xenogas?: number } | null;
  departure_time: number;
  arrival_time: number;
  return_time: number | null;
  status: string;
  processed: boolean;
  mission_phase: string;
  result?: Record<string, unknown>;
}

export async function loadResearchFromDB(userId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('player_research')
    .select('research_id, level')
    .eq('user_id', userId);
  const research: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ research_id: string; level: number }>) {
    research[r.research_id] = r.level;
  }
  return research;
}

export async function loadPlanetState(planetId: string, userId: string) {
  const [resRes, buildRes, shipsRes, defensesRes, planetRes] = await Promise.all([
    supabase.from('planet_resources').select('fer, silice, xenogas, energy').eq('planet_id', planetId).single(),
    supabase.from('planet_buildings').select('building_id, level').eq('planet_id', planetId),
    supabase.from('planet_ships').select('ship_id, quantity').eq('planet_id', planetId),
    supabase.from('planet_defenses').select('defense_id, quantity').eq('planet_id', planetId),
    supabase.from('planets').select('planet_name, coordinates, last_update').eq('id', planetId).single(),
  ]);

  const resData = resRes.data as { fer?: number; silice?: number; xenogas?: number; energy?: number } | null;
  const buildings: Record<string, number> = {};
  for (const r of (buildRes.data ?? []) as Array<{ building_id: string; level: number }>) {
    buildings[r.building_id] = r.level;
  }
  const ships: Record<string, number> = {};
  for (const r of (shipsRes.data ?? []) as Array<{ ship_id: string; quantity: number }>) {
    if (r.quantity > 0) ships[r.ship_id] = r.quantity;
  }
  const defenses: Record<string, number> = {};
  for (const r of (defensesRes.data ?? []) as Array<{ defense_id: string; quantity: number }>) {
    if (r.quantity > 0) defenses[r.defense_id] = r.quantity;
  }

  const research = await loadResearchFromDB(userId);

  const now = Date.now();
  const lastUpdate = (planetRes.data?.last_update as number) ?? now;
  const elapsed = (now - lastUpdate) / 1000;

  const production = calculateProduction(buildings, research, ships);
  const storageCap = getResourceStorageCapacity(buildings);

  const rawFer = resData?.fer ?? 0;
  const rawSilice = resData?.silice ?? 0;
  const rawXenogas = resData?.xenogas ?? 0;

  const { data: matResult } = await supabase.rpc('materialize_planet_resources', {
    p_planet_id: planetId,
    p_user_id: userId,
  });

  const matRes = matResult as { success?: boolean; fer?: number; silice?: number; xenogas?: number } | null;

  const resources = {
    fer: matRes?.fer ?? (rawFer >= storageCap.fer ? rawFer : Math.min(rawFer + (production.fer / 3600) * elapsed, storageCap.fer)),
    silice: matRes?.silice ?? (rawSilice >= storageCap.silice ? rawSilice : Math.min(rawSilice + (production.silice / 3600) * elapsed, storageCap.silice)),
    xenogas: matRes?.xenogas ?? (rawXenogas >= storageCap.xenogas ? rawXenogas : Math.min(rawXenogas + (production.xenogas / 3600) * elapsed, storageCap.xenogas)),
  };

  return {
    planetName: (planetRes.data?.planet_name as string) ?? 'Unknown',
    resources,
    buildings,
    research,
    ships,
    defenses,
  };
}

export async function getPlanetIdByCoords(coords: number[]): Promise<{ planetId: string; userId: string } | null> {
  const { data } = await supabase
    .from('planets')
    .select('id, user_id')
    .filter('coordinates->>0', 'eq', String(coords[0]))
    .filter('coordinates->>1', 'eq', String(coords[1]))
    .filter('coordinates->>2', 'eq', String(coords[2]))
    .single();
  if (!data) return null;
  return { planetId: data.id as string, userId: data.user_id as string };
}

const sanitizeForJsonb = (val: unknown): unknown => {
  if (val === undefined) return null;
  if (val === null) return null;
  if (typeof val === 'number') {
    if (!isFinite(val)) return 0;
    return val;
  }
  if (Array.isArray(val)) return val.map(sanitizeForJsonb);
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = sanitizeForJsonb(v);
    }
    return out;
  }
  return val;
};

export interface MissionProcessResult {
  finalPhase: 'returning' | 'completed';
  returnTime: number | null;
  survivingShips: Record<string, number>;
  cargoResources: { fer: number; silice: number; xenogas: number };
  result: Record<string, unknown>;
}

export async function processEspionageMission(mission: FleetMission): Promise<void> {
  const senderId = mission.sender_id;
  let targetPlayerId = mission.target_player_id;
  const targetCoords = mission.target_coords;
  const ships = mission.ships;

  logger.log('[FleetProcessing][Espionage] === START === mission', mission.id, 'sender:', senderId);

  const targetPlanetInfo = await getPlanetIdByCoords(targetCoords);

  if (!targetPlanetInfo) {
    logger.log('[FleetProcessing][Espionage] Target planet not found - returning probes');
    const travelTime = mission.arrival_time - mission.departure_time;
    await supabase.from('fleet_missions').update({
      status: 'returning',
      processed: true,
      mission_phase: 'returning',
      return_time: mission.arrival_time + travelTime,
      result: { type: 'espionage', probes_sent: ships.spectreSonde ?? 1, probes_lost: 0 },
    }).eq('id', mission.id);
    return;
  }

  if (!targetPlayerId) {
    targetPlayerId = targetPlanetInfo.userId;
  }

  const senderResearch = await loadResearchFromDB(senderId);

  let targetState: Awaited<ReturnType<typeof loadPlanetState>> | null = null;
  try {
    targetState = await loadPlanetState(targetPlanetInfo.planetId, targetPlanetInfo.userId);
  } catch (e) {
    logger.log('[FleetProcessing][Espionage] ERROR loading target state:', e);
  }

  const probesSent = ships.spectreSonde ?? 1;
  const attackerEspionage = senderResearch.espionageTech ?? 0;
  const defenderEspionage = targetState?.research?.espionageTech ?? 0;

  const espResult = processEspionage(
    attackerEspionage,
    defenderEspionage,
    probesSent,
    {
      resources: targetState?.resources ?? { fer: 0, silice: 0, xenogas: 0 },
      buildings: targetState?.buildings ?? {},
      research: targetState?.research ?? {},
      ships: targetState?.ships ?? {},
      defenses: targetState?.defenses ?? {},
      planetName: targetState?.planetName ?? 'Inconnue',
    },
  );

  const allProbesLost = espResult.probesLost >= probesSent;
  const targetPlanetName = espResult.planetName || targetState?.planetName || 'Inconnue';

  if (!allProbesLost) {
    await supabase.from('espionage_reports').insert({
      player_id: senderId,
      target_player_id: targetPlayerId,
      target_username: mission.target_username ?? null,
      target_coords: targetCoords,
      target_planet_id: targetPlanetInfo.planetId,
      target_planet_name: targetPlanetName,
      resources: espResult.resources,
      buildings: espResult.buildings,
      research: espResult.research,
      ships: espResult.ships,
      defenses: espResult.defenses,
      probes_sent: probesSent,
      probes_lost: espResult.probesLost,
    });
  }

  if (targetPlayerId && targetPlayerId !== senderId) {
    await supabase.from('espionage_reports').insert({
      player_id: targetPlayerId,
      target_player_id: senderId,
      target_username: null,
      target_coords: targetCoords,
      target_planet_id: targetPlanetInfo.planetId,
      target_planet_name: targetPlanetName,
      resources: null,
      buildings: null,
      research: null,
      ships: null,
      defenses: null,
      probes_sent: 0,
      probes_lost: 0,
    });
  }

  const travelTime = mission.arrival_time - mission.departure_time;
  const returnTime = mission.arrival_time + travelTime;
  const survivingProbes = probesSent - espResult.probesLost;
  const resultShips = survivingProbes > 0 ? { spectreSonde: survivingProbes } : {};

  const finalStatus = survivingProbes > 0 ? 'returning' : 'completed';
  const finalPhase = survivingProbes > 0 ? 'returning' : 'completed';

  await supabase.from('fleet_missions').update({
    status: finalStatus,
    processed: true,
    mission_phase: finalPhase,
    return_time: survivingProbes > 0 ? returnTime : null,
    ships: resultShips,
    result: { type: 'espionage', probes_sent: probesSent, probes_lost: espResult.probesLost },
    ...(finalPhase === 'completed' ? { completed_at: new Date().toISOString() } : {}),
  }).eq('id', mission.id);

  if (!allProbesLost) {
    try {
      await tryValidateTutorialStep({
        type: 'fleet_event',
        eventType: 'espionage_report_created',
        userId: senderId,
        proofId: mission.id,
      });
    } catch (e) {
      logger.log('[FleetProcessing][Espionage] Non-blocking: tutorial validation error:', e instanceof Error ? e.message : String(e));
    }
  }

  logger.log('[FleetProcessing][Espionage] === DONE === mission', mission.id, 'surviving:', survivingProbes);
}

export async function processAttackMission(mission: FleetMission): Promise<void> {
  const senderId = mission.sender_id;
  const targetPlayerId = mission.target_player_id;
  const targetCoords = mission.target_coords;
  const attackerShips = mission.ships;

  const senderResearch = await loadResearchFromDB(senderId);

  let targetState: Awaited<ReturnType<typeof loadPlanetState>> | null = null;
  let targetPlanetId: string | null = null;

  if (targetPlayerId) {
    const planetInfo = await getPlanetIdByCoords(targetCoords);
    if (planetInfo) {
      targetPlanetId = planetInfo.planetId;
      targetState = await loadPlanetState(planetInfo.planetId, targetPlayerId);
    }
  }

  if (!targetState || !targetPlayerId) {
    const travelTime = mission.arrival_time - mission.departure_time;
    await supabase.from('fleet_missions').update({
      status: 'returning',
      processed: true,
      mission_phase: 'returning',
      return_time: mission.arrival_time + travelTime,
      result: { type: 'combat', outcome: 'draw', loot: { fer: 0, silice: 0, xenogas: 0 } },
    }).eq('id', mission.id);
    return;
  }

  logger.log('[FleetProcessing][Attack] ===== ATTACK MISSION', mission.id, '=====');

  const combatResult = simulateCombat(
    attackerShips,
    senderResearch,
    targetState.ships ?? {},
    targetState.defenses ?? {},
    targetState.research ?? {},
    targetState.resources,
  );

  logger.log('[FleetProcessing][Attack] Result:', combatResult.result, 'rounds:', combatResult.rounds);

  const attackerPlayerId = String(senderId);
  const defenderPlayerId = targetPlayerId ? String(targetPlayerId) : null;

  const safeCombatLog = Array.isArray(combatResult.combatLog) && combatResult.combatLog.length > 0
    ? sanitizeForJsonb(combatResult.combatLog)
    : [{ type: 'error', message: 'Combat log was empty or invalid' }];
  const safeRoundLogs = Array.isArray(combatResult.roundLogs) && combatResult.roundLogs.length > 0
    ? sanitizeForJsonb(combatResult.roundLogs)
    : [];

  const baseReportPayload = {
    attacker_id: attackerPlayerId,
    defender_id: defenderPlayerId,
    attacker_username: mission.sender_username ?? null,
    defender_username: mission.target_username ?? null,
    attacker_coords: mission.sender_coords ?? null,
    target_coords: targetCoords,
    attacker_fleet: sanitizeForJsonb(attackerShips) ?? {},
    defender_fleet: sanitizeForJsonb(targetState.ships) ?? {},
    defender_defenses_initial: sanitizeForJsonb(targetState.defenses) ?? {},
    rounds: combatResult.rounds ?? 0,
    result: combatResult.result,
    attacker_losses: sanitizeForJsonb(combatResult.attackerLosses) ?? {},
    defender_losses: sanitizeForJsonb({ ...combatResult.defenderShipLosses, ...combatResult.defenderDefenseLosses }) ?? {},
    loot: sanitizeForJsonb(combatResult.loot) ?? { fer: 0, silice: 0, xenogas: 0 },
    debris: sanitizeForJsonb(combatResult.debris) ?? { fer: 0, silice: 0 },
    combat_log: safeCombatLog,
    round_logs: safeRoundLogs,
  };

  const insertReport = async (viewerRole: string): Promise<boolean> => {
    const payload = { ...baseReportPayload, viewer_role: viewerRole };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error } = await supabase.from('combat_reports').insert(payload);
        if (error) {
          logger.log(`[FleetProcessing][Attack] INSERT FAILED ${viewerRole} (attempt ${attempt}):`, error.message);
          if (attempt < 3) { await new Promise(r => setTimeout(r, 300 * attempt)); continue; }
          return false;
        }
        return true;
      } catch (ex) {
        logger.log(`[FleetProcessing][Attack] INSERT EXCEPTION ${viewerRole} (attempt ${attempt}):`, ex);
        if (attempt < 3) { await new Promise(r => setTimeout(r, 300 * attempt)); continue; }
        return false;
      }
    }
    return false;
  };

  await insertReport('attacker');
  if (defenderPlayerId && defenderPlayerId !== attackerPlayerId) {
    await insertReport('defender');
  }

  if (targetPlanetId) {
    const defenseRebuilds = Object.fromEntries(
      Object.entries(combatResult.defenderDefenseLosses).map(([id, count]) => [id, getDefenseRebuildCount(count)])
    );

    await supabase.rpc('apply_attack_loot', {
      p_planet_id: targetPlanetId,
      p_loot_fer: combatResult.loot.fer,
      p_loot_silice: combatResult.loot.silice,
      p_loot_xenogas: combatResult.loot.xenogas,
      p_ship_losses: combatResult.defenderShipLosses,
      p_defense_losses: combatResult.defenderDefenseLosses,
      p_defense_rebuilds: defenseRebuilds,
    });
  }

  if (combatResult.debris && (combatResult.debris.fer > 0 || combatResult.debris.silice > 0)) {
    const { data: existing } = await supabase
      .from('debris_fields')
      .select('id, fer, silice')
      .eq('coords->>0', String(targetCoords[0]))
      .eq('coords->>1', String(targetCoords[1]))
      .eq('coords->>2', String(targetCoords[2]))
      .single();

    if (existing) {
      await supabase.from('debris_fields').update({
        fer: (existing.fer ?? 0) + combatResult.debris.fer,
        silice: (existing.silice ?? 0) + combatResult.debris.silice,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('debris_fields').insert({
        coords: targetCoords,
        fer: combatResult.debris.fer,
        silice: combatResult.debris.silice,
      });
    }
  }

  const travelTime = mission.arrival_time - mission.departure_time;
  const returnTime = mission.arrival_time + travelTime;
  const hasShips = Object.values(combatResult.attackerSurvivingShips).some(c => c > 0);

  const attackFinalPhase = hasShips ? 'returning' : 'completed';
  await supabase.from('fleet_missions').update({
    status: hasShips ? 'returning' : 'completed',
    processed: true,
    mission_phase: attackFinalPhase,
    return_time: hasShips ? returnTime : null,
    ships: combatResult.attackerSurvivingShips,
    resources: combatResult.loot,
    result: { type: 'combat', outcome: combatResult.result, loot: combatResult.loot },
    ...(attackFinalPhase === 'completed' ? { completed_at: new Date().toISOString() } : {}),
  }).eq('id', mission.id);

  try {
    await tryValidateTutorialStep({
      type: 'fleet_event',
      eventType: 'combat_report_created',
      userId: String(senderId),
      proofId: mission.id,
    });
  } catch (e) {
    logger.log('[FleetProcessing][Attack] Non-blocking: tutorial validation error:', e instanceof Error ? e.message : String(e));
  }

  logger.log('[FleetProcessing][Attack] Done:', mission.id, 'result:', combatResult.result);
}

export async function processTransportMission(mission: FleetMission): Promise<void> {
  const targetCoords = mission.target_coords;
  const resources = mission.resources;

  const deliveredResources = {
    fer: resources?.fer ?? 0,
    silice: resources?.silice ?? 0,
    xenogas: resources?.xenogas ?? 0,
  };

  const targetPlanetInfo = await getPlanetIdByCoords(targetCoords);
  if (targetPlanetInfo && (deliveredResources.fer > 0 || deliveredResources.silice > 0 || deliveredResources.xenogas > 0)) {
    const { error: rpcErr } = await supabase.rpc('add_resources_to_planet', {
      p_planet_id: targetPlanetInfo.planetId,
      p_fer: deliveredResources.fer,
      p_silice: deliveredResources.silice,
      p_xenogas: deliveredResources.xenogas,
    });
    if (rpcErr) {
      logger.log('[FleetProcessing][Transport] Error adding resources:', rpcErr.message);
    } else {
      await supabase.from('planets').update({ last_update: Date.now() }).eq('id', targetPlanetInfo.planetId);
    }
  }

  const travelTime = mission.arrival_time - mission.departure_time;
  const returnTime = mission.arrival_time + travelTime;

  await supabase.from('fleet_missions').update({
    status: 'returning',
    processed: true,
    mission_phase: 'returning',
    return_time: returnTime,
    resources: { fer: 0, silice: 0, xenogas: 0 },
    result: { type: 'transport', delivered: resources },
  }).eq('id', mission.id);

  logger.log('[FleetProcessing][Transport] Done:', mission.id);
}

export async function processRecycleMission(mission: FleetMission): Promise<void> {
  const senderId = mission.sender_id;
  const coords = mission.target_coords;
  const ships = mission.ships;

  const { data: debrisRow } = await supabase
    .from('debris_fields')
    .select('*')
    .eq('coords->>0', String(coords[0]))
    .eq('coords->>1', String(coords[1]))
    .eq('coords->>2', String(coords[2]))
    .single();

  const debrisFer = debrisRow?.fer ?? 0;
  const debrisSilice = debrisRow?.silice ?? 0;

  const senderResearch = await loadResearchFromDB(senderId);
  const mantaCount = ships.mantaRecup ?? 0;
  const mantaCargo = getMantaRecupCargoCapacity(mantaCount, senderResearch);

  const totalDebris = debrisFer + debrisSilice;
  let collectedFer = 0;
  let collectedSilice = 0;

  if (totalDebris > 0 && mantaCargo > 0) {
    const ratio = Math.min(1, mantaCargo / totalDebris);
    collectedFer = Math.floor(debrisFer * ratio);
    collectedSilice = Math.floor(debrisSilice * ratio);
  }

  const remainingFer = debrisFer - collectedFer;
  const remainingSilice = debrisSilice - collectedSilice;

  if (remainingFer <= 0 && remainingSilice <= 0) {
    await supabase.from('debris_fields').delete()
      .eq('coords->>0', String(coords[0]))
      .eq('coords->>1', String(coords[1]))
      .eq('coords->>2', String(coords[2]));
  } else if (debrisRow) {
    await supabase.from('debris_fields').update({
      fer: remainingFer,
      silice: remainingSilice,
      updated_at: new Date().toISOString(),
    }).eq('id', debrisRow.id);
  }

  const travelTime = mission.arrival_time - mission.departure_time;
  const returnTime = mission.arrival_time + travelTime;

  await supabase.from('fleet_missions').update({
    status: 'returning',
    processed: true,
    mission_phase: 'returning',
    return_time: returnTime,
    resources: { fer: collectedFer, silice: collectedSilice, xenogas: 0 },
    result: { type: 'recycle', collected: { fer: collectedFer, silice: collectedSilice } },
  }).eq('id', mission.id);

  logger.log('[FleetProcessing][Recycle] Done:', collectedFer, 'fer,', collectedSilice, 'silice');
}

export async function processColonizeMission(mission: FleetMission): Promise<void> {
  const senderId = mission.sender_id;
  const targetCoords = mission.target_coords as [number, number, number];
  const ships = mission.ships;

  const { data: existingPlanets } = await supabase
    .from('planets')
    .select('id')
    .filter('coordinates->>0', 'eq', String(targetCoords[0]))
    .filter('coordinates->>1', 'eq', String(targetCoords[1]))
    .filter('coordinates->>2', 'eq', String(targetCoords[2]))
    .limit(1);

  const isOccupied = (existingPlanets?.length ?? 0) > 0;
  const travelTime = mission.arrival_time - mission.departure_time;
  const returnTime = mission.arrival_time + travelTime;

  if (isOccupied) {
    await supabase.from('fleet_missions').update({
      status: 'returning', processed: true, mission_phase: 'returning',
      return_time: returnTime, ships,
      result: { type: 'colonize', success: false, reason: 'Position déjà occupée' },
    }).eq('id', mission.id);
    return;
  }

  const { data: playerColonies } = await supabase
    .from('planets').select('id').eq('user_id', senderId).eq('is_main', false);

  const senderResearch = await loadResearchFromDB(senderId);
  const astroLevel = senderResearch.astrophysics ?? 0;
  const maxColonies = Math.floor((astroLevel + 1) / 2);
  const currentColonies = playerColonies?.length ?? 0;

  if (currentColonies >= maxColonies) {
    await supabase.from('fleet_missions').update({
      status: 'returning', processed: true, mission_phase: 'returning',
      return_time: returnTime, ships,
      result: { type: 'colonize', success: false, reason: 'Nombre maximum de colonies atteint' },
    }).eq('id', mission.id);
    return;
  }

  const slotPosition = targetCoords[2];
  const { data: slotDef } = await supabase
    .from('planet_slot_defs')
    .select('*')
    .eq('position', slotPosition)
    .single();

  const fieldMin = (slotDef?.field_min as number) ?? 163;
  const fieldMax = (slotDef?.field_max as number) ?? 248;
  const baseFields = Math.floor(Math.random() * (fieldMax - fieldMin + 1)) + fieldMin;

  const tempMinSlot = (slotDef?.temp_min as number) ?? 20;
  const tempMaxSlot = (slotDef?.temp_max as number) ?? 60;
  const temperature = Math.floor(Math.random() * (tempMaxSlot - tempMinSlot + 1)) + tempMinSlot;
  const temperatureMin = temperature;
  const temperatureMax = temperature;

  logger.log('[FleetProcessing][Colonize] Slot', slotPosition, 'fields:', baseFields, 'temp:', temperatureMin, '-', temperatureMax);

  const { data: newPlanet, error: insertErr } = await supabase.from('planets').insert({
    user_id: senderId, planet_name: `Colonie ${currentColonies + 1}`,
    coordinates: targetCoords, is_main: false, last_update: Date.now(),
    slot_position: slotPosition,
    base_fields: baseFields,
    total_fields: baseFields,
    temperature_min: temperatureMin,
    temperature_max: temperatureMax,
    metal_bonus_pct: (slotDef?.metal_bonus_pct as number) ?? 0,
    crystal_bonus_pct: (slotDef?.crystal_bonus_pct as number) ?? 0,
    deut_bonus_pct: (slotDef?.deut_bonus_pct as number) ?? 0,
  }).select('id').single();

  if (insertErr || !newPlanet) {
    await supabase.from('fleet_missions').update({
      status: 'returning', processed: true, mission_phase: 'returning',
      return_time: returnTime, ships,
      result: { type: 'colonize', success: false, reason: 'Erreur création colonie' },
    }).eq('id', mission.id);
    return;
  }

  await supabase.from('planet_resources').insert({
    planet_id: newPlanet.id, fer: 500, silice: 300, xenogas: 0, energy: 0,
  });

  const returningShips = { ...ships };
  const colonyShipCount = returningShips.colonyShip ?? 0;
  if (colonyShipCount > 1) {
    returningShips.colonyShip = colonyShipCount - 1;
  } else {
    delete returningShips.colonyShip;
  }

  const hasReturning = Object.values(returningShips).some(c => c > 0);
  const colonizeFinalPhase = hasReturning ? 'returning' : 'completed';

  await supabase.from('fleet_missions').update({
    status: hasReturning ? 'returning' : 'completed',
    processed: true, mission_phase: colonizeFinalPhase,
    return_time: hasReturning ? returnTime : null,
    ships: returningShips,
    result: { type: 'colonize', success: true, colonyId: newPlanet.id },
    ...(colonizeFinalPhase === 'completed' ? { completed_at: new Date().toISOString() } : {}),
  }).eq('id', mission.id);

  try {
    await tryValidateTutorialStep({
      type: 'fleet_event',
      eventType: 'colony_created',
      userId: senderId,
      proofId: newPlanet.id as string,
    });
  } catch (e) {
    logger.log('[FleetProcessing][Colonize] Non-blocking: tutorial validation error:', e instanceof Error ? e.message : String(e));
  }

  logger.log('[FleetProcessing][Colonize] Colony created:', newPlanet.id, 'at', targetCoords);
}

export async function processStationMission(mission: FleetMission): Promise<void> {
  const targetCoords = mission.target_coords;
  const ships = mission.ships;
  const resources = mission.resources;

  const targetPlanetInfo = await getPlanetIdByCoords(targetCoords);
  if (targetPlanetInfo) {
    for (const [shipId, qty] of Object.entries(ships)) {
      if (qty <= 0) continue;
      const { data: existing } = await supabase
        .from('planet_ships').select('quantity')
        .eq('planet_id', targetPlanetInfo.planetId).eq('ship_id', shipId).single();

      await supabase.from('planet_ships').upsert({
        planet_id: targetPlanetInfo.planetId, ship_id: shipId,
        quantity: (existing?.quantity ?? 0) + qty,
      }, { onConflict: 'planet_id,ship_id' });
    }

    if (resources && ((resources.fer ?? 0) > 0 || (resources.silice ?? 0) > 0 || (resources.xenogas ?? 0) > 0)) {
      await supabase.rpc('add_resources_to_planet', {
        p_planet_id: targetPlanetInfo.planetId,
        p_fer: resources.fer ?? 0, p_silice: resources.silice ?? 0, p_xenogas: resources.xenogas ?? 0,
      });
    }
  }

  await supabase.from('fleet_missions').update({
    status: 'completed', processed: true, mission_phase: 'completed',
    completed_at: new Date().toISOString(),
    result: { type: 'station', delivered_ships: ships, delivered_resources: resources },
  }).eq('id', mission.id);

  logger.log('[FleetProcessing][Station] Done:', mission.id);
}

export async function dispatchMission(mission: FleetMission): Promise<void> {
  const missionType = mission.mission_type;
  if (missionType === 'espionage') {
    await processEspionageMission(mission);
  } else if (missionType === 'attack') {
    await processAttackMission(mission);
  } else if (missionType === 'transport') {
    await processTransportMission(mission);
  } else if (missionType === 'recycle') {
    await processRecycleMission(mission);
  } else if (missionType === 'colonize') {
    await processColonizeMission(mission);
  } else if (missionType === 'station') {
    await processStationMission(mission);
  } else {
    logger.log('[FleetProcessing] Unknown mission type:', missionType);
    throw new Error(`Unknown mission type: ${missionType}`);
  }
}
