/**
 * ResourceCard Component
 * Displays information about the resource that was affected by the action
 */

import { ExternalLink, Hash, Tag, Type } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { getResourceTypeLabel } from './labels';

interface RelatedResource {
  type: string;
  id: string;
  name?: string;
}

interface ResourceCardProps {
  resourceType: string;
  resourceId?: string | null;
  resourceName?: string | null;
  relatedResources?: RelatedResource[] | null;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
  adminPrefix: string;
}

export function ResourceCard({
  resourceType,
  resourceId,
  resourceName,
  relatedResources,
  workspaceName,
  workspaceSlug,
  adminPrefix,
}: ResourceCardProps) {
  const resourceLabel = getResourceTypeLabel(resourceType);

  // Build link to the resource if possible
  const resourceLink = getResourceLink(resourceType, resourceId, adminPrefix);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4" />
          Resource
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Type className="h-3.5 w-3.5" />
            Type
          </span>
          <Badge variant="outline">{resourceLabel}</Badge>
        </div>

        {resourceId ? (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              ID
            </span>
            <span className="font-mono text-xs">{truncate(resourceId, 24)}</span>
          </div>
        ) : null}

        {resourceName ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{resourceName}</span>
              {resourceLink ? (
                <Link
                  to={resourceLink}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {workspaceName ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Workspace</span>
            <span>
              {workspaceSlug ? (
                <Link to={`/admin/${workspaceSlug}`} className="text-primary hover:underline">
                  {workspaceName}
                </Link>
              ) : (
                workspaceName
              )}
            </span>
          </div>
        ) : null}

        {/* Related Resources */}
        {relatedResources && relatedResources.length > 0 ? (
          <>
            <div className="my-2 border-t" />
            <div className="text-sm font-medium">Related Resources</div>
            <div className="space-y-2">
              {relatedResources.map((resource, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {getResourceTypeLabel(resource.type)}
                  </span>
                  <span className="font-medium">{resource.name || truncate(resource.id, 16)}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function getResourceLink(
  resourceType: string,
  resourceId: string | null | undefined,
  adminPrefix: string,
): string | null {
  if (!resourceId) return null;

  switch (resourceType) {
    case 'USER':
      return `${adminPrefix}/users`;
    case 'ROLE':
      return `${adminPrefix}/roles`;
    case 'POLICY':
      return `${adminPrefix}/policies`;
    case 'MCP_SERVER':
      return `${adminPrefix}/mcp-servers`;
    case 'AGENT':
      return `${adminPrefix}/agents`;
    case 'SENSITIVE_FLAG':
      return `${adminPrefix}/sensitive-flags`;
    case 'WEBHOOK_ENDPOINT':
      return `${adminPrefix}/webhooks`;
    case 'WORKSPACE':
      return `${adminPrefix}/workspaces/${resourceId}`;
    default:
      return null;
  }
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}
