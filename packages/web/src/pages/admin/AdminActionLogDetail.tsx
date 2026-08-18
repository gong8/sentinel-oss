/**
 * AdminActionLogDetail Page
 * Full-page detail view for a single admin action log entry
 * Shows action summary, actor info, resource info, change diff, and related entries
 */

import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
  ActionSummaryBanner,
  ActionTimeline,
  ActorCard,
  ChangeSummaryCard,
  RawDataCard,
  RelatedEntriesCard,
  ResourceCard,
} from '../../components/adminActionLog';
import { getActionTypeLabel } from '../../components/adminActionLog/labels';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { trpc } from '../../lib/trpc';

interface FieldChange {
  before: unknown;
  after: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

interface ChangeDiff {
  [field: string]: FieldChange;
}

interface RelatedResource {
  type: string;
  id: string;
  name?: string;
}

interface RelatedEntry {
  id: string;
  actionType: string;
  source: string;
  timestamp: Date | string;
  adminEmail?: string | null;
  diffSummary?: string | null;
}

// Explicit type for the admin action log entry to avoid deep type instantiation
interface AdminActionLogEntry {
  id: string;
  actionType: string;
  source: string;
  timestamp: Date | string;
  resourceType: string;
  resourceId: string;
  resourceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestPath: string | null;
  referrer: string | null;
  sessionFingerprint: string | null;
  correlationId: string | null;
  actionStage: string | null;
  changeDiff: unknown;
  diffSummary: string | null;
  relatedResources: unknown;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  mcpSessionId: string | null;
  mcpToolName: string | null;
  requestHeaders: unknown;
  adminUser: { id: string; email: string } | null;
  workspace: { id: string; name: string; slug: string } | null;
}

interface AdminActionLogDetailData {
  entry: AdminActionLogEntry;
  correlatedActions: RelatedEntry[];
  resourceHistory: RelatedEntry[];
}

export default function AdminActionLogDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedWorkspaceSlug, isGlobalView } = useWorkspace();

  // Build admin prefix for routes
  const adminPrefix = useMemo(() => {
    if (isGlobalView) return '/global/admin';
    if (selectedWorkspaceSlug) return `/admin/${selectedWorkspaceSlug}`;
    throw new Error('Admin pages require workspace or global context');
  }, [selectedWorkspaceSlug, isGlobalView]);

  // Fetch the admin action log entry with related data
  const entryQuery = trpc.admin.adminActionLogs.getDetail.useQuery(
    { id: id ?? '' },
    { enabled: !!id },
  );

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
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
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
            onClick={() => navigate(`${adminPrefix}/action-log`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Action Log
          </Button>
          <Alert variant="destructive">
            <AlertTitle>Failed to load action log entry</AlertTitle>
            <AlertDescription>{entryQuery.error.message}</AlertDescription>
          </Alert>
        </div>
      </AdminLayout>
    );
  }

  // Extract entry data - cast to explicit type to avoid deep type instantiation
  const data = entryQuery.data as unknown as AdminActionLogDetailData;
  const entry = data.entry;
  const correlatedActions = data.correlatedActions ?? [];
  const resourceHistory = data.resourceHistory ?? [];

  // Parse JSON fields safely
  const changeDiff = entry.changeDiff as ChangeDiff | null;
  const relatedResources = entry.relatedResources as RelatedResource[] | null;
  const beforeSnapshot = entry.beforeSnapshot;
  const afterSnapshot = entry.afterSnapshot;

  // Extract admin email from nested relation
  const adminEmail = entry.adminUser?.email ?? null;
  const workspaceName = entry.workspace?.name ?? null;
  const workspaceSlug = entry.workspace?.slug ?? null;

  // Build raw data object for debugging
  const rawData = {
    id: entry.id,
    actionType: entry.actionType,
    source: entry.source,
    timestamp: entry.timestamp,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    resourceName: entry.resourceName,
    adminEmail,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    requestPath: entry.requestPath,
    referrer: entry.referrer,
    sessionFingerprint: entry.sessionFingerprint,
    correlationId: entry.correlationId,
    actionStage: entry.actionStage,
    changeDiff: entry.changeDiff,
    diffSummary: entry.diffSummary,
    relatedResources: entry.relatedResources,
    beforeSnapshot: entry.beforeSnapshot,
    afterSnapshot: entry.afterSnapshot,
    mcpSessionId: entry.mcpSessionId,
    mcpToolName: entry.mcpToolName,
    requestHeaders: entry.requestHeaders,
  };

  const actionLabel = getActionTypeLabel(entry.actionType);
  const timestamp =
    typeof entry.timestamp === 'string' ? new Date(entry.timestamp) : entry.timestamp;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(`${adminPrefix}/action-log`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Action Log
          </Button>
        </div>

        <PageHeader
          title={actionLabel}
          description={`${adminEmail || 'Unknown admin'} • ${formatDateTime(timestamp.toISOString())}`}
        />

        {/* Action Summary Banner */}
        <ActionSummaryBanner
          actionType={entry.actionType}
          timestamp={timestamp}
          source={entry.source}
          diffSummary={entry.diffSummary ?? undefined}
        />

        {/* Action Timeline (if multi-stage) */}
        {entry.actionStage && (
          <ActionTimeline
            actionStage={entry.actionStage}
            correlationId={entry.correlationId}
            timestamp={timestamp}
          />
        )}

        {/* Actor and Resource Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          <ActorCard
            adminEmail={adminEmail}
            source={entry.source}
            ipAddress={entry.ipAddress}
            userAgent={entry.userAgent}
            sessionFingerprint={entry.sessionFingerprint}
            mcpSessionId={entry.mcpSessionId}
            mcpToolName={entry.mcpToolName}
          />

          <ResourceCard
            resourceType={entry.resourceType}
            resourceId={entry.resourceId}
            resourceName={entry.resourceName}
            relatedResources={relatedResources}
            workspaceName={workspaceName}
            workspaceSlug={workspaceSlug}
            adminPrefix={adminPrefix}
          />
        </div>

        {/* Change Summary with Type-Specific Renderer */}
        <ChangeSummaryCard
          resourceType={entry.resourceType}
          actionType={entry.actionType}
          changeDiff={changeDiff}
          diffSummary={entry.diffSummary}
          beforeSnapshot={beforeSnapshot}
          afterSnapshot={afterSnapshot}
        />

        {/* Related Entries */}
        <RelatedEntriesCard
          resourceHistory={resourceHistory}
          correlatedActions={correlatedActions}
          currentEntryId={entry.id}
          adminPrefix={adminPrefix}
        />

        {/* Raw Data (Collapsible) */}
        <RawDataCard data={rawData} title="Raw Data (Debug)" />
      </div>
    </AdminLayout>
  );
}
