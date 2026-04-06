import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import type { GameEvent } from './types';

export async function handleFleetReturn(event: GameEvent): Promise<void> {
  const { mission_id } = event.payload as { mission_id: string };

  logger.log('[EventHandler][FleetReturn] Processing event', event.id, 'mission:', mission_id);

  const { data: missionRow, error: fetchErr } = await supabase
    .from('fleet_missions')
    .select('*')
    .eq('id', mission_id)
    .maybeSingle();

  if (fetchErr) {
    logger.log('[EventHandler][FleetReturn] Error fetching mission:', fetchErr.message);
    throw new Error(`Failed to fetch mission: ${fetchErr.message}`);
  }

  if (!missionRow) {
    logger.log('[EventHandler][FleetReturn] Mission not found:', mission_id, '- idempotent skip');
    return;
  }

  const mission = missionRow as Record<string, unknown>;

  if ((mission.mission_phase as string) === 'completed') {
    logger.log('[EventHandler][FleetReturn] Mission already completed:', mission_id, '- idempotent skip');
    return;
  }

  if ((mission.mission_phase as string) !== 'returning') {
    logger.log('[EventHandler][FleetReturn] Mission not in returning phase:', mission.mission_phase, '- skipping');
    return;
  }

  const returnTime = mission.return_time as number | null;
  if (!returnTime) {
    logger.log('[EventHandler][FleetReturn] Mission has no return_time:', mission_id, '- skipping');
    return;
  }

  const now = Date.now();
  if (returnTime > now + 2000) {
    logger.log('[EventHandler][FleetReturn] Return time', returnTime, 'is still in the future (now:', now, ') - stale event, skipping');
    return;
  }

  const { data: claimed } = await supabase
    .from('fleet_missions')
    .update({ mission_phase: 'completed', status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', mission_id)
    .eq('mission_phase', 'returning')
    .select();

  if (!claimed?.length) {
    logger.log('[EventHandler][FleetReturn] Mission already claimed by world tick or rpc_process_fleet_returns:', mission_id, '- idempotent skip');
    return;
  }

  logger.log('[EventHandler][FleetReturn] Mission claimed, processing return:', mission_id);

  const senderId = mission.sender_id as string;
  const senderCoords = mission.sender_coords as number[] | null;
  const ships = mission.ships as Record<string, number> | null;
  const resources = mission.resources as { fer?: number; silice?: number; xenogas?: number } | null;

  let senderPlanetId: string | null = null;

  if (senderCoords) {
    const { data: senderPlanet } = await supabase
      .from('planets')
      .select('id')
      .eq('user_id', senderId)
      .filter('coordinates->>0', 'eq', String(senderCoords[0]))
      .filter('coordinates->>1', 'eq', String(senderCoords[1]))
      .filter('coordinates->>2', 'eq', String(senderCoords[2]))
      .maybeSingle();

    senderPlanetId = (senderPlanet?.id as string) ?? null;
  }

  if (!senderPlanetId) {
    logger.log('[EventHandler][FleetReturn] Sender planet not found for user', senderId, 'coords:', JSON.stringify(senderCoords), '- ships and resources lost (planet abandoned?)');
    return;
  }

  if (ships && typeof ships === 'object') {
    for (const [shipId, qty] of Object.entries(ships)) {
      if (!qty || qty <= 0) continue;

      const { data: existing } = await supabase
        .from('planet_ships')
        .select('quantity')
        .eq('planet_id', senderPlanetId)
        .eq('ship_id', shipId)
        .maybeSingle();

      const { error: upsertErr } = await supabase
        .from('planet_ships')
        .upsert({
          planet_id: senderPlanetId,
          ship_id: shipId,
          quantity: (existing?.quantity ?? 0) + qty,
        }, { onConflict: 'planet_id,ship_id' });

      if (upsertErr) {
        logger.log('[EventHandler][FleetReturn] Error restoring ship', shipId, 'x', qty, ':', upsertErr.message);
      }
    }
    logger.log('[EventHandler][FleetReturn] Ships restored to planet', senderPlanetId);
  }

  const cargoFer = resources?.fer ?? 0;
  const cargoSilice = resources?.silice ?? 0;
  const cargoXenogas = resources?.xenogas ?? 0;

  if (cargoFer > 0 || cargoSilice > 0 || cargoXenogas > 0) {
    const { error: rpcErr } = await supabase.rpc('add_resources_to_planet', {
      p_planet_id: senderPlanetId,
      p_fer: cargoFer,
      p_silice: cargoSilice,
      p_xenogas: cargoXenogas,
    });

    if (rpcErr) {
      logger.log('[EventHandler][FleetReturn] Error adding cargo resources:', rpcErr.message);
    } else {
      logger.log('[EventHandler][FleetReturn] Cargo deposited: fer=', cargoFer, 'silice=', cargoSilice, 'xenogas=', cargoXenogas);
    }
  }

  logger.log('[EventHandler][FleetReturn] === DONE === mission', mission_id, 'ships and resources restored to planet', senderPlanetId);
}
