import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AdminLayout } from '../../components/layout/AdminLayout';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { SetPageTitle } from '../../components/layout/PageTitleContext';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { MatcherSelector } from '../../components/policy/MatcherSelector';
import { ToolPatternSelector } from '../../components/policy/ToolPatternSelector';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatShortDate } from '../../lib/format';
import type { MatcherEntry, ToolPatternEntry } from '../../lib/policyUtils';
import { matcherFromUI, toolPatternFromUI } from '../../lib/policyUtils';
import { trpc } from '../../lib/trpc';

// Explicit interface to avoid deep type instantiation with tRPC inference
interface PolicyProposal {
  id: string;
  organizationId: string;
  workspaceId: string;
  proposedById: string;
  matchers: string[];
  toolPatterns: string[];
  effect: string;
  description: string;
  conditions: unknown;
  justification: string;
  status: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdPolicyId: string | null;
  createdAt: string;
  updatedAt: string;
  proposedBy: { id: string; email: string } | null;
  reviewer: { id: string; email: string } | null;
}

// Form schema for creating proposals
const proposalFormSchema = z.object({
  workspaceId: z.string().min(1, 'Please select a workspace'),
  matchers: z
    .array(
      z.object({
        type: z.enum(['all', 'user', 'role', 'agent']),
        value: z.string(),
      }),
    )
    .min(1, 'At least one matcher is required'),
  toolPatterns: z
    .array(
      z.object({
        server: z.string().min(1),
        tool: z.string().min(1),
      }),
    )
    .min(1, 'At least one tool pattern is required'),
  effect: z.enum(['ALLOW', 'DENY']),
  description: z.string().min(4, 'Description must be at least 4 characters'),
  justification: z.string().min(10, 'Please provide a justification (at least 10 characters)'),
});

type ProposalFormValues = z.infer<typeof proposalFormSchema>;

const DEFAULT_FORM_VALUES: ProposalFormValues = {
  workspaceId: '',
  matchers: [{ type: 'role', value: '' }],
  toolPatterns: [{ server: '*', tool: '*' }],
  effect: 'ALLOW',
  description: '',
  justification: '',
};

type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

function getStatusBadgeVariant(status: ProposalStatus): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'PENDING':
      return 'secondary';
    case 'APPROVED':
      return 'default';
    case 'REJECTED':
      return 'destructive';
  }
}

export default function AdminPolicyProposals() {
  const utils = trpc.useUtils();
  const { isOrgOwner, workspaces } = useWorkspace();

  // Queries
  const myProposalsQuery = trpc.admin.policyProposals.list.useQuery();
  const pendingProposalsQuery = trpc.admin.policyProposals.list.useQuery(
    { status: 'PENDING' },
    { enabled: isOrgOwner },
  );
  const usersQuery = trpc.admin.users.list.useQuery();
  const rolesQuery = trpc.admin.roles.list.useQuery();
  const agentsQuery = trpc.admin.agents.list.useQuery();

  // MCP servers for tool pattern selector
  const {
    mcpServers,
    a2aAgents,
    getToolsForServer,
    isToolFlagged,
    getToolFlagCountsForServer,
    toolFlagData,
  } = useMcpServers();

  // Mutations
  const createMutation = trpc.admin.policyProposals.create.useMutation({
    onSuccess: () => {
      utils.admin.policyProposals.list.invalidate();
      setCreateOpen(false);
      form.reset(DEFAULT_FORM_VALUES);
    },
  });

  const approveMutation = trpc.admin.policyProposals.approve.useMutation({
    onSuccess: () => {
      utils.admin.policyProposals.list.invalidate();
      utils.admin.policies.list.invalidate();
      setReviewingProposal(null);
      setReviewNote('');
    },
  });

  const rejectMutation = trpc.admin.policyProposals.reject.useMutation({
    onSuccess: () => {
      utils.admin.policyProposals.list.invalidate();
      setReviewingProposal(null);
      setReviewNote('');
    },
  });

  // State
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewingProposal, setReviewingProposal] = useState<{
    id: string;
    description: string;
    proposedBy: { email: string };
    matchers: string[];
    toolPatterns: string[];
    effect: 'ALLOW' | 'DENY';
    justification: string;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [activeTab, setActiveTab] = useState<string>('my-proposals');

  // Form
  const form = useForm<ProposalFormValues>({
    resolver: zodResolver(proposalFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  // Derived data - explicit types to avoid deep type instantiation
  const myProposals: PolicyProposal[] = myProposalsQuery.data ?? [];
  const pendingProposals: PolicyProposal[] = pendingProposalsQuery.data ?? [];
  const adminWorkspaces = workspaces ?? [];

  function handleCreateSubmit(values: ProposalFormValues) {
    const matchers = values.matchers.map((m) => matcherFromUI(m.type, m.value));
    const toolPatterns = values.toolPatterns.map((tp) => toolPatternFromUI(tp.server, tp.tool));

    createMutation.mutate({
      workspaceId: values.workspaceId,
      matchers,
      toolPatterns,
      effect: values.effect,
      description: values.description,
      justification: values.justification,
    });
  }

  function handleApprove() {
    if (!reviewingProposal) return;
    approveMutation.mutate({
      proposalId: reviewingProposal.id,
      reviewNote: reviewNote || undefined,
    });
  }

  function handleReject() {
    if (!reviewingProposal || !reviewNote.trim()) return;
    rejectMutation.mutate({
      proposalId: reviewingProposal.id,
      reviewNote: reviewNote,
    });
  }

  // Watch form values for controlled components
  const watchedMatchers = form.watch('matchers');
  const watchedToolPatterns = form.watch('toolPatterns');
  const watchedEffect = form.watch('effect');
  const watchedWorkspaceId = form.watch('workspaceId');

  return (
    <AdminLayout>
      <SetPageTitle title="Policy Proposals" description="Review and manage policy proposals." />
      <div className="space-y-6">
        <PageHeader
          title="Policy Proposals"
          description="Workspace admins can propose org-wide policies for review by organization owners."
          actions={<Button onClick={() => setCreateOpen(true)}>Create Proposal</Button>}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-proposals">
              My Proposals
              {myProposals.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {myProposals.length}
                </Badge>
              )}
            </TabsTrigger>
            {isOrgOwner && (
              <TabsTrigger value="pending-review">
                Pending Review
                {pendingProposals.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {pendingProposals.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* My Proposals Tab */}
          <TabsContent value="my-proposals">
            <Card>
              <CardHeader>
                <CardTitle>My Proposals</CardTitle>
                <CardDescription>
                  Policies you have proposed for org-wide application.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {myProposalsQuery.isPending ? (
                  <TableSkeleton />
                ) : myProposals.length === 0 ? (
                  <EmptyState
                    title="No proposals yet"
                    description="Create a proposal to request an org-wide policy."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Effect</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Reviewer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myProposals.map((proposal) => (
                        <TableRow key={proposal.id}>
                          <TableCell className="font-medium max-w-md truncate">
                            {proposal.description}
                          </TableCell>
                          <TableCell>
                            <AllowDenyBadge value={proposal.effect} size="sm" />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getStatusBadgeVariant(proposal.status as ProposalStatus)}
                            >
                              {proposal.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatShortDate(proposal.createdAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {proposal.reviewer?.email ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Review Tab (Org Owners only) */}
          {isOrgOwner && (
            <TabsContent value="pending-review">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Review</CardTitle>
                  <CardDescription>
                    Policy proposals awaiting your approval or rejection.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingProposalsQuery.isPending ? (
                    <TableSkeleton />
                  ) : pendingProposals.length === 0 ? (
                    <EmptyState
                      title="No pending proposals"
                      description="All policy proposals have been reviewed."
                    />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Proposed By</TableHead>
                          <TableHead>Effect</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingProposals.map((proposal) => (
                          <TableRow key={proposal.id}>
                            <TableCell className="font-medium max-w-md truncate">
                              {proposal.description}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {proposal.proposedBy?.email ?? 'Unknown'}
                            </TableCell>
                            <TableCell>
                              <AllowDenyBadge value={proposal.effect} size="sm" />
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatShortDate(proposal.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setReviewingProposal({
                                    id: proposal.id,
                                    description: proposal.description,
                                    proposedBy: { email: proposal.proposedBy?.email ?? 'Unknown' },
                                    matchers: proposal.matchers,
                                    toolPatterns: proposal.toolPatterns,
                                    effect: proposal.effect === 'ALLOW' ? 'ALLOW' : 'DENY',
                                    justification: proposal.justification,
                                  })
                                }
                              >
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Create Proposal Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Policy Proposal</DialogTitle>
              <DialogDescription>
                Propose an org-wide policy for review by organization owners.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={form.handleSubmit(handleCreateSubmit)} className="space-y-6">
              {/* Workspace Selection */}
              <div className="space-y-2">
                <Label htmlFor="workspaceId">Workspace</Label>
                <p className="text-xs text-muted-foreground">
                  Select the workspace this proposal originates from.
                </p>
                <Select
                  value={watchedWorkspaceId}
                  onValueChange={(value) => form.setValue('workspaceId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {adminWorkspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.workspaceId && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.workspaceId.message}
                  </p>
                )}
              </div>

              {/* Matchers */}
              <MatcherSelector
                matchers={watchedMatchers}
                onChange={(matchers) => form.setValue('matchers', matchers as MatcherEntry[])}
                users={usersQuery.data}
                roles={rolesQuery.data}
                agents={agentsQuery.data}
                error={form.formState.errors.matchers?.message}
              />

              {/* Tool Patterns */}
              <ToolPatternSelector
                patterns={watchedToolPatterns}
                onChange={(patterns) =>
                  form.setValue('toolPatterns', patterns as ToolPatternEntry[])
                }
                mcpServers={mcpServers}
                a2aAgents={a2aAgents}
                getToolsForServer={getToolsForServer}
                isToolFlagged={isToolFlagged}
                getToolFlagCountsForServer={getToolFlagCountsForServer}
                toolFlagData={toolFlagData}
                showBulkActions={false}
                error={form.formState.errors.toolPatterns?.message}
              />

              {/* Effect */}
              <div className="space-y-2">
                <Label>Effect</Label>
                <Select
                  value={watchedEffect}
                  onValueChange={(value) => form.setValue('effect', value as 'ALLOW' | 'DENY')}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALLOW">ALLOW</SelectItem>
                    <SelectItem value="DENY">DENY</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <p className="text-xs text-muted-foreground">
                  A short description of what this policy does.
                </p>
                <Input
                  id="description"
                  placeholder="Allow developers to use read-only tools"
                  {...form.register('description')}
                />
                {form.formState.errors.description && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>

              {/* Justification */}
              <div className="space-y-2">
                <Label htmlFor="justification">Justification</Label>
                <p className="text-xs text-muted-foreground">
                  Explain why this policy should be applied organization-wide.
                </p>
                <Textarea
                  id="justification"
                  placeholder="This policy is needed because..."
                  rows={3}
                  {...form.register('justification')}
                />
                {form.formState.errors.justification && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.justification.message}
                  </p>
                )}
              </div>

              {createMutation.error && (
                <Alert variant="destructive">
                  <AlertDescription>{createMutation.error.message}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Proposal'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Review Proposal Dialog */}
        <Dialog
          open={Boolean(reviewingProposal)}
          onOpenChange={(open) => {
            if (!open) {
              setReviewingProposal(null);
              setReviewNote('');
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Proposal</DialogTitle>
              <DialogDescription>
                Review and approve or reject this policy proposal.
              </DialogDescription>
            </DialogHeader>

            {reviewingProposal && (
              <div className="space-y-6">
                {/* Proposal Details */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground">Proposed By</Label>
                    <p className="font-medium">{reviewingProposal.proposedBy.email}</p>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="font-medium">{reviewingProposal.description}</p>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Effect</Label>
                    <div className="mt-1">
                      <AllowDenyBadge value={reviewingProposal.effect} size="sm" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Matchers</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {reviewingProposal.matchers.map((m, i) => (
                        <Badge key={i} variant="outline">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Tool Patterns</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {reviewingProposal.toolPatterns.map((tp, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-xs">
                          {tp}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Justification</Label>
                    <p className="text-sm mt-1 p-3 bg-muted rounded-md">
                      {reviewingProposal.justification}
                    </p>
                  </div>
                </div>

                {/* Review Note */}
                <div className="space-y-2">
                  <Label htmlFor="reviewNote">Review Note</Label>
                  <p className="text-xs text-muted-foreground">
                    Add an optional note for approval, or a required note explaining the rejection.
                  </p>
                  <Textarea
                    id="reviewNote"
                    placeholder="Your feedback..."
                    rows={3}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                </div>

                {(approveMutation.error || rejectMutation.error) && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      {approveMutation.error?.message || rejectMutation.error?.message}
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReviewingProposal(null);
                      setReviewNote('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleReject}
                    disabled={!reviewNote.trim() || rejectMutation.isPending}
                  >
                    {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending ? 'Approving...' : 'Approve'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
