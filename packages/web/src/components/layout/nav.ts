/**
 * Navigation Configuration
 *
 * This file exports navigation configurations for different views:
 * - Legacy admin nav (adminNavGroups, adminNav) - for backwards compatibility
 * - Global nav (globalNavGroups, globalNav) - for /global/admin/* routes
 * - Workspace nav functions - for /admin/:workspaceSlug/* and /user/:workspaceSlug/* routes
 */

import type { NavGroup, NavItem } from './AppShell';
import {
  globalCompulsoryNavItems as globalCompulsoryNavItemsImported,
  globalNavGroups as globalNavGroupsImported,
  globalPolicySubpages as globalPolicySubpagesImported,
  globalSettingsSubpages as globalSettingsSubpagesImported,
} from './globalNav';
import {
  getWorkspaceAgentSubpages as getWorkspaceAgentSubpagesImported,
  getWorkspaceCompulsoryNavItems as getWorkspaceCompulsoryNavItemsImported,
  getWorkspaceNavGroups as getWorkspaceNavGroupsImported,
  getWorkspacePolicySubpages as getWorkspacePolicySubpagesImported,
  getWorkspaceSettingsSubpages as getWorkspaceSettingsSubpagesImported,
  getWorkspaceToolsSubpages as getWorkspaceToolsSubpagesImported,
} from './workspaceNav';

export type { NavGroup };

// =============================================================================
// Shared Constants
// =============================================================================

/** Policy subpages that should highlight the Policies nav item (legacy routes) */
export const policySubpages = [
  { to: '/admin/policy-playground', label: 'Policy Test' },
  { to: '/admin/policy-conflicts', label: 'Policy Conflicts' },
  { to: '/admin/policy-assertions', label: 'Policy Assertions' },
];

/** Tools subpages that should highlight the Tools nav item (legacy routes) */
export const toolsSubpages = [{ to: '/admin/sensitive-flags', label: 'Tool Flags' }];

/** Settings subpages accessible via command palette (legacy routes) */
export const settingsSubpages = [
  { to: '/admin/settings', label: 'Settings: Appearance' },
  { to: '/admin/settings/navigation', label: 'Settings: Navigation' },
  { to: '/admin/settings/organization', label: 'Settings: Organization' },
  { to: '/admin/settings/owners', label: 'Settings: Org Owners' },
  { to: '/admin/settings/system', label: 'Settings: System' },
  { to: '/admin/settings/variables', label: 'Settings: Global Variables' },
  { to: '/admin/settings/advanced', label: 'Settings: Advanced' },
  { to: '/admin/settings/admin-mcp', label: 'Settings: Admin MCP' },
];

/** Additional pages not in main nav but accessible via command palette */
export const additionalPages = [
  { to: '/admin/a2a-agents', label: 'A2A Agents' },
  { to: '/admin/deleted-items', label: 'Deleted Items' },
];

/** Items that cannot be hidden from navigation (legacy routes) */
export const compulsoryNavItems = ['/admin', '/admin/policies', '/admin/settings'];

// =============================================================================
// Legacy Admin Navigation (backwards compatibility)
// =============================================================================

export const adminNavGroups: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [{ to: '/admin', label: 'Dashboard', end: true }],
    standalone: true,
  },
  {
    label: 'Organization',
    items: [{ to: '/admin/workspaces', label: 'Workspaces' }],
  },
  {
    label: 'People',
    items: [
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/roles', label: 'Roles' },
      { to: '/admin/agents', label: 'Agents' },
      { to: '/admin/publishers', label: 'Publishers' },
    ],
    defaultOpen: true,
  },
  {
    label: 'Access Control',
    items: [
      { to: '/admin/policies', label: 'Policies', relatedPaths: policySubpages.map((p) => p.to) },
      { to: '/admin/proposals', label: 'Policy Proposals' },
      { to: '/admin/requests', label: 'Requests', relatedPaths: ['/admin/mcp-requests'] },
      { to: '/admin/mcp-confirmations', label: 'MCP Confirmations' },
    ],
  },
  {
    label: 'Servers & Tools',
    items: [
      { to: '/admin/mcp-servers', label: 'Servers' },
      { to: '/admin/tools', label: 'Tools', relatedPaths: toolsSubpages.map((p) => p.to) },
      { to: '/admin/credentials', label: 'Credentials' },
    ],
  },
  {
    label: 'Activity',
    items: [
      { to: '/admin/audit', label: 'Audit Log' },
      { to: '/admin/action-log', label: 'Admin Actions' },
      { to: '/admin/sessions', label: 'Sessions' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/admin/webhooks', label: 'Webhooks' },
      { to: '/admin/settings', label: 'Settings' },
    ],
  },
];

/** Flat array for backwards compatibility */
export const adminNav: NavItem[] = adminNavGroups.flatMap((group) => group.items);

export const userNav: NavItem[] = [
  { to: '/user', label: 'Dashboard', end: true },
  { to: '/user/mcp-servers', label: 'MCP Servers' },
  { to: '/user/credentials', label: 'Credentials' },
  { to: '/user/tools', label: 'Tools' },
  { to: '/user/audit', label: 'Audit' },
  { to: '/user/requests', label: 'Requests', relatedPaths: ['/user/mcp-requests'] },
  { to: '/user/approvals', label: 'Live Approvals' },
];

// =============================================================================
// Re-exports for Global and Workspace Navigation
// =============================================================================

export {
  globalCompulsoryNavItems,
  globalNav,
  globalNavGroups,
  globalPolicySubpages,
  globalSettingsSubpages,
} from './globalNav';

export {
  getWorkspaceAgentSubpages,
  getWorkspaceCompulsoryNavItems,
  getWorkspaceNav,
  getWorkspaceNavGroups,
  getWorkspacePolicySubpages,
  getWorkspaceSettingsSubpages,
  getWorkspaceToolsSubpages,
  getWorkspaceUserNav,
} from './workspaceNav';

// =============================================================================
// Workspace-Aware Navigation Helper Functions
// =============================================================================

/**
 * View types for navigation
 */
export type ViewType = 'legacy' | 'global' | 'workspace';

/**
 * Determines the view type from the current URL path
 *
 * NEW routing pattern:
 * - /admin/:workspaceSlug/* - workspace admin view (includes agent at /admin/:workspaceSlug/agent/*)
 * - /user/:workspaceSlug/* - workspace user view
 */
export function getViewTypeFromPath(pathname: string): ViewType {
  if (pathname.startsWith('/global/')) {
    return 'global';
  }
  // Check if path starts with /admin/ or /user/ followed by a workspace slug
  // Pattern: /(admin|user)/:workspaceSlug/*
  // Workspace slug is lowercase alphanumeric with hyphens
  const workspaceSlugMatch = pathname.match(/^\/(admin|user)\/([a-z0-9][a-z0-9-]*)/);
  if (workspaceSlugMatch) {
    return 'workspace';
  }
  return 'legacy';
}

/**
 * Extracts workspace slug from URL path
 * Returns null if not in workspace view
 *
 * NEW routing pattern:
 * - /admin/:workspaceSlug/* - workspace slug is second segment (includes agent at /admin/:workspaceSlug/agent/*)
 * - /user/:workspaceSlug/* - workspace slug is second segment
 */
export function getWorkspaceSlugFromPath(pathname: string): string | null {
  // Pattern: /(admin|user)/:workspaceSlug/*
  // Workspace slug is the SECOND segment after admin/user
  const match = pathname.match(/^\/(admin|user)\/([a-z0-9][a-z0-9-]*)/);
  return match ? match[2] : null;
}

/**
 * Creates policy subpages for a given context
 */
export function getPolicySubpagesForContext(
  viewType: ViewType,
  workspaceSlug?: string,
): Array<{ to: string; label: string }> {
  if (viewType === 'global') {
    return globalPolicySubpagesImported;
  }
  if (viewType === 'workspace' && workspaceSlug) {
    return getWorkspacePolicySubpagesImported(workspaceSlug);
  }
  return policySubpages;
}

/**
 * Creates settings subpages for a given context
 */
export function getSettingsSubpagesForContext(
  viewType: ViewType,
  workspaceSlug?: string,
): Array<{ to: string; label: string }> {
  if (viewType === 'global') {
    return globalSettingsSubpagesImported;
  }
  if (viewType === 'workspace' && workspaceSlug) {
    return getWorkspaceSettingsSubpagesImported(workspaceSlug);
  }
  return settingsSubpages;
}

/**
 * Creates tools subpages for a given context
 */
export function getToolsSubpagesForContext(
  viewType: ViewType,
  workspaceSlug?: string,
): Array<{ to: string; label: string }> {
  if (viewType === 'workspace' && workspaceSlug) {
    return getWorkspaceToolsSubpagesImported(workspaceSlug);
  }
  return toolsSubpages;
}

/**
 * Creates agent subpages for a given context
 * Agent is only available at workspace level
 */
export function getAgentSubpagesForContext(
  viewType: ViewType,
  workspaceSlug?: string,
): Array<{ to: string; label: string }> {
  if (viewType === 'workspace' && workspaceSlug) {
    return getWorkspaceAgentSubpagesImported(workspaceSlug);
  }
  return [];
}

/**
 * Creates navigation groups for a given context
 */
export function getNavGroupsForContext(viewType: ViewType, workspaceSlug?: string): NavGroup[] {
  if (viewType === 'global') {
    return globalNavGroupsImported;
  }
  if (viewType === 'workspace' && workspaceSlug) {
    return getWorkspaceNavGroupsImported(workspaceSlug);
  }
  return adminNavGroups;
}

/**
 * Creates compulsory nav items for a given context
 */
export function getCompulsoryNavItemsForContext(
  viewType: ViewType,
  workspaceSlug?: string,
): string[] {
  if (viewType === 'global') {
    return globalCompulsoryNavItemsImported;
  }
  if (viewType === 'workspace' && workspaceSlug) {
    return getWorkspaceCompulsoryNavItemsImported(workspaceSlug);
  }
  return compulsoryNavItems;
}

/**
 * Creates user navigation items for a given context
 */
export function getUserNavForContext(viewType: ViewType, workspaceSlug?: string): NavItem[] {
  if (viewType === 'workspace' && workspaceSlug) {
    // Workspace-scoped user routes: /user/:workspaceSlug/*
    const prefix = `/user/${workspaceSlug}`;
    return [
      { to: prefix, label: 'Dashboard', end: true },
      { to: `${prefix}/mcp-servers`, label: 'MCP Servers' },
      { to: `${prefix}/credentials`, label: 'Credentials' },
      { to: `${prefix}/tools`, label: 'Tools' },
      { to: `${prefix}/audit`, label: 'Audit' },
      { to: `${prefix}/requests`, label: 'Requests', relatedPaths: [`${prefix}/mcp-requests`] },
      { to: `${prefix}/approvals`, label: 'Live Approvals' },
    ];
  }
  // Legacy user routes (fallback)
  return userNav;
}
