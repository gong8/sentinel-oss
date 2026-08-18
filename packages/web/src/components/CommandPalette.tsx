import { Command } from 'cmdk';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';

import { getIsAdmin } from '../lib/auth';
import { fuzzySearch, type SearchableItem } from '../lib/fuzzy-search';
import { cn } from '../lib/utils';
import {
  getAgentSubpagesForContext,
  getNavGroupsForContext,
  getPolicySubpagesForContext,
  getSettingsSubpagesForContext,
  getUserNavForContext,
  getViewTypeFromPath,
  getWorkspaceSlugFromPath,
  type NavGroup,
  type ViewType,
} from './layout/nav';

interface CommandItem extends SearchableItem {
  group: string;
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SubpageItem {
  to: string;
  label: string;
}

/** Additional pages not in main nav but accessible via command palette (varies by context) */
function getAdditionalPagesForContext(viewType: ViewType, workspaceSlug?: string): SubpageItem[] {
  if (viewType === 'global') {
    // Global view has no additional pages currently
    return [];
  }
  if (viewType === 'workspace' && workspaceSlug) {
    // Workspace view has no additional pages currently
    return [];
  }
  // Legacy view
  return [
    { to: '/admin/a2a-agents', label: 'A2A Agents' },
    { to: '/admin/deleted-items', label: 'Deleted Items' },
  ];
}

function generateAdminNavigationCommands(
  navGroups: NavGroup[],
  policySubpages: SubpageItem[],
  settingsSubpages: SubpageItem[],
  additionalPages: SubpageItem[],
  navigate: ReturnType<typeof useNavigate>,
): CommandItem[] {
  const commands: CommandItem[] = [];

  for (const group of navGroups) {
    for (const item of group.items) {
      commands.push({
        id: `nav-${item.to}`,
        label: item.label,
        group: group.label,
        keywords: [item.label.toLowerCase(), group.label.toLowerCase()],
        action: () => navigate(item.to),
      });
    }
  }

  // Add policy subpages under Access Control group
  for (const subpage of policySubpages) {
    commands.push({
      id: `nav-${subpage.to}`,
      label: subpage.label,
      group: 'Access Control',
      keywords: [subpage.label.toLowerCase(), 'policy', 'policies'],
      action: () => navigate(subpage.to),
    });
  }

  // Add settings subpages under Settings group
  for (const subpage of settingsSubpages) {
    commands.push({
      id: `nav-${subpage.to}`,
      label: subpage.label,
      group: 'Settings',
      keywords: [subpage.label.toLowerCase(), 'settings', 'preferences', 'configuration'],
      action: () => navigate(subpage.to),
    });
  }

  // Add additional pages that aren't in main nav
  for (const page of additionalPages) {
    commands.push({
      id: `nav-${page.to}`,
      label: page.label,
      group: 'Other',
      keywords: [page.label.toLowerCase()],
      action: () => navigate(page.to),
    });
  }

  return commands;
}

function generateUserNavigationCommands(
  userNavItems: Array<{ to: string; label: string }>,
  navigate: ReturnType<typeof useNavigate>,
): CommandItem[] {
  return userNavItems.map((item) => ({
    id: `nav-${item.to}`,
    label: item.label,
    group: 'Navigation',
    keywords: [item.label.toLowerCase()],
    action: () => navigate(item.to),
  }));
}

/** Action commands with their tier requirements */
interface ActionCommand {
  id: string;
  label: string;
  keywords: string[];
  /** Route suffix after /admin prefix, e.g., '/users' for /admin/users */
  routeSuffix: string;
  state?: Record<string, unknown>;
  /** If true, this action is only available in workspace view */
  workspaceOnly?: boolean;
  /** If true, this action is only available in global or legacy view */
  globalOrLegacyOnly?: boolean;
}

const ALL_ACTION_COMMANDS: ActionCommand[] = [
  {
    id: 'action-create-user',
    label: 'Create user',
    keywords: ['new user', 'add user', 'invite', 'member'],
    routeSuffix: '/users',
    state: { openCreateModal: true },
  },
  {
    id: 'action-create-agent',
    label: 'Create agent',
    keywords: ['new agent', 'add agent', 'mcp agent'],
    routeSuffix: '/agents',
    state: { openCreateModal: true },
  },
  {
    id: 'action-create-role',
    label: 'Create role',
    keywords: ['new role', 'add role', 'permission'],
    routeSuffix: '/roles',
    globalOrLegacyOnly: true, // Roles not available in workspace view
  },
  {
    id: 'action-create-policy',
    label: 'Create policy',
    keywords: ['new policy', 'add policy', 'rule', 'permission'],
    routeSuffix: '/policies',
    state: { openCreateModal: true },
  },
  {
    id: 'action-add-mcp-server',
    label: 'Add MCP server',
    keywords: ['new server', 'connect server', 'create server', 'mcp'],
    routeSuffix: '/mcp-servers',
    state: { openCreateModal: true },
  },
  {
    id: 'action-register-a2a-agent',
    label: 'Register A2A agent',
    keywords: ['new a2a', 'add a2a', 'agent to agent', 'a2a agent'],
    routeSuffix: '/a2a-agents',
    state: { openCreateModal: true },
    globalOrLegacyOnly: true, // A2A agents not available in workspace view
  },
  {
    id: 'action-add-publisher',
    label: 'Add publisher',
    keywords: ['new publisher', 'register publisher', 'trusted publisher', 'attestation'],
    routeSuffix: '/publishers',
    state: { openCreateModal: true },
    globalOrLegacyOnly: true, // Publishers not available in workspace view
  },
  {
    id: 'action-create-webhook',
    label: 'Create webhook',
    keywords: ['new webhook', 'add webhook', 'notification', 'discord', 'slack'],
    routeSuffix: '/webhooks',
    state: { openCreateModal: true },
    globalOrLegacyOnly: true, // Webhooks not available in workspace view
  },
  {
    id: 'action-create-sensitive-flag',
    label: 'Create sensitive flag',
    keywords: ['new flag', 'sensitive tool', 'risk', 'approval', 'rate limit'],
    routeSuffix: '/sensitive-flags',
    state: { openCreateModal: true },
  },
  {
    id: 'action-view-audit',
    label: 'View recent audit logs',
    keywords: ['audit', 'logs', 'history', 'activity', 'see'],
    routeSuffix: '/audit',
  },
];

function generateAdminActionCommands(
  navigate: ReturnType<typeof useNavigate>,
  adminPrefix: string,
  viewType: ViewType,
): CommandItem[] {
  return ALL_ACTION_COMMANDS.filter((cmd) => {
    // Filter by view type
    if (cmd.workspaceOnly && viewType !== 'workspace') {
      return false;
    }
    if (cmd.globalOrLegacyOnly && viewType === 'workspace') {
      return false;
    }
    return true;
  }).map((cmd) => ({
    id: cmd.id,
    label: cmd.label,
    group: 'Actions',
    keywords: cmd.keywords,
    action: () =>
      navigate(`${adminPrefix}${cmd.routeSuffix}`, cmd.state ? { state: cmd.state } : undefined),
  }));
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Check admin status to filter commands appropriately
  const isAdmin = getIsAdmin();

  // Detect view type and workspace slug from URL
  const viewType = React.useMemo(() => getViewTypeFromPath(location.pathname), [location.pathname]);
  const workspaceSlug = React.useMemo(
    () => getWorkspaceSlugFromPath(location.pathname),
    [location.pathname],
  );

  // Build admin prefix based on context
  // NEW pattern: /admin/:workspaceSlug/* instead of /:workspaceSlug/admin/*
  const adminPrefix = React.useMemo(() => {
    if (viewType === 'global') {
      return '/global/admin';
    }
    if (viewType === 'workspace' && workspaceSlug) {
      return `/admin/${workspaceSlug}`;
    }
    return '/admin'; // Fallback to legacy
  }, [viewType, workspaceSlug]);

  // Get context-aware navigation items
  const contextNavGroups = React.useMemo(
    () => getNavGroupsForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );

  const contextPolicySubpages = React.useMemo(
    () => getPolicySubpagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );

  const contextSettingsSubpages = React.useMemo(
    () => getSettingsSubpagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );

  const contextAgentSubpages = React.useMemo(
    () => getAgentSubpagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );

  // Get context-aware additional pages
  const additionalPages = React.useMemo(
    () => getAdditionalPagesForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );

  // Get context-aware user navigation (workspace-scoped routes)
  const contextUserNav = React.useMemo(
    () => getUserNavForContext(viewType, workspaceSlug ?? undefined),
    [viewType, workspaceSlug],
  );

  const allCommands = React.useMemo(() => {
    if (isAdmin) {
      // Admin users see full navigation and action commands
      const navigationCommands = generateAdminNavigationCommands(
        contextNavGroups,
        contextPolicySubpages,
        contextSettingsSubpages,
        additionalPages,
        navigate,
      );
      const actionCommands = generateAdminActionCommands(navigate, adminPrefix, viewType);

      // Add agent subpages for workspace view
      const agentCommands: CommandItem[] = contextAgentSubpages.map((subpage) => ({
        id: `nav-${subpage.to}`,
        label: subpage.label,
        group: 'Agent',
        keywords: [subpage.label.toLowerCase(), 'agent', 'settings'],
        action: () => navigate(subpage.to),
      }));

      return [...actionCommands, ...navigationCommands, ...agentCommands];
    } else {
      // Non-admin users only see user navigation (workspace-scoped)
      return generateUserNavigationCommands(contextUserNav, navigate);
    }
  }, [
    navigate,
    isAdmin,
    adminPrefix,
    viewType,
    contextNavGroups,
    contextPolicySubpages,
    contextSettingsSubpages,
    additionalPages,
    contextAgentSubpages,
    contextUserNav,
  ]);

  // Use custom fuzzy search
  const filteredResults = React.useMemo(() => {
    const results = fuzzySearch(searchQuery, allCommands);
    return results.map((r) => r.item);
  }, [searchQuery, allCommands]);

  // Group filtered results
  const groupedCommands = React.useMemo(() => {
    const groups = new Map<string, CommandItem[]>();

    for (const cmd of filteredResults) {
      const existing = groups.get(cmd.group) ?? [];
      existing.push(cmd);
      groups.set(cmd.group, existing);
    }

    return groups;
  }, [filteredResults]);

  const handleSelect = React.useCallback(
    (commandId: string) => {
      const command = allCommands.find((cmd) => cmd.id === commandId);
      if (command) {
        command.action();
        onOpenChange(false);
        setSearchQuery('');
      }
    },
    [allCommands, onOpenChange],
  );

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open) {
      setSearchQuery('');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-background/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Command dialog */}
      <div className="fixed left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2 px-4">
        <Command
          className="rounded-lg border border-border/70 bg-card/95 shadow-xl backdrop-blur"
          shouldFilter={false}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
              onOpenChange(false);
            }
          }}
        >
          <Command.Input
            ref={inputRef}
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Type a command or search..."
            className="w-full border-b border-border/50 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            {filteredResults.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              <>
                {/* Actions group first */}
                {groupedCommands.has('Actions') && (
                  <Command.Group
                    heading="Actions"
                    className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {groupedCommands.get('Actions')?.map((cmd) => (
                      <Command.Item
                        key={cmd.id}
                        value={cmd.id}
                        onSelect={handleSelect}
                        className={cn(
                          'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none',
                          'data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground',
                          'text-muted-foreground',
                        )}
                      >
                        {cmd.label}
                        {cmd.shortcut && (
                          <span className="ml-auto text-xs text-muted-foreground/70">
                            {cmd.shortcut}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* Navigation groups */}
                {Array.from(groupedCommands.entries())
                  .filter(([group]) => group !== 'Actions')
                  .map(([group, commands]) => (
                    <Command.Group
                      key={group}
                      heading={group}
                      className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-muted-foreground"
                    >
                      {commands.map((cmd) => (
                        <Command.Item
                          key={cmd.id}
                          value={cmd.id}
                          onSelect={handleSelect}
                          className={cn(
                            'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none',
                            'data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground',
                            'text-muted-foreground',
                          )}
                        >
                          {cmd.label}
                          {cmd.shortcut && (
                            <span className="ml-auto text-xs text-muted-foreground/70">
                              {cmd.shortcut}
                            </span>
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ))}
              </>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
