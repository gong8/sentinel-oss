/**
 * Workspace Mode Tabs
 * Allows switching between Agent and Control Panel (Admin) views
 */

import { NavLink, useLocation } from 'react-router';

import { cn } from '../../lib/utils';

interface WorkspaceModeTabsProps {
  workspaceSlug: string;
}

type Mode = 'agent' | 'admin' | 'user';

function getModeFromPath(pathname: string): Mode | null {
  // Check for agent mode first (sub-path of admin)
  if (/^\/admin\/[^/]+\/agent/.test(pathname)) return 'agent';
  if (pathname.startsWith('/admin/')) return 'admin';
  if (pathname.startsWith('/user/')) return 'user';
  return null;
}

export function WorkspaceModeTabs({ workspaceSlug }: WorkspaceModeTabsProps) {
  const location = useLocation();
  const currentMode = getModeFromPath(location.pathname);

  // Don't render tabs if not in a workspace context
  if (!currentMode) return null;

  const tabs = [
    { mode: 'agent' as const, label: 'Agent', to: `/admin/${workspaceSlug}/agent` },
    { mode: 'admin' as const, label: 'Control Panel', to: `/admin/${workspaceSlug}` },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
      {tabs.map((tab) => (
        <NavLink
          key={tab.mode}
          to={tab.to}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            currentMode === tab.mode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
          )}
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
