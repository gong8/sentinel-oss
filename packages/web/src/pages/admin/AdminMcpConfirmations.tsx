/**
 * Admin MCP Confirmations Page
 *
 * Queue for pending Admin MCP write operations that require confirmation.
 * Admins can confirm, reject, or let requests expire.
 */

import { useMemo, useState } from 'react';

import { ErrorAlert } from '../../components/admin';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
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
import { TableLoadingState } from '../../components/ui/table-loading-state';
import { Textarea } from '../../components/ui/textarea';
import { useMutationErrors } from '../../hooks/useMutationErrors';
import { formatDateTime, formatRelativeTime, formatToolName } from '../../lib/format';
import { getConfirmationStatusColor, getRiskBadgeVariant } from '../../lib/statusUtils';
import { trpc } from '../../lib/trpc';

// Status filter options
const STATUS_OPTIONS = [
  'ALL',
  'PENDING',
  'CONFIRMED',
  'EXECUTED',
  'REJECTED',
  'EXPIRED',
  'FAILED',
] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];
const STATUS_OPTION_SET: ReadonlySet<string> = new Set(STATUS_OPTIONS);

function isStatusOption(value: string): value is StatusOption {
  return STATUS_OPTION_SET.has(value);
}

// Raw API response shape (matches tRPC output without deep type instantiation)
interface RawConfirmation {
  id: string;
  toolName: string;
  toolInput: unknown;
  status: string;
  riskLevel: string;
  description: string;
  adminUserId: string;
  adminUser: { id: string; email: string } | null;
  confirmedAt: Date | string | null;
  confirmedBy: string | null;
  confirmer: { id: string; email: string } | null;
  executedAt: Date | string | null;
  result: unknown;
  error: string | null;
  expiresAt: Date | string;
  createdAt: Date | string;
}

interface Confirmation {
  id: string;
  toolName: string;
  toolInput: unknown;
  status: string;
  riskLevel: string;
  description: string;
  adminUserId: string;
  adminUserEmail: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmedByEmail: string | null;
  executedAt: string | null;
  result: unknown;
  error: string | null;
  expiresAt: string;
  createdAt: string;
}

/**
 * Transform raw API confirmations to the UI-friendly format.
 * Uses generic constraint to safely narrow types without type assertions.
 */
function transformConfirmations<T extends RawConfirmation>(data: T[] | undefined): Confirmation[] {
  if (!data) return [];
  return data.map((c) => ({
    id: c.id,
    toolName: c.toolName,
    toolInput: c.toolInput,
    status: c.status,
    riskLevel: c.riskLevel,
    description: c.description,
    adminUserId: c.adminUserId,
    adminUserEmail: c.adminUser?.email ?? 'Unknown',
    confirmedAt: c.confirmedAt ? String(c.confirmedAt) : null,
    confirmedBy: c.confirmedBy,
    confirmedByEmail: c.confirmer?.email ?? null,
    executedAt: c.executedAt ? String(c.executedAt) : null,
    result: c.result,
    error: c.error,
    expiresAt: String(c.expiresAt),
    createdAt: String(c.createdAt),
  }));
}

export default function AdminMcpConfirmations(): React.ReactElement {
  const utils = trpc.useUtils();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusOption>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Review state
  const [reviewConfirmation, setReviewConfirmation] = useState<{
    confirmation: Confirmation;
    action: 'confirm' | 'reject';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // Queries - poll when viewing PENDING to catch new confirmations
  const confirmationsQuery = trpc.admin.adminMcpConfirmation.list.useQuery(
    {
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    },
    {
      refetchInterval: statusFilter === 'PENDING' ? 2000 : undefined,
    },
  );

  // Mutations
  const confirmMutation = trpc.admin.adminMcpConfirmation.confirm.useMutation({
    onSuccess: () => {
      utils.admin.adminMcpConfirmation.list.invalidate();
      handleCloseReview();
    },
  });

  const rejectMutation = trpc.admin.adminMcpConfirmation.reject.useMutation({
    onSuccess: () => {
      utils.admin.adminMcpConfirmation.list.invalidate();
      handleCloseReview();
    },
  });

  // Error handling
  const errors = useMutationErrors([confirmationsQuery]);

  // Transform API data to UI-friendly format
  const confirmations = useMemo(
    () => transformConfirmations(confirmationsQuery.data?.confirmations),
    [confirmationsQuery.data],
  );

  // Filter by search query
  const filteredConfirmations = useMemo(() => {
    if (!searchQuery) return confirmations;
    const query = searchQuery.toLowerCase();
    return confirmations.filter(
      (c) =>
        c.toolName.toLowerCase().includes(query) ||
        c.adminUserEmail.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query),
    );
  }, [confirmations, searchQuery]);

  function openReview(confirmation: Confirmation, action: 'confirm' | 'reject') {
    setReviewConfirmation({ confirmation, action });
    setReviewNote('');
    confirmMutation.reset();
    rejectMutation.reset();
  }

  function handleCloseReview() {
    setReviewConfirmation(null);
    setReviewNote('');
    confirmMutation.reset();
    rejectMutation.reset();
  }

  function handleConfirm() {
    if (!reviewConfirmation) return;
    confirmMutation.mutate({ id: reviewConfirmation.confirmation.id });
  }

  function handleReject() {
    if (!reviewConfirmation) return;
    rejectMutation.mutate({
      id: reviewConfirmation.confirmation.id,
      reason: reviewNote.trim() || undefined,
    });
  }

  function isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Admin MCP Confirmations"
          description="Review and confirm Admin MCP write operations."
        />

        <ErrorAlert title="Failed to load confirmations" errors={errors} />

        {/* Search and Filter Bar */}
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by tool, admin, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (isStatusOption(value)) {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Confirmations Table */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Confirmations</CardTitle>
            <CardDescription>{filteredConfirmations.length} confirmation(s) found.</CardDescription>
          </CardHeader>
          <CardContent>
            <TableLoadingState
              isLoading={confirmationsQuery.isPending}
              isEmpty={filteredConfirmations.length === 0}
              hasActiveFilters={Boolean(searchQuery)}
              emptyTitle="No confirmations"
              emptyDescription="Admin MCP write operations will appear here for confirmation."
              filteredEmptyTitle="No matching confirmations"
              filteredEmptyDescription="No confirmations match your search."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operation</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConfirmations.map((confirmation) => (
                    <TableRow key={confirmation.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <span className="font-medium">
                            {formatToolName(confirmation.toolName)}
                          </span>
                          <p className="text-xs text-muted-foreground max-w-[300px] truncate">
                            {confirmation.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getRiskBadgeVariant(confirmation.riskLevel)}
                          className="text-xs"
                        >
                          {confirmation.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{confirmation.adminUserEmail}</TableCell>
                      <TableCell
                        className={`text-xs font-bold ${getConfirmationStatusColor(confirmation.status)}`}
                      >
                        {confirmation.status}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {confirmation.status === 'PENDING' ? (
                          isExpired(confirmation.expiresAt) ? (
                            <span className="text-destructive">Expired</span>
                          ) : (
                            formatRelativeTime(confirmation.expiresAt)
                          )
                        ) : (
                          formatDateTime(confirmation.createdAt)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {confirmation.status === 'PENDING' && !isExpired(confirmation.expiresAt) ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => openReview(confirmation, 'confirm')}>
                              Confirm
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReview(confirmation, 'reject')}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReview(confirmation, 'confirm')}
                          >
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableLoadingState>
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <Dialog
          open={Boolean(reviewConfirmation)}
          onOpenChange={(open) => !open && handleCloseReview()}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {reviewConfirmation?.action === 'confirm'
                  ? 'Confirm Operation'
                  : 'Reject Operation'}
              </DialogTitle>
              <DialogDescription>
                Review this Admin MCP operation before{' '}
                {reviewConfirmation?.action === 'confirm' ? 'confirming' : 'rejecting'}.
              </DialogDescription>
            </DialogHeader>

            {(confirmMutation.error || rejectMutation.error) && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {confirmMutation.error?.message || rejectMutation.error?.message}
                </AlertDescription>
              </Alert>
            )}

            {reviewConfirmation && (
              <div className="space-y-4 py-2">
                {/* Operation Details */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {formatToolName(reviewConfirmation.confirmation.toolName)}
                    </span>
                    <Badge variant={getRiskBadgeVariant(reviewConfirmation.confirmation.riskLevel)}>
                      {reviewConfirmation.confirmation.riskLevel} Risk
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {reviewConfirmation.confirmation.description}
                  </p>
                </div>

                {/* Requested By */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Requested by</Label>
                  <p className="text-sm">{reviewConfirmation.confirmation.adminUserEmail}</p>
                </div>

                {/* Tool Input */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Input parameters</Label>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-[200px]">
                    {JSON.stringify(reviewConfirmation.confirmation.toolInput, null, 2)}
                  </pre>
                </div>

                {/* Status-specific info */}
                {reviewConfirmation.confirmation.status === 'EXECUTED' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Result</Label>
                    <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-[200px]">
                      {JSON.stringify(reviewConfirmation.confirmation.result, null, 2)}
                    </pre>
                  </div>
                )}

                {reviewConfirmation.confirmation.status === 'FAILED' &&
                  reviewConfirmation.confirmation.error && (
                    <Alert variant="destructive">
                      <AlertTitle>Execution Failed</AlertTitle>
                      <AlertDescription>{reviewConfirmation.confirmation.error}</AlertDescription>
                    </Alert>
                  )}

                {/* Review Note (for reject only) */}
                {reviewConfirmation.action === 'reject' &&
                  reviewConfirmation.confirmation.status === 'PENDING' && (
                    <div className="space-y-2">
                      <Label htmlFor="reviewNote">Rejection reason (optional)</Label>
                      <Textarea
                        id="reviewNote"
                        placeholder="Explain why this operation is being rejected..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        rows={2}
                      />
                    </div>
                  )}

                {/* Confirmation info */}
                {reviewConfirmation.confirmation.confirmedByEmail && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {reviewConfirmation.confirmation.status === 'REJECTED'
                        ? 'Rejected by'
                        : 'Confirmed by'}
                    </Label>
                    <p className="text-sm">
                      {reviewConfirmation.confirmation.confirmedByEmail}
                      {reviewConfirmation.confirmation.confirmedAt && (
                        <span className="text-xs text-muted-foreground ml-2">
                          at {formatDateTime(reviewConfirmation.confirmation.confirmedAt)}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseReview}>
                Cancel
              </Button>
              {reviewConfirmation?.confirmation.status === 'PENDING' &&
                !isExpired(reviewConfirmation.confirmation.expiresAt) && (
                  <>
                    {reviewConfirmation.action === 'confirm' ? (
                      <Button onClick={handleConfirm} disabled={confirmMutation.isPending}>
                        {confirmMutation.isPending ? 'Confirming...' : 'Confirm & Execute'}
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        onClick={handleReject}
                        disabled={rejectMutation.isPending}
                      >
                        {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
                      </Button>
                    )}
                  </>
                )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
