/**
 * Onboarding Highlight
 * Wrapper component that adds a pulsing highlight when element is the current step target
 */

import { type ReactNode } from 'react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { cn } from '../../lib/utils';

interface OnboardingHighlightProps {
  /** The element ID that matches step.highlightElement */
  elementId: string;
  children: ReactNode;
  className?: string;
}

export function OnboardingHighlight({ elementId, children, className }: OnboardingHighlightProps) {
  const { currentStepDef, hasActiveTour } = useOnboarding();

  const isHighlighted = hasActiveTour && currentStepDef?.highlightElement === elementId;

  return (
    <div
      className={cn('relative', isHighlighted && 'onboarding-highlight', className)}
      id={elementId}
    >
      {children}
      {isHighlighted && (
        <div className="absolute inset-0 pointer-events-none rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse" />
      )}
    </div>
  );
}

/**
 * Simple hook to check if an element should be highlighted
 */
export function useOnboardingHighlight(elementId: string): boolean {
  const { currentStepDef, hasActiveTour } = useOnboarding();
  return hasActiveTour && currentStepDef?.highlightElement === elementId;
}
