import { createTRPCRouter, protectedProcedure } from "../create-context";
import { supabase } from "@/backend/supabase";
import { z } from "zod";
import { BUILDINGS, RESEARCH, SHIPS, DEFENSES } from "@/constants/gameData";
import { TUTORIAL_STEPS } from "@/constants/tutorial";
import {
  checkPrerequisites,
} from "@/utils/gameCalculations";
import { logger } from "@/utils/logger";
import { ensureEventForShipyardQueue } from "@/backend/eventScheduler";

interface RpcResult {
  success: boolean;
  error?: string;
  resources?: { fer: number; silice: number; xenogas: number; energy: number };
  timer?: { id: string; type: string; targetLevel: number; startTime: number; endTime: number };
  queueItem?: {
    id: string;
    type: string;
    totalQuantity: number;
    remainingQuantity: number;
    buildTimePerUnit: number;
    currentUnitStartTime: number;
    currentUnitEndTime: number;
  };
  solar?: number;
  completedId?: string;
  completedType?: string;
  completedLevel?: number;
  completedQuantity?: number;
}

async function loadPlanetBuildings(planetId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("planet_buildings")
    .select("building_id, level")
    .eq("planet_id", planetId);
  const result: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ building_id: string; level: number }>) {
    result[r.building_id] = r.level;
  }
  return result;
}

async function loadPlayerResearch(userId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("player_research")
    .select("research_id, level")
    .eq("user_id", userId);
  const result: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ research_id: string; level: number }>) {
    result[r.research_id] = r.level;
  }
  return result;
}

async function verifyPlanetOwnership(planetId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("planets")
    .select("id")
    .eq("id", planetId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export const actionsRouter = createTRPCRouter({
  startBuilding: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      buildingId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, buildingId } = input;
      logger.log("[Actions] startBuilding:", buildingId, "planet:", planetId, "user:", userId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const building = BUILDINGS.find(b => b.id === buildingId);
      if (!building) return { success: false, error: "Building not found" };

      const [buildings, research] = await Promise.all([
        loadPlanetBuildings(planetId),
        loadPlayerResearch(userId),
      ]);

      const { met } = checkPrerequisites(building.prerequisites, buildings, research);
      if (!met) return { success: false, error: "Prerequisites not met" };

      const { data, error } = await supabase.rpc("rpc_build_structure", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_building_id: buildingId,
      });

      if (error) {
        logger.error("[Actions] RPC error startBuilding:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      logger.log("[Actions] Building started (atomic):", buildingId);
      return {
        success: true,
        resources: result.resources,
        timer: result.timer ? {
          id: result.timer.id,
          type: "building" as const,
          targetLevel: result.timer.targetLevel,
          startTime: result.timer.startTime,
          endTime: result.timer.endTime,
        } : undefined,
      };
    }),

  startResearch: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      researchId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, researchId } = input;
      logger.log("[Actions] startResearch:", researchId, "planet:", planetId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const researchDef = RESEARCH.find(r => r.id === researchId);
      if (!researchDef) return { success: false, error: "Research not found" };

      const [buildings, research] = await Promise.all([
        loadPlanetBuildings(planetId),
        loadPlayerResearch(userId),
      ]);

      const { met } = checkPrerequisites(researchDef.prerequisites, buildings, research);
      if (!met) return { success: false, error: "Prerequisites not met" };

      const { data, error } = await supabase.rpc("rpc_start_research", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_research_id: researchId,
      });

      if (error) {
        logger.error("[Actions] RPC error startResearch:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      logger.log("[Actions] Research started (atomic):", researchId);
      return {
        success: true,
        resources: result.resources,
        timer: result.timer ? {
          id: result.timer.id,
          type: "research" as const,
          targetLevel: result.timer.targetLevel,
          startTime: result.timer.startTime,
          endTime: result.timer.endTime,
        } : undefined,
      };
    }),

  buildShips: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      shipId: z.string(),
      quantity: z.number().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, shipId, quantity } = input;
      logger.log("[Actions] buildShips:", shipId, "x", quantity, "planet:", planetId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const ship = SHIPS.find(s => s.id === shipId);
      if (!ship) return { success: false, error: "Ship not found" };

      const [buildings, research] = await Promise.all([
        loadPlanetBuildings(planetId),
        loadPlayerResearch(userId),
      ]);

      const { met } = checkPrerequisites(ship.prerequisites, buildings, research);
      if (!met) return { success: false, error: "Prerequisites not met" };

      const { data, error } = await supabase.rpc("rpc_build_ships", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_ship_id: shipId,
        p_quantity: quantity,
      });

      if (error) {
        logger.error("[Actions] RPC error buildShips:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      logger.log("[Actions] Ships queued (atomic):", shipId, "x", quantity);

      if (result.queueItem) {
        try {
          await ensureEventForShipyardQueue(
            planetId,
            shipId,
            'ship',
            result.queueItem.currentUnitEndTime,
          );
        } catch (e) {
          logger.log("[Actions] Non-blocking: failed to ensure shipyard event:", e instanceof Error ? e.message : String(e));
        }
      }

      return {
        success: true,
        resources: result.resources,
        queueItem: result.queueItem ? {
          id: result.queueItem.id,
          type: "ship" as const,
          totalQuantity: result.queueItem.totalQuantity,
          remainingQuantity: result.queueItem.remainingQuantity,
          buildTimePerUnit: result.queueItem.buildTimePerUnit,
          currentUnitStartTime: result.queueItem.currentUnitStartTime,
          currentUnitEndTime: result.queueItem.currentUnitEndTime,
        } : undefined,
      };
    }),

  buildDefenses: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      defenseId: z.string(),
      quantity: z.number().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, defenseId } = input;
      let quantity = input.quantity;
      logger.log("[Actions] buildDefenses:", defenseId, "x", quantity, "planet:", planetId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const defense = DEFENSES.find(d => d.id === defenseId);
      if (!defense) return { success: false, error: "Defense not found" };

      const [buildings, research] = await Promise.all([
        loadPlanetBuildings(planetId),
        loadPlayerResearch(userId),
      ]);

      const { met } = checkPrerequisites(defense.prerequisites, buildings, research);
      if (!met) return { success: false, error: "Prerequisites not met" };

      const { data, error } = await supabase.rpc("rpc_build_defenses", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_defense_id: defenseId,
        p_quantity: quantity,
      });

      if (error) {
        logger.error("[Actions] RPC error buildDefenses:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      logger.log("[Actions] Defenses queued (atomic):", defenseId, "x", quantity);

      if (result.queueItem) {
        try {
          await ensureEventForShipyardQueue(
            planetId,
            defenseId,
            'defense',
            result.queueItem.currentUnitEndTime,
          );
        } catch (e) {
          logger.log("[Actions] Non-blocking: failed to ensure defense event:", e instanceof Error ? e.message : String(e));
        }
      }

      return {
        success: true,
        resources: result.resources,
        queueItem: result.queueItem ? {
          id: result.queueItem.id,
          type: "defense" as const,
          totalQuantity: result.queueItem.totalQuantity,
          remainingQuantity: result.queueItem.remainingQuantity,
          buildTimePerUnit: result.queueItem.buildTimePerUnit,
          currentUnitStartTime: result.queueItem.currentUnitStartTime,
          currentUnitEndTime: result.queueItem.currentUnitEndTime,
        } : undefined,
      };
    }),

  rushTimer: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      timerId: z.string(),
      timerType: z.enum(["building", "research"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, timerId, timerType } = input;
      logger.log("[Actions] rushTimer:", timerId, timerType, "planet:", planetId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const { data, error } = await supabase.rpc("rpc_rush_timer", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_timer_id: timerId,
        p_timer_type: timerType,
      });

      if (error) {
        logger.error("[Actions] RPC error rushTimer:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      logger.log("[Actions] Rush completed (atomic):", timerId, timerType);
      return {
        success: true,
        solar: result.solar,
        completedId: result.completedId,
        completedType: result.completedType,
        completedLevel: result.completedLevel,
      };
    }),

  cancelTimer: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      timerId: z.string(),
      timerType: z.enum(["building", "research"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, timerId, timerType } = input;
      logger.log("[Actions] cancelTimer:", timerId, timerType, "planet:", planetId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const { data, error } = await supabase.rpc("rpc_cancel_timer", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_timer_id: timerId,
        p_timer_type: timerType,
      });

      if (error) {
        logger.error("[Actions] RPC error cancelTimer:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      logger.log("[Actions] Timer cancelled (atomic):", timerId);
      return { success: true, resources: result.resources };
    }),

  rushShipyard: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      itemId: z.string(),
      itemType: z.enum(["ship", "defense"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, itemId, itemType } = input;
      logger.log("[Actions] rushShipyard:", itemId, itemType, "planet:", planetId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const { data, error } = await supabase.rpc("rpc_rush_shipyard", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_item_id: itemId,
        p_item_type: itemType,
      });

      if (error) {
        logger.error("[Actions] RPC error rushShipyard:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      logger.log("[Actions] Shipyard rushed (atomic):", itemId, "x", result.completedQuantity);
      return {
        success: true,
        solar: result.solar,
        completedId: result.completedId,
        completedType: result.completedType,
        completedQuantity: result.completedQuantity,
      };
    }),

  renamePlanet: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      newName: z.string().min(1).max(24),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, newName } = input;
      const trimmed = newName.trim();

      if (!trimmed || trimmed.length > 24) {
        return { success: false, error: "Nom invalide (1-24 caractères)" };
      }

      const { data, error } = await supabase
        .from("planets")
        .update({ planet_name: trimmed })
        .eq("id", planetId)
        .eq("user_id", userId)
        .select("id, planet_name")
        .single();

      if (error) {
        logger.error("[Actions] renamePlanet error:", error.message);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: "Planète introuvable ou non autorisée" };
      }

      const isMain = await supabase
        .from("planets")
        .select("is_main")
        .eq("id", planetId)
        .single();

      if (isMain.data?.is_main) {
        await supabase
          .from("players")
          .update({ planet_name: trimmed })
          .eq("user_id", userId);
      }

      return { success: true, name: trimmed };
    }),

  sendFleet: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      ships: z.record(z.string(), z.number()),
      resources: z.object({ fer: z.number(), silice: z.number(), xenogas: z.number() }).optional(),
      missionType: z.string(),
      targetCoords: z.array(z.number()),
      targetPlayerId: z.string().nullable().optional(),
      targetUsername: z.string().nullable().optional(),
      targetPlanet: z.string().nullable().optional(),
      senderUsername: z.string(),
      senderPlanet: z.string(),
      senderCoords: z.array(z.number()),
      speedPercent: z.number().min(10).max(100).default(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      logger.log("[Actions] sendFleet:", input.missionType, "from", input.planetId, "speed:", input.speedPercent ?? 100, "%");

      if (!await verifyPlanetOwnership(input.planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const speedFraction = (input.speedPercent ?? 100) / 100;
      const cargo = input.resources ?? { fer: 0, silice: 0, xenogas: 0 };

      const { data: rpcResult, error: rpcError } = await supabase.rpc("rpc_send_fleet", {
        p_planet_id: input.planetId,
        p_ships: input.ships,
        p_cargo_fer: cargo.fer,
        p_cargo_silice: cargo.silice,
        p_cargo_xenogas: cargo.xenogas,
        p_sender_coords: input.senderCoords,
        p_target_coords: input.targetCoords,
        p_user_id: userId,
        p_mission_type: input.missionType,
        p_target_player_id: input.targetPlayerId ?? null,
        p_speed_percent: speedFraction,
        p_sender_username: input.senderUsername,
        p_sender_planet: input.senderPlanet,
        p_target_username: input.targetUsername ?? null,
        p_target_planet: input.targetPlanet ?? null,
      });

      if (rpcError) {
        logger.error("[Actions] RPC error sendFleet:", rpcError.message);
        return { success: false, error: rpcError.message };
      }

      const res = rpcResult as {
        success: boolean;
        error?: string;
        mission_id?: string;
        flight_time_sec?: number;
        departure_time?: number;
        arrival_time?: number;
        return_time?: number;
        fuel_consumed?: number;
      };

      if (!res.success) {
        return { success: false, error: res.error };
      }

      const departureTime = res.departure_time ?? Date.now();
      const flightTimeSec = res.flight_time_sec ?? 30;
      const arrivalTime = res.arrival_time ?? (departureTime + flightTimeSec * 1000);
      const returnTime = res.return_time ?? null;
      const fuelConsumed = res.fuel_consumed ?? 0;

      logger.log("[Actions] Fleet sent (atomic):", input.missionType, "mission_id=", res.mission_id);
      return { success: true, departureTime, arrivalTime, returnTime, flightTimeSec, fuelConsumed };
    }),

  recallFleet: protectedProcedure
    .input(z.object({
      missionId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { missionId } = input;
      logger.log("[Actions] recallFleet:", missionId, "user:", userId);

      const { data, error } = await supabase.rpc("rpc_recall_fleet", {
        p_user_id: userId,
        p_mission_id: missionId,
      });

      if (error) {
        logger.error("[Actions] RPC error recallFleet:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; return_time?: number; return_duration_sec?: number };
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, returnTime: result.return_time, returnDurationSec: result.return_duration_sec };
    }),

  claimTutorialReward: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      stepId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      logger.log("[Actions] claimTutorialReward:", input.stepId, "for", userId);

      if (!await verifyPlanetOwnership(input.planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const step = TUTORIAL_STEPS.find(s => s.id === input.stepId);
      if (!step) {
        return { success: false, error: "Tutorial step not found" };
      }

      const reward = step.reward;
      const rewardType = reward.type;
      const serverFer = reward.fer ?? 0;
      const serverSilice = reward.silice ?? 0;
      const serverXenogas = reward.xenogas ?? 0;
      const serverSolar = reward.solar ?? 0;

      const { data, error } = await supabase.rpc("rpc_claim_tutorial_reward", {
        p_user_id: userId,
        p_planet_id: input.planetId,
        p_step_id: input.stepId,
        p_reward_type: rewardType,
        p_fer: serverFer,
        p_silice: serverSilice,
        p_xenogas: serverXenogas,
        p_solar: serverSolar,
      });

      if (error) {
        logger.error("[Actions] RPC error claimTutorialReward:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; solar?: number; resources?: { fer: number; silice: number; xenogas: number } };
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true, solar: result.solar, resources: result.resources };
    }),

  setProductionPercentages: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      percentages: z.object({
        ferMine: z.number(),
        siliceMine: z.number(),
        xenogasRefinery: z.number(),
        solarPlant: z.number(),
        heliosRemorqueur: z.number(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;

      const { error } = await supabase
        .from("planets")
        .update({ production_percentages: input.percentages })
        .eq("id", input.planetId)
        .eq("user_id", userId);

      if (error) {
        logger.error("[Actions] Error saving production percentages:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    }),

  cancelShipyard: protectedProcedure
    .input(z.object({
      planetId: z.string(),
      itemId: z.string(),
      itemType: z.enum(["ship", "defense"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const { planetId, itemId, itemType } = input;
      logger.log("[Actions] cancelShipyard:", itemId, itemType, "planet:", planetId);

      if (!await verifyPlanetOwnership(planetId, userId)) {
        return { success: false, error: "Planet not owned by user" };
      }

      const { data, error } = await supabase.rpc("rpc_cancel_shipyard", {
        p_user_id: userId,
        p_planet_id: planetId,
        p_item_id: itemId,
        p_item_type: itemType,
      });

      if (error) {
        logger.error("[Actions] RPC error cancelShipyard:", error.message);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, resources: result.resources };
    }),
});
