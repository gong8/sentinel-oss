/**
 * Utility functions for admin action log components
 */

import type { LucideProps } from 'lucide-react';
import {
  Bot,
  Building2,
  FileText,
  Flag,
  GitBranch,
  Key,
  Link,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Trash2,
  Undo2,
  User,
  UserCog,
  Users,
  Webhook,
} from 'lucide-react';

/**
 * Icon component that renders the appropriate icon for an action type
 * Uses direct JSX rendering to avoid the "Cannot create components during render" lint error
 */
export function ActionTypeIcon({
  actionType,
  ...props
}: { actionType: string } & LucideProps): React.ReactElement {
  // User actions
  if (actionType.startsWith('USER_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    if (actionType.includes('RESTORE')) return <Undo2 {...props} />;
    if (actionType.includes('ROLES')) return <UserCog {...props} />;
    if (actionType.includes('TOKEN')) return <Key {...props} />;
    return <User {...props} />;
  }

  // Role actions
  if (actionType.startsWith('ROLE_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    if (actionType.includes('RESTORE')) return <Undo2 {...props} />;
    return <Users {...props} />;
  }

  // Policy actions
  if (actionType.startsWith('POLICY_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    if (actionType.includes('RESTORE')) return <Undo2 {...props} />;
    return <Shield {...props} />;
  }

  // MCP Server actions
  if (actionType.startsWith('MCP_SERVER_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    if (actionType.includes('RESTORE')) return <Undo2 {...props} />;
    if (actionType.includes('DISCOVER')) return <RefreshCw {...props} />;
    return <Server {...props} />;
  }

  // OAuth actions
  if (actionType.startsWith('OAUTH_')) {
    if (actionType.includes('DISCONNECT')) return <Trash2 {...props} />;
    return <Link {...props} />;
  }

  // Agent actions
  if (actionType.startsWith('AGENT_') || actionType.startsWith('A2A_')) {
    if (actionType.includes('CREATE') || actionType.includes('REGISTER'))
      return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    if (actionType.includes('RESTORE')) return <Undo2 {...props} />;
    return <Bot {...props} />;
  }

  // Sensitive flag actions
  if (actionType.startsWith('SENSITIVE_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    return <Flag {...props} />;
  }

  // Webhook actions
  if (actionType.startsWith('WEBHOOK_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    return <Webhook {...props} />;
  }

  // Workspace actions
  if (actionType.startsWith('WORKSPACE_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    if (actionType.includes('RESTORE')) return <Undo2 {...props} />;
    return <Building2 {...props} />;
  }

  // Organization actions
  if (actionType.startsWith('ORG_') || actionType.startsWith('ORGANIZATION_')) {
    return <Building2 {...props} />;
  }

  // Permission/proposal actions
  if (actionType.includes('PERMISSION_') || actionType.includes('PROPOSAL_')) {
    return <FileText {...props} />;
  }

  // Variable actions
  if (actionType.startsWith('GLOBAL_VAR_')) {
    if (actionType.includes('CREATE')) return <Plus {...props} />;
    if (actionType.includes('DELETE')) return <Trash2 {...props} />;
    if (actionType.includes('RESTORE')) return <Undo2 {...props} />;
    return <GitBranch {...props} />;
  }

  // Default
  return <Settings {...props} />;
}

/**
 * Get badge variant for source
 */
export function getSourceBadgeVariant(
  source: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (source) {
    case 'UI':
      return 'default';
    case 'MCP_ADMIN':
      return 'secondary';
    case 'API':
      return 'outline';
    case 'SYSTEM':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Get action category from action type
 */
export function getActionCategory(
  actionType: string,
): 'user' | 'role' | 'policy' | 'server' | 'agent' | 'security' | 'workspace' | 'other' {
  if (actionType.startsWith('USER_')) return 'user';
  if (actionType.startsWith('ROLE_')) return 'role';
  if (actionType.startsWith('POLICY_')) return 'policy';
  if (actionType.startsWith('MCP_SERVER_') || actionType.startsWith('OAUTH_')) return 'server';
  if (actionType.startsWith('AGENT_') || actionType.startsWith('A2A_')) return 'agent';
  if (actionType.startsWith('SENSITIVE_') || actionType.startsWith('PERMISSION_'))
    return 'security';
  if (actionType.startsWith('WORKSPACE_') || actionType.startsWith('ORG_')) return 'workspace';
  return 'other';
}

/**
 * Check if a value looks like it might be sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  const sensitivePatterns = [
    'password',
    'secret',
    'token',
    'apikey',
    'api_key',
    'credential',
    'private',
  ];
  const lower = fieldName.toLowerCase();
  return sensitivePatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Format a value for display in diffs
 */
export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(empty)';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    if (value.length > 100) {
      return value.slice(0, 100) + '...';
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty array)';
    if (value.length <= 3) return value.join(', ');
    return `${value.slice(0, 3).join(', ')} (+${value.length - 3} more)`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
