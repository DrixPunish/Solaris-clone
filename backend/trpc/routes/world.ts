import { createTRPCRouter, publicProcedure } from "../create-context";
import { runWorldTick } from "@/backend/worldTick";
import { supabase } from "@/backend/supabase";
import { z } from "zod";

export const worldRouter = createTRPCRouter({
  tick: publicProcedure.mutation(async () => {
    const result = await runWorldTick();
    return {
      success: true,
      ...result,
      timestamp: Date.now(),
    };
  }),

  status: publicProcedure.query(() => {
    return {
      running: true,
      timestamp: Date.now(),
    };
  }),

  getActiveMissions: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabase
        .from('fleet_missions')
        .select('*')
        .or(`sender_id.eq.${input.userId},target_player_id.eq.${input.userId}`)
        .in('mission_phase', ['en_route', 'arrived', 'returning'])
        .order('arrival_time', { ascending: true });

      if (error) {
        console.log('[tRPC] Error fetching active missions:', error.message);
        return { success: false as const, error: error.message, missions: [] };
      }

      console.log('[tRPC] Active missions for', input.userId, ':', (data ?? []).length);
      return { success: true as const, missions: data ?? [] };
    }),

  deleteEspionageReport: publicProcedure
    .input(z.object({ reportId: z.string(), playerId: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from('espionage_reports')
        .delete()
        .eq('id', input.reportId)
        .eq('player_id', input.playerId);
      if (error) {
        console.log('[tRPC] Error deleting espionage report:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[tRPC] Espionage report deleted:', input.reportId);
      return { success: true };
    }),

  deleteAllEspionageReports: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from('espionage_reports')
        .delete()
        .eq('player_id', input.playerId);
      if (error) {
        console.log('[tRPC] Error deleting all espionage reports:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[tRPC] All espionage reports deleted for:', input.playerId);
      return { success: true };
    }),

  deleteCombatReport: publicProcedure
    .input(z.object({ reportId: z.string(), playerId: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from('combat_reports')
        .delete()
        .eq('id', input.reportId);
      if (error) {
        console.log('[tRPC] Error deleting combat report:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[tRPC] Combat report deleted:', input.reportId);
      return { success: true };
    }),

  deleteAllCombatReports: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from('combat_reports')
        .delete()
        .or(`attacker_id.eq.${input.playerId},defender_id.eq.${input.playerId}`);
      if (error) {
        console.log('[tRPC] Error deleting all combat reports:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[tRPC] All combat reports deleted for:', input.playerId);
      return { success: true };
    }),

  deleteTransportReport: publicProcedure
    .input(z.object({ missionId: z.string(), playerId: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from('fleet_missions')
        .delete()
        .eq('id', input.missionId);
      if (error) {
        console.log('[tRPC] Error deleting transport report:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[tRPC] Transport report deleted:', input.missionId);
      return { success: true };
    }),

  insertTargetEspionageNotification: publicProcedure
    .input(z.object({
      targetPlayerId: z.string(),
      targetCoords: z.array(z.number()),
      probesSent: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from('espionage_reports')
        .insert({
          player_id: input.targetPlayerId,
          target_player_id: null,
          target_username: null,
          target_coords: input.targetCoords,
          target_planet_name: null,
          resources: null,
          buildings: null,
          research: null,
          ships: null,
          defenses: null,
          probes_sent: 0,
          probes_lost: 0,
        });
      if (error) {
        console.log('[tRPC] Error inserting target espionage notification:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[tRPC] Target espionage notification inserted for:', input.targetPlayerId);
      return { success: true };
    }),

  deleteAllTransportReports: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ input }) => {
      const { error: e1 } = await supabase
        .from('fleet_missions')
        .delete()
        .eq('sender_id', input.playerId)
        .in('mission_type', ['transport', 'recycle'])
        .eq('status', 'completed');
      if (e1) console.log('[tRPC] Error deleting sent transport reports:', e1.message);

      const { error: e2 } = await supabase
        .from('fleet_missions')
        .delete()
        .eq('target_player_id', input.playerId)
        .neq('sender_id', input.playerId)
        .eq('mission_type', 'transport')
        .eq('processed', true)
        .eq('status', 'completed');
      if (e2) console.log('[tRPC] Error deleting received transport reports:', e2.message);

      console.log('[tRPC] All transport reports deleted for:', input.playerId);
      return { success: true };
    }),
});
