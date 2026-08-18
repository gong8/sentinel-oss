import type { JSX } from 'react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { UserLayout } from '../../components/layout/UserLayout';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { AllowDenyBadge } from '../../components/ui/allow-deny-toggle';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { SensitiveFlagBadge } from '../../components/ui/sensitive-flag-badge';
import { useApplyResetFilters } from '../../hooks/useApplyResetFilters';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatToolNameForDisplay, getDomainPrefix } from '../../lib/mcpUtils';
import { trpc } from '../../lib/trpc';

interface Tool {
  id: string;
  name: string;
  qualifiedName: string;
  description: string | null;
  access: string;
  justification: string | null;
  blockedByDeny: boolean;
  blockingPolicyId: string | null;
  isFlagged: boolean;
  flagBehaviors: string[];
}

interface ServerTools {
  serverId: string;
  serverName: string;
  serverUrl: string;
  authenticated: boolean;
  authType: 'NONE' | 'API_KEY' | 'OAUTH';
  tools: Tool[];
}

const ACCESS_OPTIONS = ['ALL', 'ALLOWED', 'DENIED'] as const;
type AccessOption = (typeof ACCESS_OPTIONS)[number];

function isAccessOption(value: string): value is AccessOption {
  return (ACCESS_OPTIONS as readonly string[]).includes(value);
}

interface FilterState extends Record<string, unknown> {
  search: string;
  access: AccessOption;
  serverId: string;
}

export default function UserTools(): JSX.Element {
  const navigate = useNavigate();
  const toolsQuery = trpc.user.tools.list.useQuery();
  const { selectedWorkspaceSlug } = useWorkspace();

  // Build user prefix for routes
  const userPrefix = useMemo(() => {
    if (selectedWorkspaceSlug) return `/user/${selectedWorkspaceSlug}`;
    return '/user';
  }, [selectedWorkspaceSlug]);

  const { filters, appliedFilters, updateFilter, apply, reset } = useApplyResetFilters<FilterState>(
    {
      initialFilters: { search: '', access: 'ALL', serverId: 'ALL' },
    },
  );

  function handleRequestTool(tool: Tool): void {
    const params = new URLSearchParams({ toolNames: tool.qualifiedName });
    if (tool.blockedByDeny && tool.blockingPolicyId) {
      params.set('blockedByDeny', 'true');
      params.set('policyId', tool.blockingPolicyId);
    }
    navigate(`${userPrefix}/requests?${params.toString()}`);
  }

  function handleRequestAllTools(serverUrl: string): void {
    const domainPrefix = getDomainPrefix(serverUrl);
    if (domainPrefix) {
      navigate(`${userPrefix}/requests?toolNames=${encodeURIComponent(`${domainPrefix}::*`)}`);
    }
  }

  const serverOptions = useMemo(() => {
    if (!toolsQuery.data) return [];
    return toolsQuery.data.map((s) => ({
      id: s.serverId,
      name: s.serverName,
    }));
  }, [toolsQuery.data]);

  const filteredTools = useMemo(() => {
    if (!toolsQuery.data) return [];

    const result: Array<ServerTools & { tool: Tool }> = [];

    for (const server of toolsQuery.data) {
      for (const tool of server.tools) {
        const searchLower = appliedFilters.search.toLowerCase();
        const matchesSearch =
          !appliedFilters.search ||
          tool.name.toLowerCase().includes(searchLower) ||
          tool.qualifiedName.toLowerCase().includes(searchLower) ||
          (tool.description?.toLowerCase().includes(searchLower) ?? false);

        const matchesAccess =
          appliedFilters.access === 'ALL' || tool.access === appliedFilters.access;

        const matchesServer =
          appliedFilters.serverId === 'ALL' || server.serverId === appliedFilters.serverId;

        if (matchesSearch && matchesAccess && matchesServer) {
          result.push({ ...server, tool });
        }
      }
    }

    return result;
  }, [toolsQuery.data, appliedFilters]);

  const stats = useMemo(() => {
    if (!toolsQuery.data) return { total: 0, allowed: 0, denied: 0 };

    let total = 0;
    let allowed = 0;
    let denied = 0;

    for (const server of toolsQuery.data) {
      for (const tool of server.tools) {
        total++;
        if (tool.access === 'ALLOWED') {
          allowed++;
        } else {
          denied++;
        }
      }
    }

    return { total, allowed, denied };
  }, [toolsQuery.data]);

  const sortedServers = useMemo(() => {
    if (!toolsQuery.data) return [];
    return [...toolsQuery.data].sort((a, b) => {
      if (a.authenticated === b.authenticated) {
        return a.serverName.localeCompare(b.serverName);
      }
      return a.authenticated ? -1 : 1;
    });
  }, [toolsQuery.data]);

  function getServerTools(server: ServerTools): Tool[] {
    return filteredTools
      .filter((ft) => ft.serverId === server.serverId)
      .map((ft) => ft.tool)
      .sort((a, b) => {
        if (a.access === b.access) return a.name.localeCompare(b.name);
        return a.access === 'ALLOWED' ? -1 : 1;
      });
  }

  return (
    <UserLayout>
      <div className="space-y-8">
        <PageHeader
          title="Tools"
          description="View tools available from your registered MCP servers and their access status."
        />

        {toolsQuery.error && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load tools</AlertTitle>
            <AlertDescription>{toolsQuery.error.message}</AlertDescription>
          </Alert>
        )}

        {toolsQuery.isPending ? (
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="h-5 w-32 rounded bg-muted" />
                  <div className="h-4 w-48 rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-10 w-full rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : toolsQuery.data && toolsQuery.data.length > 0 ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="border-b-0 bg-transparent pb-2">
                  <CardDescription>Total Tools</CardDescription>
                  <CardTitle className="text-3xl">{stats.total}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="border-b-0 bg-transparent pb-2">
                  <CardDescription>Allowed</CardDescription>
                  <CardTitle className="text-3xl text-primary">{stats.allowed}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="border-b-0 bg-transparent pb-2">
                  <CardDescription>Denied</CardDescription>
                  <CardTitle className="text-3xl text-destructive">{stats.denied}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
                <CardDescription>Filter tools by name, access status, or server</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="search">Search</Label>
                    <Input
                      id="search"
                      placeholder="Search tools..."
                      value={filters.search}
                      onChange={(e) => updateFilter('search', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="access">Access</Label>
                    <Select
                      value={filters.access}
                      onValueChange={(value) =>
                        updateFilter('access', isAccessOption(value) ? value : 'ALL')
                      }
                    >
                      <SelectTrigger id="access">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCESS_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="server">Server</Label>
                    <Select
                      value={filters.serverId}
                      onValueChange={(value) => updateFilter('serverId', value)}
                    >
                      <SelectTrigger id="server">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Servers</SelectItem>
                        {serverOptions.map((server) => (
                          <SelectItem key={server.id} value={server.id}>
                            {server.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button type="button" onClick={apply} className="flex-1 sm:flex-none">
                      Apply
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={reset}
                      className="flex-1 sm:flex-none"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {filteredTools.length > 0 ? (
              <div className="space-y-4">
                {sortedServers
                  .map((server) => {
                    const serverTools = getServerTools(server);
                    if (serverTools.length === 0) return null;

                    const hasDeniedTools = serverTools.some((t) => t.access === 'DENIED');

                    return (
                      <Card key={server.serverId}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-lg">{server.serverName}</CardTitle>
                                {!server.authenticated && server.authType !== 'NONE' && (
                                  <Badge variant="outline" className="text-xs">
                                    Not authenticated
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className="text-xs">
                                {serverTools.length} tool{serverTools.length !== 1 ? 's' : ''}
                              </Badge>
                              {hasDeniedTools && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRequestAllTools(server.serverUrl)}
                                  className="text-xs"
                                >
                                  Request All
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {serverTools.map((tool) => (
                              <div
                                key={tool.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/20"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 className="font-medium text-sm">{tool.name}</h4>
                                    <AllowDenyBadge value={tool.access} size="sm" />
                                    {tool.isFlagged && (
                                      <SensitiveFlagBadge
                                        behaviors={tool.flagBehaviors}
                                        size="sm"
                                        showPopover={false}
                                      />
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate mb-1">
                                    {formatToolNameForDisplay(tool.qualifiedName, [
                                      { name: server.serverName, url: server.serverUrl },
                                    ])}
                                  </p>
                                  {tool.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                      {tool.description}
                                    </p>
                                  )}
                                  {tool.justification && (
                                    <p className="text-xs text-destructive mt-1">
                                      {tool.justification}
                                    </p>
                                  )}
                                </div>
                                {tool.access === 'DENIED' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRequestTool(tool)}
                                    className="shrink-0 text-xs"
                                  >
                                    {tool.blockedByDeny ? 'Request Removal' : 'Request'}
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                  .filter(Boolean)}
              </div>
            ) : (
              <EmptyState
                title="No tools match your filters"
                description="Try adjusting your search or filter criteria."
              />
            )}
          </>
        ) : (
          <EmptyState
            title="No tools available"
            description="No MCP servers have been registered or no tools have been discovered yet."
          />
        )}
      </div>
    </UserLayout>
  );
}
