import { supabase } from '@/backend/supabase';
import { TUTORIAL_STEPS, TutorialStep } from '@/constants/tutorial';
import { logger } from '@/utils/logger';

interface BuildingContext {
  type: 'building';
  buildingId: string;
  level: number;
  userId: string;
}

interface ResearchContext {
  type: 'research';
  researchId: string;
  level: number;
  userId: string;
}

interface ShipyardContext {
  type: 'shipyard';
  itemId: string;
  itemType: 'ship' | 'defense';
  newQuantity: number;
  userId: string;
}

interface FleetEventContext {
  type: 'fleet_event';
  eventType: 'espionage_report_created' | 'combat_report_created' | 'colony_created' | 'transport_delivered' | 'debris_collected';
  userId: string;
  proofId?: string;
}

interface TransactionContext {
  type: 'transaction';
  transactionType: string;
  userId: string;
}

type TutorialEventContext = BuildingContext | ResearchContext | ShipyardContext | FleetEventContext | TransactionContext;

function matchesCurrentStep(
  stepId: string,
  context: TutorialEventContext,
): boolean {
  const step = TUTORIAL_STEPS.find(s => s.id === stepId);
  if (!step) return false;

  switch (context.type) {
    case 'building':
      if (step.checkType !== 'building_level') return false;
      return step.checkTarget === context.buildingId && context.level >= step.checkValue;

    case 'research':
      if (step.checkType !== 'research_level') return false;
      return step.checkTarget === context.researchId && context.level >= step.checkValue;

    case 'shipyard':
      if (step.checkType === 'ship_count' && context.itemType === 'ship') {
        return step.checkTarget === context.itemId && context.newQuantity >= step.checkValue;
      }
      if (step.checkType === 'defense_count' && context.itemType === 'defense') {
        return step.checkTarget === context.itemId && context.newQuantity >= step.checkValue;
      }
      return false;

    case 'fleet_event':
      if (step.checkType !== 'server_event') return false;
      return step.validationSource === context.eventType;

    case 'transaction':
      if (step.checkType !== 'transaction_check') return false;
      return step.checkTarget === context.transactionType;

    default:
      return false;
  }
}

export async function verifyStepFromTables(
  step: TutorialStep,
  userId: string,
): Promise<{ verified: boolean; proof?: Record<string, unknown> }> {
  try {
    logger.log('[Tutorial][DirectCheck] Verifying step:', step.id, 'type:', step.checkType, 'target:', step.checkTarget, 'value:', step.checkValue);

    const { data: playerPlanets } = await supabase
      .from('planets')
      .select('id')
      .eq('user_id', userId);
    const planetIds = (playerPlanets ?? []).map((p: { id: string }) => p.id);

    switch (step.checkType) {
      case 'building_level': {
        if (planetIds.length === 0) return { verified: false };
        const { data } = await supabase
          .from('planet_buildings')
          .select('level, planet_id')
          .in('planet_id', planetIds)
          .eq('building_id', step.checkTarget)
          .gte('level', step.checkValue)
          .limit(1);
        const found = (data?.length ?? 0) > 0;
        logger.log('[Tutorial][DirectCheck] building_level:', step.checkTarget, '>= ', step.checkValue, '->', found);
        return { verified: found, proof: found ? { building_id: step.checkTarget, level: (data as Array<{ level: number; planet_id: string }>)[0].level } : undefined };
      }

      case 'research_level': {
        const { data } = await supabase
          .from('player_research')
          .select('level')
          .eq('user_id', userId)
          .eq('research_id', step.checkTarget)
          .gte('level', step.checkValue)
          .limit(1);
        const found = (data?.length ?? 0) > 0;
        logger.log('[Tutorial][DirectCheck] research_level:', step.checkTarget, '>= ', step.checkValue, '->', found);
        return { verified: found, proof: found ? { research_id: step.checkTarget, level: (data as Array<{ level: number }>)[0].level } : undefined };
      }

      case 'ship_count': {
        if (planetIds.length === 0) return { verified: false };
        const { data } = await supabase
          .from('planet_ships')
          .select('quantity, planet_id')
          .in('planet_id', planetIds)
          .eq('ship_id', step.checkTarget);
        const totalQty = (data ?? []).reduce((sum: number, r: { quantity: number }) => sum + (r.quantity ?? 0), 0);
        const found = totalQty >= step.checkValue;
        logger.log('[Tutorial][DirectCheck] ship_count:', step.checkTarget, 'total:', totalQty, '>= ', step.checkValue, '->', found);
        return { verified: found, proof: found ? { ship_id: step.checkTarget, total_quantity: totalQty } : undefined };
      }

      case 'defense_count': {
        if (planetIds.length === 0) return { verified: false };
        const { data } = await supabase
          .from('planet_defenses')
          .select('quantity, planet_id')
          .in('planet_id', planetIds)
          .eq('defense_id', step.checkTarget);
        const totalQty = (data ?? []).reduce((sum: number, r: { quantity: number }) => sum + (r.quantity ?? 0), 0);
        const found = totalQty >= step.checkValue;
        logger.log('[Tutorial][DirectCheck] defense_count:', step.checkTarget, 'total:', totalQty, '>= ', step.checkValue, '->', found);
        return { verified: found, proof: found ? { defense_id: step.checkTarget, total_quantity: totalQty } : undefined };
      }

      case 'transaction_check': {
        const { data: txData } = await supabase
          .from('solar_transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('transaction_type', step.checkTarget)
          .limit(1);
        const txFound = (txData?.length ?? 0) > 0;
        logger.log('[Tutorial][DirectCheck] transaction_check:', step.checkTarget, '->', txFound);
        return { verified: txFound, proof: txFound ? { transaction_type: step.checkTarget } : undefined };
      }

      case 'server_event': {
        if (step.checkTarget === 'espionage_report_created') {
          const { data } = await supabase
            .from('espionage_reports')
            .select('id')
            .eq('player_id', userId)
            .gt('probes_sent', 0)
            .limit(1);
          const found = (data?.length ?? 0) > 0;
          logger.log('[Tutorial][DirectCheck] espionage_report_created for sender ->', found);
          return { verified: found, proof: found ? { event: 'espionage_report_created' } : undefined };
        }

        if (step.checkTarget === 'combat_report_created') {
          const { data } = await supabase
            .from('combat_reports')
            .select('id')
            .eq('attacker_id', userId)
            .eq('viewer_role', 'attacker')
            .limit(1);
          const found = (data?.length ?? 0) > 0;
          logger.log('[Tutorial][DirectCheck] combat_report_created for attacker ->', found);
          return { verified: found, proof: found ? { event: 'combat_report_created' } : undefined };
        }

        if (step.checkTarget === 'colony_created') {
          const { data } = await supabase
            .from('planets')
            .select('id')
            .eq('user_id', userId)
            .eq('is_main', false)
            .limit(1);
          const found = (data?.length ?? 0) > 0;
          logger.log('[Tutorial][DirectCheck] colony_created ->', found);
          return { verified: found, proof: found ? { event: 'colony_created', colony_id: (data as Array<{ id: string }>)[0].id } : undefined };
        }

        logger.log('[Tutorial][DirectCheck] Unknown server_event target:', step.checkTarget);
        return { verified: false };
      }

      default:
        return { verified: false };
    }
  } catch (e) {
    logger.log('[Tutorial][DirectCheck] Error verifying step:', step.id, e instanceof Error ? e.message : String(e));
    return { verified: false };
  }
}

export async function tryValidateTutorialStep(context: TutorialEventContext): Promise<void> {
  const userId = context.userId;
  try {
    logger.log('[Tutorial] tryValidateTutorialStep called:', JSON.stringify({
      type: context.type,
      userId,
      ...(context.type === 'building' ? { buildingId: context.buildingId, level: context.level } : {}),
      ...(context.type === 'research' ? { researchId: context.researchId, level: context.level } : {}),
      ...(context.type === 'shipyard' ? { itemId: context.itemId, itemType: context.itemType, qty: context.newQuantity } : {}),
      ...(context.type === 'fleet_event' ? { eventType: context.eventType } : {}),
      ...(context.type === 'transaction' ? { transactionType: context.transactionType } : {}),
    }));

    let { data: progress } = await supabase
      .from('player_tutorial_progress')
      .select('current_step_id, current_step_index, finished_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!progress) {
      logger.log('[Tutorial] No tutorial progress found for user:', userId, '- auto-creating');
      const { error: insertErr } = await supabase
        .from('player_tutorial_progress')
        .insert({ user_id: userId, current_step_id: 'ch1_ferro_mine_1', current_step_index: 0 })
        .select('current_step_id, current_step_index, finished_at')
        .maybeSingle();

      if (insertErr) {
        logger.log('[Tutorial] Failed to auto-create progress:', insertErr.message);
        return;
      }

      const { data: freshProgress } = await supabase
        .from('player_tutorial_progress')
        .select('current_step_id, current_step_index, finished_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!freshProgress) {
        logger.log('[Tutorial] Still no progress after auto-create for user:', userId);
        return;
      }
      progress = freshProgress;
    }

    if (progress.finished_at) {
      logger.log('[Tutorial] Tutorial already finished for user:', userId);
      return;
    }

    const currentStepId = progress.current_step_id as string;
    const currentStepIndex = progress.current_step_index as number;

    logger.log('[Tutorial] Current step:', currentStepId, 'index:', currentStepIndex, 'checking match...');

    if (!matchesCurrentStep(currentStepId, context)) {
      logger.log('[Tutorial] Step does not match current context. Step:', currentStepId, 'Context type:', context.type,
        context.type === 'building' ? `building=${context.buildingId} level=${context.level}` :
        context.type === 'research' ? `research=${context.researchId} level=${context.level}` :
        context.type === 'shipyard' ? `item=${context.itemId} type=${context.itemType} qty=${context.newQuantity}` :
        context.type === 'fleet_event' ? `event=${context.eventType}` :
        context.type === 'transaction' ? `txType=${context.transactionType}` : '');
      return;
    }

    const step = TUTORIAL_STEPS.find(s => s.id === currentStepId);
    if (!step) return;

    const proofId = context.type === 'fleet_event' ? context.proofId : undefined;

    const validationSource = step.validationSource;

    const { data: existing } = await supabase
      .from('tutorial_step_validations')
      .select('id')
      .eq('user_id', userId)
      .eq('step_id', currentStepId)
      .maybeSingle();

    if (existing) {
      logger.log('[Tutorial] Step already validated:', currentStepId);
      return;
    }

    const { error: insertErr } = await supabase
      .from('tutorial_step_validations')
      .insert({
        user_id: userId,
        step_id: currentStepId,
        step_index: currentStepIndex,
        validation_source: validationSource,
        proof_id: proofId ?? null,
        proof_data: {
          context_type: context.type,
          ...(context.type === 'building' ? { building_id: context.buildingId, level: context.level } : {}),
          ...(context.type === 'research' ? { research_id: context.researchId, level: context.level } : {}),
          ...(context.type === 'shipyard' ? { item_id: context.itemId, item_type: context.itemType, quantity: context.newQuantity } : {}),
          ...(context.type === 'fleet_event' ? { event_type: context.eventType } : {}),
          ...(context.type === 'transaction' ? { transaction_type: context.transactionType } : {}),
        },
      });

    if (insertErr) {
      if (insertErr.code === '23505') {
        logger.log('[Tutorial] Step validation already exists (duplicate key):', currentStepId);
        return;
      }
      logger.log('[Tutorial] Error inserting validation:', insertErr.message);
      return;
    }

    logger.log('[Tutorial] Step validated:', currentStepId, 'source:', validationSource, 'for user:', userId);
  } catch (e) {
    logger.log('[Tutorial] Non-blocking validation error:', e instanceof Error ? e.message : String(e));
  }
}
