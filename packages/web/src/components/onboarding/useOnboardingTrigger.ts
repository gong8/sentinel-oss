/**
 * Onboarding Trigger Hooks
 * Hooks to automatically trigger onboarding step completion
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useOnboarding } from '../../contexts/OnboardingContext';

/**
 * Hook to trigger onboarding step when navigating to a specific path
 * The OnboardingContext already handles this, but this hook can be used
 * for explicit navigation triggers in components
 */
export function useOnboardingNavigationTrigger() {
  const location = useLocation();
  const { triggerNavigation, currentStepDef, hasActiveTour } = useOnboarding();

  useEffect(() => {
    if (hasActiveTour && currentStepDef?.trigger.type === 'navigation') {
      triggerNavigation(location.pathname);
    }
  }, [location.pathname, hasActiveTour, currentStepDef, triggerNavigation]);
}

/**
 * Creates a callback wrapper that triggers onboarding step completion
 * when a specific mutation succeeds
 *
 * Usage:
 * const onSuccess = useOnboardingMutationCallback('admin.mcpServers.create', () => {
 *   // your original onSuccess logic
 * });
 *
 * mutation.mutate(data, { onSuccess });
 */
export function useOnboardingMutationCallback<T>(
  mutationPath: string,
  originalCallback?: (data: T) => void,
): (data: T) => void {
  const { triggerMutation, currentStepDef, hasActiveTour } = useOnboarding();

  return (data: T) => {
    // Call original callback first
    originalCallback?.(data);

    // Then trigger onboarding if applicable
    if (
      hasActiveTour &&
      currentStepDef?.trigger.type === 'mutation' &&
      currentStepDef.trigger.mutationPath === mutationPath
    ) {
      triggerMutation(mutationPath);
    }
  };
}

/**
 * Hook that returns a function to call after a mutation succeeds
 * to trigger onboarding step completion
 *
 * Usage:
 * const triggerOnboarding = useOnboardingMutationSuccess('admin.mcpServers.create');
 *
 * mutation.mutate(data, {
 *   onSuccess: () => {
 *     triggerOnboarding();
 *     // other logic
 *   }
 * });
 */
export function useOnboardingMutationSuccess(mutationPath: string): () => void {
  const { triggerMutation, currentStepDef, hasActiveTour } = useOnboarding();

  return () => {
    if (
      hasActiveTour &&
      currentStepDef?.trigger.type === 'mutation' &&
      currentStepDef.trigger.mutationPath === mutationPath
    ) {
      triggerMutation(mutationPath);
    }
  };
}
