import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "@/backend/supabase";
import { SHIPS, DEFENSES, BUILDINGS, RESEARCH } from "@/constants/gameData";

interface BuildingDefRow {
  building_id: string;
  base_cost_fer: number;
  base_cost_silice: number;
  base_cost_xenogas: number;
  cost_factor: number;
  base_time: number;
  time_factor: number;
}

interface ResearchDefRow {
  research_id: string;
  base_cost_fer: number;
  base_cost_silice: number;
  base_cost_xenogas: number;
  cost_factor: number;
  base_time: number;
  time_factor: number;
}

interface ShipDefRow {
  ship_id: string;
  cost_fer: number;
  cost_silice: number;
  cost_xenogas: number;
  build_time: number;
  base_attack: number;
  base_shield: number;
  base_hull: number;
  base_speed: number;
  base_cargo: number;
}

interface DefenseDefRow {
  defense_id: string;
  cost_fer: number;
  cost_silice: number;
  cost_xenogas: number;
  build_time: number;
  base_attack: number;
  base_shield: number;
  base_hull: number;
}

export const defsRouter = createTRPCRouter({
  getBuildingDefs: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("building_defs")
      .select("*");

    if (error) {
      console.log("[Defs] Error fetching building_defs:", error.message);
      return { success: false as const, error: error.message, data: [] };
    }

    const rows = (data ?? []) as BuildingDefRow[];
    return {
      success: true as const,
      data: rows.map((r) => ({
        id: r.building_id,
        baseCostFer: r.base_cost_fer,
        baseCostSilice: r.base_cost_silice,
        baseCostXenogas: r.base_cost_xenogas,
        costFactor: r.cost_factor,
        baseTime: r.base_time,
        timeFactor: r.time_factor,
      })),
    };
  }),

  getResearchDefs: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("research_defs")
      .select("*");

    if (error) {
      console.log("[Defs] Error fetching research_defs:", error.message);
      return { success: false as const, error: error.message, data: [] };
    }

    const rows = (data ?? []) as ResearchDefRow[];
    return {
      success: true as const,
      data: rows.map((r) => ({
        id: r.research_id,
        baseCostFer: r.base_cost_fer,
        baseCostSilice: r.base_cost_silice,
        baseCostXenogas: r.base_cost_xenogas,
        costFactor: r.cost_factor,
        baseTime: r.base_time,
        timeFactor: r.time_factor,
      })),
    };
  }),

  getShipDefs: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("ship_defs")
      .select("*");

    if (error) {
      console.log("[Defs] Error fetching ship_defs:", error.message);
      return { success: false as const, error: error.message, data: [] };
    }

    const rows = (data ?? []) as ShipDefRow[];
    return {
      success: true as const,
      data: rows.map((r) => ({
        id: r.ship_id,
        costFer: r.cost_fer,
        costSilice: r.cost_silice,
        costXenogas: r.cost_xenogas,
        buildTime: r.build_time,
        baseAttack: r.base_attack,
        baseShield: r.base_shield,
        baseHull: r.base_hull,
        baseSpeed: r.base_speed,
        baseCargo: r.base_cargo,
      })),
    };
  }),

  getDefenseDefs: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("defense_defs")
      .select("*");

    if (error) {
      console.log("[Defs] Error fetching defense_defs:", error.message);
      return { success: false as const, error: error.message, data: [] };
    }

    const rows = (data ?? []) as DefenseDefRow[];
    return {
      success: true as const,
      data: rows.map((r) => ({
        id: r.defense_id,
        costFer: r.cost_fer,
        costSilice: r.cost_silice,
        costXenogas: r.cost_xenogas,
        buildTime: r.build_time,
        baseAttack: r.base_attack,
        baseShield: r.base_shield,
        baseHull: r.base_hull,
      })),
    };
  }),

  verifySyncDefs: publicProcedure.query(async () => {
    const [shipsRes, defensesRes, buildingsRes, researchRes] = await Promise.all([
      supabase.from("ship_defs").select("*"),
      supabase.from("defense_defs").select("*"),
      supabase.from("building_defs").select("*"),
      supabase.from("research_defs").select("*"),
    ]);

    const mismatches: string[] = [];

    const serverShips = (shipsRes.data ?? []) as ShipDefRow[];
    for (const clientShip of SHIPS) {
      const serverShip = serverShips.find(s => s.ship_id === clientShip.id);
      if (!serverShip) {
        mismatches.push(`SHIP ${clientShip.id}: missing in server ship_defs`);
        continue;
      }
      if ((clientShip.cost.fer ?? 0) !== serverShip.cost_fer)
        mismatches.push(`SHIP ${clientShip.id}: cost_fer client=${clientShip.cost.fer ?? 0} server=${serverShip.cost_fer}`);
      if ((clientShip.cost.silice ?? 0) !== serverShip.cost_silice)
        mismatches.push(`SHIP ${clientShip.id}: cost_silice client=${clientShip.cost.silice ?? 0} server=${serverShip.cost_silice}`);
      if ((clientShip.cost.xenogas ?? 0) !== serverShip.cost_xenogas)
        mismatches.push(`SHIP ${clientShip.id}: cost_xenogas client=${clientShip.cost.xenogas ?? 0} server=${serverShip.cost_xenogas}`);
      if (clientShip.stats.attack !== serverShip.base_attack)
        mismatches.push(`SHIP ${clientShip.id}: attack client=${clientShip.stats.attack} server=${serverShip.base_attack}`);
      if (clientShip.stats.shield !== serverShip.base_shield)
        mismatches.push(`SHIP ${clientShip.id}: shield client=${clientShip.stats.shield} server=${serverShip.base_shield}`);
      if (clientShip.stats.hull !== serverShip.base_hull)
        mismatches.push(`SHIP ${clientShip.id}: hull client=${clientShip.stats.hull} server=${serverShip.base_hull}`);
      if (clientShip.stats.speed !== serverShip.base_speed)
        mismatches.push(`SHIP ${clientShip.id}: speed client=${clientShip.stats.speed} server=${serverShip.base_speed}`);
      if (clientShip.stats.cargo !== serverShip.base_cargo)
        mismatches.push(`SHIP ${clientShip.id}: cargo client=${clientShip.stats.cargo} server=${serverShip.base_cargo}`);
    }
    for (const serverShip of serverShips) {
      if (!SHIPS.find(s => s.id === serverShip.ship_id)) {
        mismatches.push(`SHIP ${serverShip.ship_id}: exists in server but missing in client gameData`);
      }
    }

    const serverDefenses = (defensesRes.data ?? []) as DefenseDefRow[];
    for (const clientDef of DEFENSES) {
      const serverDef = serverDefenses.find(d => d.defense_id === clientDef.id);
      if (!serverDef) {
        mismatches.push(`DEFENSE ${clientDef.id}: missing in server defense_defs`);
        continue;
      }
      if ((clientDef.cost.fer ?? 0) !== serverDef.cost_fer)
        mismatches.push(`DEFENSE ${clientDef.id}: cost_fer client=${clientDef.cost.fer ?? 0} server=${serverDef.cost_fer}`);
      if ((clientDef.cost.silice ?? 0) !== serverDef.cost_silice)
        mismatches.push(`DEFENSE ${clientDef.id}: cost_silice client=${clientDef.cost.silice ?? 0} server=${serverDef.cost_silice}`);
      if ((clientDef.cost.xenogas ?? 0) !== serverDef.cost_xenogas)
        mismatches.push(`DEFENSE ${clientDef.id}: cost_xenogas client=${clientDef.cost.xenogas ?? 0} server=${serverDef.cost_xenogas}`);
      if (clientDef.stats.attack !== serverDef.base_attack)
        mismatches.push(`DEFENSE ${clientDef.id}: attack client=${clientDef.stats.attack} server=${serverDef.base_attack}`);
      if (clientDef.stats.shield !== serverDef.base_shield)
        mismatches.push(`DEFENSE ${clientDef.id}: shield client=${clientDef.stats.shield} server=${serverDef.base_shield}`);
      if (clientDef.stats.hull !== serverDef.base_hull)
        mismatches.push(`DEFENSE ${clientDef.id}: hull client=${clientDef.stats.hull} server=${serverDef.base_hull}`);
    }
    for (const serverDef of serverDefenses) {
      if (!DEFENSES.find(d => d.id === serverDef.defense_id)) {
        mismatches.push(`DEFENSE ${serverDef.defense_id}: exists in server but missing in client gameData`);
      }
    }

    const serverBuildings = (buildingsRes.data ?? []) as BuildingDefRow[];
    for (const clientBld of BUILDINGS) {
      const serverBld = serverBuildings.find(b => b.building_id === clientBld.id);
      if (!serverBld) {
        mismatches.push(`BUILDING ${clientBld.id}: missing in server building_defs`);
        continue;
      }
      if ((clientBld.baseCost.fer ?? 0) !== serverBld.base_cost_fer)
        mismatches.push(`BUILDING ${clientBld.id}: base_cost_fer client=${clientBld.baseCost.fer ?? 0} server=${serverBld.base_cost_fer}`);
      if ((clientBld.baseCost.silice ?? 0) !== serverBld.base_cost_silice)
        mismatches.push(`BUILDING ${clientBld.id}: base_cost_silice client=${clientBld.baseCost.silice ?? 0} server=${serverBld.base_cost_silice}`);
      if ((clientBld.baseCost.xenogas ?? 0) !== serverBld.base_cost_xenogas)
        mismatches.push(`BUILDING ${clientBld.id}: base_cost_xenogas client=${clientBld.baseCost.xenogas ?? 0} server=${serverBld.base_cost_xenogas}`);
      if (clientBld.costFactor !== serverBld.cost_factor)
        mismatches.push(`BUILDING ${clientBld.id}: cost_factor client=${clientBld.costFactor} server=${serverBld.cost_factor}`);
    }

    const serverResearch = (researchRes.data ?? []) as ResearchDefRow[];
    for (const clientRes of RESEARCH) {
      const serverRes = serverResearch.find(r => r.research_id === clientRes.id);
      if (!serverRes) {
        mismatches.push(`RESEARCH ${clientRes.id}: missing in server research_defs`);
        continue;
      }
      if ((clientRes.baseCost.fer ?? 0) !== serverRes.base_cost_fer)
        mismatches.push(`RESEARCH ${clientRes.id}: base_cost_fer client=${clientRes.baseCost.fer ?? 0} server=${serverRes.base_cost_fer}`);
      if ((clientRes.baseCost.silice ?? 0) !== serverRes.base_cost_silice)
        mismatches.push(`RESEARCH ${clientRes.id}: base_cost_silice client=${clientRes.baseCost.silice ?? 0} server=${serverRes.base_cost_silice}`);
      if ((clientRes.baseCost.xenogas ?? 0) !== serverRes.base_cost_xenogas)
        mismatches.push(`RESEARCH ${clientRes.id}: base_cost_xenogas client=${clientRes.baseCost.xenogas ?? 0} server=${serverRes.base_cost_xenogas}`);
      if (clientRes.costFactor !== serverRes.cost_factor)
        mismatches.push(`RESEARCH ${clientRes.id}: cost_factor client=${clientRes.costFactor} server=${serverRes.cost_factor}`);
    }

    if (mismatches.length > 0) {
      console.log('[Defs] ⚠️ SYNC MISMATCHES DETECTED:', mismatches.length, 'issues');
      for (const m of mismatches) {
        console.log('[Defs] ⚠️', m);
      }
    } else {
      console.log('[Defs] ✅ All gameData.ts <-> server_defs are in sync');
    }

    return {
      success: true as const,
      inSync: mismatches.length === 0,
      mismatches,
      counts: {
        clientShips: SHIPS.length,
        serverShips: serverShips.length,
        clientDefenses: DEFENSES.length,
        serverDefenses: serverDefenses.length,
        clientBuildings: BUILDINGS.length,
        serverBuildings: serverBuildings.length,
        clientResearch: RESEARCH.length,
        serverResearch: serverResearch.length,
      },
    };
  }),

  getAllDefs: publicProcedure.query(async () => {
    const [buildings, research, ships, defenses] = await Promise.all([
      supabase.from("building_defs").select("*"),
      supabase.from("research_defs").select("*"),
      supabase.from("ship_defs").select("*"),
      supabase.from("defense_defs").select("*"),
    ]);

    if (buildings.error || research.error || ships.error || defenses.error) {
      const err = buildings.error?.message || research.error?.message || ships.error?.message || defenses.error?.message;
      console.log("[Defs] Error fetching all defs:", err);
      return { success: false as const, error: err };
    }

    const buildingRows = (buildings.data ?? []) as BuildingDefRow[];
    const researchRows = (research.data ?? []) as ResearchDefRow[];
    const shipRows = (ships.data ?? []) as ShipDefRow[];
    const defenseRows = (defenses.data ?? []) as DefenseDefRow[];

    return {
      success: true as const,
      buildings: buildingRows.map((r) => ({
        id: r.building_id,
        baseCostFer: r.base_cost_fer,
        baseCostSilice: r.base_cost_silice,
        baseCostXenogas: r.base_cost_xenogas,
        costFactor: r.cost_factor,
        baseTime: r.base_time,
        timeFactor: r.time_factor,
      })),
      research: researchRows.map((r) => ({
        id: r.research_id,
        baseCostFer: r.base_cost_fer,
        baseCostSilice: r.base_cost_silice,
        baseCostXenogas: r.base_cost_xenogas,
        costFactor: r.cost_factor,
        baseTime: r.base_time,
        timeFactor: r.time_factor,
      })),
      ships: shipRows.map((r) => ({
        id: r.ship_id,
        costFer: r.cost_fer,
        costSilice: r.cost_silice,
        costXenogas: r.cost_xenogas,
        buildTime: r.build_time,
        baseAttack: r.base_attack,
        baseShield: r.base_shield,
        baseHull: r.base_hull,
        baseSpeed: r.base_speed,
        baseCargo: r.base_cargo,
      })),
      defenses: defenseRows.map((r) => ({
        id: r.defense_id,
        costFer: r.cost_fer,
        costSilice: r.cost_silice,
        costXenogas: r.cost_xenogas,
        buildTime: r.build_time,
        baseAttack: r.base_attack,
        baseShield: r.base_shield,
        baseHull: r.base_hull,
      })),
    };
  }),
});
