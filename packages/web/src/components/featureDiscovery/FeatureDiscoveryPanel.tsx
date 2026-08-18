/**
 * Feature Discovery Panel
 * Shows contextual feature tips on dashboard pages
 */

import { ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router';

import { useOnboarding } from '../../contexts/OnboardingContext';
import { useDismissTip, useFeatureTips } from '../../hooks/useFeatureDiscovery';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { FeatureTipCard } from './FeatureTipCard';

interface FeatureDiscoveryPanelProps {
  workspaceId?: string | null;
}

export function FeatureDiscoveryPanel({ workspaceId }: FeatureDiscoveryPanelProps) {
  const location = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { hasActiveTour } = useOnboarding();
  const { data: tips, isLoading } = useFeatureTips(location.pathname, workspaceId);
  const dismissMutation = useDismissTip();

  // Don't show if tutorial is active, no tips, or loading
  if (hasActiveTour || isLoading || !tips || tips.length === 0) {
    return null;
  }

  const currentTip = tips[currentIndex];

  const handleDismiss = async (type: 'NOT_INTERESTED' | 'REMIND_LATER') => {
    await dismissMutation.mutateAsync({
      tipId: currentTip.id,
      dismissType: type,
    });
    // Move to next tip or close if none left
    if (currentIndex >= tips.length - 1) {
      setCurrentIndex(0);
    }
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? tips.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === tips.length - 1 ? 0 : prev + 1));
  };

  if (isCollapsed) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 shadow-lg"
      >
        <Lightbulb className="h-4 w-4 mr-2" />
        Tips ({tips.length})
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-[450px] shadow-xl">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium">Did you know?</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse tips"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-2">
        <FeatureTipCard
          tip={currentTip}
          onDismiss={handleDismiss}
          isLoading={dismissMutation.isPending}
        />

        {tips.length > 1 && (
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t">
            <Button variant="ghost" size="icon" onClick={handlePrev} aria-label="Previous tip">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} of {tips.length}
            </span>
            <Button variant="ghost" size="icon" onClick={handleNext} aria-label="Next tip">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
