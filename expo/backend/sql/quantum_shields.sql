-- =============================================================
-- QUANTUM SHIELD SYSTEM
-- Table + RPC functions for the global player shield
-- Run in Supabase SQL Editor AFTER server_fleet_extras.sql
-- =============================================================

-- =============================================================
-- 1. TABLE: quantum_shields
-- =============================================================
CREATE TABLE IF NOT EXISTS quantum_shields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shield_active boolean NOT NULL DEFAULT false,
  shield_expires_at timestamptz DEFAULT NULL,
  shield_last_activated_at timestamptz DEFAULT NULL,
  cooldown_expires_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_quantum_shields_player UNIQUE (player_id)
);

CREATE INDEX IF NOT EXISTS idx_quantum_shields_player
  ON quantum_shields (player_id);

CREATE INDEX IF NOT EXISTS idx_quantum_shields_active
  ON quantum_shields (shield_active, shield_expires_at)
  WHERE shield_active = true;

-- =============================================================
-- 2. refresh_quantum_shield_state(player_id)
-- Normalizes shield state: if expired, deactivate + set cooldown
-- =============================================================
CREATE OR REPLACE FUNCTION refresh_quantum_shield_state(
  p_player_id uuid
) RETURNS TABLE (
  shield_active boolean,
  shield_expires_at timestamptz,
  cooldown_expires_at timestamptz
) AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT qs.shield_active, qs.shield_expires_at, qs.cooldown_expires_at
  INTO v_rec
  FROM quantum_shields qs
  WHERE qs.player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_rec.shield_active = true AND v_rec.shield_expires_at IS NOT NULL AND v_rec.shield_expires_at <= now() THEN
    UPDATE quantum_shields qs
    SET shield_active = false,
        shield_expires_at = NULL,
        cooldown_expires_at = now() + interval '24 hours',
        updated_at = now()
    WHERE qs.player_id = p_player_id;

    RETURN QUERY SELECT false::boolean, NULL::timestamptz, (now() + interval '24 hours')::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_rec.shield_active, v_rec.shield_expires_at, v_rec.cooldown_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 3. rpc_buy_quantum_shield(player_id)
-- Buys and activates the quantum shield (500 Solar)
-- =============================================================
CREATE OR REPLACE FUNCTION rpc_buy_quantum_shield(
  p_player_id uuid
) RETURNS json AS $$
DECLARE
  v_state record;
  v_solar double precision;
  v_shield_active boolean;
  v_shield_expires timestamptz;
  v_cooldown_expires timestamptz;
BEGIN
  SELECT * INTO v_state
  FROM refresh_quantum_shield_state(p_player_id);

  v_shield_active := v_state.shield_active;
  v_shield_expires := v_state.shield_expires_at;
  v_cooldown_expires := v_state.cooldown_expires_at;

  IF v_shield_active = true THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bouclier quantique déjà actif'
    );
  END IF;

  IF v_cooldown_expires IS NOT NULL AND v_cooldown_expires > now() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cooldown en cours. Disponible dans ' ||
        CEIL(EXTRACT(EPOCH FROM (v_cooldown_expires - now())) / 3600) || 'h',
      'cooldown_expires_at', v_cooldown_expires
    );
  END IF;

  SELECT solar INTO v_solar
  FROM players
  WHERE user_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Joueur introuvable');
  END IF;

  IF v_solar < 500 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Solar insuffisant (500 requis, disponible: ' || FLOOR(v_solar) || ')'
    );
  END IF;

	PERFORM set_solar_tx_context('buy_shield', 'quantum_shield_24h');

  UPDATE players
  SET solar = solar - 500
  WHERE user_id = p_player_id
  RETURNING solar INTO v_solar;

  INSERT INTO quantum_shields (player_id, shield_active, shield_expires_at, shield_last_activated_at, cooldown_expires_at, updated_at)
  VALUES (
    p_player_id,
    true,
    now() + interval '24 hours',
    now(),
    NULL,
    now()
  )
  ON CONFLICT (player_id) DO UPDATE SET
    shield_active = true,
    shield_expires_at = now() + interval '24 hours',
    shield_last_activated_at = now(),
    cooldown_expires_at = NULL,
    updated_at = now();

  RETURN json_build_object(
    'success', true,
    'shield_active', true,
    'shield_expires_at', (now() + interval '24 hours'),
    'cooldown_expires_at', NULL,
    'remaining_solar', v_solar
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 4. reduce_quantum_shield_on_attack(attacker_id)
-- Called when an attacker under shield launches an attack.
-- Reduces shield duration by 12h. If <= 0, deactivates.
-- =============================================================
CREATE OR REPLACE FUNCTION reduce_quantum_shield_on_attack(
  p_attacker_id uuid
) RETURNS json AS $$
DECLARE
  v_state record;
  v_new_expiry timestamptz;
BEGIN
  SELECT * INTO v_state
  FROM refresh_quantum_shield_state(p_attacker_id);

  IF v_state.shield_active IS NOT TRUE THEN
    RETURN json_build_object('reduced', false, 'shield_active', false);
  END IF;

  v_new_expiry := v_state.shield_expires_at - interval '12 hours';

  IF v_new_expiry <= now() THEN
    UPDATE quantum_shields
    SET shield_active = false,
        shield_expires_at = NULL,
        cooldown_expires_at = now() + interval '24 hours',
        updated_at = now()
    WHERE player_id = p_attacker_id;

    RETURN json_build_object(
      'reduced', true,
      'shield_active', false,
      'message', 'Bouclier désactivé suite à attaque'
    );
  ELSE
    UPDATE quantum_shields
    SET shield_expires_at = v_new_expiry,
        updated_at = now()
    WHERE player_id = p_attacker_id;

    RETURN json_build_object(
      'reduced', true,
      'shield_active', true,
      'new_expires_at', v_new_expiry,
      'message', 'Bouclier réduit de 12h'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 5. get_quantum_shield_status(player_id)
-- Returns the current shield status for a player
-- =============================================================
CREATE OR REPLACE FUNCTION get_quantum_shield_status(
  p_player_id uuid
) RETURNS json AS $$
DECLARE
  v_state record;
  v_remaining_seconds double precision;
  v_cooldown_remaining double precision;
  v_can_buy boolean;
BEGIN
  SELECT * INTO v_state
  FROM refresh_quantum_shield_state(p_player_id);

  IF v_state.shield_active = true AND v_state.shield_expires_at IS NOT NULL THEN
    v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_state.shield_expires_at - now())));
  ELSE
    v_remaining_seconds := 0;
  END IF;

  IF v_state.cooldown_expires_at IS NOT NULL AND v_state.cooldown_expires_at > now() THEN
    v_cooldown_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_state.cooldown_expires_at - now())));
  ELSE
    v_cooldown_remaining := 0;
  END IF;

  v_can_buy := (v_state.shield_active IS NOT TRUE)
    AND (v_state.cooldown_expires_at IS NULL OR v_state.cooldown_expires_at <= now());

  RETURN json_build_object(
    'shield_active', COALESCE(v_state.shield_active, false),
    'shield_expires_at', v_state.shield_expires_at,
    'cooldown_expires_at', v_state.cooldown_expires_at,
    'remaining_seconds', FLOOR(v_remaining_seconds),
    'cooldown_remaining_seconds', FLOOR(v_cooldown_remaining),
    'can_buy', v_can_buy,
    'cost_solar', 500
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
