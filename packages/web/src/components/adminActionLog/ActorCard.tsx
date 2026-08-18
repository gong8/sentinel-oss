/**
 * ActorCard Component
 * Displays information about the admin who performed the action
 */

import { Globe, Monitor, Server, User } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { getSourceBadgeVariant } from './utils';

interface ActorCardProps {
  adminEmail?: string | null;
  source: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionFingerprint?: string | null;
  mcpSessionId?: string | null;
  mcpToolName?: string | null;
}

export function ActorCard({
  adminEmail,
  source,
  ipAddress,
  userAgent,
  sessionFingerprint,
  mcpSessionId,
  mcpToolName,
}: ActorCardProps) {
  // Parse user agent for browser/OS info
  const deviceInfo = parseUserAgent(userAgent);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="h-4 w-4" />
          Actor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Admin</span>
          <span className="font-medium">{adminEmail || 'Unknown'}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Source</span>
          <Badge variant={getSourceBadgeVariant(source)}>{formatSource(source)}</Badge>
        </div>

        {ipAddress ? (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              IP Address
            </span>
            <span className="font-mono text-xs">{ipAddress}</span>
          </div>
        ) : null}

        {deviceInfo ? (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Monitor className="h-3.5 w-3.5" />
              Device
            </span>
            <span className="text-xs">{deviceInfo}</span>
          </div>
        ) : null}

        {sessionFingerprint ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Session ID</span>
            <span className="font-mono text-xs">{sessionFingerprint}</span>
          </div>
        ) : null}

        {source === 'MCP_ADMIN' && mcpSessionId ? (
          <>
            <div className="my-2 border-t" />
            <div className="flex items-center gap-2 text-sm font-medium">
              <Server className="h-4 w-4" />
              MCP Admin Details
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">MCP Session</span>
              <span className="font-mono text-xs">{truncate(mcpSessionId, 16)}</span>
            </div>
            {mcpToolName ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tool</span>
                <span className="font-mono text-xs">{mcpToolName}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatSource(source: string): string {
  switch (source) {
    case 'UI':
      return 'Dashboard';
    case 'MCP_ADMIN':
      return 'MCP Admin';
    case 'API':
      return 'API';
    case 'SYSTEM':
      return 'System';
    default:
      return source;
  }
}

function parseUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;

  // Simple parsing for common browsers
  if (userAgent.includes('Chrome')) {
    const match = userAgent.match(/Chrome\/(\d+)/);
    const version = match ? match[1] : '';
    if (userAgent.includes('Mac')) return `Chrome ${version} on macOS`;
    if (userAgent.includes('Windows')) return `Chrome ${version} on Windows`;
    if (userAgent.includes('Linux')) return `Chrome ${version} on Linux`;
    return `Chrome ${version}`;
  }

  if (userAgent.includes('Firefox')) {
    const match = userAgent.match(/Firefox\/(\d+)/);
    const version = match ? match[1] : '';
    if (userAgent.includes('Mac')) return `Firefox ${version} on macOS`;
    if (userAgent.includes('Windows')) return `Firefox ${version} on Windows`;
    if (userAgent.includes('Linux')) return `Firefox ${version} on Linux`;
    return `Firefox ${version}`;
  }

  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return 'Safari on macOS';
  }

  if (userAgent.includes('curl')) return 'curl (CLI)';
  if (userAgent.includes('node') || userAgent.includes('Node')) return 'Node.js';

  // Return truncated version if we can't parse it
  return truncate(userAgent, 40);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}
