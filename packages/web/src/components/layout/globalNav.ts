/**
 * Global View Navigation Configuration
 *
 * Limited sidebar for org owners managing organization-wide resources.
 * Route: /global/admin/*
 */

import type { NavGroup, NavItem } from './AppShell';

/** Policy Proposals subpages for global view */
export const globalPolicySubpages = [
  { to: '/global/admin/policy-playground', label: 'Policy Test' },
  { to: '/global/admin/policy-conflicts', label: 'Policy Conflicts' },
  { to: '/global/admin/policy-assertions', label: 'Policy Assertions' },
];

/** Settings subpages for global view */
export const globalSettingsSubpages = [
  { to: '/global/admin/settings', label: 'Settings: Appearance' },
  { to: '/global/admin/settings/navigation', label: 'Settings: Navigation' },
  { to: '/global/admin/settings/organization', label: 'Settings: Organization' },
  { to: '/global/admin/settings/owners', label: 'Settings: Org Owners' },
  { to: '/global/admin/settings/system', label: 'Settings: System' },
  { to: '/global/admin/settings/variables', label: 'Settings: Global Variables' },
  { to: '/global/admin/settings/advanced', label: 'Settings: Advanced' },
  { to: '/global/admin/settings/admin-mcp', label: 'Settings: Admin MCP' },
];

/** Items that cannot be hidden from global navigation */
export const globalCompulsoryNavItems = [
  '/global/admin',
  '/global/admin/policies',
  '/global/admin/settings',
];

/**
 * Navigation groups for global view (org owners only)
 *
 * Sections:
 * - Dashboard
 * - Organization (Workspaces, Org Owners)
 * - Global Access Control (Global Policies, Policy Proposals with badge)
 * - Global Resources (Global MCP Servers, Global Variables)
 * - Activity (Audit Log, Admin Actions)
 * - Settings
 */
export const globalNavGroups: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [{ to: '/global/admin', label: 'Dashboard', end: true }],
    standalone: true,
  },
  {
    label: 'Organization',
    items: [
      { to: '/global/admin/workspaces', label: 'Workspaces' },
      { to: '/global/admin/settings/owners', label: 'Org Owners' },
    ],
    defaultOpen: true,
  },
  {
    label: 'Global Access Control',
    items: [
      {
        to: '/global/admin/policies',
        label: 'Global Policies',
        relatedPaths: globalPolicySubpages.map((p) => p.to),
      },
      { to: '/global/admin/proposals', label: 'Policy Proposals' },
    ],
    defaultOpen: true,
  },
  {
    label: 'Global Resources',
    items: [{ to: '/global/admin/mcp-servers', label: 'Global MCP Servers' }],
  },
  {
    label: 'Activity',
    items: [
      { to: '/global/admin/audit', label: 'Audit Log' },
      { to: '/global/admin/action-log', label: 'Admin Actions' },
    ],
  },
  {
    label: 'Settings',
    items: [{ to: '/global/admin/settings', label: 'Settings' }],
  },
];

/** Flat array of global nav items */
export const globalNav: NavItem[] = globalNavGroups.flatMap((group) => group.items);
