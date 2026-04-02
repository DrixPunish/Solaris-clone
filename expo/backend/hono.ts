import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { runWorldTick, startWorldTickLoop, getCombatErrorBuffer } from "./worldTick";

const app = new Hono();

app.use("*", cors());
 
app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Solaris Backend API", version: "2.3.0-no-player-id", deployedAt: "2026-04-02T15:00:00Z" });
});

app.post("/tick", async (c) => {
  const result = await runWorldTick();
  return c.json({ success: true, ...result, timestamp: Date.now() });
});

app.get("/tick/status", (c) => {
  return c.json({ running: true, timestamp: Date.now() });
});

app.get("/debug/combat-report-test", async (c) => {
  const { supabase } = await import("./supabase");

  const testData = {
    attacker_id: 'ca7eb6df-059e-4c10-bb29-3c66a87295df',
    defender_id: '8fb0d35f-d117-4a9c-968b-b8bd23f620c0',
    viewer_role: 'attacker',
    attacker_username: 'test_attacker',
    defender_username: 'test_defender',
    attacker_coords: [1, 1, 1],
    target_coords: [1, 1, 2],
    attacker_fleet: { fighter: 10 },
    defender_fleet: { fighter: 5 },
    defender_defenses_initial: {},
    rounds: 3,
    result: 'attacker_wins' as const,
    attacker_losses: { fighter: 2 },
    defender_losses: { fighter: 5 },
    loot: { fer: 100, silice: 50, xenogas: 25 },
    debris: { fer: 30, silice: 15 },
    combat_log: [{ type: 'init', message: 'test' }],
    round_logs: [{ round: 1, attackerAlive: 8, defenderAlive: 0 }],
  };

  const { data, error } = await supabase.from('combat_reports').insert(testData).select('id');

  if (error) {
    return c.json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      fullError: JSON.stringify(error),
    });
  }

  if (data?.[0]?.id) {
    await supabase.from('combat_reports').delete().eq('id', data[0].id);
  }

  return c.json({ success: true, insertedId: data?.[0]?.id, message: 'Insert OK, cleaned up test row' });
});

app.get("/debug/combat-report-realistic", async (c) => {
  const { supabase } = await import("./supabase");
  const { simulateCombat } = await import("@/utils/fleetCalculations");

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

  try {
    const attackerShips = { spectreSonde: 1 };
    const attackerResearch = { espionageTech: 1 };
    const defenderShips: Record<string, number> = {};
    const defenderDefenses: Record<string, number> = {};
    const defenderResearch: Record<string, number> = {};
    const defenderResources = { fer: 100, silice: 50, xenogas: 25 };

    const combatResult = simulateCombat(
      attackerShips, attackerResearch,
      defenderShips, defenderDefenses,
      defenderResearch, defenderResources,
    );

    const safeCombatLog = Array.isArray(combatResult.combatLog) && combatResult.combatLog.length > 0
      ? sanitizeForJsonb(combatResult.combatLog)
      : [{ type: 'error', message: 'Combat log was empty or invalid' }];
    const safeRoundLogs = Array.isArray(combatResult.roundLogs) && combatResult.roundLogs.length > 0
      ? sanitizeForJsonb(combatResult.roundLogs)
      : [];

    const payload = {
      attacker_id: 'ca7eb6df-059e-4c10-bb29-3c66a87295df',
      defender_id: '8fb0d35f-d117-4a9c-968b-b8bd23f620c0',
      attacker_username: 'test_attacker',
      defender_username: 'test_defender',
      attacker_coords: [1, 1, 1],
      target_coords: [1, 1, 2],
      attacker_fleet: sanitizeForJsonb(attackerShips) ?? {},
      defender_fleet: sanitizeForJsonb(defenderShips) ?? {},
      defender_defenses_initial: sanitizeForJsonb(defenderDefenses) ?? {},
      rounds: combatResult.rounds ?? 0,
      result: combatResult.result,
      attacker_losses: sanitizeForJsonb(combatResult.attackerLosses) ?? {},
      defender_losses: sanitizeForJsonb({ ...combatResult.defenderShipLosses, ...combatResult.defenderDefenseLosses }) ?? {},
      loot: sanitizeForJsonb(combatResult.loot) ?? { fer: 0, silice: 0, xenogas: 0 },
      debris: sanitizeForJsonb(combatResult.debris) ?? { fer: 0, silice: 0 },
      combat_log: safeCombatLog,
      round_logs: safeRoundLogs,
      viewer_role: 'attacker',
    };

    const payloadKeys = Object.keys(payload).sort();
    const payloadJson = JSON.stringify(payload);

    const { data, error } = await supabase.from('combat_reports').insert(payload).select('id');

    if (error) {
      return c.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        fullError: JSON.stringify(error),
        payloadKeys,
        payloadSize: payloadJson.length,
        payload: payloadJson.substring(0, 3000),
      });
    }

    const insertedId = data?.[0]?.id;
    if (insertedId) {
      await supabase.from('combat_reports').delete().eq('id', insertedId);
    }

    return c.json({
      success: true,
      insertedId,
      message: 'Realistic insert OK (simulateCombat + sanitizeForJsonb), cleaned up',
      payloadKeys,
      payloadSize: payloadJson.length,
      combatLogEntries: Array.isArray(combatResult.combatLog) ? combatResult.combatLog.length : 0,
      roundLogEntries: Array.isArray(combatResult.roundLogs) ? combatResult.roundLogs.length : 0,
    });
  } catch (ex) {
    return c.json({ success: false, error: String(ex), stack: (ex as Error)?.stack });
  }
});

app.get("/debug/combat-report-columns", async (c) => {
  const { supabase } = await import("./supabase");
  const { data: _cols, error: colErr } = await supabase
    .from('combat_reports')
    .select('*')
    .limit(0);

  const { data: sample, error: sampleErr } = await supabase
    .from('combat_reports')
    .select('*')
    .limit(1);

  return c.json({
    colsError: colErr?.message ?? null,
    sampleError: sampleErr?.message ?? null,
    sampleKeys: sample?.[0] ? Object.keys(sample[0]).sort() : [],
    expectedKeys: [
      'attacker_coords', 'attacker_fleet', 'attacker_id', 'attacker_losses',
      'attacker_username', 'combat_log', 'created_at', 'debris',
      'defender_defenses_initial', 'defender_fleet', 'defender_id',
      'defender_losses', 'defender_username', 'id', 'loot', 'result',
      'round_logs', 'rounds', 'target_coords', 'viewer_role',
    ],
  });
});

app.get("/debug/combat-errors", (c) => {
  const errors = getCombatErrorBuffer();
  return c.json({
    count: errors.length,
    errors,
    message: errors.length === 0 ? 'No combat insert errors recorded since last deploy' : `${errors.length} errors captured`,
  });
});

app.get("/debug/timers", async (c) => {
  const { supabase } = await import("./supabase");
  const now = Date.now();

  const { data: allTimers, error: allErr } = await supabase
    .from('active_timers')
    .select('id, end_time, start_time, timer_type, target_id, target_level, planet_id, user_id')
    .order('end_time', { ascending: true })
    .limit(20);

  const { data: expiredTimers, error: expErr } = await supabase
    .from('active_timers')
    .select('id, end_time, timer_type, target_id')
    .lte('end_time', now);

  return c.json({
    now,
    nowISO: new Date(now).toISOString(),
    nowType: typeof now,
    allTimersCount: allTimers?.length ?? 0,
    allTimersError: allErr?.message ?? null,
    expiredCount: expiredTimers?.length ?? 0,
    expiredError: expErr?.message ?? null,
    timers: (allTimers ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      end_time: t.end_time,
      end_time_type: typeof t.end_time,
      start_time: t.start_time,
      timer_type: t.timer_type,
      target_id: t.target_id,
      target_level: t.target_level,
      diff_ms: Number(t.end_time) - now,
      diff_sec: Math.round((Number(t.end_time) - now) / 1000),
      is_expired: Number(t.end_time) <= now,
      lte_would_match: (t.end_time as number) <= now,
      lte_string_match: String(t.end_time) <= String(now),
    })),
  });
});

startWorldTickLoop(5000);
console.log("[Backend] Solaris world tick loop started (5s interval)");

export default app;
