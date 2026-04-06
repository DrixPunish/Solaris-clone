import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import type { GameEvent } from './types';

export async function handleShipyardUnitComplete(event: GameEvent): Promise<void> {
  const { planet_id, item_id, item_type, queue_id: _queue_id } = event.payload as {
    planet_id: string;
    item_id: string;
    item_type: 'ship' | 'defense';
    queue_id?: string;
  };

  logger.log('[EventHandler][ShipyardComplete] Processing event', event.id, 'planet:', planet_id, 'item:', item_id, 'type:', item_type);

  const { data: queueRow } = await supabase
    .from('shipyard_queue')
    .select('remaining_quantity, build_time_per_unit, current_unit_end_time')
    .eq('planet_id', planet_id)
    .eq('item_id', item_id)
    .eq('item_type', item_type)
    .maybeSingle();

  if (!queueRow || queueRow.remaining_quantity <= 0) {
    logger.log('[EventHandler][ShipyardComplete] Queue entry already processed (idempotent skip)');
    return;
  }

  const remaining = queueRow.remaining_quantity - 1;

  if (remaining <= 0) {
    await supabase
      .from('shipyard_queue')
      .delete()
      .eq('planet_id', planet_id)
      .eq('item_id', item_id)
      .eq('item_type', item_type);
  } else {
    const nextEndTime = queueRow.current_unit_end_time + queueRow.build_time_per_unit * 1000;
    await supabase
      .from('shipyard_queue')
      .update({
        remaining_quantity: remaining,
        current_unit_start_time: queueRow.current_unit_end_time,
        current_unit_end_time: nextEndTime,
      })
      .eq('planet_id', planet_id)
      .eq('item_id', item_id)
      .eq('item_type', item_type);

    // TODO Phase 2: Schedule next shipyard_unit_complete event with execute_at = nextEndTime
  }

  if (item_type === 'ship') {
    const { data: existing } = await supabase
      .from('planet_ships')
      .select('quantity')
      .eq('planet_id', planet_id)
      .eq('ship_id', item_id)
      .maybeSingle();

    await supabase.from('planet_ships').upsert({
      planet_id,
      ship_id: item_id,
      quantity: (existing?.quantity ?? 0) + 1,
    }, { onConflict: 'planet_id,ship_id' });
  } else {
    const { data: existing } = await supabase
      .from('planet_defenses')
      .select('quantity')
      .eq('planet_id', planet_id)
      .eq('defense_id', item_id)
      .maybeSingle();

    await supabase.from('planet_defenses').upsert({
      planet_id,
      defense_id: item_id,
      quantity: (existing?.quantity ?? 0) + 1,
    }, { onConflict: 'planet_id,defense_id' });
  }

  logger.log('[EventHandler][ShipyardComplete] Built 1x', item_id, '(' + item_type + ') on planet', planet_id, '| remaining:', remaining);
}
