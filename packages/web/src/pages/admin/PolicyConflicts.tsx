import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { PolicyPageLayout } from '../../components/layout/PolicyPageLayout';
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
import { Skeleton } from '../../components/ui/skeleton';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { RouterOutputs, trpc } from '../../lib/trpc';

type Conflict = RouterOutputs['admin']['policies']['detectConflicts'][number];
type Policy = Conflict['policies'][number];

const EMPTY_CONFLICTS: Conflict[] = [];
const STORAGE_KEY = 'sentinel:ignored-conflicts';

function getConflictId(conflict: Conflict): string {
  const policyIds = conflict.policies
    .map((p) => p.id)
    .sort()
    .join(',');
  return `${conflict.type}:${policyIds}`;
}

function getIgnoredConflicts(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

function saveIgnoredConflicts(ignored: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ignored)));
  } catch {
    // Ignore storage errors
  }
}

interface PolicyCardProps {
  policy: Policy;
  variant?: 'default' | 'muted';
}

function PolicyCard({ policy, variant = 'default' }: PolicyCardProps): React.ReactElement {
  const bgClass = variant === 'muted' ? 'bg-card' : 'bg-muted/30';
  return (
    <div className={`rounded-md border border-border ${bgClass} p-4`}>
      <div className="mb-2">
        <div className="font-medium text-sm text-foreground">
          {policy.description || 'Untitled policy'}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Effect: {policy.effect}</div>
      </div>
    </div>
  );
}

interface ConflictCardProps {
  conflict: Conflict;
  isIgnored?: boolean;
  policyLabel: string;
  onIgnore?: () => void;
  onUnignore?: () => void;
  onResolve?: () => void;
}

function ConflictCard({
  conflict,
  isIgnored = false,
  policyLabel,
  onIgnore,
  onUnignore,
  onResolve,
}: ConflictCardProps): React.ReactElement {
  const containerClass = isIgnored
    ? 'rounded-lg border border-border bg-muted/30 p-5 opacity-60'
    : 'rounded-lg border border-border bg-card p-5';

  return (
    <div className={containerClass}>
      <div className="mb-4">
        <p className="text-sm text-foreground leading-relaxed">{conflict.message}</p>
      </div>
      <div className="space-y-3 mt-4 pt-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {policyLabel}
          </div>
          <div className="flex items-center gap-2">
            {isIgnored && onUnignore && (
              <Button variant="ghost" size="sm" onClick={onUnignore} className="text-xs">
                Unignore
              </Button>
            )}
            {!isIgnored && onIgnore && (
              <Button variant="ghost" size="sm" onClick={onIgnore} className="text-xs">
                Ignore
              </Button>
            )}
            {!isIgnored && onResolve && (
              <Button variant="outline" size="sm" onClick={onResolve} className="text-xs">
                Delete Policy
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {conflict.policies.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} variant={isIgnored ? 'muted' : 'default'} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PolicyConflicts() {
  const conflictsQuery = trpc.admin.policies.detectConflicts.useQuery();
  const utils = trpc.useUtils();
  const { selectedWorkspaceSlug, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);
  const deletePolicyMutation = trpc.admin.policies.delete.useMutation({
    onSuccess: () => {
      utils.admin.policies.detectConflicts.invalidate();
      setResolveDialog(null);
    },
  });

  const [resolveDialog, setResolveDialog] = useState<{
    conflictIndex: number;
    conflict: Conflict;
  } | null>(null);
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(getIgnoredConflicts);
  const [showIgnored, setShowIgnored] = useState(false);

  const allConflicts = conflictsQuery.data ?? EMPTY_CONFLICTS;

  // Separate conflicts into active and ignored
  const { activeConflicts, ignoredConflictsList } = useMemo(() => {
    const active: Conflict[] = [];
    const ignored: Conflict[] = [];

    allConflicts.forEach((conflict) => {
      const conflictId = getConflictId(conflict);
      if (ignoredConflicts.has(conflictId)) {
        ignored.push(conflict);
      } else {
        active.push(conflict);
      }
    });

    return { activeConflicts: active, ignoredConflictsList: ignored };
  }, [allConflicts, ignoredConflicts]);

  const highSeverity = activeConflicts.filter((c) => c.severity === 'high');
  const lowSeverity = activeConflicts.filter((c) => c.severity === 'low');

  const ignoredHighSeverity = ignoredConflictsList.filter((c) => c.severity === 'high');
  const ignoredLowSeverity = ignoredConflictsList.filter((c) => c.severity === 'low');

  const handleResolveConflict = (policyId: string) => {
    deletePolicyMutation.mutate({
      id: policyId,
      reason: 'Policy deleted to resolve conflict',
    });
  };

  const handleIgnoreConflict = (conflict: Conflict) => {
    const conflictId = getConflictId(conflict);
    const newIgnored = new Set(ignoredConflicts);
    newIgnored.add(conflictId);
    setIgnoredConflicts(newIgnored);
    saveIgnoredConflicts(newIgnored);
  };

  const handleUnignoreConflict = (conflict: Conflict) => {
    const conflictId = getConflictId(conflict);
    const newIgnored = new Set(ignoredConflicts);
    newIgnored.delete(conflictId);
    setIgnoredConflicts(newIgnored);
    saveIgnoredConflicts(newIgnored);
  };

  return (
    <PolicyPageLayout>
      <div className="space-y-8">
        <PageHeader
          title="Policy Conflicts"
          description="Review and resolve conflicting or overlapping policies."
          actions={
            ignoredConflictsList.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setShowIgnored(!showIgnored)}>
                {showIgnored ? 'Hide Ignored' : `Show Ignored (${ignoredConflictsList.length})`}
              </Button>
            ) : undefined
          }
        />

        {conflictsQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to detect conflicts</AlertTitle>
            <AlertDescription>{conflictsQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Contradictions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {conflictsQuery.isPending ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{highSeverity.length}</div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Policies with conflicting effects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Redundant</CardTitle>
            </CardHeader>
            <CardContent>
              {conflictsQuery.isPending ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{lowSeverity.length}</div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Policies with redundant permissions
              </p>
            </CardContent>
          </Card>
        </div>

        {conflictsQuery.isPending ? (
          <Card>
            <CardHeader>
              <CardTitle>Analyzing Policies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : activeConflicts.length > 0 || (showIgnored && ignoredConflictsList.length > 0) ? (
          <div className="space-y-6">
            {highSeverity.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Contradictions</CardTitle>
                  <CardDescription>
                    These policies have conflicting effects. The system defaults to DENY when
                    contradictions exist.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {highSeverity.map((conflict, index) => (
                    <ConflictCard
                      key={index}
                      conflict={conflict}
                      policyLabel="Conflicting Policies"
                      onIgnore={() => handleIgnoreConflict(conflict)}
                      onResolve={() => setResolveDialog({ conflictIndex: index, conflict })}
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {lowSeverity.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Redundant Policies</CardTitle>
                  <CardDescription>
                    These policies have redundant permissions but will not cause issues.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lowSeverity.map((conflict, index) => (
                    <ConflictCard
                      key={index}
                      conflict={conflict}
                      policyLabel="Redundant Policies"
                      onIgnore={() => handleIgnoreConflict(conflict)}
                      onResolve={() =>
                        setResolveDialog({ conflictIndex: highSeverity.length + index, conflict })
                      }
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {showIgnored && ignoredConflictsList.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Ignored Conflicts</CardTitle>
                      <CardDescription>
                        These conflicts have been marked as ignored.
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowIgnored(false)}>
                      Hide
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {ignoredHighSeverity.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
                        Contradictions
                      </h4>
                      <div className="space-y-4">
                        {ignoredHighSeverity.map((conflict, index) => (
                          <ConflictCard
                            key={index}
                            conflict={conflict}
                            isIgnored
                            policyLabel="Conflicting Policies"
                            onUnignore={() => handleUnignoreConflict(conflict)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {ignoredLowSeverity.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
                        Redundant
                      </h4>
                      <div className="space-y-4">
                        {ignoredLowSeverity.map((conflict, index) => (
                          <ConflictCard
                            key={index}
                            conflict={conflict}
                            isIgnored
                            policyLabel="Redundant Policies"
                            onUnignore={() => handleUnignoreConflict(conflict)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : allConflicts.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                title="No conflicts detected"
                description="Your policies are well-configured with no overlaps or contradictions."
              />
              <div className="mt-6 flex justify-center">
                <Link to={`${adminPrefix}/policies`}>
                  <Button variant="outline">View Policies</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Resolve Conflict Dialog */}
        {resolveDialog && (
          <Dialog open={Boolean(resolveDialog)} onOpenChange={() => setResolveDialog(null)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Delete Policy to Resolve Conflict</DialogTitle>
                <DialogDescription>
                  Choose which policy to delete. This action cannot be undone. The remaining policy
                  will continue to apply after deletion.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {resolveDialog.conflict.policies.map((policy) => (
                  <button
                    key={policy.id}
                    type="button"
                    className="w-full rounded-md border border-border bg-card p-4 hover:bg-accent/50 transition-colors text-left"
                    onClick={() => handleResolveConflict(policy.id)}
                    disabled={deletePolicyMutation.isPending}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-foreground">
                          {policy.description || 'Untitled policy'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Effect: {policy.effect}
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-xs font-medium text-destructive">
                        Delete
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setResolveDialog(null)}
                  disabled={deletePolicyMutation.isPending}
                >
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </PolicyPageLayout>
  );
}
