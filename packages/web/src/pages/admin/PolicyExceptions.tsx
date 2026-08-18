import { useState } from 'react';

import { AdminLayout } from '../../components/layout/AdminLayout';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { SetPageTitle } from '../../components/layout/PageTitleContext';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
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
import { Label } from '../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatShortDate } from '../../lib/format';
import { trpc } from '../../lib/trpc';

// Explicit interface to avoid deep type instantiation
interface PolicyExceptionRequest {
  id: string;
  organizationId: string;
  workspaceId: string;
  requestedById: string;
  requestType: string;
  policyId: string | null;
  justification: string;
  status: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  resultPolicyId: string | null;
  createdAt: string;
  workspace: { id: string; name: string } | null;
  requestedBy: { id: string; email: string } | null;
  policy: {
    id: string;
    slug: string;
    description: string | null;
    effect: string;
  } | null;
}

type RequestType = 'WORKSPACE_EXCEPTION' | 'REMOVAL_REQUEST' | 'PROPOSAL';

function getRequestTypeBadge(type: RequestType) {
  switch (type) {
    case 'WORKSPACE_EXCEPTION':
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
        >
          Exception
        </Badge>
      );
    case 'REMOVAL_REQUEST':
      return (
        <Badge
          variant="outline"
          className="bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
        >
          Removal
        </Badge>
      );
    case 'PROPOSAL':
      return (
        <Badge
          variant="outline"
          className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
        >
          Proposal
        </Badge>
      );
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

function getRequestTypeDescription(type: RequestType): string {
  switch (type) {
    case 'WORKSPACE_EXCEPTION':
      return 'Workspace requests an exception to a global DENY policy';
    case 'REMOVAL_REQUEST':
      return 'Workspace requests removal of a blocking global policy';
    case 'PROPOSAL':
      return 'Workspace proposes a new org-wide policy';
    default:
      return '';
  }
}

export default function PolicyExceptions() {
  const utils = trpc.useUtils();
  const { isOrgOwner } = useWorkspace();

  // Queries
  const pendingQuery = trpc.admin.policyExceptions.listPending.useQuery(undefined, {
    enabled: isOrgOwner,
  });
  const countQuery = trpc.admin.policyExceptions.countPending.useQuery(undefined, {
    enabled: isOrgOwner,
  });

  // Mutations
  const approveMutation = trpc.admin.policyExceptions.approve.useMutation({
    onSuccess: () => {
      utils.admin.policyExceptions.listPending.invalidate();
      utils.admin.policyExceptions.countPending.invalidate();
      utils.admin.policies.list.invalidate();
      setReviewingRequest(null);
      setReviewNote('');
    },
  });

  const denyMutation = trpc.admin.policyExceptions.deny.useMutation({
    onSuccess: () => {
      utils.admin.policyExceptions.listPending.invalidate();
      utils.admin.policyExceptions.countPending.invalidate();
      setReviewingRequest(null);
      setReviewNote('');
    },
  });

  // State
  const [reviewingRequest, setReviewingRequest] = useState<PolicyExceptionRequest | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // Derived data - filter out PROPOSAL type since that's handled by PolicyProposals page
  const pendingRequests: PolicyExceptionRequest[] = (pendingQuery.data ?? []).filter(
    (r) => r.requestType !== 'PROPOSAL',
  );

  function handleApprove() {
    if (!reviewingRequest) return;
    approveMutation.mutate({
      id: reviewingRequest.id,
      reviewNote: reviewNote || undefined,
    });
  }

  function handleDeny() {
    if (!reviewingRequest || !reviewNote.trim()) return;
    denyMutation.mutate({
      id: reviewingRequest.id,
      reviewNote: reviewNote,
    });
  }

  if (!isOrgOwner) {
    return (
      <AdminLayout>
        <SetPageTitle title="Policy Exceptions" description="Review policy exception requests." />
        <div className="space-y-6">
          <PageHeader
            title="Policy Exceptions"
            description="Review and approve workspace exception requests."
          />
          <Alert>
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              Only organization owners can review policy exception requests.
            </AlertDescription>
          </Alert>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SetPageTitle title="Policy Exceptions" description="Review policy exception requests." />
      <div className="space-y-6">
        <PageHeader
          title="Policy Exceptions"
          description="Review workspace requests for exceptions to global policies."
        />

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Requests</CardDescription>
              <CardTitle className="text-3xl">{countQuery.data ?? '-'}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Exception Requests</CardDescription>
              <CardTitle className="text-3xl text-blue-600">
                {pendingRequests.filter((r) => r.requestType === 'WORKSPACE_EXCEPTION').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Removal Requests</CardDescription>
              <CardTitle className="text-3xl text-orange-600">
                {pendingRequests.filter((r) => r.requestType === 'REMOVAL_REQUEST').length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Pending Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
            <CardDescription>
              Workspace exception and removal requests awaiting your review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingQuery.isPending ? (
              <TableSkeleton />
            ) : pendingRequests.length === 0 ? (
              <EmptyState
                title="No pending requests"
                description="All policy exception requests have been reviewed."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        {getRequestTypeBadge(request.requestType as RequestType)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {request.workspace?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell>
                        {request.policy ? (
                          <div className="space-y-1">
                            <div className="font-mono text-xs">{request.policy.slug}</div>
                            <AllowDenyBadge value={request.policy.effect} size="sm" />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {request.requestedBy?.email ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatShortDate(request.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReviewingRequest(request)}
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

        {/* Review Request Dialog */}
        <Dialog
          open={Boolean(reviewingRequest)}
          onOpenChange={(open) => {
            if (!open) {
              setReviewingRequest(null);
              setReviewNote('');
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Request</DialogTitle>
              <DialogDescription>
                Review and approve or deny this policy exception request.
              </DialogDescription>
            </DialogHeader>

            {reviewingRequest && (
              <div className="space-y-6">
                {/* Request Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {getRequestTypeBadge(reviewingRequest.requestType as RequestType)}
                    <span className="text-sm text-muted-foreground">
                      {getRequestTypeDescription(reviewingRequest.requestType as RequestType)}
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-muted-foreground">Workspace</Label>
                      <p className="font-medium">{reviewingRequest.workspace?.name ?? 'Unknown'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Requested By</Label>
                      <p className="font-medium">
                        {reviewingRequest.requestedBy?.email ?? 'Unknown'}
                      </p>
                    </div>
                  </div>

                  {reviewingRequest.policy && (
                    <div className="rounded-md border border-border bg-muted p-4 space-y-2">
                      <Label className="text-muted-foreground">Target Policy</Label>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{reviewingRequest.policy.slug}</span>
                        <AllowDenyBadge value={reviewingRequest.policy.effect} size="sm" />
                      </div>
                      {reviewingRequest.policy.description && (
                        <p className="text-sm text-muted-foreground">
                          {reviewingRequest.policy.description}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <Label className="text-muted-foreground">Justification</Label>
                    <p className="text-sm mt-1 p-3 bg-muted rounded-md">
                      {reviewingRequest.justification}
                    </p>
                  </div>

                  {reviewingRequest.requestType === 'WORKSPACE_EXCEPTION' && (
                    <Alert>
                      <AlertTitle>What happens on approval</AlertTitle>
                      <AlertDescription>
                        A new ALLOW policy will be created for this workspace, overriding the global
                        DENY policy for workspace members.
                      </AlertDescription>
                    </Alert>
                  )}

                  {reviewingRequest.requestType === 'REMOVAL_REQUEST' && (
                    <Alert variant="destructive">
                      <AlertTitle>What happens on approval</AlertTitle>
                      <AlertDescription>
                        The target policy will be disabled and soft-deleted. This affects all
                        workspaces in the organization.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Review Note */}
                <div className="space-y-2">
                  <Label htmlFor="reviewNote">Review Note</Label>
                  <p className="text-xs text-muted-foreground">
                    Add an optional note for approval, or a required note explaining the denial.
                  </p>
                  <Textarea
                    id="reviewNote"
                    placeholder="Your feedback..."
                    rows={3}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                </div>

                {(approveMutation.error || denyMutation.error) && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      {approveMutation.error?.message || denyMutation.error?.message}
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReviewingRequest(null);
                      setReviewNote('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeny}
                    disabled={!reviewNote.trim() || denyMutation.isPending}
                  >
                    {denyMutation.isPending ? 'Denying...' : 'Deny'}
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
