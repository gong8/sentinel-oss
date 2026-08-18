/**
 * Workspace Selection Page
 * - Shown after login to let users choose their workspace
 * - Org owners see "Global View" option + all workspaces
 * - Admins and users see only their workspaces
 * - Auto-redirects to workspace if user has exactly one (org owners excluded - they have Global View)
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { usePreferences } from '../hooks/PreferencesContext';
import { clearAccessToken, getAccessToken } from '../lib/auth';
import { trpc } from '../lib/trpc';

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}

/**
 * Determine user's display role based on their permissions
 */
function getUserDisplayRole(profile: {
  isOrgOwner: boolean;
  userRoles: Array<{ role: { isAdmin: boolean; name: string } }>;
}): { label: string; description: string } {
  if (profile.isOrgOwner) {
    return {
      label: 'Organization Owner',
      description: 'Full access to all workspaces and global settings',
    };
  }

  // Check if user has any admin role (org-level admin)
  const hasAdminRole = profile.userRoles.some((ur) => ur.role.isAdmin);
  if (hasAdminRole) {
    return {
      label: 'Administrator',
      description: 'Admin access to assigned workspaces',
    };
  }

  return {
    label: 'User',
    description: 'Access to assigned workspaces',
  };
}

export default function WorkspaceSelectionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const hasToken = Boolean(getAccessToken());
  const { preferences } = usePreferences();

  // Check if user explicitly navigated here (e.g., clicked "Change Workspace")
  const forceShow = (location.state as { forceShow?: boolean } | null)?.forceShow === true;

  // Fetch workspaces and profile
  const workspacesQuery = trpc.user.workspaces.list.useQuery(undefined, {
    enabled: hasToken,
    staleTime: 30000,
  });

  const profileQuery = trpc.user.profile.get.useQuery(undefined, {
    enabled: hasToken,
    staleTime: 60000,
  });

  const profile = profileQuery.data;
  const isOrgOwner = profile?.isOrgOwner ?? false;
  const workspaces = workspacesQuery.data ?? [];
  const activeWorkspaces = workspaces.filter((w) => w.deletedAt === null);
  const isLoading = workspacesQuery.isPending || profileQuery.isPending;

  // Compute role for display
  const roleInfo = profile
    ? getUserDisplayRole({
        isOrgOwner: profile.isOrgOwner,
        userRoles: profile.userRoles,
      })
    : null;

  // Auto-redirect logic:
  // 1. If forceShow is true, always show the selection page
  // 2. If user has a default workspace preference, redirect there
  // 3. If non-org-owner with exactly one workspace, redirect there
  useEffect(() => {
    if (isLoading || !profile) return;
    if (forceShow) return; // User explicitly wants to see the selection page

    // Check for default workspace preference
    if (preferences.defaultWorkspaceId) {
      if (preferences.defaultWorkspaceId === 'global' && isOrgOwner) {
        navigate('/global/admin', { replace: true });
        return;
      }

      const defaultWorkspace = activeWorkspaces.find(
        (w) => w.id === preferences.defaultWorkspaceId,
      );
      if (defaultWorkspace) {
        const routeType = defaultWorkspace.userRole === 'ADMIN' ? 'admin' : 'user';
        navigate(`/${routeType}/${defaultWorkspace.slug}`, { replace: true });
        return;
      }
      // Default workspace not found (maybe deleted or access removed) - fall through to normal logic
    }

    // For non-org-owners with exactly one workspace, auto-redirect
    if (!isOrgOwner && activeWorkspaces.length === 1) {
      const workspace = activeWorkspaces[0];
      const routeType = workspace.userRole === 'ADMIN' ? 'admin' : 'user';
      navigate(`/${routeType}/${workspace.slug}`, { replace: true });
    }
  }, [
    isLoading,
    profile,
    isOrgOwner,
    activeWorkspaces,
    navigate,
    forceShow,
    preferences.defaultWorkspaceId,
  ]);

  // Redirect to login if not authenticated
  if (!hasToken) {
    navigate('/login', { replace: true });
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <div className="text-center mb-12">
            <Skeleton className="h-8 w-48 mx-auto mb-4" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    clearAccessToken();
    queryClient.clear(); // Clear all cached data to prevent stale user data on next login
    navigate('/login', { replace: true });
  };

  // No access message for non-org-owners with no workspaces
  if (!isOrgOwner && activeWorkspaces.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Workspace Access</CardTitle>
            <CardDescription>You don&apos;t have access to any workspaces yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Please contact your organization owner to add you to a workspace. Once you have
              workspace access, you&apos;ll be able to manage policies, servers, and other
              resources.
            </p>
            <Button variant="outline" onClick={handleLogout}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-16">
        {/* Header with Welcome Message */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900">
              <img src="/logo.png" alt="Sentinel" className="h-7 w-auto" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Sentinel</h1>
          </div>

          {/* Welcome message with email and role */}
          {profile && roleInfo && (
            <div className="mb-6 space-y-2">
              <p className="text-lg font-medium">
                {/* TODO: Replace email with user's name once we have it in the profile */}
                Welcome, {profile.email}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Badge
                  variant={
                    isOrgOwner
                      ? 'default'
                      : roleInfo.label === 'Administrator'
                        ? 'secondary'
                        : 'outline'
                  }
                  className="text-sm px-3 py-1"
                >
                  {roleInfo.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{roleInfo.description}</p>
            </div>
          )}

          <p className="text-muted-foreground">
            {isOrgOwner
              ? 'Select a workspace or manage your organization globally'
              : 'Select a workspace to continue'}
          </p>
        </div>

        {/* Workspace Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Global View option for org owners */}
          {isOrgOwner && (
            <Card
              className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 border-2 border-dashed"
              onClick={() => navigate('/global/admin')}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <GlobeIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Global View</CardTitle>
                    <CardDescription className="text-xs">
                      Organization-wide management
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Manage global policies, MCP servers, and organization settings that apply to all
                  workspaces.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Workspace cards */}
          {activeWorkspaces.map((workspace) => {
            const routeType = workspace.userRole === 'ADMIN' ? 'admin' : 'user';
            return (
              <Card
                key={workspace.id}
                className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50"
                onClick={() => {
                  console.log('[WorkspaceSelection] Card click:', {
                    slug: workspace.slug,
                    userRole: workspace.userRole,
                    routeType,
                  });
                  navigate(`/${routeType}/${workspace.slug}`);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <BuildingIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{workspace.name}</CardTitle>
                      {workspace.description && (
                        <CardDescription className="text-xs truncate">
                          {workspace.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {workspace._count.members} member{workspace._count.members !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {workspace._count.policies} polic
                      {workspace._count.policies !== 1 ? 'ies' : 'y'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {workspace._count.mcpServers} server
                      {workspace._count.mcpServers !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {isOrgOwner && (
            <Button variant="outline" onClick={() => navigate('/global/admin/workspaces')}>
              Manage Workspaces
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleLogout}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
