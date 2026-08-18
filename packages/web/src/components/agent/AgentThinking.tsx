/**
 * Agent Thinking Indicator
 * Shows animated indicator while the agent is processing
 */

import { BotAvatar } from './BotAvatar';

interface AgentThinkingProps {
  /** Whether this is an admin conversation (shows "Sentinel Admin Agent" vs "Sentinel Agent") */
  isAdmin?: boolean;
}

export function AgentThinking({ isAdmin = true }: AgentThinkingProps) {
  return (
    <div className="flex gap-3 px-4 py-5">
      <BotAvatar />
      <div className="flex flex-col gap-2 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">
            {isAdmin ? 'Sentinel Admin Agent' : 'Sentinel Agent'}
          </span>
          <span className="text-xs text-muted-foreground">is thinking...</span>
        </div>
        <div className="flex items-center gap-1.5 h-4">
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}
