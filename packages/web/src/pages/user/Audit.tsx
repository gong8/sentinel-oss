import type { JSX } from 'react';
import { useMemo, useState } from 'react';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
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
import { PaginationControls } from '../../components/ui/pagination-controls';
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
import { usePagination } from '../../hooks/usePagination';
import { formatDateTime } from '../../lib/format';
import { createToolNameFormatter } from '../../lib/mcpUtils';
import { trpc } from '../../lib/trpc';

const DECISION_OPTIONS = ['ALL', 'ALLOWED', 'DENIED'] as const;
type DecisionOption = (typeof DECISION_OPTIONS)[number];

function isDecisionOption(value: string): value is DecisionOption {
  return (DECISION_OPTIONS as readonly string[]).includes(value);
}

type AuditDecisionValue = 'ALLOWED' | 'DENIED' | 'ALLOW' | 'DENY';

interface AuditEntry {
  id: string;
  toolName: string;
  parameters: unknown;
  decision: AuditDecisionValue;
  justification: string | null;
  timestamp: string;
  approvalRequired: boolean;
  approvalRequestId: string | null;
  approvalStatus: string | null;
  approvalDecidedBy: string | null;
  approvalDecidedByEmail: string | null;
  approvalDecidedAt: string | null;
}

function isValidDecision(value: unknown): value is AuditDecisionValue {
  return value === 'ALLOWED' || value === 'DENIED' || value === 'ALLOW' || value === 'DENY';
}

function getAuditEntries<
  T extends {
    entries: Array<{
      id: string;
      toolName: string;
      parameters: unknown;
      decision: unknown;
      justification: string | null;
      timestamp: unknown;
      approvalRequired: boolean;
      approvalRequestId: string | null;
      approvalStatus: string | null;
      approvalDecidedBy: string | null;
      approvalDecidedByEmail: string | null;
      approvalDecidedAt: unknown;
    }>;
    total: number;
  },
>(data: T | undefined): { entries: AuditEntry[]; total: number } | undefined {
  if (!data) return undefined;
  return {
    entries: data.entries.map((e) => ({
      id: e.id,
      toolName: e.toolName,
      parameters: e.parameters,
      decision: isValidDecision(e.decision) ? e.decision : 'DENIED',
      justification: e.justification,
      timestamp: String(e.timestamp),
      approvalRequired: e.approvalRequired,
      approvalRequestId: e.approvalRequestId,
      approvalStatus: e.approvalStatus,
      approvalDecidedBy: e.approvalDecidedBy,
      approvalDecidedByEmail: e.approvalDecidedByEmail,
      approvalDecidedAt: e.approvalDecidedAt ? String(e.approvalDecidedAt) : null,
    })),
    total: data.total,
  };
}

const EMPTY_ENTRIES: AuditEntry[] = [];

interface FilterState extends Record<string, unknown> {
  toolName: string;
  decision: DecisionOption;
}

function getApprovalBadgeVariant(
  status: string | null,
): 'outline' | 'destructive' | 'secondary' | 'default' {
  if (status === 'APPROVED') return 'outline';
  if (status === 'DENIED' || status === 'EXPIRED' || status === 'CANCELLED') {
    return 'destructive';
  }
  return 'secondary';
}

export default function UserAudit(): JSX.Element {
  const mcpServersQuery = trpc.user.mcpServers.list.useQuery();
  const { page, limit, offset, prevPage, nextPage, resetPage, getPageInfo } = usePagination({
    limit: 20,
  });

  const { filters, appliedFilters, updateFilter, apply, reset } = useApplyResetFilters<FilterState>(
    {
      initialFilters: { toolName: '', decision: 'ALL' },
      onApply: resetPage,
    },
  );

  const formatToolName = mcpServersQuery.data
    ? createToolNameFormatter(mcpServersQuery.data.map((s) => ({ name: s.name, url: s.url })))
    : (name: string) => name;

  const input = useMemo(
    () => ({
      toolName: appliedFilters.toolName || undefined,
      decision: appliedFilters.decision === 'ALL' ? undefined : appliedFilters.decision,
      limit,
      offset,
    }),
    [appliedFilters, limit, offset],
  );

  const auditQuery = trpc.user.auditLogEntries.list.useQuery(input);
  const auditData = getAuditEntries(auditQuery.data);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const entries = auditData?.entries ?? EMPTY_ENTRIES;
  const total = auditData?.total ?? 0;
  const pageInfo = getPageInfo(total);

  return (
    <UserLayout>
      <div className="space-y-8">
        <PageHeader title="My Audit Log" description="Review your tool activity and decisions." />

        {auditQuery.error && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load audit log</AlertTitle>
            <AlertDescription>{auditQuery.error.message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search by tool name or decision.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="toolName">Tool name</Label>
                <Input
                  id="toolName"
                  placeholder="notion.com::createPage"
                  value={filters.toolName}
                  onChange={(event) => updateFilter('toolName', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Decision</Label>
                <Select
                  value={filters.decision}
                  onValueChange={(value) =>
                    updateFilter('decision', isDecisionOption(value) ? value : 'ALL')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECISION_OPTIONS.map((decision) => (
                      <SelectItem key={decision} value={decision}>
                        {decision}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" onClick={reset} className="flex-1 sm:flex-none">
                  Reset
                </Button>
                <Button onClick={apply} className="flex-1 sm:flex-none">
                  Apply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit entries</CardTitle>
            <CardDescription>
              Showing {entries.length} of {total} entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auditQuery.isPending ? (
              <TableSkeleton />
            ) : entries.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {formatToolName(entry.toolName)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AllowDenyBadge value={entry.decision} size="sm" />
                          {entry.approvalRequired && (
                            <Badge
                              variant={getApprovalBadgeVariant(entry.approvalStatus)}
                              className="text-xs"
                            >
                              {entry.approvalStatus ?? 'Approval'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{formatDateTime(entry.timestamp)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedEntry(entry)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No audit entries"
                description="Tool activity will appear here once available."
              />
            )}

            {entries.length > 0 && (
              <PaginationControls
                page={page}
                totalPages={pageInfo.totalPages}
                onPrevious={prevPage}
                onNext={nextPage}
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(selectedEntry)} onOpenChange={() => setSelectedEntry(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Audit details</DialogTitle>
              <DialogDescription>
                {selectedEntry ? formatToolName(selectedEntry.toolName) : ''} at{' '}
                {selectedEntry ? formatDateTime(selectedEntry.timestamp) : ''}
              </DialogDescription>
            </DialogHeader>
            {selectedEntry && (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-muted p-3 text-sm">
                  <div className="font-medium text-foreground">Parameters</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {JSON.stringify(selectedEntry.parameters, null, 2)}
                  </pre>
                </div>
                {selectedEntry.justification && (
                  <div className="rounded-md border border-border bg-muted p-3 text-sm">
                    <div className="font-medium text-foreground">Justification</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {selectedEntry.justification}
                    </div>
                  </div>
                )}
                {selectedEntry.approvalRequired && (
                  <div className="rounded-md border border-border bg-muted p-3 text-sm">
                    <div className="font-medium text-foreground">Live Approval</div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Status:</span>
                        <Badge
                          variant={
                            selectedEntry.approvalStatus === 'APPROVED'
                              ? 'default'
                              : getApprovalBadgeVariant(selectedEntry.approvalStatus)
                          }
                        >
                          {selectedEntry.approvalStatus ?? 'PENDING'}
                        </Badge>
                      </div>
                      {selectedEntry.approvalDecidedByEmail && (
                        <div>
                          <span className="font-medium">Decided by:</span>{' '}
                          {selectedEntry.approvalDecidedByEmail}
                        </div>
                      )}
                      {selectedEntry.approvalDecidedAt && (
                        <div>
                          <span className="font-medium">Decided at:</span>{' '}
                          {formatDateTime(selectedEntry.approvalDecidedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setSelectedEntry(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </UserLayout>
  );
}
