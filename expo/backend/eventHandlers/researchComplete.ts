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

  const { data: currentResearch } = await supabase
    .from('player_research')
    .select('level')
    .eq('user_id', player_id)
    .eq('research_id', research_id)
    .maybeSingle();

  const currentLevel = currentResearch?.level ?? 0;

  if (currentLevel >= target_level) {
    logger.log('[EventHandler][ResearchComplete] Research already at level', currentLevel, '>= target', target_level, '- idempotent skip');
    if (timer_id) {
      await supabase.from('active_timers').delete().eq('id', timer_id);
    }
    return;
  }

  if (currentLevel !== target_level - 1) {
    logger.log('[EventHandler][ResearchComplete] WARNING: current level', currentLevel, 'does not match expected', target_level - 1, '- possible concurrent modification. Proceeding with caution.');
  }

  if (timer_id) {
    const { data: timerRow } = await supabase
      .from('active_timers')
      .select('id, target_id, target_level, timer_type')
      .eq('id', timer_id)
      .maybeSingle();

    if (!timerRow) {
      logger.log('[EventHandler][ResearchComplete] Timer not found:', timer_id, '- checking if research already upgraded');
      if (currentLevel >= target_level) {
        logger.log('[EventHandler][ResearchComplete] Research already at target level, timer was already processed');
        return;
      }
      logger.log('[EventHandler][ResearchComplete] Timer gone but research not yet upgraded - proceeding (rush or race condition)');
    } else {
      if (timerRow.timer_type !== 'research' || timerRow.target_id !== research_id || timerRow.target_level !== target_level) {
        logger.log('[EventHandler][ResearchComplete] Timer mismatch! Expected research:', research_id, 'lv', target_level, 'Got:', timerRow.timer_type, timerRow.target_id, 'lv', timerRow.target_level, '- aborting');
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
  } else {
    const { data: matchingTimer } = await supabase
      .from('active_timers')
      .select('id')
      .eq('user_id', player_id)
      .eq('target_id', research_id)
      .eq('timer_type', 'research')
      .eq('target_level', target_level)
      .maybeSingle();

    if (matchingTimer) {
      logger.log('[EventHandler][ResearchComplete] Found matching timer without explicit timer_id, cleaning up:', matchingTimer.id);
      await supabase.from('active_timers').delete().eq('id', matchingTimer.id);
    }
  }

  const { data: playerExists } = await supabase
    .from('players')
    .select('user_id')
    .eq('user_id', player_id)
    .maybeSingle();

  if (!playerExists) {
    logger.log('[EventHandler][ResearchComplete] Player no longer exists:', player_id, '- aborting');
    return;
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
