import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { startEventWorkerLoop, getEventWorkerStats } from "./eventWorker";
  
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
  return c.json({ status: "ok", message: "Solaris Backend API", version: "4.0.0-event-only", deployedAt: "2026-04-06T00:00:00Z" });
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

app.get("/debug/event-worker", (c) => {
  const stats = getEventWorkerStats();
  return c.json({ ...stats, timestamp: Date.now() });
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

startEventWorkerLoop(1000);
console.log("[Backend] Solaris event worker loop started (1s interval, sole runtime engine)");

export default app;
