import { supabase } from '@/backend/supabase';
import { logger } from '@/utils/logger';
import { scheduleShipyardUnitComplete, scheduleScoreRecalc } from '@/backend/eventScheduler';
import type { GameEvent } from './types';

export async function handleShipyardUnitComplete(event: GameEvent): Promise<void> {
  const { planet_id, item_id, item_type, queue_position, queue_id } = event.payload as {
    planet_id: string;
    item_id: string;
    item_type: 'ship' | 'defense';
    queue_position?: number;
    queue_id?: string;
  };

  logger.log('[EventHandler][ShipyardComplete] Processing event', event.id, 'planet:', planet_id, 'item:', item_id, 'type:', item_type, 'pos:', queue_position ?? 0, 'queue_id:', queue_id ?? 'none');

  const { data: planetExists } = await supabase
    .from('planets')
    .select('id')
    .eq('id', planet_id)
    .maybeSingle();

  if (!planetExists) {
    logger.log('[EventHandler][ShipyardComplete] Planet no longer exists:', planet_id, '- aborting');
    return;
  }

  let query = supabase
    .from('shipyard_queue')
    .select('remaining_quantity, build_time_per_unit, current_unit_end_time, current_unit_start_time, total_quantity')
    .eq('planet_id', planet_id)
    .eq('item_id', item_id)
    .eq('item_type', item_type);

  if (queue_id) {
    query = query.eq('id', queue_id);
  }

  const { data: queueRow } = await query.maybeSingle();

  if (!queueRow) {
    logger.log('[EventHandler][ShipyardComplete] Queue entry not found - already fully processed or cancelled (idempotent skip)');
    return;
  }

  if (queueRow.remaining_quantity <= 0) {
    logger.log('[EventHandler][ShipyardComplete] Queue remaining_quantity is 0 - already fully processed (idempotent skip)');
    return;
  }

  const now = Date.now();
  if (queueRow.current_unit_end_time > now + 2000) {
    logger.log('[EventHandler][ShipyardComplete] Queue unit end_time', queueRow.current_unit_end_time, 'is in the future (now:', now, ') - possible stale event after rush/cancel. Aborting.');
    return;
  }

  const remaining = queueRow.remaining_quantity - 1;

  if (remaining <= 0) {
    const deleteQuery = supabase
      .from('shipyard_queue')
      .delete()
      .eq('planet_id', planet_id)
      .eq('item_id', item_id)
      .eq('item_type', item_type)
      .eq('remaining_quantity', queueRow.remaining_quantity);

    if (queue_id) {
      deleteQuery.eq('id', queue_id);
    }

    const { data: deleted } = await deleteQuery.select();

    if (!deleted?.length) {
      logger.log('[EventHandler][ShipyardComplete] Queue row was modified concurrently during delete - idempotent skip');
      return;
    }
  } else {
    const nextEndTime = queueRow.current_unit_end_time + queueRow.build_time_per_unit * 1000;

    const updateQuery = supabase
      .from('shipyard_queue')
      .update({
        remaining_quantity: remaining,
        current_unit_start_time: queueRow.current_unit_end_time,
        current_unit_end_time: nextEndTime,
      })
      .eq('planet_id', planet_id)
      .eq('item_id', item_id)
      .eq('item_type', item_type)
      .eq('remaining_quantity', queueRow.remaining_quantity);

    if (queue_id) {
      updateQuery.eq('id', queue_id);
    }

    const { data: updated } = await updateQuery.select();

    if (!updated?.length) {
      logger.log('[EventHandler][ShipyardComplete] Queue row was modified concurrently during update - idempotent skip');
      return;
    }

    const nextPosition = (queue_position ?? 0) + 1;
    const nextExecuteAt = new Date(nextEndTime);

    try {
      const result = await scheduleShipyardUnitComplete(
        planet_id,
        item_id,
        item_type,
        nextPosition,
        nextExecuteAt,
        queue_id,
      );
      logger.log('[EventHandler][ShipyardComplete] Chained next event:', result.eventId, 'pos:', nextPosition, 'execute_at:', nextExecuteAt.toISOString());
    } catch (e) {
      logger.log('[EventHandler][ShipyardComplete] Error scheduling next shipyard event:', e instanceof Error ? e.message : String(e));
    }
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

  const { data: planetOwner } = await supabase
    .from('planets')
    .select('user_id')
    .eq('id', planet_id)
    .maybeSingle();

  if (planetOwner?.user_id) {
    try {
      await scheduleScoreRecalc(planetOwner.user_id as string);
    } catch (e) {
      logger.log('[EventHandler][ShipyardComplete] Non-blocking: failed to schedule score recalc:', e instanceof Error ? e.message : String(e));
    }
  }
}
