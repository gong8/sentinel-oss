/**
 * Onboarding Context
 * Provides global onboarding state and actions
 */

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { getAccessToken } from '../lib/auth';
import { trpc } from '../lib/trpc';

type TourId = 'admin' | 'user' | 'org-owner';

interface TourStepTrigger {
  type: 'manual' | 'mutation' | 'navigation';
  mutationPath?: string;
  navigationPattern?: string;
}

interface TourStep {
  id: string;
  title: string;
  description: string;
  trigger: TourStepTrigger;
  highlightElement?: string;
}

interface TourDefinition {
  id: TourId;
  name: string;
  description: string;
  steps: TourStep[];
}

interface OnboardingContextValue {
  // State
  isLoading: boolean;
  currentTourId: TourId | null;
  currentStep: number;
  currentTour: TourDefinition | null;
  currentStepDef: TourStep | null;
  completedTours: TourId[];
  dismissed: boolean;
  recommendedTour: TourId;
  availableTours: TourId[];
  tours: Record<TourId, TourDefinition>;

  // Computed
  hasActiveTour: boolean;
  tourProgress: { current: number; total: number } | null;
  isStepManual: boolean;

  // Actions
  startTour: (tourId: TourId) => void;
  advanceStep: () => void;
  completeTour: () => void;
  dismiss: () => void;
  restart: (tourId?: TourId) => void;
  triggerNavigation: (path: string) => void;
  triggerMutation: (mutationPath: string) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const utils = trpc.useUtils();

  // Query onboarding state - only when authenticated
  const isAuthenticated = !!getAccessToken();
  const { data, isLoading } = trpc.user.onboarding.getState.useQuery(undefined, {
    staleTime: 30000,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated,
  });

  // Mutations
  const startTourMutation = trpc.user.onboarding.startTour.useMutation({
    onSuccess: () => utils.user.onboarding.getState.invalidate(),
  });

  const advanceStepMutation = trpc.user.onboarding.advanceStep.useMutation({
    onSuccess: () => utils.user.onboarding.getState.invalidate(),
  });

  const completeTourMutation = trpc.user.onboarding.completeTour.useMutation({
    onSuccess: () => utils.user.onboarding.getState.invalidate(),
  });

  const dismissMutation = trpc.user.onboarding.dismiss.useMutation({
    onSuccess: () => utils.user.onboarding.getState.invalidate(),
  });

  const restartMutation = trpc.user.onboarding.restart.useMutation({
    onSuccess: () => utils.user.onboarding.getState.invalidate(),
  });

  const triggerStepCompletionMutation = trpc.user.onboarding.triggerStepCompletion.useMutation({
    onSuccess: () => utils.user.onboarding.getState.invalidate(),
  });

  // Refs to prevent duplicate mutation calls
  const hasAttemptedAutoStart = useRef(false);
  const lastNavigationPath = useRef<string | null>(null);

  // Auto-start recommended tour for new users
  useEffect(() => {
    // Skip if already attempted or mutating
    if (hasAttemptedAutoStart.current || startTourMutation.isPending) {
      return;
    }
    if (
      !isLoading &&
      data &&
      !data.dismissed &&
      !data.currentTourId &&
      data.completedTours.length === 0
    ) {
      // New user - start recommended tour
      hasAttemptedAutoStart.current = true;
      startTourMutation.mutate({ tourId: data.recommendedTour });
    }
  }, [isLoading, data, startTourMutation]);

  // Extract currentStepDef early for use in effects and callbacks
  const currentStepDef = data?.currentStepDef;

  // Navigation trigger - check when location changes
  useEffect(() => {
    // Skip if already mutating or same path already triggered
    if (triggerStepCompletionMutation.isPending) {
      return;
    }
    if (!currentStepDef || currentStepDef.trigger.type !== 'navigation') {
      return;
    }
    if (lastNavigationPath.current === location.pathname) {
      return;
    }

    // Trigger navigation completion
    lastNavigationPath.current = location.pathname;
    triggerStepCompletionMutation.mutate({
      triggerType: 'navigation',
      triggerValue: location.pathname,
    });
  }, [location.pathname, currentStepDef, triggerStepCompletionMutation]);

  // Actions
  const startTour = useCallback(
    (tourId: TourId) => {
      startTourMutation.mutate({ tourId });
    },
    [startTourMutation],
  );

  const advanceStep = useCallback(() => {
    advanceStepMutation.mutate();
  }, [advanceStepMutation]);

  const completeTour = useCallback(() => {
    completeTourMutation.mutate();
  }, [completeTourMutation]);

  const dismiss = useCallback(() => {
    dismissMutation.mutate();
  }, [dismissMutation]);

  const restart = useCallback(
    (tourId?: TourId) => {
      restartMutation.mutate({ tourId });
    },
    [restartMutation],
  );

  const triggerNavigation = useCallback(
    (path: string) => {
      if (!currentStepDef || currentStepDef.trigger.type !== 'navigation') {
        return;
      }
      triggerStepCompletionMutation.mutate({
        triggerType: 'navigation',
        triggerValue: path,
      });
    },
    [currentStepDef, triggerStepCompletionMutation],
  );

  const triggerMutation = useCallback(
    (mutationPath: string) => {
      if (!currentStepDef || currentStepDef.trigger.type !== 'mutation') {
        return;
      }
      triggerStepCompletionMutation.mutate({
        triggerType: 'mutation',
        triggerValue: mutationPath,
      });
    },
    [currentStepDef, triggerStepCompletionMutation],
  );

  // Computed values
  const hasActiveTour = Boolean(data?.currentTourId && !data?.dismissed);
  const tourProgress = data?.currentTour
    ? { current: data.currentStep + 1, total: data.currentTour.steps.length }
    : null;
  const isStepManual = currentStepDef?.trigger.type === 'manual';

  const value: OnboardingContextValue = {
    // State
    isLoading,
    currentTourId: data?.currentTourId ?? null,
    currentStep: data?.currentStep ?? 0,
    currentTour: (data?.currentTour as TourDefinition | null) ?? null,
    currentStepDef: (currentStepDef as TourStep | null) ?? null,
    completedTours: (data?.completedTours ?? []) as TourId[],
    dismissed: data?.dismissed ?? false,
    recommendedTour: (data?.recommendedTour ?? 'user') as TourId,
    availableTours: (data?.availableTours ?? ['user']) as TourId[],
    tours: (data?.tours ?? {}) as Record<TourId, TourDefinition>,

    // Computed
    hasActiveTour,
    tourProgress,
    isStepManual,

    // Actions
    startTour,
    advanceStep,
    completeTour,
    dismiss,
    restart,
    triggerNavigation,
    triggerMutation,
  };

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}

/**
 * Hook to trigger onboarding step completion when a mutation succeeds
 * Use this in components that perform mutations that should advance the tour
 */
export function useOnboardingMutationTrigger(mutationPath: string) {
  const { triggerMutation, currentStepDef } = useOnboarding();

  const trigger = useCallback(() => {
    if (
      currentStepDef?.trigger.type === 'mutation' &&
      currentStepDef.trigger.mutationPath === mutationPath
    ) {
      triggerMutation(mutationPath);
    }
  }, [currentStepDef, mutationPath, triggerMutation]);

  return trigger;
}
