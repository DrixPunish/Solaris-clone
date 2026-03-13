import { supabase } from './supabase';

interface TimerRow {
  id: string;
  user_id: string;
  planet_id: string | null;
  timer_type: string;
  target_id: string;
  target_level: number;
  start_time: number;
  end_time: number;
}

interface QueueRow {
  planet_id: string;
  item_id: string;
  item_type: string;
  total_quantity: number;
  remaining_quantity: number;
  build_time_per_unit: number;
  current_unit_start_time: number;
  current_unit_end_time: number;
}

export async function processExpiredTimers(): Promise<number> {
  const now = Date.now();

  const { data: expired, error } = await supabase
    .from('active_timers')
    .select('*')
    .lte('end_time', now);

  if (error || !expired?.length) return 0;

  let count = 0;

  for (const timer of expired as TimerRow[]) {
    const { data: deleted } = await supabase
      .from('active_timers')
      .delete()
      .eq('id', timer.id)
      .select();

    if (!deleted?.length) {
      continue;
    }

    if (timer.timer_type === 'building' && timer.planet_id) {
      const { error: upsertErr } = await supabase
        .from('planet_buildings')
        .upsert({
          planet_id: timer.planet_id,
          building_id: timer.target_id,
          level: timer.target_level,
        }, { onConflict: 'planet_id,building_id' });

      if (upsertErr) {
        console.log('[WorldProcessor] Error applying building:', upsertErr.message);
      } else {
        console.log('[WorldProcessor] Building completed:', timer.target_id, 'lv', timer.target_level, 'planet', timer.planet_id);
      }
    } else if (timer.timer_type === 'research') {
      const { error: upsertErr } = await supabase
        .from('player_research')
        .upsert({
          user_id: timer.user_id,
          research_id: timer.target_id,
          level: timer.target_level,
        }, { onConflict: 'user_id,research_id' });

      if (upsertErr) {
        console.log('[WorldProcessor] Error applying research:', upsertErr.message);
      } else {
        console.log('[WorldProcessor] Research completed:', timer.target_id, 'lv', timer.target_level, 'user', timer.user_id);
      }
    }

    count++;
  }

  if (count > 0) {
    console.log('[WorldProcessor] Processed', count, 'expired timers');
  }

  return count;
}

export async function processExpiredShipyardQueues(): Promise<number> {
  const now = Date.now();

  const { data: items, error } = await supabase
    .from('shipyard_queue')
    .select('*')
    .lte('current_unit_end_time', now);

  if (error || !items?.length) return 0;

  let count = 0;

  for (const item of items as QueueRow[]) {
    let completed = 0;
    let endTime = item.current_unit_end_time;
    let remaining = item.remaining_quantity;

    while (now >= endTime && remaining > 0) {
      completed++;
      remaining--;
      if (remaining > 0) {
        endTime += item.build_time_per_unit * 1000;
      }
    }

    if (completed === 0) continue;

    if (remaining <= 0) {
      const { data: deleted } = await supabase
        .from('shipyard_queue')
        .delete()
        .eq('planet_id', item.planet_id)
        .eq('item_id', item.item_id)
        .eq('item_type', item.item_type)
        .eq('remaining_quantity', item.remaining_quantity)
        .select();

      if (!deleted?.length) {
        console.log('[WorldProcessor] Shipyard queue already modified:', item.item_id);
        continue;
      }
    } else {
      const { data: updated } = await supabase
        .from('shipyard_queue')
        .update({
          remaining_quantity: remaining,
          current_unit_start_time: endTime - item.build_time_per_unit * 1000,
          current_unit_end_time: endTime,
        })
        .eq('planet_id', item.planet_id)
        .eq('item_id', item.item_id)
        .eq('item_type', item.item_type)
        .eq('remaining_quantity', item.remaining_quantity)
        .select();

      if (!updated?.length) {
        console.log('[WorldProcessor] Shipyard queue already modified:', item.item_id);
        continue;
      }
    }

    if (item.item_type === 'ship') {
      const { data: existing } = await supabase
        .from('planet_ships')
        .select('quantity')
        .eq('planet_id', item.planet_id)
        .eq('ship_id', item.item_id)
        .single();

      await supabase.from('planet_ships').upsert({
        planet_id: item.planet_id,
        ship_id: item.item_id,
        quantity: (existing?.quantity ?? 0) + completed,
      }, { onConflict: 'planet_id,ship_id' });
    } else {
      const { data: existing } = await supabase
        .from('planet_defenses')
        .select('quantity')
        .eq('planet_id', item.planet_id)
        .eq('defense_id', item.item_id)
        .single();

      await supabase.from('planet_defenses').upsert({
        planet_id: item.planet_id,
        defense_id: item.item_id,
        quantity: (existing?.quantity ?? 0) + completed,
      }, { onConflict: 'planet_id,defense_id' });
    }

    console.log('[WorldProcessor] Built', completed, 'x', item.item_id, '(' + item.item_type + ') for planet', item.planet_id);
    count++;
  }

  if (count > 0) {
    console.log('[WorldProcessor] Processed', count, 'shipyard queue items');
  }

  return count;
}

async function findPlanetByCoords(
  userId: string,
  coords: number[],
): Promise<string | null> {
  const { data } = await supabase
    .from('planets')
    .select('id')
    .eq('user_id', userId)
    .filter('coordinates->>0', 'eq', String(coords[0]))
    .filter('coordinates->>1', 'eq', String(coords[1]))
    .filter('coordinates->>2', 'eq', String(coords[2]))
    .single();
  return data?.id ?? null;
}

export async function processReturningFleets(): Promise<number> {
  const now = Date.now();

  const { data: returning, error } = await supabase
    .from('fleet_missions')
    .select('*')
    .eq('status', 'returning')
    .not('return_time', 'is', null)
    .lte('return_time', now);

  if (error || !returning?.length) return 0;

  let count = 0;

  for (const mission of returning) {
    const { data: claimed } = await supabase
      .from('fleet_missions')
      .update({ status: 'completed' })
      .eq('id', mission.id)
      .eq('status', 'returning')
      .select();

    if (!claimed?.length) continue;

    const senderCoords = mission.sender_coords as number[];
    const senderPlanetId = await findPlanetByCoords(mission.sender_id, senderCoords);

    if (!senderPlanetId) {
      console.log('[WorldProcessor] Sender planet not found for return:', mission.id, 'sender:', mission.sender_id, 'coords:', senderCoords);
      continue;
    }

    const ships = (mission.ships ?? {}) as Record<string, number>;
    for (const [shipId, qty] of Object.entries(ships)) {
      if (typeof qty !== 'number' || qty <= 0) continue;

      const { data: existing } = await supabase
        .from('planet_ships')
        .select('quantity')
        .eq('planet_id', senderPlanetId)
        .eq('ship_id', shipId)
        .single();

      await supabase.from('planet_ships').upsert({
        planet_id: senderPlanetId,
        ship_id: shipId,
        quantity: (existing?.quantity ?? 0) + qty,
      }, { onConflict: 'planet_id,ship_id' });
    }

    const res = mission.resources as { fer?: number; silice?: number; xenogas?: number } | null;
    if (res && ((res.fer ?? 0) > 0 || (res.silice ?? 0) > 0 || (res.xenogas ?? 0) > 0)) {
      const { error: rpcErr } = await supabase.rpc('add_resources_to_planet', {
        p_planet_id: senderPlanetId,
        p_fer: res.fer ?? 0,
        p_silice: res.silice ?? 0,
        p_xenogas: res.xenogas ?? 0,
      });

      if (rpcErr) {
        console.log('[WorldProcessor] Error adding return resources:', rpcErr.message);
      }
    }

    console.log('[WorldProcessor] Fleet returned:', mission.id,
      'ships:', Object.keys(ships).length > 0 ? JSON.stringify(ships) : 'none',
      'resources:', res ? `fer:${res.fer ?? 0} sil:${res.silice ?? 0} xen:${res.xenogas ?? 0}` : 'none');
    count++;
  }

  if (count > 0) {
    console.log('[WorldProcessor] Processed', count, 'fleet returns');
  }

  return count;
}

let isRunning = false;

export async function runWorldTick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const [timers, queues, returns] = await Promise.all([
      processExpiredTimers().catch(e => { console.log('[WorldProcessor] Timer error:', e); return 0; }),
      processExpiredShipyardQueues().catch(e => { console.log('[WorldProcessor] Queue error:', e); return 0; }),
      processReturningFleets().catch(e => { console.log('[WorldProcessor] Return error:', e); return 0; }),
    ]);

    if (timers > 0 || queues > 0 || returns > 0) {
      console.log('[WorldProcessor] Tick complete: timers=' + timers + ' queues=' + queues + ' returns=' + returns);
    }
  } catch (e) {
    console.log('[WorldProcessor] Tick error:', e);
  } finally {
    isRunning = false;
  }
}
