/**
 * Onboarding Widget
 * Floating card showing onboarding progress and current step
 */

import { CheckCircle2, ChevronRight, Sparkles, X } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function OnboardingWidget() {
  const {
    isLoading,
    hasActiveTour,
    currentTour,
    currentStepDef,
    tourProgress,
    isStepManual,
    completedTours,
    dismissed,
    advanceStep,
    dismiss,
  } = useOnboarding();

  // Don't render while loading
  if (isLoading) {
    return null;
  }

  // Don't show widget if dismissed or completed all tours
  // (restart button is available in Settings > Appearance)
  if (dismissed || (!hasActiveTour && completedTours.length > 0)) {
    return null;
  }

  // Don't show if no active tour
  if (!hasActiveTour || !currentTour || !currentStepDef || !tourProgress) {
    return null;
  }

  const isLastStep = tourProgress.current === tourProgress.total;
  const progressPercent = (tourProgress.current / tourProgress.total) * 100;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 animate-in slide-in-from-bottom-4 duration-300">
      <Card className="shadow-xl border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {/* Progress bar */}
        <div className="h-1 bg-muted rounded-t-lg overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <CardHeader className="pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {currentTour.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tourProgress.current}/{tourProgress.total}
                </span>
              </div>
              <CardTitle className="text-sm leading-snug">{currentStepDef.title}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-2 shrink-0"
              onClick={dismiss}
              aria-label="Dismiss tutorial"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0 pb-4">
          <CardDescription className="text-xs leading-relaxed mb-4">
            {currentStepDef.description}
          </CardDescription>

          <div className="flex items-center justify-between gap-2">
            {/* Step type indicator */}
            {!isStepManual && (
              <span className="text-xs text-muted-foreground italic">
                Complete the action to continue
              </span>
            )}

            {/* Action button for manual steps */}
            {isStepManual && <div className="flex-1" />}

            {isStepManual && (
              <Button size="sm" onClick={advanceStep} className="gap-1">
                {isLastStep ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Compact onboarding button for use in settings or navigation
 */
export function OnboardingRestartButton({ className }: { className?: string }) {
  const { restart, isLoading } = useOnboarding();

  if (isLoading) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => restart()}
      className={cn('gap-2', className)}
    >
      <Sparkles className="h-4 w-4" />
      Restart Tutorial
    </Button>
  );
}
