import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import { scheduleScoreRecalc } from '@/backend/eventScheduler';
import type { GameEvent } from './types';

export async function handleBuildingComplete(event: GameEvent): Promise<void> {
  const { planet_id, building_id, target_level, timer_id } = event.payload as {
    planet_id: string;
    building_id: string;
    target_level: number;
    timer_id?: string;
  };

  logger.log('[EventHandler][BuildingComplete] Processing event', event.id, 'planet:', planet_id, 'building:', building_id, 'level:', target_level);

  const { data: currentBuilding } = await supabase
    .from('planet_buildings')
    .select('level')
    .eq('planet_id', planet_id)
    .eq('building_id', building_id)
    .maybeSingle();

  const currentLevel = currentBuilding?.level ?? 0;

  if (currentLevel >= target_level) {
    logger.log('[EventHandler][BuildingComplete] Building already at level', currentLevel, '>= target', target_level, '- idempotent skip');
    if (timer_id) {
      await supabase.from('active_timers').delete().eq('id', timer_id);
    }
    return;
  }

  if (currentLevel !== target_level - 1) {
    logger.log('[EventHandler][BuildingComplete] WARNING: current level', currentLevel, 'does not match expected', target_level - 1, '- possible concurrent modification. Proceeding with caution.');
  }

  if (timer_id) {
    const { data: timerRow } = await supabase
      .from('active_timers')
      .select('id, target_id, target_level, timer_type')
      .eq('id', timer_id)
      .maybeSingle();

    if (!timerRow) {
      logger.log('[EventHandler][BuildingComplete] Timer not found:', timer_id, '- checking if building already upgraded');
      if (currentLevel >= target_level) {
        logger.log('[EventHandler][BuildingComplete] Building already at target level, timer was already processed');
        return;
      }
      logger.log('[EventHandler][BuildingComplete] Timer gone but building not yet upgraded - proceeding (rush or race condition)');
    } else {
      if (timerRow.timer_type !== 'building' || timerRow.target_id !== building_id || timerRow.target_level !== target_level) {
        logger.log('[EventHandler][BuildingComplete] Timer mismatch! Expected building:', building_id, 'lv', target_level, 'Got:', timerRow.timer_type, timerRow.target_id, 'lv', timerRow.target_level, '- aborting');
        return;
      }

      const { error: delErr } = await supabase
        .from('active_timers')
        .delete()
        .eq('id', timer_id);

      if (delErr) {
        logger.log('[EventHandler][BuildingComplete] Error deleting timer:', delErr.message);
      }
    }
  } else {
    const { data: matchingTimer } = await supabase
      .from('active_timers')
      .select('id')
      .eq('planet_id', planet_id)
      .eq('target_id', building_id)
      .eq('timer_type', 'building')
      .eq('target_level', target_level)
      .maybeSingle();

    if (matchingTimer) {
      logger.log('[EventHandler][BuildingComplete] Found matching timer without explicit timer_id, cleaning up:', matchingTimer.id);
      await supabase.from('active_timers').delete().eq('id', matchingTimer.id);
    }
  }

  const { data: planetExists } = await supabase
    .from('planets')
    .select('id')
    .eq('id', planet_id)
    .maybeSingle();

  if (!planetExists) {
    logger.log('[EventHandler][BuildingComplete] Planet no longer exists:', planet_id, '- aborting');
    return;
  }

  const { error: upsertErr } = await supabase
    .from('planet_buildings')
    .upsert({
      planet_id,
      building_id,
      level: target_level,
    }, { onConflict: 'planet_id,building_id' });

  if (upsertErr) {
    logger.log('[EventHandler][BuildingComplete] Error upserting building:', upsertErr.message);
    throw new Error(`Failed to complete building: ${upsertErr.message}`);
  }

  if (building_id === 'geoformEngine') {
    const { data: planetData } = await supabase
      .from('planets')
      .select('base_fields')
      .eq('id', planet_id)
      .maybeSingle();
    const baseFields = (planetData?.base_fields as number) ?? 163;
    const newTotalFields = baseFields + target_level * 5;
    await supabase.from('planets').update({ total_fields: newTotalFields }).eq('id', planet_id);
    logger.log('[EventHandler][BuildingComplete] GeoformEngine lv', target_level, '-> total_fields:', newTotalFields);
  }

  logger.log('[EventHandler][BuildingComplete] Building completed:', building_id, 'level', target_level, 'on planet', planet_id);

  const { data: planetOwner } = await supabase
    .from('planets')
    .select('user_id')
    .eq('id', planet_id)
    .maybeSingle();

  if (planetOwner?.user_id) {
    try {
      await scheduleScoreRecalc(planetOwner.user_id as string);
      logger.log('[EventHandler][BuildingComplete] Score recalc scheduled for player', planetOwner.user_id);
    } catch (e) {
      logger.log('[EventHandler][BuildingComplete] Non-blocking: failed to schedule score recalc:', e instanceof Error ? e.message : String(e));
    }
  }
}
