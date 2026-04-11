-- =============================================================
-- MIGRATION: Planet Orbital Slot System (OGame-like)
-- =============================================================
-- Adds:
-- 1. planet_slot_defs table (reference, 15 rows)
-- 2. New columns on planets table
-- 3. Backfill for existing planets
-- 4. Updated calc_planet_economy with temperature/bonus
--
-- Run AFTER: server_defs.sql, resource_hardening.sql
-- =============================================================

-- =============================================================
-- 1. PLANET SLOT DEFINITIONS TABLE
-- =============================================================
CREATE TABLE IF NOT EXISTS planet_slot_defs (
  position        smallint PRIMARY KEY CHECK (position BETWEEN 1 AND 15),
  field_min       smallint NOT NULL CHECK (field_min > 0),
  field_max       smallint NOT NULL CHECK (field_max >= field_min),
  temp_min        smallint NOT NULL,
  temp_max        smallint NOT NULL CHECK (temp_max >= temp_min),
  metal_bonus_pct double precision NOT NULL DEFAULT 0,
  crystal_bonus_pct double precision NOT NULL DEFAULT 0,
  deut_bonus_pct  double precision NOT NULL DEFAULT 0,
  label           text
);

INSERT INTO planet_slot_defs
  (position, field_min, field_max, temp_min, temp_max, metal_bonus_pct, crystal_bonus_pct, deut_bonus_pct, label)
VALUES
  (1,   95, 108,  220, 260,   0,   40,   0, 'Tres chaud, proche etoile'),
  (2,   97, 110,  170, 220,   0,   30,   0, 'Chaud, bonus cristal'),
  (3,   98, 137,  120, 170,   0,   20,   0, 'Chaud, bonus cristal leger'),
  (4,  123, 167,   70, 120,   0,    0,   0, 'Tempere chaud'),
  (5,  148, 210,   60, 100,   0,    0,   0, 'Tempere'),
  (6,  148, 226,   50,  90,   5,    0,   0, 'Tempere, bonus metal leger'),
  (7,  163, 248,   40,  80,  10,    0,   0, 'Tempere, bonus metal'),
  (8,  178, 310,   30,  70,  15,    0,   0, 'Optimal taille, bonus metal fort'),
  (9,  163, 248,   20,  60,  10,    0,   0, 'Tempere froid, bonus metal'),
  (10, 148, 226,   10,  50,   5,    0,   0, 'Froid, bonus metal leger'),
  (11, 148, 210,  -25,  30,   0,    0,   0, 'Froid'),
  (12, 123, 167,  -50,  10,   0,    0,   0, 'Tres froid'),
  (13,  98, 137,  -75, -15,   0,    0,   5, 'Glacial, bonus deut leger'),
  (14,  95, 110, -100, -35,   0,    0,  10, 'Glacial, bonus deut'),
  (15,  95, 108, -130, -60,   0,    0,  20, 'Extreme froid, optimal deut')
ON CONFLICT (position) DO UPDATE SET
  field_min = EXCLUDED.field_min,
  field_max = EXCLUDED.field_max,
  temp_min = EXCLUDED.temp_min,
  temp_max = EXCLUDED.temp_max,
  metal_bonus_pct = EXCLUDED.metal_bonus_pct,
  crystal_bonus_pct = EXCLUDED.crystal_bonus_pct,
  deut_bonus_pct = EXCLUDED.deut_bonus_pct,
  label = EXCLUDED.label;

-- =============================================================
-- 2. ALTER TABLE planets - Add slot data columns
-- =============================================================
ALTER TABLE planets
  ADD COLUMN IF NOT EXISTS slot_position     smallint,
  ADD COLUMN IF NOT EXISTS base_fields       smallint,
  ADD COLUMN IF NOT EXISTS total_fields      smallint,
  ADD COLUMN IF NOT EXISTS temperature_min   smallint,
  ADD COLUMN IF NOT EXISTS temperature_max   smallint,
  ADD COLUMN IF NOT EXISTS metal_bonus_pct   double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crystal_bonus_pct double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deut_bonus_pct    double precision DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_planets_slot_position ON planets(slot_position);

-- =============================================================
-- 3. BACKFILL existing planets
-- =============================================================
-- For existing homeworlds (is_main = true): 160 fields always
-- For existing colonies: random based on slot definition
-- Temperature: random within slot range, 40 degree spread (OGame standard)
-- =============================================================

-- 3a. Backfill homeworlds with 160 fields
UPDATE planets p
SET
  slot_position = (p.coordinates->>2)::smallint,
  base_fields = 160,
  total_fields = 160 + COALESCE(
    (SELECT level * 5 FROM planet_buildings pb WHERE pb.planet_id = p.id AND pb.building_id = 'geoformEngine'),
    0
  ),
  temperature_min = COALESCE(
    (SELECT FLOOR(RANDOM() * GREATEST(1, sd.temp_max - sd.temp_min - 40 + 1) + sd.temp_min)
     FROM planet_slot_defs sd
     WHERE sd.position = (p.coordinates->>2)::smallint),
    20
  ),
  metal_bonus_pct = COALESCE(
    (SELECT sd.metal_bonus_pct FROM planet_slot_defs sd WHERE sd.position = (p.coordinates->>2)::smallint),
    0
  ),
  crystal_bonus_pct = COALESCE(
    (SELECT sd.crystal_bonus_pct FROM planet_slot_defs sd WHERE sd.position = (p.coordinates->>2)::smallint),
    0
  ),
  deut_bonus_pct = COALESCE(
    (SELECT sd.deut_bonus_pct FROM planet_slot_defs sd WHERE sd.position = (p.coordinates->>2)::smallint),
    0
  )
WHERE p.slot_position IS NULL AND p.is_main = true;

-- 3b. Backfill colonies with random fields based on slot
UPDATE planets p
SET
  slot_position = (p.coordinates->>2)::smallint,
  base_fields = COALESCE(
    (SELECT FLOOR(RANDOM() * (sd.field_max - sd.field_min + 1) + sd.field_min)
     FROM planet_slot_defs sd
     WHERE sd.position = (p.coordinates->>2)::smallint),
    163
  ),
  temperature_min = COALESCE(
    (SELECT FLOOR(RANDOM() * GREATEST(1, sd.temp_max - sd.temp_min - 40 + 1) + sd.temp_min)
     FROM planet_slot_defs sd
     WHERE sd.position = (p.coordinates->>2)::smallint),
    20
  ),
  metal_bonus_pct = COALESCE(
    (SELECT sd.metal_bonus_pct FROM planet_slot_defs sd WHERE sd.position = (p.coordinates->>2)::smallint),
    0
  ),
  crystal_bonus_pct = COALESCE(
    (SELECT sd.crystal_bonus_pct FROM planet_slot_defs sd WHERE sd.position = (p.coordinates->>2)::smallint),
    0
  ),
  deut_bonus_pct = COALESCE(
    (SELECT sd.deut_bonus_pct FROM planet_slot_defs sd WHERE sd.position = (p.coordinates->>2)::smallint),
    0
  )
WHERE p.slot_position IS NULL AND p.is_main = false;

-- 3c. Set total_fields for colonies (after base_fields is set)
UPDATE planets p
SET
  total_fields = COALESCE(p.base_fields, 163) + COALESCE(
    (SELECT level * 5 FROM planet_buildings pb WHERE pb.planet_id = p.id AND pb.building_id = 'geoformEngine'),
    0
  )
WHERE p.total_fields IS NULL;

-- 3d. Set temperature_max = temperature_min (single fixed temperature per planet)
UPDATE planets
SET temperature_max = temperature_min
WHERE temperature_max IS NULL AND temperature_min IS NOT NULL;

-- =============================================================
-- 4. UPDATED calc_planet_economy with temperature & slot bonuses
-- =============================================================
-- Changes:
-- - Helios energy: (temp_max + 160) / 6 instead of fixed 30
-- - Xenogas production: * (1.28 - 0.002 * temp_max) factor
-- - Fer production: * (1 + metal_bonus_pct / 100)
-- - Silice production: * (1 + crystal_bonus_pct / 100)
-- =============================================================
CREATE OR REPLACE FUNCTION calc_planet_economy(
  p_planet_id uuid,
  p_user_id uuid,
  OUT prod_fer_h double precision,
  OUT prod_silice_h double precision,
  OUT prod_xenogas_h double precision,
  OUT storage_fer double precision,
  OUT storage_silice double precision,
  OUT storage_xenogas double precision,
  OUT energy_net double precision,
  OUT ferro_store_level int,
  OUT silica_store_level int,
  OUT xeno_store_level int,
  OUT fer_mine_level int,
  OUT silice_mine_level int,
  OUT xenogas_ref_level int
) AS $$
DECLARE
  v_fer_mine int := 0;
  v_silice_mine int := 0;
  v_xenogas_ref int := 0;
  v_solar_plant int := 0;
  v_ferro_store int := 0;
  v_silica_store int := 0;
  v_xeno_store int := 0;
  v_quantum_flux int := 0;
  v_plasma int := 0;
  v_helios int := 0;
  v_pct jsonb;
  v_pct_fer double precision := 100;
  v_pct_silice double precision := 100;
  v_pct_xenogas double precision := 100;
  v_pct_solar double precision := 100;
  v_pct_helios double precision := 100;
  v_energy_prod double precision;
  v_energy_cons double precision;
  v_ratio double precision;
  v_temp_max smallint;
  v_metal_bonus double precision;
  v_crystal_bonus double precision;
  v_deut_bonus double precision;
  v_helios_energy_per_unit double precision;
  v_xenogas_temp_factor double precision;
BEGIN
  SELECT
    COALESCE(MAX(CASE WHEN building_id = 'ferMine' THEN level END), 0),
    COALESCE(MAX(CASE WHEN building_id = 'siliceMine' THEN level END), 0),
    COALESCE(MAX(CASE WHEN building_id = 'xenogasRefinery' THEN level END), 0),
    COALESCE(MAX(CASE WHEN building_id = 'solarPlant' THEN level END), 0),
    COALESCE(MAX(CASE WHEN building_id = 'ferroStore' THEN level END), 0),
    COALESCE(MAX(CASE WHEN building_id = 'silicaStore' THEN level END), 0),
    COALESCE(MAX(CASE WHEN building_id = 'xenoStore' THEN level END), 0)
  INTO v_fer_mine, v_silice_mine, v_xenogas_ref, v_solar_plant, v_ferro_store, v_silica_store, v_xeno_store
  FROM planet_buildings
  WHERE planet_id = p_planet_id
    AND building_id IN ('ferMine','siliceMine','xenogasRefinery','solarPlant','ferroStore','silicaStore','xenoStore');

  v_fer_mine := COALESCE(v_fer_mine, 0);
  v_silice_mine := COALESCE(v_silice_mine, 0);
  v_xenogas_ref := COALESCE(v_xenogas_ref, 0);
  v_solar_plant := COALESCE(v_solar_plant, 0);
  v_ferro_store := COALESCE(v_ferro_store, 0);
  v_silica_store := COALESCE(v_silica_store, 0);
  v_xeno_store := COALESCE(v_xeno_store, 0);

  ferro_store_level := v_ferro_store;
  silica_store_level := v_silica_store;
  xeno_store_level := v_xeno_store;
  fer_mine_level := v_fer_mine;
  silice_mine_level := v_silice_mine;
  xenogas_ref_level := v_xenogas_ref;

  SELECT
    COALESCE(MAX(CASE WHEN research_id = 'quantumFlux' THEN level END), 0),
    COALESCE(MAX(CASE WHEN research_id = 'plasmaOverdrive' THEN level END), 0)
  INTO v_quantum_flux, v_plasma
  FROM player_research
  WHERE user_id = p_user_id
    AND research_id IN ('quantumFlux','plasmaOverdrive');

  v_quantum_flux := COALESCE(v_quantum_flux, 0);
  v_plasma := COALESCE(v_plasma, 0);

  SELECT COALESCE(quantity, 0) INTO v_helios
  FROM planet_ships
  WHERE planet_id = p_planet_id AND ship_id = 'heliosRemorqueur';
  IF NOT FOUND THEN v_helios := 0; END IF;
  v_helios := COALESCE(v_helios, 0);

  SELECT production_percentages,
         COALESCE(temperature_max, 50),
         COALESCE(metal_bonus_pct, 0),
         COALESCE(crystal_bonus_pct, 0),
         COALESCE(deut_bonus_pct, 0)
  INTO v_pct, v_temp_max, v_metal_bonus, v_crystal_bonus, v_deut_bonus
  FROM planets WHERE id = p_planet_id;

  IF v_pct IS NOT NULL THEN
    v_pct_fer := COALESCE((v_pct->>'ferMine')::double precision, 100);
    v_pct_silice := COALESCE((v_pct->>'siliceMine')::double precision, 100);
    v_pct_xenogas := COALESCE((v_pct->>'xenogasRefinery')::double precision, 100);
    v_pct_solar := COALESCE((v_pct->>'solarPlant')::double precision, 100);
    v_pct_helios := COALESCE((v_pct->>'heliosRemorqueur')::double precision, 100);
  END IF;

  v_helios_energy_per_unit := GREATEST(0, (COALESCE(v_temp_max, 50) + 160.0) / 6.0);

  v_xenogas_temp_factor := GREATEST(0, 1.28 - 0.002 * COALESCE(v_temp_max, 50));

  v_energy_prod := GREATEST(0,
    FLOOR(20.0 * v_solar_plant * POWER(1.1, v_solar_plant) * (1.0 + v_quantum_flux * 0.05) * (v_pct_solar / 100.0))
    + FLOOR(COALESCE(v_helios, 0) * v_helios_energy_per_unit * (v_pct_helios / 100.0))
  );

  v_energy_cons := GREATEST(0,
    FLOOR(10.0 * v_fer_mine * POWER(1.1, v_fer_mine) * (v_pct_fer / 100.0))
    + FLOOR(10.0 * v_silice_mine * POWER(1.1, v_silice_mine) * (v_pct_silice / 100.0))
    + FLOOR(20.0 * v_xenogas_ref * POWER(1.1, v_xenogas_ref) * (v_pct_xenogas / 100.0))
  );

  IF v_energy_cons > 0 THEN
    v_ratio := LEAST(1.0, v_energy_prod / v_energy_cons);
  ELSE
    v_ratio := 1.0;
  END IF;

  v_ratio := GREATEST(0, COALESCE(v_ratio, 1.0));

  prod_fer_h := GREATEST(0,
    10 + FLOOR(30.0 * v_fer_mine * POWER(1.1, v_fer_mine) * v_ratio * (v_pct_fer / 100.0) * (1.0 + v_plasma * 0.01) * (1.0 + v_metal_bonus / 100.0))
  );
  prod_silice_h := GREATEST(0,
    5 + FLOOR(20.0 * v_silice_mine * POWER(1.1, v_silice_mine) * v_ratio * (v_pct_silice / 100.0) * (1.0 + v_plasma * 0.0066) * (1.0 + v_crystal_bonus / 100.0))
  );
  prod_xenogas_h := GREATEST(0,
    FLOOR(10.0 * v_xenogas_ref * POWER(1.1, v_xenogas_ref) * v_ratio * (v_pct_xenogas / 100.0) * (1.0 + v_plasma * 0.0033) * v_xenogas_temp_factor)
  );

  storage_fer := GREATEST(10000, calc_storage_cap(v_ferro_store));
  storage_silice := GREATEST(10000, calc_storage_cap(v_silica_store));
  storage_xenogas := GREATEST(10000, calc_storage_cap(v_xeno_store));

  energy_net := COALESCE(v_energy_prod, 0) - COALESCE(v_energy_cons, 0);
END;
$$ LANGUAGE plpgsql STABLE;
