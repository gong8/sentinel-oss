/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 * Validates admin status via API for admin/user routes (not just localStorage)
 * - Non-admins trying to access /admin/* are redirected to /user/mcp-servers
 * - Admins trying to access /user/* are redirected to /admin
 */

import { TRPCClientError } from '@trpc/client';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { clearAccessToken, getAccessToken, setIsAdmin } from '../../lib/auth';
import { trpc } from '../../lib/trpc';

interface ProtectedRouteProps {
  children: ReactNode;
}

type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'non-admin' | 'admin-on-user-route';

interface ValidationState {
  pathname: string | null;
  status: ValidationStatus;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = getAccessToken();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isUserRoute = location.pathname.startsWith('/user');
  const requiresValidation = isAdminRoute || isUserRoute;

  // Track validation state with the route type it was validated for (admin vs user)
  const [validation, setValidation] = useState<ValidationState>({
    pathname: null,
    status: requiresValidation ? 'pending' : 'valid',
  });

  // Store mutate function in ref to avoid dependency array issues
  const mutateRef = useRef<((vars: { accessToken: string }) => void) | null>(null);

  // Only revalidate when switching between admin/user route types, not on every page change
  const currentRouteType = isAdminRoute ? 'admin' : isUserRoute ? 'user' : null;
  const validatedRouteType = validation.pathname?.startsWith('/admin')
    ? 'admin'
    : validation.pathname?.startsWith('/user')
      ? 'user'
      : null;
  const needsRevalidation = requiresValidation && currentRouteType !== validatedRouteType;
  const effectiveStatus = needsRevalidation ? 'pending' : validation.status;

  const validateToken = trpc.auth.validateToken.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        // Update localStorage with server-verified value
        setIsAdmin(data.isAdmin);
        if (isAdminRoute && !data.isAdmin) {
          // Non-admin trying to access admin route
          setValidation({ pathname: location.pathname, status: 'non-admin' });
        } else if (isUserRoute && data.isAdmin) {
          // Admin trying to access user route
          setValidation({ pathname: location.pathname, status: 'admin-on-user-route' });
        } else {
          setValidation({ pathname: location.pathname, status: 'valid' });
        }
      } else {
        // Invalid token - clear storage and redirect to login
        clearAccessToken();
        setValidation({ pathname: location.pathname, status: 'invalid' });
      }
    },
    onError: (error) => {
      // Only clear token on actual authentication errors, not network errors
      // (e.g., aborted requests during navigation should not clear token)
      const isAuthError =
        error instanceof TRPCClientError &&
        (error.data?.code === 'UNAUTHORIZED' || error.data?.code === 'FORBIDDEN');

      if (isAuthError) {
        clearAccessToken();
        setValidation({ pathname: location.pathname, status: 'invalid' });
      }
      // For non-auth errors (like aborted requests), don't change state
      // The token is still valid, we just couldn't verify it
    },
  });

  // Keep ref in sync with latest mutate function (useLayoutEffect runs before useEffect)
  useLayoutEffect(() => {
    mutateRef.current = validateToken.mutate;
  });

  // Guard: only validate if needed and not already validating
  const shouldValidate = needsRevalidation && token && !validateToken.isPending;

  useEffect(() => {
    // Validate for admin and user routes when pathname changes
    if (shouldValidate) {
      mutateRef.current?.({ accessToken: token });
    }
  }, [shouldValidate, token]);

  // No token - redirect to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // For admin and user routes, wait for server validation
  if (requiresValidation) {
    if (effectiveStatus === 'pending') {
      // Show loading state while validating
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
      // Non-admin trying to access admin route - redirect to workspace selection
      return <Navigate to="/select-workspace" replace />;
    }

    if (effectiveStatus === 'admin-on-user-route') {
      // Admin trying to access user route - redirect to workspace selection
      return <Navigate to="/select-workspace" replace />;
    }
  }

  return <>{children}</>;
}
