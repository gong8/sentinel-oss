import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getAccessToken } from '../lib/auth';
import { trpc, type RouterOutputs } from '../lib/trpc';

type Workspace = RouterOutputs['user']['workspaces']['list'][number];

interface WorkspaceContextValue {
  workspaces: Workspace[] | undefined;
  /** Workspace slug from URL, or null for global view (/global/*) */
  selectedWorkspaceSlug: string | null;
  /** Workspace ID resolved from slug */
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;
  /** Navigate to a different workspace or global view */
  setSelectedWorkspace: (workspace: Workspace | null) => void;
  isLoading: boolean;
  isOrgOwner: boolean;
  /** True when on /global/* routes */
  isGlobalView: boolean;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

/**
 * Extract workspace slug from URL path
 * Supports patterns: /admin/:workspaceSlug/*, /user/:workspaceSlug/*
 * Agent mode is a sub-route: /admin/:workspaceSlug/agent/*
 * Returns null for /global/* routes (org-wide view)
 */
function getWorkspaceSlugFromPath(pathname: string): string | null {
  // Global routes - org-wide view
  if (pathname.startsWith('/global/')) {
    return null;
  }

  // Match /admin/:workspaceSlug/* or /user/:workspaceSlug/*
  // Slug is the SECOND segment after admin/user
  // Agent mode is now under /admin/:workspaceSlug/agent/*, so still extracted correctly
  const match = pathname.match(/^\/(admin|user)\/([a-z0-9][a-z0-9-]*)/i);
  if (match) {
    return match[2];
  }

  return null;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  // Only fetch when authenticated to avoid UNAUTHORIZED errors on login page
  const hasToken = Boolean(getAccessToken());
  const location = useLocation();
  const navigate = useNavigate();

  const workspacesQuery = trpc.user.workspaces.list.useQuery(undefined, {
    staleTime: 30000,
    enabled: hasToken,
  });
  const profileQuery = trpc.user.profile.get.useQuery(undefined, {
    staleTime: 60000,
    enabled: hasToken,
  });

  const isOrgOwner = profileQuery.data?.isOrgOwner ?? false;
  const workspaces = workspacesQuery.data;

  // Derive workspace slug from URL
  const isGlobalView = location.pathname.startsWith('/global/');
  const urlWorkspaceSlug = getWorkspaceSlugFromPath(location.pathname);

  // Find workspace by slug
  const selectedWorkspace = React.useMemo(() => {
    if (isGlobalView || !urlWorkspaceSlug || !workspaces) {
      return null;
    }
    return workspaces.find((w) => w.slug === urlWorkspaceSlug && w.deletedAt === null) ?? null;
  }, [isGlobalView, urlWorkspaceSlug, workspaces]);

  const selectedWorkspaceSlug = isGlobalView ? null : urlWorkspaceSlug;
  const selectedWorkspaceId = selectedWorkspace?.id ?? null;

  // Navigate to a different workspace or global view
  const setSelectedWorkspace = React.useCallback(
    (workspace: Workspace | null) => {
      // Non-org-owners cannot select null (global view)
      if (workspace === null && !isOrgOwner) {
        return;
      }

      // Extract the current route type and suffix from URL pattern
      // Pattern: /admin/:workspaceSlug/* or /user/:workspaceSlug/*
      // Agent mode: /admin/:workspaceSlug/agent/*
      // Global: /global/admin/* or /global/user/*
      let routeType = 'admin';
      let routeSuffix = '';
      let isAgentMode = false;

      // Try workspace route pattern: /(admin|user)/:workspaceSlug/*
      const workspaceMatch = location.pathname.match(
        /^\/(admin|user)\/[a-z0-9][a-z0-9-]*(\/.*)?$/i,
      );
      if (workspaceMatch) {
        routeType = workspaceMatch[1];
        routeSuffix = workspaceMatch[2] ?? '';
        // Check if we're in agent mode (suffix starts with /agent)
        isAgentMode = routeSuffix.startsWith('/agent');
      } else {
        // Try global route pattern: /global/(admin|user)/*
        const globalMatch = location.pathname.match(/^\/global\/(admin|user)(\/.*)?$/i);
        if (globalMatch) {
          routeType = globalMatch[1];
          routeSuffix = globalMatch[2] ?? '';
        }
      }

      if (workspace === null) {
        // Navigate to global view - agent mode doesn't apply to global view
        // Strip /agent prefix from suffix if present
        const globalSuffix = isAgentMode ? routeSuffix.replace(/^\/agent/, '') : routeSuffix;
        navigate(`/global/${routeType}${globalSuffix}`);
      } else {
        // Navigate to workspace view using pattern: /routeType/:slug/*
        // Preserve agent mode when switching workspaces
        navigate(`/${routeType}/${workspace.slug}${routeSuffix}`);
      }
    },
    [isOrgOwner, location.pathname, navigate],
  );

  const value = React.useMemo(
    () => ({
      workspaces,
      selectedWorkspaceSlug,
      selectedWorkspaceId,
      selectedWorkspace,
      setSelectedWorkspace,
      isLoading: workspacesQuery.isPending || profileQuery.isPending,
      isOrgOwner,
      isGlobalView,
    }),
    [
      workspaces,
      selectedWorkspaceSlug,
      selectedWorkspaceId,
      selectedWorkspace,
      setSelectedWorkspace,
      workspacesQuery.isPending,
      profileQuery.isPending,
      isOrgOwner,
      isGlobalView,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
