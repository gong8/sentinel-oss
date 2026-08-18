import type { JSX } from 'react';
import { useState } from 'react';

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { StatusBadge } from '../../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

interface ApprovalRequest {
  id: string;
  toolName: string;
  parameters: unknown;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  agentName: string | null;
  canSelfApprove: boolean;
}

function getApprovalRequests<
  T extends Array<{
    id: string;
    toolName: string;
    parameters: unknown;
    status: unknown;
    createdAt: unknown;
    expiresAt: unknown;
    agent?: { name: string } | null;
    canSelfApprove?: boolean;
  }>,
>(data: T | undefined): ApprovalRequest[] | undefined {
  if (!data) return undefined;
  return data.map((r) => ({
    id: r.id,
    toolName: r.toolName,
    parameters: r.parameters,
    status: String(r.status),
    createdAt: String(r.createdAt),
    expiresAt: r.expiresAt ? String(r.expiresAt) : null,
    agentName: r.agent?.name ?? null,
    canSelfApprove: r.canSelfApprove ?? false,
  }));
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function getEffectiveStatus(status: string, expiresAt: string | null): string {
  if (status === 'PENDING' && isExpired(expiresAt)) {
    return 'EXPIRED';
  }
  return status;
}

export default function UserApprovals(): JSX.Element {
  const utils = trpc.useUtils();
  const approvalsQuery = trpc.user.sensitiveFlags.listPendingApprovals.useQuery();
  const approvals = getApprovalRequests(approvalsQuery.data);

  const selfApproveMutation = trpc.user.sensitiveFlags.selfApprove.useMutation({
    onSuccess: () => {
      utils.user.sensitiveFlags.listPendingApprovals.invalidate();
      setSelectedApproval(null);
    },
  });

  const cancelMutation = trpc.user.sensitiveFlags.cancelRequest.useMutation({
    onSuccess: () => {
      utils.user.sensitiveFlags.listPendingApprovals.invalidate();
      setCancelConfirm(null);
    },
  });

  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<ApprovalRequest | null>(null);

  function renderExpiresCell(approval: ApprovalRequest): JSX.Element {
    if (!approval.expiresAt) {
      return <span>Never</span>;
    }
    if (isExpired(approval.expiresAt)) {
      return <span className="text-destructive">Expired</span>;
    }
    return <span>{formatDateTime(approval.expiresAt)}</span>;
  }

  function renderActions(approval: ApprovalRequest): JSX.Element | null {
    if (approval.status !== 'PENDING' || isExpired(approval.expiresAt)) {
      return null;
    }

    return (
      <>
        {approval.canSelfApprove && (
          <Button
            size="sm"
            onClick={() => selfApproveMutation.mutate({ id: approval.id })}
            disabled={selfApproveMutation.isPending}
          >
            {selfApproveMutation.isPending && selfApproveMutation.variables?.id === approval.id
              ? 'Approving...'
              : 'Approve'}
          </Button>
        )}
        <Button variant="destructive" size="sm" onClick={() => setCancelConfirm(approval)}>
          Cancel
        </Button>
      </>
    );
  }

  return (
    <UserLayout>
      <div className="space-y-8">
        <PageHeader
          title="Live Approvals"
          description="Manage approval requests for sensitive tool invocations."
        />

        {approvalsQuery.error && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load approvals</AlertTitle>
            <AlertDescription>{approvalsQuery.error.message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Approval Requests</CardTitle>
            <CardDescription>
              These tools require approval before they can be executed. You may be able to
              self-approve some requests depending on your organization&apos;s policy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {approvalsQuery.isPending ? (
              <TableSkeleton />
            ) : approvals && approvals.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals.map((approval) => (
                    <TableRow key={approval.id}>
                      <TableCell className="font-medium">{approval.toolName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {approval.agentName ?? 'N/A'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={getEffectiveStatus(approval.status, approval.expiresAt)}
                          type="approval"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(approval.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {renderExpiresCell(approval)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedApproval(approval)}
                          >
                            View
                          </Button>
                          {renderActions(approval)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No pending approvals"
                description="When a sensitive tool requires approval, it will appear here."
              />
            )}
          </CardContent>
        </Card>

        {/* View Details Dialog */}
        <Dialog open={Boolean(selectedApproval)} onOpenChange={() => setSelectedApproval(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Approval Request Details</DialogTitle>
              <DialogDescription>
                {selectedApproval?.toolName} -{' '}
                <StatusBadge
                  status={getEffectiveStatus(
                    selectedApproval?.status ?? '',
                    selectedApproval?.expiresAt ?? null,
                  )}
                  type="approval"
                />
              </DialogDescription>
            </DialogHeader>
            {selectedApproval && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Agent:</span>
                    <p className="font-medium">{selectedApproval.agentName ?? 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Requested:</span>
                    <p className="font-medium">{formatDateTime(selectedApproval.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expires:</span>
                    <p className="font-medium">
                      {selectedApproval.expiresAt
                        ? formatDateTime(selectedApproval.expiresAt)
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Self-Approve:</span>
                    <p className="font-medium">
                      {selectedApproval.canSelfApprove ? 'Allowed' : 'Not Allowed'}
                    </p>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted p-3 text-sm">
                  <div className="font-medium text-foreground">Parameters</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {JSON.stringify(selectedApproval.parameters, null, 2)}
                  </pre>
                </div>

                {selfApproveMutation.error && (
                  <Alert variant="destructive">
                    <AlertTitle>Approval Failed</AlertTitle>
                    <AlertDescription>{selfApproveMutation.error.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            <DialogFooter>
              {selectedApproval?.status === 'PENDING' &&
                !isExpired(selectedApproval?.expiresAt ?? null) && (
                  <>
                    {selectedApproval?.canSelfApprove && (
                      <Button
                        onClick={() =>
                          selectedApproval &&
                          selfApproveMutation.mutate({ id: selectedApproval.id })
                        }
                        disabled={selfApproveMutation.isPending}
                      >
                        {selfApproveMutation.isPending ? 'Approving...' : 'Approve'}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (selectedApproval) {
                          setCancelConfirm(selectedApproval);
                          setSelectedApproval(null);
                        }
                      }}
                    >
                      Cancel Request
                    </Button>
                  </>
                )}
              <Button variant="outline" onClick={() => setSelectedApproval(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Confirmation Dialog */}
        <Dialog open={Boolean(cancelConfirm)} onOpenChange={() => setCancelConfirm(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cancel Approval Request</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel the approval request for{' '}
                <strong>{cancelConfirm?.toolName}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {cancelMutation.error && (
              <Alert variant="destructive">
                <AlertTitle>Cancellation Failed</AlertTitle>
                <AlertDescription>{cancelMutation.error.message}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelConfirm(null)}>
                Keep Request
              </Button>
              <Button
                variant="destructive"
                onClick={() => cancelConfirm && cancelMutation.mutate({ id: cancelConfirm.id })}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </UserLayout>
  );
}
