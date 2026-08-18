/**
 * Agent Layout Component
 * Full-screen layout for the agent page without nav sidebar
 */

import * as React from 'react';

interface AgentLayoutProps {
  children: React.ReactNode;
}

export function AgentLayout({ children }: AgentLayoutProps) {
  return (
    <div className="h-screen overflow-hidden bg-background text-foreground transition-colors duration-300 ease-in-out">
      <div className="flex h-full">{children}</div>
    </div>
  );
}
