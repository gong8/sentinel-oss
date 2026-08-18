/**
 * WorkspaceSwitcher Component
 *
 * Dropdown to switch between workspaces via URL navigation.
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

export function WorkspaceSwitcher() {
  const {
    workspaces,
    selectedWorkspaceSlug,
    setSelectedWorkspace,
    isLoading,
    isOrgOwner,
    isGlobalView,
  } = useWorkspace();

  // Don't render if no workspaces and not loading (unless org owner who can see "All Workspaces")
  if (!isLoading && (!workspaces || workspaces.length === 0) && !isOrgOwner) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="mt-3">
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  // Build the select value
  // - 'global' for global view (org owners only)
  // - workspace slug for workspace view
  const selectValue = isGlobalView ? 'global' : (selectedWorkspaceSlug ?? 'select');

  const handleWorkspaceChange = (value: string) => {
    if (value === 'global') {
      // Navigate to global view
      setSelectedWorkspace(null);
    } else if (value !== 'select') {
      // Find workspace by slug and navigate
      const workspace = workspaces?.find((w) => w.slug === value);
      if (workspace) {
        setSelectedWorkspace(workspace);
      }
    }
  };

  return (
    <div className="mt-3">
      <Select value={selectValue} onValueChange={handleWorkspaceChange}>
        <SelectTrigger
          className={cn('w-full bg-background/50', isGlobalView && 'border-blue-500/50')}
        >
          <SelectValue placeholder="Select workspace">
            {isGlobalView ? (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Global View</span>
              </div>
            ) : selectedWorkspaceSlug ? (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>
                  {workspaces?.find((w) => w.slug === selectedWorkspaceSlug)?.name ?? 'Workspace'}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select workspace</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* Global View Option - only for org owners */}
          {isOrgOwner && (
            <>
              <SelectItem value="global">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-500" />
                  <div className="flex flex-col">
                    <span className="font-medium">Global View</span>
                    <span className="text-xs text-muted-foreground">Org-wide resources</span>
                  </div>
                </div>
              </SelectItem>
              {workspaces && workspaces.length > 0 && <SelectSeparator />}
            </>
          )}

          {/* Workspaces Section */}
          {workspaces && workspaces.length > 0 && (
            <>
              {isOrgOwner && (
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    Workspaces
                  </div>
                </div>
              )}
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.slug}>
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
