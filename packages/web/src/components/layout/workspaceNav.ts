/**
 * Workspace View Navigation Configuration
 *
 * Full sidebar for workspace admins/members managing workspace-specific resources.
 * Route: /admin/:workspaceSlug/*
 */

import type { NavGroup, NavItem } from './AppShell';

/**
 * Creates policy-related subpages with workspace prefix
 */
export function getWorkspacePolicySubpages(workspaceSlug: string) {
  const prefix = `/admin/${workspaceSlug}`;
  return [
    { to: `${prefix}/policy-playground`, label: 'Policy Test' },
    { to: `${prefix}/policy-conflicts`, label: 'Policy Conflicts' },
    { to: `${prefix}/policy-assertions`, label: 'Policy Assertions' },
  ];
}

/**
 * Creates tools-related subpages with workspace prefix
 */
export function getWorkspaceToolsSubpages(workspaceSlug: string) {
  const prefix = `/admin/${workspaceSlug}`;
  return [{ to: `${prefix}/sensitive-flags`, label: 'Tool Flags' }];
}

/**
 * Creates settings subpages with workspace prefix
 */
export function getWorkspaceSettingsSubpages(workspaceSlug: string) {
  const prefix = `/admin/${workspaceSlug}`;
  return [
    { to: `${prefix}/settings`, label: 'Workspace Settings' },
    { to: `${prefix}/settings/navigation`, label: 'Settings: Navigation' },
    { to: `${prefix}/settings/chat`, label: 'Settings: Chat' },
  ];
}

/**
 * Creates agent-related subpages with workspace prefix
 */
export function getWorkspaceAgentSubpages(workspaceSlug: string) {
  const prefix = `/admin/${workspaceSlug}/agent`;
  return [{ to: `${prefix}/settings`, label: 'Agent Settings' }];
}

/**
 * Creates compulsory nav items that cannot be hidden
 */
export function getWorkspaceCompulsoryNavItems(workspaceSlug: string): string[] {
  const prefix = `/admin/${workspaceSlug}`;
  return [`${prefix}`, `${prefix}/policies`, `${prefix}/settings`];
}

/**
 * Creates navigation groups for workspace view
 *
 * Sections:
 * - Dashboard
 * - People (Users, Agents)
 * - Access Control (Policies, Requests)
 * - Resources (MCP Servers, Tools, Credentials)
 * - Activity (Audit Log)
 * - Settings (Workspace Settings)
 *
 * @param workspaceSlug - The workspace slug for URL prefixing
 */
export function getWorkspaceNavGroups(workspaceSlug: string): NavGroup[] {
  const prefix = `/admin/${workspaceSlug}`;
  const policySubpages = getWorkspacePolicySubpages(workspaceSlug);
  const toolsSubpages = getWorkspaceToolsSubpages(workspaceSlug);

  return [
    {
      label: 'Dashboard',
      items: [{ to: prefix, label: 'Dashboard', end: true }],
      standalone: true,
    },
    {
      label: 'People',
      items: [
        { to: `${prefix}/users`, label: 'Users' },
        { to: `${prefix}/roles`, label: 'Roles' },
        { to: `${prefix}/agents`, label: 'Agents' },
        { to: `${prefix}/publishers`, label: 'Publishers' },
      ],
      defaultOpen: true,
    },
    {
      label: 'Access Control',
      items: [
        {
          to: `${prefix}/policies`,
          label: 'Policies',
          relatedPaths: policySubpages.map((p) => p.to),
        },
        { to: `${prefix}/proposals`, label: 'Policy Proposals' },
        { to: `${prefix}/requests`, label: 'Requests', relatedPaths: [`${prefix}/mcp-requests`] },
        { to: `${prefix}/mcp-confirmations`, label: 'MCP Confirmations' },
      ],
      defaultOpen: true,
    },
    {
      label: 'Resources',
      items: [
        { to: `${prefix}/mcp-servers`, label: 'MCP Servers' },
        { to: `${prefix}/tools`, label: 'Tools', relatedPaths: toolsSubpages.map((p) => p.to) },
        { to: `${prefix}/credentials`, label: 'Credentials' },
      ],
    },
    {
      label: 'Activity',
      items: [
        { to: `${prefix}/audit`, label: 'Audit Log' },
        { to: `${prefix}/action-log`, label: 'Admin Actions' },
        { to: `${prefix}/sessions`, label: 'Sessions' },
      ],
    },
    {
      label: 'Settings',
      items: [
        { to: `${prefix}/webhooks`, label: 'Webhooks' },
        { to: `${prefix}/settings`, label: 'Settings' },
      ],
    },
  ];
}

/**
 * Creates flat array of workspace nav items
 */
export function getWorkspaceNav(workspaceSlug: string): NavItem[] {
  return getWorkspaceNavGroups(workspaceSlug).flatMap((group) => group.items);
}

/**
 * Creates user navigation items for workspace view
 * Route: /user/:workspaceSlug/*
 *
 * @param workspaceSlug - The workspace slug for URL prefixing
 */
export function getWorkspaceUserNav(workspaceSlug: string): NavItem[] {
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
