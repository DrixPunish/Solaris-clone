import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import type { GameEvent } from './types';

export async function handleBuildingComplete(event: GameEvent): Promise<void> {
  const { planet_id, building_id, target_level, timer_id } = event.payload as {
    planet_id: string;
    building_id: string;
    target_level: number;
    timer_id?: string;
  };

  logger.log('[EventHandler][BuildingComplete] Processing event', event.id, 'planet:', planet_id, 'building:', building_id, 'level:', target_level);

  if (timer_id) {
    const { data: timerExists } = await supabase
      .from('active_timers')
      .select('id')
      .eq('id', timer_id)
      .maybeSingle();

    if (!timerExists) {
      logger.log('[EventHandler][BuildingComplete] Timer already processed (idempotent skip):', timer_id);
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

  logger.log('[EventHandler][BuildingComplete] Building completed:', building_id, 'level', target_level, 'on planet', planet_id);
}
