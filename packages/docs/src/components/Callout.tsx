import { AlertCircle, AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { cn } from '../lib/utils';

type CalloutType = 'info' | 'warning' | 'danger' | 'tip';

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: React.ReactNode;
}

const calloutConfig: Record<
  CalloutType,
  {
    icon: React.ComponentType<{ className?: string }>;
    className: string;
    defaultTitle: string;
  }
> = {
  info: {
    icon: Info,
    className: 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    defaultTitle: 'Info',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    defaultTitle: 'Warning',
  },
  danger: {
    icon: AlertCircle,
    className: 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400',
    defaultTitle: 'Danger',
  },
  tip: {
    icon: Lightbulb,
    className: 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400',
    defaultTitle: 'Tip',
  },
};

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const config = calloutConfig[type];
  const Icon = config.icon;

  return (
    <div className={cn('my-6 rounded-lg border px-4 py-4', config.className)}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {(title || config.defaultTitle) && (
            <p className="font-semibold mb-1 leading-6">{title ?? config.defaultTitle}</p>
          )}
          <div className="text-sm leading-relaxed text-foreground/90 [&>p]:my-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
