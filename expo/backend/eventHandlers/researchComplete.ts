import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import type { GameEvent } from './types';

export async function handleResearchComplete(event: GameEvent): Promise<void> {
  const { player_id, research_id, target_level, timer_id } = event.payload as {
    player_id: string;
    research_id: string;
    target_level: number;
    timer_id?: string;
  };

  logger.log('[EventHandler][ResearchComplete] Processing event', event.id, 'player:', player_id, 'research:', research_id, 'level:', target_level);

  if (timer_id) {
    const { data: timerExists } = await supabase
      .from('active_timers')
      .select('id')
      .eq('id', timer_id)
      .maybeSingle();

    if (!timerExists) {
      logger.log('[EventHandler][ResearchComplete] Timer already processed (idempotent skip):', timer_id);
      return;
    }

    const { error: delErr } = await supabase
      .from('active_timers')
      .delete()
      .eq('id', timer_id);

    if (delErr) {
      logger.log('[EventHandler][ResearchComplete] Error deleting timer:', delErr.message);
    }
  }

  const { error: upsertErr } = await supabase
    .from('player_research')
    .upsert({
      user_id: player_id,
      research_id,
      level: target_level,
    }, { onConflict: 'user_id,research_id' });

  if (upsertErr) {
    logger.log('[EventHandler][ResearchComplete] Error upserting research:', upsertErr.message);
    throw new Error(`Failed to complete research: ${upsertErr.message}`);
  }

  logger.log('[EventHandler][ResearchComplete] Research completed:', research_id, 'level', target_level, 'for player', player_id);
}
