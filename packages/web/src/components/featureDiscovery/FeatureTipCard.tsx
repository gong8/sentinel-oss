/**
 * Feature Tip Card Component
 * Displays a single feature tip with dismiss options
 */

import { Clock, ExternalLink, X } from 'lucide-react';

import { Button } from '../ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/card';

interface FeatureTipCardProps {
  tip: {
    id: string;
    title: string;
    description: string;
    docUrl: string;
    category: 'basic' | 'intermediate' | 'advanced' | 'enterprise';
  };
  onDismiss: (type: 'NOT_INTERESTED' | 'REMIND_LATER') => void;
  isLoading?: boolean;
}

const categoryColors = {
  basic: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  advanced: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  enterprise: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

export function FeatureTipCard({ tip, onDismiss, isLoading }: FeatureTipCardProps) {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${categoryColors[tip.category]}`}
            >
              {tip.category}
            </span>
          </div>
        </div>
        <h4 className="font-semibold text-base">{tip.title}</h4>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground">{tip.description}</p>
        <a
          href={tip.docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
        >
          Learn more
          <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
      <CardFooter className="pt-0 flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss('NOT_INTERESTED')}
          disabled={isLoading}
          className="text-muted-foreground text-xs px-2"
        >
          <X className="h-3 w-3 mr-1" />
          Not interested
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss('REMIND_LATER')}
          disabled={isLoading}
          className="text-muted-foreground text-xs px-2"
        >
          <Clock className="h-3 w-3 mr-1" />
          Remind later
        </Button>
      </CardFooter>
    </Card>
  );
}
