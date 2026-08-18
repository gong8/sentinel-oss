/**
 * Navigation Hook
 *
 * Resolves navigation for the current URL context (global, workspace, or user view).
 */

import { useMemo } from 'react';
import { useLocation } from 'react-router';

import {
  getAgentSubpagesForContext,
  getNavGroupsForContext,
  getPolicySubpagesForContext,
  getSettingsSubpagesForContext,
  getToolsSubpagesForContext,
  getUserNavForContext,
  getViewTypeFromPath,
  getWorkspaceSlugFromPath,
  type ViewType,
} from '../components/layout/nav';

export function useNav() {
  const location = useLocation();

  // Determine view type and workspace slug from current path
  const viewType: ViewType = useMemo(
    () => getViewTypeFromPath(location.pathname),
    [location.pathname],
  );
  const workspaceSlug = useMemo(
    () => getWorkspaceSlugFromPath(location.pathname),
    [location.pathname],
  );

  const navGroups = useMemo(
    () => getNavGroupsForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );
  const userNav = useMemo(
    () => getUserNavForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );
  const policySubpages = useMemo(
    () => getPolicySubpagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );
  const toolsSubpages = useMemo(
    () => getToolsSubpagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );
  const settingsSubpages = useMemo(
    () => getSettingsSubpagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );
  const agentSubpages = useMemo(
    () => getAgentSubpagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );

  return {
    navGroups,
    userNav,
    policySubpages,
    toolsSubpages,
    settingsSubpages,
    agentSubpages,
    viewType,
    workspaceSlug,
  };
}
