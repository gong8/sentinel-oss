import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ViewAsSelector, ViewAsSummary } from '../../components/admin/ViewAsSelector';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { ToolsPageLayout } from '../../components/layout/ToolsPageLayout';
import { ClassificationOverrideDialog } from '../../components/mcp/ClassificationOverrideDialog';
import {
  ToolClassificationBadges,
  ToolClassificationSummary,
  type ToolAccessType,
  type ToolClassification,
  type ToolRiskLevel,
} from '../../components/mcp/ToolClassificationBadges';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
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
import { TooltipProvider } from '../../components/ui/tooltip';
import { useViewAsContext } from '../../hooks/useViewAsContext';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { trpc } from '../../lib/trpc';

interface Tool {
  id: string;
  name: string;
  description: string | null;
}

type ClassificationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

interface McpServerItem {
  id: string;
  name: string;
  url: string;
  trusted: boolean;
  tools?: Tool[];
  classificationStatus?: ClassificationStatus;
  classificationStartedAt?: string | null;
  classificationError?: string | null;
}

function getServers<
  T extends Array<{
    id: string;
    name: string;
    url: string;
    trusted: boolean;
    tools?: Tool[];
    classificationStatus?: ClassificationStatus;
    classificationStartedAt?: string | null;
    classificationError?: string | null;
  }>,
>(data: T | undefined): McpServerItem[] | undefined {
  return data;
}

// Classification is considered stale if it's been IN_PROGRESS for more than 2 minutes
const STALE_CLASSIFICATION_MS = 2 * 60 * 1000;

function isClassificationStale(startedAt: string | null | undefined): boolean {
  if (!startedAt) return false;
  const startTime = new Date(startedAt).getTime();
  return Date.now() - startTime > STALE_CLASSIFICATION_MS;
}

type FlaggedFilter = 'ALL' | 'FLAGGED' | 'UNFLAGGED';
type RiskLevelFilter = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNCLASSIFIED';

interface Filters {
  search: string;
  serverId: string;
  flaggedStatus: FlaggedFilter;
  riskLevel: RiskLevelFilter;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  serverId: 'ALL',
  flaggedStatus: 'ALL',
  riskLevel: 'ALL',
};

export default function AdminTools(): React.ReactElement {
  const { selectedWorkspaceId } = useWorkspace();
  const serversQuery = trpc.admin.mcpServers.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const servers = getServers(serversQuery.data);
  const toolFlagStatusQuery = trpc.admin.mcpServers.getToolsWithFlagStatus.useQuery();
  const classificationSummaryQuery = trpc.admin.toolClassifications.getSummary.useQuery();

  const viewAs = useViewAsContext();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Override dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<{
    id: string;
    name: string;
    classification: ToolClassification | null;
  } | null>(null);

  const utils = trpc.useUtils();

  const overrideMutation = trpc.admin.toolClassifications.override.useMutation({
    onSuccess: () => {
      setOverrideDialogOpen(false);
      setSelectedTool(null);
      utils.admin.toolClassifications.getSummary.invalidate();
      utils.admin.toolClassifications.getAll.invalidate();
      utils.admin.mcpServers.list.invalidate();
    },
  });

  const resetMutation = trpc.admin.toolClassifications.resetToAuto.useMutation({
    onSuccess: () => {
      setOverrideDialogOpen(false);
      setSelectedTool(null);
      utils.admin.toolClassifications.getSummary.invalidate();
      utils.admin.toolClassifications.getAll.invalidate();
      utils.admin.mcpServers.list.invalidate();
    },
  });

  const classifyUnclassifiedMutation =
    trpc.admin.toolClassifications.classifyUnclassified.useMutation({
      onSuccess: () => {
        utils.admin.toolClassifications.getSummary.invalidate();
        utils.admin.toolClassifications.getAll.invalidate();
        utils.admin.mcpServers.list.invalidate();
      },
    });

  // Check if any server has classification in progress
  const hasClassificationInProgress = useMemo(() => {
    return servers?.some((s) => s.classificationStatus === 'IN_PROGRESS') ?? false;
  }, [servers]);

  // Poll for updates when classification is in progress
  useEffect(() => {
    if (!hasClassificationInProgress) return;

    const interval = setInterval(() => {
      utils.admin.mcpServers.list.invalidate();
      utils.admin.toolClassifications.getSummary.invalidate();
      utils.admin.toolClassifications.getAll.invalidate();
    }, 3000);

    return () => clearInterval(interval);
  }, [hasClassificationInProgress, utils]);

  const toolAccessQuery = trpc.admin.mcpServers.getToolAccessForUser.useQuery(
    {
      userId: viewAs.viewAsType === 'user' ? viewAs.viewAsId : undefined,
      agentId: viewAs.viewAsType === 'agent' ? viewAs.viewAsId : undefined,
      roleId: viewAs.viewAsType === 'role' ? viewAs.viewAsId : undefined,
    },
    { enabled: viewAs.isEnabled },
  );

  const handleApply = () => setAppliedFilters(filters);
  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  // Server options for filter dropdown
  const serverOptions = useMemo(() => {
    if (!servers) return [];
    return servers.map((s) => ({ id: s.id, name: s.name }));
  }, [servers]);

  // Create map of tool ID to flag info
  const toolFlagMap = useMemo(() => {
    const map = new Map<
      string,
      { isFlagged: boolean; flagBehaviors: Array<'REQUIRE_APPROVAL' | 'RATE_LIMIT' | 'ALERT'> }
    >();
    if (!toolFlagStatusQuery.data?.servers) return map;

    for (const server of toolFlagStatusQuery.data.servers) {
      for (const tool of server.tools) {
        map.set(tool.id, {
          isFlagged: tool.isFlagged,
          flagBehaviors: tool.flagBehaviors,
        });
      }
    }
    return map;
  }, [toolFlagStatusQuery.data]);

  // Fetch all classifications for the organization
  const allClassificationsQuery = trpc.admin.toolClassifications.getAll.useQuery();

  // Create map of tool ID to classification
  const toolClassificationMap = useMemo(() => {
    const map = new Map<string, ToolClassification>();
    if (!allClassificationsQuery.data?.tools) return map;

    for (const tool of allClassificationsQuery.data.tools) {
      if (tool.classification) {
        map.set(tool.id, tool.classification as ToolClassification);
      }
    }
    return map;
  }, [allClassificationsQuery.data]);

  // Filter and flatten tools with access information
  const filteredTools = useMemo(() => {
    if (!servers) return [];

    const result: Array<{
      serverId: string;
      serverName: string;
      tool: Tool;
      access?: {
        decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
        justification: string | null;
      };
    }> = [];

    for (const server of servers) {
      const tools = server.tools ?? [];
      for (const tool of tools) {
        const matchesSearch =
          !appliedFilters.search ||
          tool.name.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
          (tool.description?.toLowerCase().includes(appliedFilters.search.toLowerCase()) ?? false);

        const matchesServer =
          appliedFilters.serverId === 'ALL' || server.id === appliedFilters.serverId;

        const flagInfo = toolFlagMap.get(tool.id);
        const matchesFlagged =
          appliedFilters.flaggedStatus === 'ALL' ||
          (appliedFilters.flaggedStatus === 'FLAGGED' && flagInfo?.isFlagged) ||
          (appliedFilters.flaggedStatus === 'UNFLAGGED' && !flagInfo?.isFlagged);

        const classification = toolClassificationMap.get(tool.id);
        const matchesRiskLevel =
          appliedFilters.riskLevel === 'ALL' ||
          (appliedFilters.riskLevel === 'UNCLASSIFIED' && !classification?.riskLevel) ||
          classification?.riskLevel === appliedFilters.riskLevel;

        if (matchesSearch && matchesServer && matchesFlagged && matchesRiskLevel) {
          const toolAccess = toolAccessQuery.data?.toolAccess.find((ta) => ta.toolId === tool.id);
          result.push({
            serverId: server.id,
            serverName: server.name,
            tool,
            access: toolAccess
              ? { decision: toolAccess.decision, justification: toolAccess.justification }
              : undefined,
          });
        }
      }
    }

    return result;
  }, [servers, appliedFilters, toolAccessQuery.data, toolFlagMap, toolClassificationMap]);

  // Stats
  const stats = useMemo(() => {
    if (!servers) return { total: 0, servers: 0 };

    let total = 0;
    const serversWithTools = new Set<string>();

    for (const server of servers) {
      const tools = server.tools ?? [];
      total += tools.length;
      if (tools.length > 0) serversWithTools.add(server.id);
    }

    return { total, servers: serversWithTools.size };
  }, [servers]);

  // Access counts for ViewAsSummary
  const accessCounts = useMemo(() => {
    const toolAccess = toolAccessQuery.data?.toolAccess ?? [];
    return {
      allowed: toolAccess.filter((ta) => ta.decision === 'ALLOWED').length,
      denied: toolAccess.filter((ta) => ta.decision === 'DENIED').length,
      pendingApproval: toolAccess.filter((ta) => ta.decision === 'PENDING_APPROVAL').length,
    };
  }, [toolAccessQuery.data]);

  return (
    <TooltipProvider>
      <ToolsPageLayout>
        <div className="space-y-8">
          <PageHeader
            title="Tools"
            description="View all tools discovered from your MCP servers."
          />

          {serversQuery.error && (
            <Alert variant="destructive">
              <AlertTitle>Failed to load tools</AlertTitle>
              <AlertDescription>{serversQuery.error.message}</AlertDescription>
            </Alert>
          )}

          {serversQuery.isPending ? (
            <ToolsLoadingSkeleton />
          ) : servers && servers.length > 0 ? (
            <>
              {/* Stats */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <SimpleStatCard label="Total Tools" value={stats.total} />
                <SimpleStatCard label="Servers with Tools" value={stats.servers} />
                {classificationSummaryQuery.data && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Classification Summary</CardDescription>
                      <div className="pt-1">
                        <ToolClassificationSummary stats={classificationSummaryQuery.data} />
                      </div>
                    </CardHeader>
                  </Card>
                )}
              </div>

              {/* View As Selector */}
              <ViewAsSelector
                viewAsType={viewAs.viewAsType}
                viewAsId={viewAs.viewAsId}
                onTypeChange={viewAs.setViewAsType}
                onIdChange={viewAs.setViewAsId}
                onReset={viewAs.reset}
                users={viewAs.users}
                agents={viewAs.agents}
                roles={viewAs.roles}
              />

              {viewAs.displayName && toolAccessQuery.data && (
                <Card>
                  <CardContent className="pt-4">
                    <ViewAsSummary
                      displayName={viewAs.displayName}
                      userRoles={toolAccessQuery.data.user?.roles}
                      accessCounts={accessCounts}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Filters */}
              <ToolFilters
                filters={filters}
                setFilters={setFilters}
                serverOptions={serverOptions}
                onApply={handleApply}
                onReset={handleReset}
              />

              {/* Tools grouped by server */}
              {filteredTools.length > 0 ? (
                <ToolsGroupedByServer
                  servers={servers}
                  filteredTools={filteredTools}
                  toolFlagMap={toolFlagMap}
                  toolClassificationMap={toolClassificationMap}
                  onOverrideClick={(tool, classification) => {
                    setSelectedTool({ id: tool.id, name: tool.name, classification });
                    setOverrideDialogOpen(true);
                  }}
                  onClassifyClick={(serverId) => {
                    classifyUnclassifiedMutation.mutate({ mcpServerId: serverId });
                  }}
                  isClassifying={classifyUnclassifiedMutation.isPending}
                />
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

          {/* Override Dialog */}
          {selectedTool && (
            <ClassificationOverrideDialog
              open={overrideDialogOpen}
              onOpenChange={setOverrideDialogOpen}
              toolName={selectedTool.name}
              currentClassification={selectedTool.classification}
              onSubmit={(values) => {
                overrideMutation.mutate({
                  toolId: selectedTool.id,
                  riskLevel: values.riskLevel as ToolRiskLevel | undefined,
                  accessType: values.accessType as ToolAccessType | undefined,
                  useCases: values.useCases,
                });
              }}
              onReset={() => {
                resetMutation.mutate({ toolId: selectedTool.id });
              }}
              isSubmitting={overrideMutation.isPending}
              isResetting={resetMutation.isPending}
            />
          )}
        </div>
      </ToolsPageLayout>
    </TooltipProvider>
  );
}

// Simple stat card component for local use
function SimpleStatCard({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

// Loading skeleton
function ToolsLoadingSkeleton(): React.ReactElement {
  return (
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
  );
}

// Filters component
interface ToolFiltersProps {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  serverOptions: Array<{ id: string; name: string }>;
  onApply: () => void;
  onReset: () => void;
}

function ToolFilters({
  filters,
  setFilters,
  serverOptions,
  onApply,
  onReset,
}: ToolFiltersProps): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>Filter tools by name or server</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <Input
              id="search"
              placeholder="Search tools..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="server">Server</Label>
            <Select
              value={filters.serverId}
              onValueChange={(value) => setFilters({ ...filters, serverId: value })}
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
          <div className="space-y-2">
            <Label htmlFor="flaggedStatus">Flagged Status</Label>
            <Select
              value={filters.flaggedStatus}
              onValueChange={(value) => {
                if (value === 'ALL' || value === 'FLAGGED' || value === 'UNFLAGGED') {
                  setFilters({ ...filters, flaggedStatus: value });
                }
              }}
            >
              <SelectTrigger id="flaggedStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Tools</SelectItem>
                <SelectItem value="FLAGGED">Flagged Only</SelectItem>
                <SelectItem value="UNFLAGGED">Unflagged Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="riskLevel">Risk Level</Label>
            <Select
              value={filters.riskLevel}
              onValueChange={(value) => {
                if (
                  value === 'ALL' ||
                  value === 'LOW' ||
                  value === 'MEDIUM' ||
                  value === 'HIGH' ||
                  value === 'CRITICAL' ||
                  value === 'UNCLASSIFIED'
                ) {
                  setFilters({ ...filters, riskLevel: value });
                }
              }}
            >
              <SelectTrigger id="riskLevel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Risk Levels</SelectItem>
                <SelectItem value="LOW">Low Risk</SelectItem>
                <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                <SelectItem value="HIGH">High Risk</SelectItem>
                <SelectItem value="CRITICAL">Critical Risk</SelectItem>
                <SelectItem value="UNCLASSIFIED">Unclassified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={onApply}>
            Apply
          </Button>
          <Button type="button" variant="outline" onClick={onReset}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Tools grouped by server
interface ToolsGroupedByServerProps {
  servers: McpServerItem[];
  filteredTools: Array<{
    serverId: string;
    serverName: string;
    tool: Tool;
    access?: {
      decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
      justification: string | null;
    };
  }>;
  toolFlagMap: Map<
    string,
    { isFlagged: boolean; flagBehaviors: Array<'REQUIRE_APPROVAL' | 'RATE_LIMIT' | 'ALERT'> }
  >;
  toolClassificationMap: Map<string, ToolClassification>;
  onOverrideClick: (tool: Tool, classification: ToolClassification | null) => void;
  onClassifyClick: (serverId: string) => void;
  isClassifying: boolean;
}

function ToolsGroupedByServer({
  servers,
  filteredTools,
  toolFlagMap,
  toolClassificationMap,
  onOverrideClick,
  onClassifyClick,
  isClassifying,
}: ToolsGroupedByServerProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {servers
        .map((server) => {
          const serverTools = filteredTools.filter((ft) => ft.serverId === server.id);
          if (serverTools.length === 0) return null;

          // Count unclassified tools for this server
          const unclassifiedCount = serverTools.filter(
            (item) => !toolClassificationMap.has(item.tool.id),
          ).length;

          const isInProgress = server.classificationStatus === 'IN_PROGRESS';
          const hasFailed = server.classificationStatus === 'FAILED';
          const isStale = isInProgress && isClassificationStale(server.classificationStartedAt);
          // Only show as actively classifying if in progress and not stale
          const isActivelyClassifying = isInProgress && !isStale;

          return (
            <Card key={server.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle>{server.name}</CardTitle>
                    {isActivelyClassifying && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Classifying...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unclassifiedCount > 0 && !isActivelyClassifying && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onClassifyClick(server.id)}
                        disabled={isClassifying}
                      >
                        {isStale
                          ? 'Retry Classification'
                          : `Classify Remaining (${unclassifiedCount})`}
                      </Button>
                    )}
                    <Badge variant="secondary">
                      {serverTools.length} tool{serverTools.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
                {hasFailed && server.classificationError && (
                  <CardDescription className="text-destructive mt-1">
                    Classification failed: {server.classificationError}
                  </CardDescription>
                )}
                {isStale && (
                  <CardDescription className="text-yellow-600 dark:text-yellow-400 mt-1">
                    Classification appears to have been interrupted. Click Retry Classification to
                    continue.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {serverTools.map((item) => {
                    const classification = toolClassificationMap.get(item.tool.id) ?? null;
                    return (
                      <ToolCard
                        key={item.tool.id}
                        tool={item.tool}
                        access={item.access}
                        flagInfo={toolFlagMap.get(item.tool.id)}
                        classification={classification}
                        isClassifying={isActivelyClassifying}
                        onOverrideClick={() => onOverrideClick(item.tool, classification)}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
        .filter(Boolean)}
    </div>
  );
}

// Individual tool card
interface ToolCardProps {
  tool: Tool;
  access?: {
    decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
    justification: string | null;
  };
  flagInfo?: {
    isFlagged: boolean;
    flagBehaviors: Array<'REQUIRE_APPROVAL' | 'RATE_LIMIT' | 'ALERT'>;
  };
  classification: ToolClassification | null;
  isClassifying: boolean;
  onOverrideClick: () => void;
}

function ToolCard({
  tool,
  access,
  flagInfo,
  classification,
  isClassifying,
  onOverrideClick,
}: ToolCardProps): React.ReactElement {
  const bgClass = getAccessBgClass(access?.decision);
  const isUnclassifiedAndClassifying = !classification && isClassifying;

  return (
    <div className={`rounded-lg border p-4 transition-colors ${bgClass}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-medium">{tool.name}</h4>
            {flagInfo?.isFlagged && (
              <SensitiveFlagBadge behaviors={flagInfo.flagBehaviors} size="sm" />
            )}
          </div>
        </div>
        {access && <AccessBadge decision={access.decision} />}
      </div>

      {/* Classification badges or classifying indicator */}
      <div className="mb-2">
        {isUnclassifiedAndClassifying ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Classifying...</span>
          </div>
        ) : (
          <ToolClassificationBadges classification={classification} compact />
        )}
      </div>

      {tool.description && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{tool.description}</p>
      )}
      {access?.justification && (
        <p className="mt-2 text-xs italic text-muted-foreground">{access.justification}</p>
      )}

      {/* Override button - only show if classified or not currently classifying */}
      {classification ? (
        <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={onOverrideClick}>
          Edit Classification
        </Button>
      ) : !isClassifying ? (
        <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={onOverrideClick}>
          Classify
        </Button>
      ) : null}
    </div>
  );
}

function getAccessBgClass(decision?: string): string {
  if (!decision) return 'border-border bg-card hover:border-primary/20';

  switch (decision) {
    case 'ALLOWED':
      return 'border-green-600/30 bg-green-50/50 dark:bg-green-950/20';
    case 'PENDING_APPROVAL':
      return 'border-yellow-600/30 bg-yellow-50/50 dark:bg-yellow-950/20';
    case 'DENIED':
      return 'border-red-600/30 bg-red-50/50 dark:bg-red-950/20';
    default:
      return 'border-border bg-card hover:border-primary/20';
  }
}

function AccessBadge({
  decision,
}: {
  decision: 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL';
}): React.ReactElement {
  switch (decision) {
    case 'ALLOWED':
      return (
        <Badge
          variant="outline"
          className="border-green-600 bg-green-600/10 text-green-700 dark:text-green-400"
        >
          Allowed
        </Badge>
      );
    case 'PENDING_APPROVAL':
      return (
        <Badge
          variant="outline"
          className="border-yellow-600 bg-yellow-600/10 text-yellow-700 dark:text-yellow-400"
        >
          Pending Approval
        </Badge>
      );
    case 'DENIED':
      return (
        <Badge
          variant="outline"
          className="border-red-600 bg-red-600/10 text-red-700 dark:text-red-400"
        >
          Denied
        </Badge>
      );
  }
}
