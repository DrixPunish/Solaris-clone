import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import type { GameEvent } from './types';

export async function handleScoreRecalc(event: GameEvent): Promise<void> {
  const { player_id } = event.payload as { player_id?: string };

  logger.log('[EventHandler][ScoreRecalc] Processing event', event.id, 'player:', player_id ?? 'ALL');

  if (player_id) {
    const { error } = await supabase.rpc('recalc_player_score', { p_player_id: player_id });
    if (error) {
      logger.log('[EventHandler][ScoreRecalc] Error recalculating score for', player_id, ':', error.message);
      throw new Error(`Score recalc failed: ${error.message}`);
    }
    logger.log('[EventHandler][ScoreRecalc] Score recalculated for player', player_id);
  } else {
    const { data, error } = await supabase.rpc('recalc_all_player_scores');
    if (error) {
      logger.log('[EventHandler][ScoreRecalc] Error recalculating all scores:', error.message);
      throw new Error(`Score recalc all failed: ${error.message}`);
    }
    const res = data as { players_updated?: number } | null;
    logger.log('[EventHandler][ScoreRecalc] All scores recalculated, players updated:', res?.players_updated ?? 0);
  }
}
