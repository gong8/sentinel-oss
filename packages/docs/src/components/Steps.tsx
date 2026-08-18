import { cn } from '../lib/utils';

interface StepsProps {
  children: React.ReactNode;
}

export function Steps({ children }: StepsProps) {
  return <div className="steps my-8 space-y-6 relative">{children}</div>;
}

interface StepProps {
  number?: number;
  title: string;
  children: React.ReactNode;
}

export function Step({ number, title, children }: StepProps) {
  return (
    <div className="step relative pl-10">
      {/* Step number indicator */}
      <div
        className={cn(
          'absolute left-0 top-0 flex items-center justify-center',
          'h-7 w-7 rounded-full bg-brand-500 text-white text-sm font-semibold',
        )}
      >
        {number}
      </div>

      {/* Connector line */}
      <div
        className={cn(
          'absolute left-[13px] top-7 bottom-0 w-0.5 bg-border',
          '[.step:last-child_&]:hidden',
        )}
      />

      {/* Content */}
      <div>
        <h4 className="font-semibold text-foreground mb-2">{title}</h4>
        <div className="text-muted-foreground [&>p]:my-2 [&>pre]:my-4">{children}</div>
      </div>
    </div>
  );
}
