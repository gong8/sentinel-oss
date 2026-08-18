/**
 * AuditDetail Page
 * Full-page detail view for a single audit log entry
 * Shows flow pipeline, policy parse tree, and context information
 */

import type { PolicyEvaluationTree } from '@sentinel/shared';
import { ArrowLeft, FlaskConical, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { FlowPipeline, PolicyParseTree } from '../../components/audit';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';
import { getDecisionBadgeValue } from '../../lib/typeGuards';

// Type guard for evaluation tree
function isEvaluationTree(value: unknown): value is PolicyEvaluationTree {
  if (!value || typeof value !== 'object') return false;
  const tree = value as Record<string, unknown>;
  return (
    typeof tree.timestamp === 'string' &&
    typeof tree.toolName === 'string' &&
    'pipeline' in tree &&
    'policies' in tree &&
    typeof tree.decision === 'string'
  );
}

export default function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mcpServers, formatToolNameFriendly } = useMcpServers();
  const utils = trpc.useUtils();
  const usersQuery = trpc.admin.users.list.useQuery();
  const users = usersQuery.data;
  const { selectedWorkspaceSlug, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  // Fetch the audit entry
  const entryQuery = trpc.admin.auditLogEntries.get.useQuery({ id: id ?? '' }, { enabled: !!id });

  // Create assertion state
  const [createAssertionOpen, setCreateAssertionOpen] = useState(false);
  const [assertionName, setAssertionName] = useState('');
  const [assertionDescription, setAssertionDescription] = useState('');
  const [expectedDecision, setExpectedDecision] = useState<'ALLOWED' | 'DENIED'>('ALLOWED');

  const createAssertionMutation = trpc.admin.policyAssertions.createFromAuditLog.useMutation({
    onSuccess: () => {
      utils.admin.policyAssertions.list.invalidate();
      setCreateAssertionOpen(false);
      setAssertionName('');
      setAssertionDescription('');
    },
  });

  const handleResimulate = () => {
    if (!entryQuery.data) return;

    const localEntry = entryQuery.data;
    const toolParts = String(localEntry.toolName).split('::');
    if (toolParts.length === 2) {
      const [serverPart, toolPart] = toolParts;
      // Find MCP server by domain
      const server = mcpServers?.find((s) => {
        try {
          const url = new URL(s.url);
          const domain = url.hostname;
          const port = url.port ? `:${url.port}` : '';
          return `${domain}${port}` === serverPart;
        } catch {
          return false;
        }
      });

      if (server) {
        // Find user by email if userId not available
        let userId: string | null = localEntry.userId;
        if (!userId && localEntry.userEmail) {
          const user = users?.find((u) => u.email === localEntry.userEmail);
          userId = user?.id ?? null;
        }

        navigate(`${adminPrefix}/policy-playground`, {
          state: {
            resimulate: {
              mcpServer: serverPart,
              tool: toolPart,
              userId: userId || undefined,
              agentId: localEntry.agentId || undefined,
            },
          },
        });
      }
    }
  };

  if (entryQuery.isPending) {
    return (
      <AdminLayout>
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (entryQuery.error) {
    return (
      <AdminLayout>
        <div className="space-y-8">
          <Button
            variant="ghost"
            onClick={() => navigate(`${adminPrefix}/audit`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Audit Log
          </Button>
          <Alert variant="destructive">
            <AlertTitle>Failed to load audit entry</AlertTitle>
            <AlertDescription>{entryQuery.error.message}</AlertDescription>
          </Alert>
        </div>
      </AdminLayout>
    );
  }

  // Extract entry data - cast to unknown first to avoid deep type instantiation issues
  const entry = entryQuery.data;
  const entryAny = entry as {
    id: string;
    toolName: string;
    decision: string;
    justification: string | null;
    timestamp: unknown;
    userEmail: string | null;
    userId: string | null;
    userRoles: string[];
    agentName: string | null;
    agentId: string | null;
    mcpServerName: string | null;
    parameters: unknown;
    evaluationTree: unknown;
    approvalRequired: boolean;
    approvalStatus: string | null;
    approvalDecidedByEmail: string | null;
    approvalDecidedAt: unknown;
    user: { email: string } | null;
    agent: { name: string } | null;
  };
  const evaluationTree = isEvaluationTree(entryAny.evaluationTree) ? entryAny.evaluationTree : null;
  const userEmail = entryAny.userEmail || entryAny.user?.email || 'Unknown';
  const userRoles = entryAny.userRoles || [];
  const agentName = entryAny.agentName || entryAny.agent?.name;
  const decision = String(entryAny.decision);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(`${adminPrefix}/audit`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Audit Log
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateAssertionOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Assertion
            </Button>
            <Button onClick={handleResimulate} className="gap-2">
              <FlaskConical className="h-4 w-4" />
              Resimulate
            </Button>
          </div>
        </div>

        <PageHeader
          title={formatToolNameFriendly(entryAny.toolName)}
          description={`${userEmail}${agentName ? ` (${agentName})` : ''} • ${formatDateTime(String(entryAny.timestamp))}`}
        />

        {/* Decision Banner */}
        <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-4">
          <AllowDenyBadge value={getDecisionBadgeValue(decision)} size="lg" />
          <div className="flex-1">
            {entryAny.justification ? (
              <p className="text-sm text-muted-foreground">{entryAny.justification}</p>
            ) : null}
          </div>
          {entryAny.approvalRequired ? (
            <Badge
              variant={
                entryAny.approvalStatus === 'APPROVED'
                  ? 'outline'
                  : entryAny.approvalStatus === 'DENIED' ||
                      entryAny.approvalStatus === 'EXPIRED' ||
                      entryAny.approvalStatus === 'CANCELLED'
                    ? 'destructive'
                    : 'secondary'
              }
            >
              {entryAny.approvalStatus || 'Approval Required'}
            </Badge>
          ) : null}
        </div>

        {/* Flow Pipeline */}
        {evaluationTree?.pipeline ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Flow Pipeline</CardTitle>
              <CardDescription>The journey of this tool call through the system</CardDescription>
            </CardHeader>
            <CardContent>
              <FlowPipeline
                stages={evaluationTree.pipeline.stages}
                interruptedAt={evaluationTree.pipeline.interruptedAt}
                interruptionReason={evaluationTree.pipeline.interruptionReason}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Policy Parse Tree */}
        {evaluationTree ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy Evaluation Tree</CardTitle>
              <CardDescription>
                How each policy was evaluated to reach the final decision
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PolicyParseTree evaluationTree={evaluationTree} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy Evaluation</CardTitle>
              <CardDescription>
                Detailed evaluation data not available for this entry
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This audit log entry was created before evaluation tree tracking was enabled.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Context Information */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* User/Agent Context */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">User</span>
                <span className="font-medium">{userEmail}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Roles</span>
                <span className="font-medium">
                  {userRoles.length > 0 ? userRoles.join(', ') : 'None'}
                </span>
              </div>
              {agentName ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Agent</span>
                  <span className="font-medium">{agentName}</span>
                </div>
              ) : null}
              {entryAny.mcpServerName ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">MCP Server</span>
                  <span className="font-medium">{entryAny.mcpServerName}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Evaluation Context */}
          {evaluationTree?.evaluationContext ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evaluation Context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {evaluationTree.evaluationContext.context?.hourOfDay !== undefined ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hour of Day</span>
                    <span className="font-medium font-mono">
                      {evaluationTree.evaluationContext.context.hourOfDay}
                    </span>
                  </div>
                ) : null}
                {evaluationTree.evaluationContext.context?.dayOfWeek !== undefined ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Day of Week</span>
                    <span className="font-medium font-mono">
                      {evaluationTree.evaluationContext.context.dayOfWeek}
                    </span>
                  </div>
                ) : null}
                {evaluationTree.evaluationContext.context?.sourceIp ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Source IP</span>
                    <span className="font-medium font-mono">
                      {evaluationTree.evaluationContext.context.sourceIp}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Parameters */}
        {entryAny.parameters &&
        typeof entryAny.parameters === 'object' &&
        Object.keys(entryAny.parameters).length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parameters</CardTitle>
              <CardDescription>Arguments passed to the tool call</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg bg-muted p-4 text-xs">
                {JSON.stringify(entryAny.parameters, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : null}

        {/* Trust Check */}
        {evaluationTree?.trustCheck ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trust Check</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Server Trusted</span>
                <Badge
                  variant={evaluationTree.trustCheck.serverTrusted ? 'default' : 'destructive'}
                >
                  {evaluationTree.trustCheck.serverTrusted ? 'Yes' : 'No'}
                </Badge>
              </div>
              {evaluationTree.trustCheck.serverName ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Server</span>
                  <span className="font-medium">{evaluationTree.trustCheck.serverName}</span>
                </div>
              ) : null}
              {evaluationTree.trustCheck.reason ? (
                <div className="text-sm">
                  <span className="text-muted-foreground">Reason: </span>
                  <span>{evaluationTree.trustCheck.reason}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Flag Check */}
        {evaluationTree?.flagCheck ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Flag Evaluation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Flags Triggered</span>
                <span className="font-medium">
                  {evaluationTree.flagCheck.matchedFlagIds.length}
                </span>
              </div>
              {evaluationTree.flagCheck.flagBehaviors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {evaluationTree.flagCheck.flagBehaviors.map((behavior: string, idx: number) => (
                    <Badge key={idx} variant="secondary">
                      {behavior}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {evaluationTree.flagCheck.rateLimitHit ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rate Limit Hit</span>
                  <Badge variant="destructive">Yes</Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Live Approval Info */}
        {entryAny.approvalRequired ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant={
                    entryAny.approvalStatus === 'APPROVED'
                      ? 'default'
                      : entryAny.approvalStatus === 'DENIED' ||
                          entryAny.approvalStatus === 'EXPIRED' ||
                          entryAny.approvalStatus === 'CANCELLED'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {entryAny.approvalStatus || 'PENDING'}
                </Badge>
              </div>
              {entryAny.approvalDecidedByEmail ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Decided By</span>
                  <span className="font-medium">{entryAny.approvalDecidedByEmail}</span>
                </div>
              ) : null}
              {entryAny.approvalDecidedAt ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Decided At</span>
                  <span className="font-medium">
                    {formatDateTime(String(entryAny.approvalDecidedAt))}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Create Assertion Dialog */}
      <Dialog open={createAssertionOpen} onOpenChange={setCreateAssertionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Policy Assertion</DialogTitle>
            <DialogDescription>
              Create a persistent assertion from this audit log entry to validate future policy
              changes.
            </DialogDescription>
          </DialogHeader>

          {createAssertionMutation.error ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to create assertion</AlertTitle>
              <AlertDescription>{createAssertionMutation.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="assertion-name">Name</Label>
              <Input
                id="assertion-name"
                placeholder="e.g., Admin can access GitHub"
                value={assertionName}
                onChange={(e) => setAssertionName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assertion-description">Description (optional)</Label>
              <Input
                id="assertion-description"
                placeholder="Describe what this assertion validates"
                value={assertionDescription}
                onChange={(e) => setAssertionDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Expected Decision</Label>
              <Select
                value={expectedDecision}
                onValueChange={(value) => setExpectedDecision(value as 'ALLOWED' | 'DENIED')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALLOWED">ALLOWED</SelectItem>
                  <SelectItem value="DENIED">DENIED</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Original decision: {decision}</p>
            </div>

            <div className="rounded-md border border-border bg-muted p-3">
              <div className="text-sm font-medium">Entry Details</div>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                <div>Tool: {formatToolNameFriendly(entryAny.toolName)}</div>
                <div>
                  Context:{' '}
                  {agentName ? `Agent: ${agentName}` : userEmail ? `User: ${userEmail}` : 'Unknown'}
                </div>
                <div>Timestamp: {formatDateTime(String(entryAny.timestamp))}</div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateAssertionOpen(false)}
              disabled={createAssertionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                createAssertionMutation.mutate({
                  auditLogEntryId: entryAny.id,
                  name: assertionName,
                  description: assertionDescription || undefined,
                  expectedDecision,
                });
              }}
              disabled={createAssertionMutation.isPending || !assertionName.trim()}
            >
              {createAssertionMutation.isPending ? 'Creating...' : 'Create Assertion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
