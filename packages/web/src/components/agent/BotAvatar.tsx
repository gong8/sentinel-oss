/**
 * Bot Avatar Component
 * Displays the Sentinel logo avatar used in chat messages and thinking indicator
 */

import { cn } from '../../lib/utils';

interface BotAvatarProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: { container: 'h-6 w-6', logo: 'h-4' },
  md: { container: 'h-8 w-8', logo: 'h-5' },
  lg: { container: 'h-10 w-10', logo: 'h-6' },
};

export function BotAvatar({ className, size = 'md' }: BotAvatarProps): React.ReactElement {
  const sizeConfig = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-zinc-900 shadow-sm',
        sizeConfig.container,
        className,
      )}
    >
      <img src="/logo.png" alt="Sentinel" className={cn(sizeConfig.logo, 'w-auto')} />
    </div>
  );
}
