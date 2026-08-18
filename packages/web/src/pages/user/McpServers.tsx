import type { JSX } from 'react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { UserLayout } from '../../components/layout/UserLayout';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useApplyResetFilters } from '../../hooks/useApplyResetFilters';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'NEEDS_CREDENTIALS', label: 'Needs credentials' },
  { value: 'NO_AUTH', label: 'No auth required' },
] as const;

interface FilterState {
  search: string;
  status: string;
  [key: string]: unknown;
}

function getServerStatus(server: { authType: string; authenticated: boolean }): string {
  if (server.authType === 'NONE') return 'NO_AUTH';
  return server.authenticated ? 'CONNECTED' : 'NEEDS_CREDENTIALS';
}

function getServerStatusLabel(server: { authType: string; authenticated: boolean }): string {
  if (server.authType === 'NONE') return 'No auth required';
  return server.authenticated ? 'Connected' : 'Needs credentials';
}

function formatToolsLabel(tools: Array<{ name: string }>): string {
  if (tools.length === 0) return 'None';
  if (tools.length <= 2) return tools.map((t) => t.name).join(', ');
  return `${tools
    .slice(0, 2)
    .map((t) => t.name)
    .join(', ')}, +${tools.length - 2} more`;
}

export default function UserMcpServers(): JSX.Element {
  const navigate = useNavigate();
  const { selectedWorkspaceSlug } = useWorkspace();

  // Build user prefix for routes
  const userPrefix = useMemo(() => {
    if (selectedWorkspaceSlug) return `/user/${selectedWorkspaceSlug}`;
    return '/user';
  }, [selectedWorkspaceSlug]);

  const serversQuery = trpc.user.mcpServers.list.useQuery();
  const toolsQuery = trpc.user.tools.list.useQuery();

  type ServerTools = NonNullable<typeof toolsQuery.data>[number];
  type Tool = ServerTools['tools'][number];

  const { filters, appliedFilters, updateFilter, apply, reset } = useApplyResetFilters<FilterState>(
    {
      initialFilters: { search: '', status: 'ALL' },
    },
  );

  const errors = useMemo(
    () => [serversQuery.error, toolsQuery.error].filter(Boolean),
    [serversQuery.error, toolsQuery.error],
  );

  const toolsByServerId = useMemo(() => {
    const map = new Map<string, Tool[]>();
    if (!toolsQuery.data) return map;

    for (const server of toolsQuery.data) {
      map.set(server.serverId, server.tools);
    }

    return map;
  }, [toolsQuery.data]);

  const filteredServers = useMemo(() => {
    if (!serversQuery.data) return [];
    const search = appliedFilters.search.trim().toLowerCase();
    return serversQuery.data.filter((server) => {
      const matchesSearch =
        !search ||
        server.name.toLowerCase().includes(search) ||
        server.url.toLowerCase().includes(search);
      const status = getServerStatus(server);
      const matchesStatus = appliedFilters.status === 'ALL' || status === appliedFilters.status;
      return matchesSearch && matchesStatus;
    });
  }, [serversQuery.data, appliedFilters]);

  return (
    <UserLayout>
      <div className="space-y-8">
        <PageHeader
          title="MCP Servers"
          description="Browse available MCP servers and review discovered tools."
        />

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load MCP servers</AlertTitle>
            <AlertDescription>{errors[0]?.message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter MCP servers by name or status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  placeholder="Search servers..."
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => updateFilter('status', value)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
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

        <Card>
          <CardHeader>
            <CardTitle>Servers</CardTitle>
            <CardDescription>Available MCP servers and discovered tools.</CardDescription>
          </CardHeader>
          <CardContent>
            {serversQuery.isPending ? (
              <TableSkeleton />
            ) : serversQuery.data && serversQuery.data.length > 0 ? (
              filteredServers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Auth</TableHead>
                      <TableHead>Trusted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tools</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServers.map((server) => {
                      const tools = toolsByServerId.get(server.id) ?? [];
                      return (
                        <TableRow key={server.id}>
                          <TableCell className="font-medium">{server.name}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{server.url}</TableCell>
                          <TableCell className="text-muted-foreground">{server.authType}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {server.trusted ? 'Trusted' : 'Untrusted'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {getServerStatusLabel(server)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {toolsQuery.isPending ? 'Loading...' : formatToolsLabel(tools)}
                          </TableCell>
                          <TableCell>{formatDateTime(server.authenticatedAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`${userPrefix}/credentials`)}
                            >
                              Manage
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="No matching servers"
                  description="Adjust your filters to see MCP servers."
                />
              )
            ) : (
              <EmptyState
                title="No MCP servers available"
                description="Your admin has not configured any servers yet."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </UserLayout>
  );
}
