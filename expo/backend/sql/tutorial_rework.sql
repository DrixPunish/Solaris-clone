-- =============================================================
-- TUTORIAL REWORK - New tables and RPCs
-- =============================================================

-- 1. Create player_tutorial_progress table (replaces player_tutorial)
-- =============================================================
CREATE TABLE IF NOT EXISTS player_tutorial_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  current_step_id text NOT NULL DEFAULT 'ch1_ferro_mine_1',
  current_step_index int NOT NULL DEFAULT 0,
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  claimed_rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  dismissed boolean NOT NULL DEFAULT false,
  minimized boolean NOT NULL DEFAULT false,
  started_at timestamptz DEFAULT now(),
  last_step_completed_at timestamptz,
  finished_at timestamptz,
  UNIQUE(user_id)
);

-- 2. Create tutorial_step_validations table (audit trail)
-- =============================================================
CREATE TABLE IF NOT EXISTS tutorial_step_validations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  step_id text NOT NULL,
  step_index int NOT NULL DEFAULT 0,
  validated_at timestamptz DEFAULT now(),
  validation_source text NOT NULL,
  proof_id text,
  proof_data jsonb,
  UNIQUE(user_id, step_id)
);

-- 3. Indexes
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_tutorial_progress_user ON player_tutorial_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_validations_user ON tutorial_step_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_validations_user_step ON tutorial_step_validations(user_id, step_id);

-- 4. RPC: rpc_claim_tutorial_step_reward (new, replaces old rpc_claim_tutorial_reward)
-- =============================================================
DROP FUNCTION IF EXISTS rpc_claim_tutorial_step_reward(uuid, uuid, text, int, text, double precision, double precision, double precision, double precision, text, int);

CREATE OR REPLACE FUNCTION rpc_claim_tutorial_step_reward(
  p_user_id uuid,
  p_planet_id uuid,
  p_step_id text,
  p_step_index int,
  p_reward_type text,
  p_fer double precision DEFAULT 0,
  p_silice double precision DEFAULT 0,
  p_xenogas double precision DEFAULT 0,
  p_solar double precision DEFAULT 0,
  p_next_step_id text DEFAULT NULL,
  p_next_step_index int DEFAULT NULL
) RETURNS json AS $$
DECLARE
  v_progress record;
  v_new_solar double precision;
  v_res record;
  v_new_fer double precision;
  v_new_silice double precision;
  v_new_xenogas double precision;
BEGIN
  -- Verify planet ownership
  IF NOT assert_planet_owner(p_user_id, p_planet_id) THEN
    RETURN json_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;

  -- Load and lock progress
  SELECT * INTO v_progress FROM player_tutorial_progress
  WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No tutorial progress found');
  END IF;

  -- Verify linearity: current step must match
  IF v_progress.current_step_id != p_step_id THEN
    RETURN json_build_object('success', false, 'error', 'Step mismatch: expected ' || v_progress.current_step_id);
  END IF;

  IF v_progress.current_step_index != p_step_index THEN
    RETURN json_build_object('success', false, 'error', 'Index mismatch');
  END IF;

  -- Verify validation proof exists
  IF NOT EXISTS (
    SELECT 1 FROM tutorial_step_validations
    WHERE user_id = p_user_id AND step_id = p_step_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Step not validated yet');
  END IF;

  -- Anti-doublon: check if already claimed
  IF v_progress.claimed_rewards ? p_step_id THEN
    RETURN json_build_object('success', false, 'error', 'Already claimed');
  END IF;

  -- Give reward
  IF p_reward_type = 'resources' THEN
    PERFORM set_resource_tx_context('tutorial_claim', 'claim_step_' || p_step_id);

    SELECT fer, silice, xenogas INTO v_res
    FROM planet_resources
    WHERE planet_id = p_planet_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Planet resources not found');
    END IF;

    v_new_fer := COALESCE(v_res.fer, 0) + GREATEST(0, p_fer);
    v_new_silice := COALESCE(v_res.silice, 0) + GREATEST(0, p_silice);
    v_new_xenogas := COALESCE(v_res.xenogas, 0) + GREATEST(0, p_xenogas);

    UPDATE planet_resources
    SET fer = v_new_fer,
        silice = v_new_silice,
        xenogas = v_new_xenogas
    WHERE planet_id = p_planet_id;

    -- Advance progression
    UPDATE player_tutorial_progress SET
      completed_steps = completed_steps || to_jsonb(p_step_id::text),
      claimed_rewards = claimed_rewards || to_jsonb(p_step_id::text),
      current_step_id = COALESCE(p_next_step_id, current_step_id),
      current_step_index = COALESCE(p_next_step_index, current_step_index),
      last_step_completed_at = now(),
      finished_at = CASE WHEN p_next_step_id IS NULL THEN now() ELSE NULL END
    WHERE user_id = p_user_id;

    RETURN json_build_object(
      'success', true,
      'resources', json_build_object('fer', v_new_fer, 'silice', v_new_silice, 'xenogas', v_new_xenogas)
    );

  ELSIF p_reward_type = 'solar' THEN
    SELECT solar INTO v_new_solar
    FROM players
    WHERE user_id = p_user_id
    FOR UPDATE;

    UPDATE players
    SET solar = COALESCE(v_new_solar, 0) + GREATEST(0, p_solar)
    WHERE user_id = p_user_id
    RETURNING solar INTO v_new_solar;

    -- Advance progression
    UPDATE player_tutorial_progress SET
      completed_steps = completed_steps || to_jsonb(p_step_id::text),
      claimed_rewards = claimed_rewards || to_jsonb(p_step_id::text),
      current_step_id = COALESCE(p_next_step_id, current_step_id),
      current_step_index = COALESCE(p_next_step_index, current_step_index),
      last_step_completed_at = now(),
      finished_at = CASE WHEN p_next_step_id IS NULL THEN now() ELSE NULL END
    WHERE user_id = p_user_id;

    RETURN json_build_object('success', true, 'solar', v_new_solar);
  END IF;

  RETURN json_build_object('success', false, 'error', 'Unknown reward type');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Migration: copy existing player_tutorial data to player_tutorial_progress
-- =============================================================
-- Run this AFTER creating the new tables to migrate existing players.
-- Maps old step IDs to new step IDs where possible.
-- Players who haven't started tutorial get a fresh row.

INSERT INTO player_tutorial_progress (user_id, current_step_id, current_step_index, completed_steps, claimed_rewards, dismissed, minimized)
SELECT
  pt.user_id,
  'ch1_ferro_mine_1',
  0,
  '[]'::jsonb,
  '[]'::jsonb,
  COALESCE(pt.dismissed, false),
  COALESCE(pt.minimized, false)
FROM player_tutorial pt
WHERE NOT EXISTS (
  SELECT 1 FROM player_tutorial_progress ptp WHERE ptp.user_id = pt.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- Also create rows for players who don't have any tutorial row yet
INSERT INTO player_tutorial_progress (user_id, current_step_id, current_step_index)
SELECT p.user_id, 'ch1_ferro_mine_1', 0
FROM players p
WHERE NOT EXISTS (
  SELECT 1 FROM player_tutorial_progress ptp WHERE ptp.user_id = p.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- 6. Enable RLS on new tables
-- =============================================================
ALTER TABLE player_tutorial_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutorial_step_validations ENABLE ROW LEVEL SECURITY;

-- Players can read their own progress
CREATE POLICY IF NOT EXISTS "Users can read own tutorial progress"
  ON player_tutorial_progress FOR SELECT
  USING (auth.uid() = user_id);

-- Players can update their own progress (dismiss/minimize)
CREATE POLICY IF NOT EXISTS "Users can update own tutorial progress"
  ON player_tutorial_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- Players can insert their own progress
CREATE POLICY IF NOT EXISTS "Users can insert own tutorial progress"
  ON player_tutorial_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Players can read their own validations
CREATE POLICY IF NOT EXISTS "Users can read own tutorial validations"
  ON tutorial_step_validations FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for backend)
CREATE POLICY IF NOT EXISTS "Service role full access tutorial progress"
  ON player_tutorial_progress FOR ALL
  USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access tutorial validations"
  ON tutorial_step_validations FOR ALL
  USING (true);
