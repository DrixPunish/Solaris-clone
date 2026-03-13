import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGame } from '@/contexts/GameContext';
import { TUTORIAL_STEPS, TutorialStep, TutorialReward } from '@/constants/tutorial';
import { supabase } from '@/utils/supabase';

const TUTORIAL_STORAGE_KEY = 'solaris_tutorial';

interface TutorialState {
  completedSteps: string[];
  claimedRewards: string[];
  dismissed: boolean;
  minimized: boolean;
}

const DEFAULT_TUTORIAL_STATE: TutorialState = {
  completedSteps: [],
  claimedRewards: [],
  dismissed: false,
  minimized: false,
};

export const [TutorialProvider, useTutorial] = createContextHook(() => {
  const [tutorialState, setTutorialState] = useState<TutorialState>(DEFAULT_TUTORIAL_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const { state, userId } = useGame();

  useEffect(() => {
    if (!userId) return;
    const key = `${TUTORIAL_STORAGE_KEY}_${userId}`;
    void AsyncStorage.getItem(key).then(stored => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as TutorialState;
          setTutorialState(parsed);
          console.log('[Tutorial] Loaded state, completed:', parsed.completedSteps.length, 'claimed:', parsed.claimedRewards.length);
        } catch {
          console.log('[Tutorial] Failed to parse stored state');
        }
      }
      setIsLoaded(true);
    });
  }, [userId]);

  const persist = useCallback((newState: TutorialState) => {
    if (!userId) return;
    const key = `${TUTORIAL_STORAGE_KEY}_${userId}`;
    void AsyncStorage.setItem(key, JSON.stringify(newState));
  }, [userId]);

  const sentMissionsQuery = useQuery({
    queryKey: ['tutorial_sent_missions', userId],
    queryFn: async () => {
      if (!userId) return { espionage: false, attack: false };
      console.log('[Tutorial] Checking sent mission types for user');
      const { data, error } = await supabase
        .from('fleet_missions')
        .select('mission_type')
        .eq('sender_id', userId)
        .in('mission_type', ['espionage', 'attack'])
        .limit(50);
      if (error) {
        console.log('[Tutorial] Error querying missions:', error.message);
        return { espionage: false, attack: false };
      }
      const types = new Set((data ?? []).map((m: { mission_type: string }) => m.mission_type));
      return {
        espionage: types.has('espionage'),
        attack: types.has('attack'),
      };
    },
    enabled: !!userId,
    refetchInterval: 15000,
  });

  const sentMissions = useMemo(() => sentMissionsQuery.data ?? { espionage: false, attack: false }, [sentMissionsQuery.data]);

  const checkStepCompletion = useCallback((step: TutorialStep): boolean => {
    switch (step.checkType) {
      case 'building_level':
        return (state.buildings[step.checkTarget] ?? 0) >= step.checkValue;
      case 'research_level':
        return (state.research[step.checkTarget] ?? 0) >= step.checkValue;
      case 'ship_count':
        return (state.ships[step.checkTarget] ?? 0) >= step.checkValue;
      case 'defense_count':
        return (state.defenses[step.checkTarget] ?? 0) >= step.checkValue;
      case 'has_colony':
        return (state.colonies ?? []).length >= step.checkValue;
      case 'has_sent_mission':
        return sentMissions[step.checkTarget as keyof typeof sentMissions] === true;
      default:
        return false;
    }
  }, [state.buildings, state.research, state.ships, state.defenses, state.colonies, sentMissions]);

  const completedStepIds = useMemo(() => {
    const ids = new Set<string>(tutorialState.completedSteps);
    for (const step of TUTORIAL_STEPS) {
      if (!ids.has(step.id) && checkStepCompletion(step)) {
        ids.add(step.id);
      }
    }
    return ids;
  }, [tutorialState.completedSteps, checkStepCompletion]);

  useEffect(() => {
    if (!isLoaded) return;
    const newCompleted = Array.from(completedStepIds);
    if (newCompleted.length !== tutorialState.completedSteps.length) {
      const updated = { ...tutorialState, completedSteps: newCompleted };
      setTutorialState(updated);
      persist(updated);
      console.log('[Tutorial] Auto-detected completions, total:', newCompleted.length);
    }
  }, [completedStepIds, isLoaded, tutorialState, persist]);

  const currentStepIndex = useMemo(() => {
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      const step = TUTORIAL_STEPS[i];
      if (!completedStepIds.has(step.id) || !tutorialState.claimedRewards.includes(step.id)) {
        return i;
      }
    }
    return TUTORIAL_STEPS.length;
  }, [completedStepIds, tutorialState.claimedRewards]);

  const currentStep = useMemo(() => {
    if (currentStepIndex >= TUTORIAL_STEPS.length) return null;
    return TUTORIAL_STEPS[currentStepIndex];
  }, [currentStepIndex]);

  const isCurrentStepCompleted = useMemo(() => {
    if (!currentStep) return false;
    return completedStepIds.has(currentStep.id);
  }, [currentStep, completedStepIds]);

  const isCurrentStepClaimed = useMemo(() => {
    if (!currentStep) return false;
    return tutorialState.claimedRewards.includes(currentStep.id);
  }, [currentStep, tutorialState.claimedRewards]);

  const claimReward = useCallback((stepId: string): TutorialReward | null => {
    const step = TUTORIAL_STEPS.find(s => s.id === stepId);
    if (!step) return null;
    if (!completedStepIds.has(stepId)) return null;
    if (tutorialState.claimedRewards.includes(stepId)) return null;

    console.log('[Tutorial] Claiming reward for step:', stepId);
    const updated = {
      ...tutorialState,
      claimedRewards: [...tutorialState.claimedRewards, stepId],
    };
    setTutorialState(updated);
    persist(updated);
    return step.reward;
  }, [completedStepIds, tutorialState, persist]);

  const dismissTutorial = useCallback(() => {
    console.log('[Tutorial] Tutorial dismissed');
    const updated = { ...tutorialState, dismissed: true };
    setTutorialState(updated);
    persist(updated);
  }, [tutorialState, persist]);

  const reopenTutorial = useCallback(() => {
    console.log('[Tutorial] Tutorial reopened');
    const updated = { ...tutorialState, dismissed: false, minimized: false };
    setTutorialState(updated);
    persist(updated);
  }, [tutorialState, persist]);

  const toggleMinimized = useCallback(() => {
    const updated = { ...tutorialState, minimized: !tutorialState.minimized };
    setTutorialState(updated);
    persist(updated);
  }, [tutorialState, persist]);

  const totalSteps = TUTORIAL_STEPS.length;
  const completedCount = tutorialState.claimedRewards.length;
  const progress = totalSteps > 0 ? completedCount / totalSteps : 0;
  const isFinished = completedCount >= totalSteps;

  return useMemo(() => ({
    currentStep,
    currentStepIndex,
    isCurrentStepCompleted,
    isCurrentStepClaimed,
    claimReward,
    dismissTutorial,
    reopenTutorial,
    toggleMinimized,
    isDismissed: tutorialState.dismissed,
    isMinimized: tutorialState.minimized,
    isLoaded,
    totalSteps,
    completedCount,
    progress,
    isFinished,
    completedStepIds,
    claimedRewards: tutorialState.claimedRewards,
    allSteps: TUTORIAL_STEPS,
  }), [
    currentStep, currentStepIndex, isCurrentStepCompleted, isCurrentStepClaimed,
    claimReward, dismissTutorial, reopenTutorial, toggleMinimized,
    tutorialState.dismissed, tutorialState.minimized, isLoaded,
    totalSteps, completedCount, progress, isFinished, completedStepIds,
    tutorialState.claimedRewards,
  ]);
});
