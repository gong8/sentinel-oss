/**
 * Workspace Protected Route Component
 * Validates:
 * 1. User is authenticated
 * 2. User has access to workspace in URL (member OR org owner)
 * 3. For /global/* routes: user is org owner
 *
 * Route patterns supported:
 * - /admin/:workspaceSlug/* - Admin routes scoped to workspace
 * - /admin/:workspaceSlug/agent/* - Agent routes (nested under admin)
 * - /user/:workspaceSlug/* - User routes scoped to workspace
 * - /global/admin/* - Global view (org owners only)
 */

import { TRPCClientError } from '@trpc/client';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { clearAccessToken, getAccessToken, setIsAdmin } from '../../lib/auth';
import { trpc } from '../../lib/trpc';

interface WorkspaceProtectedRouteProps {
  children: ReactNode;
  /** If true, requires org owner access (for /global/* routes) */
  requireOrgOwner?: boolean;
}

type ValidationStatus =
  | 'pending'
  | 'valid'
  | 'invalid'
  | 'non-admin'
  | 'no-workspace-access'
  | 'not-org-owner';

type RouteType = 'admin' | 'user' | 'agent' | 'unknown';

interface ValidationState {
  workspaceSlug: string | null;
  routeType: RouteType;
  status: ValidationStatus;
}

/**
 * Determines the route type from the pathname.
 * URL patterns:
 * - /admin/:workspaceSlug/agent/* → 'agent' (agent routes nested under admin)
 * - /admin/:workspaceSlug/* → 'admin' (regular admin routes)
 * - /user/:workspaceSlug/* → 'user'
 * - /global/admin/* → 'admin' (org owner global view)
 */
function getRouteType(pathname: string): RouteType {
  // Split path and get segments
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  // Handle /global/admin/* pattern
  if (firstSegment === 'global' && segments[1] === 'admin') {
    return 'admin';
  }

  // Handle /admin/:workspaceSlug/agent/* pattern
  // segments[0] = 'admin', segments[1] = workspaceSlug, segments[2] = 'agent'
  if (firstSegment === 'admin' && segments[2] === 'agent') {
    return 'agent';
  }

  // Regular admin routes: /admin/:workspaceSlug/*
  if (firstSegment === 'admin') return 'admin';

  // User routes: /user/:workspaceSlug/*
  if (firstSegment === 'user') return 'user';

  return 'unknown';
}

export function WorkspaceProtectedRoute({
  children,
  requireOrgOwner = false,
}: WorkspaceProtectedRouteProps) {
  const token = getAccessToken();
  const location = useLocation();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  // Track validation state
  const [validation, setValidation] = useState<ValidationState>({
    workspaceSlug: null,
    routeType: 'unknown',
    status: 'pending',
  });

  const currentRouteType = getRouteType(location.pathname);

  // Store mutate function in ref to avoid dependency array issues
  const mutateRef = useRef<((vars: { accessToken: string }) => void) | null>(null);

  // Check if revalidation is needed:
  // - Workspace slug changed (different workspace)
  // - Route type changed (admin vs user vs agent - important for permission checks)
  // - First load (status is pending)
  // NOTE: We don't revalidate on every pathname change within the same route type,
  // which prevents the "refresh" feeling when switching sidebar tabs
  // IMPORTANT: Normalize workspaceSlug to null for comparison (undefined from useParams -> null)
  const normalizedWorkspaceSlug = workspaceSlug ?? null;
  const needsRevalidation =
    validation.workspaceSlug !== normalizedWorkspaceSlug ||
    validation.routeType !== currentRouteType ||
    validation.status === 'pending';
  const effectiveStatus = needsRevalidation ? 'pending' : validation.status;

  // Fetch workspaces to check access
  const workspacesQuery = trpc.user.workspaces.list.useQuery(undefined, {
    enabled: Boolean(token),
    staleTime: 30000,
  });

  // Fetch profile to check org owner status
  const profileQuery = trpc.user.profile.get.useQuery(undefined, {
    enabled: Boolean(token),
    staleTime: 60000,
  });

  const validateToken = trpc.auth.validateToken.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        // Update localStorage with server-verified value
        setIsAdmin(data.isAdmin);

        // For global routes, require org owner
        if (requireOrgOwner && !profileQuery.data?.isOrgOwner) {
          setValidation({
            workspaceSlug: workspaceSlug ?? null,
            routeType: currentRouteType,
            status: 'not-org-owner',
          });
          return;
        }

        // For workspace routes, validate workspace access by slug
        if (workspaceSlug && !requireOrgOwner) {
          const isOrgOwner = profileQuery.data?.isOrgOwner ?? false;
          const workspaces = workspacesQuery.data ?? [];
          const hasWorkspaceAccess =
            isOrgOwner || workspaces.some((w) => w.slug === workspaceSlug && w.deletedAt === null);

          if (!hasWorkspaceAccess) {
            setValidation({
              workspaceSlug: workspaceSlug ?? null,
              routeType: currentRouteType,
              status: 'no-workspace-access',
            });
            return;
          }
        }

        // Check admin status for admin routes
        // User can access admin routes if:
        // - They are org-level admin (data.isAdmin), OR
        // - They are workspace admin for this specific workspace (adminWorkspaceIds), OR
        // - They are org owner
        if (currentRouteType === 'admin') {
          const allWorkspaces = workspacesQuery.data ?? [];
          const workspace = allWorkspaces.find(
            (w) => w.slug === workspaceSlug && w.deletedAt === null,
          );
          const workspaceId = workspace?.id;
          const isWorkspaceAdmin = workspaceId && data.adminWorkspaceIds.includes(workspaceId);
          const canAccessAdminRoutes = data.isAdmin || data.isOrgOwner || isWorkspaceAdmin;

          console.log('[WorkspaceProtectedRoute] Admin check:', {
            workspaceSlug,
            workspaceId,
            isAdmin: data.isAdmin,
            isOrgOwner: data.isOrgOwner,
            adminWorkspaceIds: data.adminWorkspaceIds,
            isWorkspaceAdmin,
            canAccessAdminRoutes,
          });

          if (!canAccessAdminRoutes) {
            setValidation({
              workspaceSlug: workspaceSlug ?? null,
              routeType: currentRouteType,
              status: 'non-admin',
            });
            return;
          }
        }

        setValidation({
          workspaceSlug: workspaceSlug ?? null,
          routeType: currentRouteType,
          status: 'valid',
        });
      } else {
        clearAccessToken();
        setValidation({
          workspaceSlug: workspaceSlug ?? null,
          routeType: currentRouteType,
          status: 'invalid',
        });
      }
    },
    onError: (error) => {
      const isAuthError =
        error instanceof TRPCClientError &&
        (error.data?.code === 'UNAUTHORIZED' || error.data?.code === 'FORBIDDEN');

      if (isAuthError) {
        clearAccessToken();
        setValidation({
          workspaceSlug: workspaceSlug ?? null,
          routeType: currentRouteType,
          status: 'invalid',
        });
      }
    },
  });

  // Keep ref in sync with latest mutate function
  useLayoutEffect(() => {
    mutateRef.current = validateToken.mutate;
  });

  // Validate when dependencies are ready
  // Guards: needsRevalidation, has token, queries finished, not already validating
  const shouldValidate =
    needsRevalidation &&
    token &&
    !workspacesQuery.isPending &&
    !profileQuery.isPending &&
    !validateToken.isPending;

  useEffect(() => {
    if (shouldValidate) {
      mutateRef.current?.({ accessToken: token });
    }
  }, [shouldValidate, token]);

  // No token - redirect to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Wait for data to load
  if (workspacesQuery.isPending || profileQuery.isPending || effectiveStatus === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (effectiveStatus === 'invalid') {
    return <Navigate to="/login" replace />;
  }

  if (effectiveStatus === 'non-admin') {
    console.log('[WorkspaceProtectedRoute] Redirecting non-admin to /select-workspace');
    return <Navigate to="/select-workspace" replace />;
  }

  if (effectiveStatus === 'no-workspace-access') {
    return <Navigate to="/select-workspace" replace />;
  }

  if (effectiveStatus === 'not-org-owner') {
    return <Navigate to="/select-workspace" replace />;
  }

  return <>{children}</>;
}
