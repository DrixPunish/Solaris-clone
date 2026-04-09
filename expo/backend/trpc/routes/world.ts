import { createTRPCRouter, publicProcedure, protectedProcedure } from "../create-context";
import { supabase } from "@/backend/supabase";
import { z } from "zod";
import { logger } from "@/utils/logger";
import { getEventWorkerStats } from "@/backend/eventWorker";

interface LeaderboardRow {
  player_id: string;
  username: string;
  coordinates: number[];
  total_points: number;
  building_points: number;
  research_points: number;
  fleet_points: number;
  defense_points: number;
  last_updated: string;
  rank: number;
}

export const worldRouter = createTRPCRouter({
  status: publicProcedure.query(() => {
    const stats = getEventWorkerStats();
    return {
      running: stats.isRunning,
      mode: 'event-only' as const,
      workerStats: stats,
      timestamp: Date.now(),
    };
  }),

  getActiveMissions: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId;
      const { data, error } = await supabase
        .from('fleet_missions')
        .select('*')
        .or(`sender_id.eq.${userId},target_player_id.eq.${userId}`)
        .in('mission_phase', ['en_route', 'arrived', 'returning'])
        .order('arrival_time', { ascending: true });

      if (error) {
        logger.error('[tRPC] Error fetching active missions:', error.message);
        return { success: false as const, error: error.message, missions: [] };
      }

      return { success: true as const, missions: data ?? [] };
    }),

  deleteEspionageReport: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { error } = await supabase
        .from('espionage_reports')
        .delete()
        .eq('id', input.reportId)
        .eq('player_id', userId);
      if (error) {
        logger.error('[tRPC] Error deleting espionage report:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    }),

  deleteAllEspionageReports: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      const { error } = await supabase
        .from('espionage_reports')
        .delete()
        .eq('player_id', userId);
      if (error) {
        logger.error('[tRPC] Error deleting all espionage reports:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    }),

  deleteCombatReport: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { error: err1 } = await supabase
        .from('combat_reports')
        .delete()
        .eq('id', input.reportId)
        .eq('viewer_role', 'attacker')
        .eq('attacker_id', userId);
      const { error: err2 } = await supabase
        .from('combat_reports')
        .delete()
        .eq('id', input.reportId)
        .eq('viewer_role', 'defender')
        .eq('defender_id', userId);
      const error = err1 || err2;
      if (error) {
        logger.error('[tRPC] Error deleting combat report:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    }),

  deleteAllCombatReports: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      const { error: err1 } = await supabase
        .from('combat_reports')
        .delete()
        .eq('viewer_role', 'attacker')
        .eq('attacker_id', userId);
      const { error: err2 } = await supabase
        .from('combat_reports')
        .delete()
        .eq('viewer_role', 'defender')
        .eq('defender_id', userId);
      const error = err1 || err2;
      if (error) {
        logger.error('[tRPC] Error deleting all combat reports:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    }),

  deleteTransportReport: protectedProcedure
    .input(z.object({ missionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { error } = await supabase
        .from('fleet_missions')
        .delete()
        .eq('id', input.missionId)
        .or(`sender_id.eq.${userId},target_player_id.eq.${userId}`);
      if (error) {
        logger.error('[tRPC] Error deleting transport report:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    }),

  insertTargetEspionageNotification: protectedProcedure
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
        logger.error('[tRPC] Error inserting target espionage notification:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    }),

  getLeaderboard: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 100;
      const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: limit });

      if (error) {
        logger.error('[tRPC] Error fetching leaderboard:', error.message);
        return { success: false as const, error: error.message, players: [] };
      }

      const rows = (data ?? []) as LeaderboardRow[];
      return { success: true as const, players: rows };
    }),

  getPlanetResources: protectedProcedure
    .input(z.object({ planetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { data: planet } = await supabase
        .from('planets')
        .select('id')
        .eq('id', input.planetId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!planet) {
        return { success: false as const, error: 'Planet not found or not owned' };
      }

      const { data: matResult, error: matError } = await supabase.rpc('materialize_planet_resources', {
        p_planet_id: input.planetId,
        p_user_id: userId,
      });

      if (matError) {
        logger.error('[tRPC] materialize_planet_resources error:', matError.message);
      }

      const matRes = matResult as { success?: boolean; fer?: number; silice?: number; xenogas?: number } | null;
      if (matRes?.success && matRes.fer !== undefined) {
        logger.log('[tRPC] getPlanetResources: materialized fresh values for', input.planetId);
        return {
          success: true as const,
          fer: matRes.fer,
          silice: matRes.silice ?? 0,
          xenogas: matRes.xenogas ?? 0,
          energy: 0,
        };
      }

      const { data, error } = await supabase
        .from('planet_resources')
        .select('fer, silice, xenogas, energy')
        .eq('planet_id', input.planetId)
        .maybeSingle();

      if (error) {
        logger.error('[tRPC] Error fetching planet resources:', error.message);
        return { success: false as const, error: error.message };
      }

      if (!data) {
        return { success: false as const, error: 'Planet resources not found' };
      }

      return {
        success: true as const,
        fer: data.fer as number,
        silice: data.silice as number,
        xenogas: data.xenogas as number,
        energy: data.energy as number,
      };
    }),

  getPlayerScore: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId;
      const { data, error } = await supabase
        .from('player_scores')
        .select('*')
        .eq('player_id', userId)
        .maybeSingle();

      if (error) {
        logger.error('[tRPC] Error fetching player score:', error.message);
        return { success: false as const, error: error.message };
      }

      return { success: true as const, score: data };
    }),

  getPlayerAttackStatus: protectedProcedure
    .input(z.object({ defenderId: z.string() }))
    .query(async ({ input, ctx }) => {
      const attackerId = ctx.userId;
      const { defenderId } = input;

      const { data: defenderShield } = await supabase.rpc('get_quantum_shield_status', { p_player_id: defenderId });
      const shieldData = defenderShield as { shield_active?: boolean; shield_expires_at?: string | null } | null;
      if (shieldData?.shield_active === true) {
        const { data: attackerData } = await supabase.from('player_scores').select('total_points').eq('player_id', attackerId).maybeSingle();
        const { data: defenderData } = await supabase.from('player_scores').select('total_points').eq('player_id', defenderId).maybeSingle();
        return {
          can_attack: false,
          reason: 'quantum_shield_defender' as const,
          attacker_pts: (attackerData?.total_points as number) ?? 0,
          defender_pts: (defenderData?.total_points as number) ?? 0,
          quantum_shield_active_defender: true,
          shield_expires_at: shieldData?.shield_expires_at ?? null,
        };
      }

      const { data: attackerData } = await supabase
        .from('player_scores')
        .select('total_points')
        .eq('player_id', attackerId)
        .maybeSingle();

      const { data: defenderData } = await supabase
        .from('player_scores')
        .select('total_points')
        .eq('player_id', defenderId)
        .maybeSingle();

      const attacker_pts = (attackerData?.total_points as number) ?? 0;
      const defender_pts = (defenderData?.total_points as number) ?? 0;

      if (attacker_pts < 100) {
        return { can_attack: false, reason: 'noob_shield_attacker' as const, attacker_pts, defender_pts };
      }
      if (defender_pts < 100) {
        return { can_attack: false, reason: 'noob_shield_defender' as const, attacker_pts, defender_pts };
      }
      if (defender_pts <= attacker_pts * 0.5) {
        return { can_attack: false, reason: 'point_gap' as const, attacker_pts, defender_pts };
      }

      return { can_attack: true, reason: null, attacker_pts, defender_pts };
    }),

  getBashingStatus: protectedProcedure
    .input(z.object({
      targetCoords: z.array(z.number()),
      targetPlayerId: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const attackerId = ctx.userId;
      const { targetCoords, targetPlayerId } = input;

      const { data: targetPlanet } = await supabase
        .from('planets')
        .select('id')
        .eq('user_id', targetPlayerId)
        .filter('coordinates->>0', 'eq', String(targetCoords[0]))
        .filter('coordinates->>1', 'eq', String(targetCoords[1]))
        .filter('coordinates->>2', 'eq', String(targetCoords[2]))
        .maybeSingle();

      if (!targetPlanet) {
        return { attacks_24h: 0, limit: 6, blocked: false };
      }

      const { data: count, error } = await supabase.rpc('get_bashing_count', {
        p_attacker_id: attackerId,
        p_target_planet_id: (targetPlanet as { id: string }).id,
      });

      if (error) {
        logger.error('[tRPC] Error fetching bashing count:', error.message);
        return { attacks_24h: 0, limit: 6, blocked: false };
      }

      const attacks = (count as number) ?? 0;
      return {
        attacks_24h: attacks,
        limit: 6,
        blocked: attacks >= 6,
      };
    }),

  getQuantumShieldStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId;
      const { data, error } = await supabase.rpc('get_quantum_shield_status', { p_player_id: userId });

      if (error) {
        logger.error('[tRPC] Error fetching quantum shield status:', error.message);
        return {
          shield_active: false,
          shield_expires_at: null as string | null,
          cooldown_expires_at: null as string | null,
          remaining_seconds: 0,
          cooldown_remaining_seconds: 0,
          can_buy: true,
          cost_solar: 500,
        };
      }

      const result = data as {
        shield_active: boolean;
        shield_expires_at: string | null;
        cooldown_expires_at: string | null;
        remaining_seconds: number;
        cooldown_remaining_seconds: number;
        can_buy: boolean;
        cost_solar: number;
      };
      return result;
    }),

  buyQuantumShield: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      const { data, error } = await supabase.rpc('rpc_buy_quantum_shield', { p_player_id: userId });

      if (error) {
        logger.error('[tRPC] Error buying quantum shield:', error.message);
        return { success: false as const, error: error.message };
      }

      const result = data as {
        success: boolean;
        error?: string;
        shield_active?: boolean;
        shield_expires_at?: string;
        cooldown_expires_at?: string | null;
        remaining_solar?: number;
      };

      if (!result.success) {
        return { success: false as const, error: result.error ?? 'Erreur inconnue' };
      }

      return {
        success: true as const,
        shield_active: result.shield_active ?? true,
        shield_expires_at: result.shield_expires_at ?? null,
        remaining_solar: result.remaining_solar ?? 0,
      };
    }),

  materializeAllPlanets: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      const { data: planets } = await supabase
        .from('planets')
        .select('id')
        .eq('user_id', userId);

      if (!planets || planets.length === 0) {
        return { success: false as const, error: 'No planets found' };
      }

      const results: Array<{ planetId: string; success: boolean }> = [];
      for (const p of planets) {
        const pid = p.id as string;
        const { error: matErr } = await supabase.rpc('materialize_planet_resources', {
          p_planet_id: pid,
          p_user_id: userId,
        });
        results.push({ planetId: pid, success: !matErr });
        if (matErr) {
          logger.error('[tRPC] materializeAllPlanets error for', pid, ':', matErr.message);
        }
      }

      logger.log('[tRPC] materializeAllPlanets done:', results.length, 'planets processed');
      return { success: true as const, results };
    }),

  recalcPlayerScore: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      const { data, error } = await supabase.rpc('recalc_player_score', { p_player_id: userId });

      if (error) {
        logger.error('[tRPC] Error recalcing player score:', error.message);
        return { success: false as const, error: error.message };
      }

      return { success: true as const, ...(data as Record<string, unknown>) };
    }),

  getFleetStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId;
      const { count, error: countError } = await supabase
        .from('fleet_missions')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', userId)
        .in('mission_phase', ['en_route', 'arrived', 'returning']);

      if (countError) {
        logger.error('[tRPC] Error fetching fleet count:', countError.message);
      }

      const { data: research } = await supabase
        .from('player_research')
        .select('level')
        .eq('user_id', userId)
        .eq('research_id', 'computerTech')
        .maybeSingle();

      const computerTechLevel = (research?.level as number) ?? 0;
      const fleetLimit = 1 + computerTechLevel;

      return {
        activeFleets: count ?? 0,
        fleetLimit,
        computerTechLevel,
      };
    }),

  calculateFlightTime: protectedProcedure
    .input(z.object({
      senderCoords: z.array(z.number()),
      targetCoords: z.array(z.number()),
      ships: z.record(z.string(), z.number()),
      speedPercent: z.number().min(10).max(100).default(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const speedFraction = (input.speedPercent ?? 100) / 100;
      const { data, error } = await supabase.rpc('rpc_calculate_flight_time', {
        p_sender_coords: input.senderCoords,
        p_target_coords: input.targetCoords,
        p_fleet_ships: input.ships,
        p_user_id: userId,
        p_speed_percent: speedFraction,
      });

      if (error) {
        logger.error('[tRPC] Error calculating flight time:', error.message);
        return { success: false as const, error: error.message };
      }

      const result = data as {
        success: boolean;
        error?: string;
        distance?: number;
        slowest_speed?: number;
        flight_time_sec?: number;
        return_time_sec?: number;
        fuel_cost?: number;
      };
      if (!result.success) {
        return { success: false as const, error: result.error ?? 'Unknown error' };
      }
      return {
        success: true as const,
        distance: result.distance ?? 0,
        slowest_speed: result.slowest_speed ?? 0,
        flight_time_sec: result.flight_time_sec ?? 30,
        return_time_sec: result.return_time_sec ?? 30,
        fuel_cost: result.fuel_cost ?? 0,
      };
    }),

  deleteAllTransportReports: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      const { error: e1 } = await supabase
        .from('fleet_missions')
        .delete()
        .eq('sender_id', userId)
        .in('mission_type', ['transport', 'recycle'])
        .eq('status', 'completed');
      if (e1) logger.error('[tRPC] Error deleting sent transport reports:', e1.message);

      const { error: e2 } = await supabase
        .from('fleet_missions')
        .delete()
        .eq('target_player_id', userId)
        .neq('sender_id', userId)
        .eq('mission_type', 'transport')
        .eq('processed', true)
        .eq('status', 'completed');
      if (e2) logger.error('[tRPC] Error deleting received transport reports:', e2.message);

      return { success: true };
    }),
});
