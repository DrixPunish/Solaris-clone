import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGame } from '@/contexts/GameContext';
import { TUTORIAL_STEPS, TUTORIAL_CHAPTERS, TutorialStep, TutorialReward, getNextStep } from '@/constants/tutorial';
import { supabase } from '@/utils/supabase';

interface TutorialProgressState {
  currentStepId: string;
  currentStepIndex: number;
  completedSteps: string[];
  claimedRewards: string[];
  dismissed: boolean;
  minimized: boolean;
  finishedAt: string | null;
}

const FIRST_STEP = TUTORIAL_STEPS[0];

const DEFAULT_PROGRESS: TutorialProgressState = {
  currentStepId: FIRST_STEP?.id ?? '',
  currentStepIndex: 0,
  completedSteps: [],
  claimedRewards: [],
  dismissed: false,
  minimized: false,
  finishedAt: null,
};

export const [TutorialProvider, useTutorial] = createContextHook(() => {
  const [progress, setProgress] = useState<TutorialProgressState>(DEFAULT_PROGRESS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const { state, userId } = useGame();
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<Partial<TutorialProgressState> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      console.log('[Tutorial] Loading progress from Supabase for user:', userId);
      try {
        const { data, error } = await supabase
          .from('player_tutorial_progress')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (cancelled) return;

        if (error && error.code !== 'PGRST116') {
          console.log('[Tutorial] Error loading progress:', error.message);
          setIsLoaded(true);
          return;
        }

        if (!data) {
          console.log('[Tutorial] No progress row found, creating default for user:', userId);
          const { error: insertError } = await supabase
            .from('player_tutorial_progress')
            .insert({
              user_id: userId,
              current_step_id: FIRST_STEP?.id ?? '',
              current_step_index: 0,
            });
          if (insertError && insertError.code !== '23505') {
            console.log('[Tutorial] Error creating progress row:', insertError.message);
          }
          setIsLoaded(true);
          return;
        }

        const serverCompleted: string[] = Array.isArray(data.completed_steps) ? data.completed_steps : [];
        const serverClaimed: string[] = Array.isArray(data.claimed_rewards) ? data.claimed_rewards : [];

        setProgress({
          currentStepId: (data.current_step_id as string) ?? FIRST_STEP?.id ?? '',
          currentStepIndex: (data.current_step_index as number) ?? 0,
          completedSteps: serverCompleted,
          claimedRewards: serverClaimed,
          dismissed: (data.dismissed as boolean) ?? false,
          minimized: (data.minimized as boolean) ?? false,
          finishedAt: (data.finished_at as string) ?? null,
        });

        console.log('[Tutorial] Loaded progress: step=', data.current_step_id, 'index=', data.current_step_index, 'completed=', serverCompleted.length, 'claimed=', serverClaimed.length);
        setIsLoaded(true);
      } catch (err) {
        console.log('[Tutorial] Unexpected error loading:', err);
        if (!cancelled) setIsLoaded(true);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const validationQuery = useQuery({
    queryKey: ['tutorial_validation', userId, progress.currentStepId],
    queryFn: async () => {
      if (!userId || !progress.currentStepId || progress.finishedAt) return false;
      const { data } = await supabase
        .from('tutorial_step_validations')
        .select('id')
        .eq('user_id', userId)
        .eq('step_id', progress.currentStepId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!userId && isLoaded && !progress.finishedAt,
    refetchInterval: 10000,
  });

  useEffect(() => {
    setIsValidated(validationQuery.data === true);
  }, [validationQuery.data]);

  const checkLocalCompletion = useCallback((step: TutorialStep): boolean => {
    if (step.checkType === 'server_event') return false;
    switch (step.checkType) {
      case 'building_level':
        return (state.buildings[step.checkTarget] ?? 0) >= step.checkValue;
      case 'research_level':
        return (state.research[step.checkTarget] ?? 0) >= step.checkValue;
      case 'ship_count':
        return (state.ships[step.checkTarget] ?? 0) >= step.checkValue;
      case 'defense_count':
        return (state.defenses[step.checkTarget] ?? 0) >= step.checkValue;
      default:
        return false;
    }
  }, [state.buildings, state.research, state.ships, state.defenses]);

  const currentStep = useMemo(() => {
    if (progress.finishedAt) return null;
    return TUTORIAL_STEPS.find(s => s.id === progress.currentStepId) ?? null;
  }, [progress.currentStepId, progress.finishedAt]);

  const isCurrentStepCompleted = useMemo(() => {
    if (!currentStep) return false;
    if (isValidated) return true;
    if (currentStep.checkType !== 'server_event') {
      return checkLocalCompletion(currentStep);
    }
    return false;
  }, [currentStep, isValidated, checkLocalCompletion]);

  const isCurrentStepClaimed = useMemo(() => {
    if (!currentStep) return false;
    return progress.claimedRewards.includes(currentStep.id);
  }, [currentStep, progress.claimedRewards]);

  const persistField = useCallback(async (fields: Record<string, unknown>) => {
    if (!userId) return;

    if (savingRef.current) {
      pendingSaveRef.current = { ...(pendingSaveRef.current ?? {}), ...fields } as Partial<TutorialProgressState>;
      return;
    }

    savingRef.current = true;
    try {
      const { error } = await supabase
        .from('player_tutorial_progress')
        .update(fields)
        .eq('user_id', userId);
      if (error) {
        console.log('[Tutorial] Error persisting:', error.message);
      }
    } catch (err) {
      console.log('[Tutorial] Unexpected error persisting:', err);
    } finally {
      savingRef.current = false;
      if (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        void persistField(pending as Record<string, unknown>);
      }
    }
  }, [userId]);

  const claimReward = useCallback((stepId: string): TutorialReward | null => {
    const step = TUTORIAL_STEPS.find(s => s.id === stepId);
    if (!step) return null;
    if (progress.claimedRewards.includes(stepId)) {
      console.log('[Tutorial] Step already claimed locally, skipping:', stepId);
      return null;
    }
    if (!isCurrentStepCompleted && !isValidated) return null;

    console.log('[Tutorial] Claiming reward for step:', stepId);
    return step.reward;
  }, [progress.claimedRewards, isCurrentStepCompleted, isValidated]);

  const reloadFromServer = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('player_tutorial_progress')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        const serverCompleted: string[] = Array.isArray(data.completed_steps) ? data.completed_steps : [];
        const serverClaimed: string[] = Array.isArray(data.claimed_rewards) ? data.claimed_rewards : [];
        setProgress({
          currentStepId: (data.current_step_id as string) ?? FIRST_STEP?.id ?? '',
          currentStepIndex: (data.current_step_index as number) ?? 0,
          completedSteps: serverCompleted,
          claimedRewards: serverClaimed,
          dismissed: (data.dismissed as boolean) ?? false,
          minimized: (data.minimized as boolean) ?? false,
          finishedAt: (data.finished_at as string) ?? null,
        });
        console.log('[Tutorial] Reloaded from server: step=', data.current_step_id, 'completed=', serverCompleted.length);
      }
    } catch (err) {
      console.log('[Tutorial] Error reloading from server:', err);
    }
  }, [userId]);

  const advanceToNextStep = useCallback(() => {
    if (!currentStep) return;
    const nextStep = getNextStep(currentStep.id);
    const newCompleted = [...progress.completedSteps, currentStep.id];
    const newClaimed = [...progress.claimedRewards, currentStep.id];

    if (nextStep) {
      setProgress(prev => ({
        ...prev,
        currentStepId: nextStep.id,
        currentStepIndex: nextStep.order,
        completedSteps: newCompleted,
        claimedRewards: newClaimed,
      }));
    } else {
      setProgress(prev => ({
        ...prev,
        completedSteps: newCompleted,
        claimedRewards: newClaimed,
        finishedAt: new Date().toISOString(),
      }));
    }

    setIsValidated(false);

    setTimeout(() => {
      void reloadFromServer();
      void validationQuery.refetch();
    }, 500);
  }, [currentStep, progress.completedSteps, progress.claimedRewards, validationQuery, reloadFromServer]);

  const dismissTutorial = useCallback(() => {
    console.log('[Tutorial] Tutorial dismissed');
    setProgress(prev => ({ ...prev, dismissed: true }));
    void persistField({ dismissed: true });
  }, [persistField]);

  const reopenTutorial = useCallback(() => {
    console.log('[Tutorial] Tutorial reopened');
    setProgress(prev => ({ ...prev, dismissed: false, minimized: false }));
    void persistField({ dismissed: false, minimized: false });
  }, [persistField]);

  const toggleMinimized = useCallback(() => {
    setProgress(prev => {
      const newMin = !prev.minimized;
      void persistField({ minimized: newMin });
      return { ...prev, minimized: newMin };
    });
  }, [persistField]);

  const refreshValidation = useCallback(() => {
    void validationQuery.refetch();
  }, [validationQuery]);

  const totalSteps = TUTORIAL_STEPS.length;
  const completedCount = progress.claimedRewards.length;
  const progressPercent = totalSteps > 0 ? completedCount / totalSteps : 0;
  const isFinished = !!progress.finishedAt || completedCount >= totalSteps;

  const currentChapter = useMemo(() => {
    if (!currentStep) return null;
    return TUTORIAL_CHAPTERS.find(c => c.id === currentStep.chapterId) ?? null;
  }, [currentStep]);

  return useMemo(() => ({
    currentStep,
    currentStepIndex: progress.currentStepIndex,
    currentChapter,
    isCurrentStepCompleted,
    isCurrentStepClaimed,
    isValidated,
    claimReward,
    advanceToNextStep,
    dismissTutorial,
    reopenTutorial,
    toggleMinimized,
    refreshValidation,
    isDismissed: progress.dismissed,
    isMinimized: progress.minimized,
    isLoaded,
    totalSteps,
    completedCount,
    progress: progressPercent,
    isFinished,
    completedStepIds: new Set(progress.completedSteps),
    claimedRewards: progress.claimedRewards,
    allSteps: TUTORIAL_STEPS,
    allChapters: TUTORIAL_CHAPTERS,
  }), [
    currentStep, progress.currentStepIndex, currentChapter,
    isCurrentStepCompleted, isCurrentStepClaimed, isValidated,
    claimReward, advanceToNextStep, dismissTutorial, reopenTutorial,
    toggleMinimized, refreshValidation,
    progress.dismissed, progress.minimized, isLoaded,
    totalSteps, completedCount, progressPercent, isFinished,
    progress.completedSteps, progress.claimedRewards,
  ]);
});
