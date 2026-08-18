/**
 * Legacy Route Redirect Component
 * Redirects old /admin/* and /user/* routes to /select-workspace
 */

import { Navigate, useLocation } from 'react-router';

export function LegacyRouteRedirect() {
  const location = useLocation();

  // For development/debugging, log the redirect
  if (import.meta.env.DEV) {
    console.log(`[LegacyRouteRedirect] Redirecting from ${location.pathname} to /select-workspace`);
  }

  return <Navigate to="/select-workspace" replace />;
}
