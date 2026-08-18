/**
 * ChangeSummaryCard Component
 * Displays change diff with type-specific rendering
 */

import { GitCompare } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { GenericChangeRenderer } from './renderers/GenericChangeRenderer';
import { McpServerChangeRenderer } from './renderers/McpServerChangeRenderer';
import { PolicyChangeRenderer } from './renderers/PolicyChangeRenderer';
import { RoleChangeRenderer } from './renderers/RoleChangeRenderer';
import { SensitiveFlagChangeRenderer } from './renderers/SensitiveFlagChangeRenderer';
import { UserChangeRenderer } from './renderers/UserChangeRenderer';

interface FieldChange {
  before: unknown;
  after: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

interface ChangeDiff {
  [field: string]: FieldChange;
}

interface ChangeSummaryCardProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  diffSummary?: string | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

export function ChangeSummaryCard({
  resourceType,
  actionType,
  changeDiff,
  diffSummary,
  beforeSnapshot,
  afterSnapshot,
}: ChangeSummaryCardProps) {
  // If no change data available, show message
  if (!changeDiff && !beforeSnapshot && !afterSnapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-4 w-4" />
            Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No change data available for this action.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-4 w-4" />
          Changes
        </CardTitle>
        {diffSummary ? <CardDescription>{diffSummary}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <ChangeRenderer
          resourceType={resourceType}
          actionType={actionType}
          changeDiff={changeDiff}
          beforeSnapshot={beforeSnapshot}
          afterSnapshot={afterSnapshot}
        />
      </CardContent>
    </Card>
  );
}

interface ChangeRendererProps {
  resourceType: string;
  actionType: string;
  changeDiff?: ChangeDiff | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

/**
 * Wrapper component that renders the appropriate change renderer for a resource type
 * This avoids the "Cannot create components during render" lint error
 */
function ChangeRenderer({
  resourceType,
  actionType,
  changeDiff,
  beforeSnapshot,
  afterSnapshot,
}: ChangeRendererProps): React.ReactElement {
  const props = { resourceType, actionType, changeDiff, beforeSnapshot, afterSnapshot };

  switch (resourceType) {
    case 'POLICY':
      return <PolicyChangeRenderer {...props} />;
    case 'USER':
      return <UserChangeRenderer {...props} />;
    case 'MCP_SERVER':
      return <McpServerChangeRenderer {...props} />;
    case 'SENSITIVE_FLAG':
      return <SensitiveFlagChangeRenderer {...props} />;
    case 'ROLE':
      return <RoleChangeRenderer {...props} />;
    default:
      return <GenericChangeRenderer {...props} />;
  }
}
