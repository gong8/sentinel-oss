/**
 * ViewSwitcher Component
 *
 * Dropdown to switch between global view and workspace views.
 * Only visible to org owners who have access to both views.
 * Uses WorkspaceContext which derives state from URL and provides navigation.
 */

import { Building2, Globe, Layers } from 'lucide-react';

import { useWorkspace } from '../../hooks/WorkspaceContext';
import { cn } from '../../lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Skeleton } from '../ui/skeleton';

interface ViewSwitcherProps {
  className?: string;
}

export function ViewSwitcher({ className }: ViewSwitcherProps) {
  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspace,
    isLoading,
    isOrgOwner,
    isGlobalView,
  } = useWorkspace();

  // Only org owners can see the view switcher
  if (!isOrgOwner) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn('mt-3', className)}>
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  // Build the select value
  const selectValue = isGlobalView ? 'global' : (selectedWorkspaceId ?? 'global');

  const handleViewChange = (value: string) => {
    if (value === 'global') {
      setSelectedWorkspace(null);
    } else {
      // Find workspace by ID and navigate
      const workspace = workspaces?.find((w) => w.id === value);
      if (workspace) {
        setSelectedWorkspace(workspace);
      }
    }
  };

  return (
    <div className={cn('mt-3', className)}>
      <Select value={selectValue} onValueChange={handleViewChange}>
        <SelectTrigger
          className={cn('w-full bg-background/50', isGlobalView && 'border-blue-500/50')}
        >
          <SelectValue placeholder="Select view">
            <div className="flex items-center gap-2">
              {isGlobalView ? (
                <>
                  <Globe className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">Global View</span>
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4" />
                  <span>
                    {workspaces?.find((w) => w.id === selectedWorkspaceId)?.name ?? 'Workspace'}
                  </span>
                </>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* Global View Option */}
          <SelectItem value="global">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              <div className="flex flex-col">
                <span className="font-medium">Global View</span>
                <span className="text-xs text-muted-foreground">Org-wide resources</span>
              </div>
            </div>
          </SelectItem>

          {workspaces && workspaces.length > 0 && (
            <>
              <SelectSeparator />
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Workspaces
                </div>
              </div>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <div className="flex flex-col">
                      <span>{workspace.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {workspace._count.policies} policies, {workspace._count.mcpServers} servers
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
