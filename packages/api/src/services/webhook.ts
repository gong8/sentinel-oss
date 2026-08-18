/**
 * Webhook Service
 * Handles sending webhook notifications with support for multiple types:
 * - CUSTOM: Raw JSON payload with HMAC-SHA256 signatures
 * - DISCORD: Formatted embeds posted directly to Discord webhooks
 * - SLACK: Formatted blocks posted directly to Slack incoming webhooks
 * - EMAIL: Formatted HTML emails via Resend API
 */

import { prisma, Prisma, WebhookEndpointType, WebhookEvent } from '@sentinel/db';
import crypto from 'crypto';
import { z } from 'zod';
import { toJsonValue } from '../lib/jsonValue.js';
import { logger } from '../lib/logger.js';
import {
  getAffectedPolicies,
  getAgentOverride,
  getApplicablePolicies,
  getFlagConfig,
  getImpact,
  getMatchedPolicies,
  getMatcherChanges,
  getOrganizationContext,
  getRateLimitContext,
  getRequestingUser,
  getResolvedMatchers,
  getResolvedToolPatterns,
  getServerContext,
  getToolPatternChanges,
  getTypedDiff,
  getUserContext,
} from './webhookDataSchemas.js';
import { enrichPayloadIfVerbose, type VerboseEnrichmentContext } from './webhookVerbose.js';

/**
 * Zod schema for validating webhook payload from database
 */
const webhookPayloadSchema = z.object({
  event: z.nativeEnum(WebhookEvent),
  timestamp: z.string(),
  organizationId: z.string(),
  data: z.record(z.string(), z.unknown()),
});

/**
 * Generates an HMAC-SHA256 signature for webhook payload
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Generates a random secret for webhook endpoints
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  organizationId: string;
  data: Record<string, unknown>;
}

// ============================================================================
// Color Constants for Discord/Slack
// ============================================================================

const EVENT_COLORS: Record<WebhookEvent, number> = {
  // Green - success events
  [WebhookEvent.TOOL_INVOCATION_ALLOWED]: 0x22c55e,
  [WebhookEvent.POLICY_CREATED]: 0x22c55e,
  [WebhookEvent.AGENT_CREATED]: 0x22c55e,

  // Red - denial/limit events
  [WebhookEvent.TOOL_INVOCATION_DENIED]: 0xef4444,
  [WebhookEvent.SENSITIVE_RATE_LIMITED]: 0xef4444,

  // Yellow - warning events
  [WebhookEvent.SENSITIVE_APPROVAL_NEEDED]: 0xf59e0b,

  // Purple - sensitive tool events
  [WebhookEvent.SENSITIVE_TOOL_INVOKED]: 0x7c3aed,

  // Blue - update/delete events
  [WebhookEvent.POLICY_UPDATED]: 0x3b82f6,
  [WebhookEvent.POLICY_DELETED]: 0x3b82f6,
  [WebhookEvent.AGENT_DELETED]: 0x3b82f6,

  // Orange - session events
  [WebhookEvent.SESSION_TERMINATED]: 0xf97316,
};

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Formats an event name for display
 */
function formatEventName(event: WebhookEvent): string {
  return event
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Converts hex color to RGB string for Slack
 */
function hexToSlackColor(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

// ============================================================================
// Common Helpers
// ============================================================================

/** HTTP timeout in milliseconds for webhook delivery */
const HTTP_TIMEOUT_MS = 30000;

/** Result type for webhook delivery operations */
interface DeliveryResult {
  success: boolean;
  status?: number;
  body?: string;
  error?: string;
}

/**
 * Performs an HTTP POST request with timeout handling
 */
async function fetchWithTimeout(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<DeliveryResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => '');

    return {
      success: response.ok,
      status: response.status,
      body: responseBody,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timed out after 30 seconds' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Truncates an array and returns a formatted string with overflow suffix
 */
function formatListWithOverflow(items: string[], maxItems: number, separator = ', '): string {
  const displayed = items.slice(0, maxItems).join(separator);
  const remaining = items.length - maxItems;
  return remaining > 0 ? `${displayed} (+${remaining} more)` : displayed;
}

/**
 * Formats policy list as "slug (effect)" entries
 */
function formatPolicyList(
  policies: Array<{ slug: string; effect: string }>,
  maxItems: number,
): string {
  return formatListWithOverflow(
    policies.map((p) => `${p.slug} (${p.effect})`),
    maxItems,
  );
}

/**
 * Formats added/removed changes into a single string
 */
function formatChanges(
  changes: { added?: string[]; removed?: string[] } | undefined,
  addedLabel = 'Added',
  removedLabel = 'Removed',
): string[] {
  if (!changes) return [];
  const parts: string[] = [];
  if (changes.added && changes.added.length > 0) {
    parts.push(`${addedLabel}: ${changes.added.join(', ')}`);
  }
  if (changes.removed && changes.removed.length > 0) {
    parts.push(`${removedLabel}: ${changes.removed.join(', ')}`);
  }
  return parts;
}

/**
 * Formats impact counts into a readable string
 */
function formatImpact(
  impact: { affectedUserCount?: number | null; affectedAgentCount?: number | null } | undefined,
): string | undefined {
  if (!impact) return undefined;
  const parts: string[] = [];
  if (impact.affectedUserCount !== undefined && impact.affectedUserCount !== null) {
    parts.push(`${impact.affectedUserCount} user(s)`);
  }
  if (impact.affectedAgentCount !== undefined && impact.affectedAgentCount !== null) {
    parts.push(`${impact.affectedAgentCount} agent(s)`);
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Extracts user display string with optional role info
 */
function formatUserWithRoles(
  user: { email?: string; roles?: Array<{ name: string } | string> } | undefined,
): string | undefined {
  if (!user?.email) return undefined;
  if (!user.roles || user.roles.length === 0) return user.email;
  const roleNames = user.roles.map((r) => (typeof r === 'string' ? r : r.name)).join(', ');
  return `${user.email} (${roleNames})`;
}

/**
 * Formats rate limit config as a readable string
 */
function formatRateLimit(
  rateLimit: { maxPerSession?: number; windowMinutes?: number } | null | undefined,
): string | undefined {
  if (!rateLimit) return undefined;
  return `${rateLimit.maxPerSession ?? '?'} per ${rateLimit.windowMinutes ?? '?'} min`;
}

// ============================================================================
// Discord Formatting
// ============================================================================

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string };
}

interface DiscordPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

/**
 * Helper to add a field if value is truthy
 */
function addFieldIf(
  fields: Array<{ name: string; value: string; inline: boolean }>,
  name: string,
  value: string | undefined | null,
  inline: boolean,
): void {
  if (value) {
    fields.push({ name, value, inline });
  }
}

/**
 * Truncates text to a maximum length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;
}

/**
 * Formats resolved matchers or tool patterns as a code block
 */
function formatResolvedItems<T extends { raw: string }>(
  items: T[] | undefined,
  formatter: (item: T) => string,
  maxItems: number,
): string | undefined {
  if (!items || items.length === 0) return undefined;
  const formatted = items.slice(0, maxItems).map(formatter).join('\n');
  const suffix = items.length > maxItems ? `\n(+${items.length - maxItems} more)` : '';
  return '```\n' + formatted + suffix + '\n```';
}

/**
 * Formats policy diff changes
 */
function formatDiffChanges(
  typedDiff:
    | {
        before?: { effect?: string; enabled?: boolean };
        after?: { effect?: string; enabled?: boolean };
        changedFields?: string[];
      }
    | undefined,
): string | undefined {
  if (!typedDiff?.changedFields || typedDiff.changedFields.length === 0) return undefined;
  const changes: string[] = [];
  if (typedDiff.before?.effect !== typedDiff.after?.effect) {
    changes.push(`Effect: ${typedDiff.before?.effect} → ${typedDiff.after?.effect}`);
  }
  if (typedDiff.before?.enabled !== typedDiff.after?.enabled) {
    changes.push(`Enabled: ${typedDiff.before?.enabled} → ${typedDiff.after?.enabled}`);
  }
  if (changes.length === 0) {
    changes.push(`Changed: ${typedDiff.changedFields.join(', ')}`);
  }
  return changes.join('\n');
}

/**
 * Formats the webhook payload for Discord
 */
export function formatDiscordPayload(payload: WebhookPayload): DiscordPayload {
  const { event, timestamp, data } = payload;

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  // Common fields - prefer friendly names when available
  const toolName = data.toolFriendlyName ?? data.toolName;
  addFieldIf(fields, 'Tool', toolName ? String(toolName) : undefined, true);
  addFieldIf(fields, 'Pattern', data.toolPattern ? String(data.toolPattern) : undefined, true);
  addFieldIf(fields, 'User ID', data.userId ? String(data.userId) : undefined, true);
  addFieldIf(fields, 'Agent ID', data.agentId ? String(data.agentId) : undefined, true);
  addFieldIf(
    fields,
    'Session',
    data.sessionId ? String(data.sessionId).slice(0, 8) + '...' : undefined,
    true,
  );

  // Policy event fields
  addFieldIf(fields, 'Policy', data.policySlug ? String(data.policySlug) : undefined, true);
  addFieldIf(fields, 'Effect', data.effect ? String(data.effect) : undefined, true);
  if (data.description && String(data.description).length > 0) {
    addFieldIf(fields, 'Description', truncate(String(data.description), 100), false);
  }
  if (Array.isArray(data.matchers) && data.matchers.length > 0) {
    addFieldIf(fields, 'Matchers', formatListWithOverflow(data.matchers.map(String), 5), false);
  }
  if (Array.isArray(data.toolPatterns) && data.toolPatterns.length > 0) {
    addFieldIf(
      fields,
      'Tool Patterns',
      formatListWithOverflow(data.toolPatterns.map(String), 5),
      false,
    );
  }
  addFieldIf(fields, 'Created By', data.createdBy ? String(data.createdBy) : undefined, true);
  addFieldIf(fields, 'Updated By', data.updatedBy ? String(data.updatedBy) : undefined, true);
  addFieldIf(fields, 'Deleted By', data.deletedBy ? String(data.deletedBy) : undefined, true);

  // Agent event fields
  addFieldIf(fields, 'Agent Name', data.agentName ? String(data.agentName) : undefined, true);

  // Verbose enrichment fields
  addFieldIf(fields, 'Impact', formatImpact(getImpact(data)), true);

  const resolved = getResolvedMatchers(data);
  addFieldIf(
    fields,
    'Resolved Matchers',
    formatResolvedItems(
      resolved,
      (m) => `${m.raw} → ${m.targetName ?? m.type} (${m.affectedCount})`,
      3,
    ),
    false,
  );

  const matcherChangeParts = formatChanges(getMatcherChanges(data));
  if (matcherChangeParts.length > 0) {
    addFieldIf(fields, 'Matcher Changes', matcherChangeParts.join('\n'), false);
  }

  const patternChangeParts = formatChanges(getToolPatternChanges(data));
  if (patternChangeParts.length > 0) {
    addFieldIf(fields, 'Pattern Changes', patternChangeParts.join('\n'), false);
  }

  addFieldIf(fields, 'User', formatUserWithRoles(getUserContext(data)), true);

  // Flag config (for sensitive events)
  const flag = getFlagConfig(data);
  if (flag) {
    addFieldIf(fields, 'Flag Pattern', flag.toolPattern, true);
    if (flag.behaviors && flag.behaviors.length > 0) {
      addFieldIf(fields, 'Behaviors', flag.behaviors.join(', '), true);
    }
    addFieldIf(fields, 'Rate Limit', formatRateLimit(flag.rateLimit), true);
    if (flag.approvalConfig?.allowedApprovers && flag.approvalConfig.allowedApprovers.length > 0) {
      addFieldIf(fields, 'Approvers', flag.approvalConfig.allowedApprovers.join(', '), true);
    }
  }

  // Matched policies (tool invocation)
  const matchedPolicies = getMatchedPolicies(data);
  if (matchedPolicies && matchedPolicies.length > 0) {
    addFieldIf(fields, 'Matched Policies', formatPolicyList(matchedPolicies, 3), false);
  }

  // Server context (tool invocation)
  const serverCtx = getServerContext(data);
  if (serverCtx?.name) {
    addFieldIf(fields, 'Server', `${serverCtx.name}${serverCtx.trusted ? ' (trusted)' : ''}`, true);
  }

  // Agent override (sensitive events)
  const agentOverride = getAgentOverride(data);
  if (agentOverride?.exempted) {
    addFieldIf(fields, 'Agent Exempted', 'Yes', true);
  } else if (agentOverride?.customBehaviors && agentOverride.customBehaviors.length > 0) {
    addFieldIf(fields, 'Agent Behaviors', agentOverride.customBehaviors.join(', '), true);
  }

  // Requesting user (approval events)
  const reqUser = getRequestingUser(data);
  if (reqUser?.email) {
    const adminRole = reqUser.roles?.find((r) => r.isAdmin);
    addFieldIf(fields, 'Requesting User', reqUser.email + (adminRole ? ' (admin)' : ''), true);
  }

  // Rate limit context
  const rateLimitCtx = getRateLimitContext(data);
  if (rateLimitCtx) {
    addFieldIf(
      fields,
      'Current Usage',
      rateLimitCtx.currentUsage !== undefined ? String(rateLimitCtx.currentUsage) : undefined,
      true,
    );
    addFieldIf(fields, 'Resets At', rateLimitCtx.resetAt, true);
  }

  // Resolved tool patterns (policy events)
  const resolvedToolPatterns = getResolvedToolPatterns(data);
  addFieldIf(
    fields,
    'Resolved Tool Patterns',
    formatResolvedItems(
      resolvedToolPatterns,
      (p) => `${p.raw} → ${p.serverName ?? 'unknown'} (${p.matchedToolCount} tools)`,
      3,
    ),
    false,
  );

  // Policy diff (updates)
  addFieldIf(fields, 'Changes', formatDiffChanges(getTypedDiff(data)), false);

  // Applicable/Affected policies
  const applicablePolicies = getApplicablePolicies(data);
  if (applicablePolicies && applicablePolicies.length > 0) {
    addFieldIf(fields, 'Applicable Policies', formatPolicyList(applicablePolicies, 5), false);
  }

  const affectedPolicies = getAffectedPolicies(data);
  if (affectedPolicies && affectedPolicies.length > 0) {
    addFieldIf(fields, 'Affected Policies', formatPolicyList(affectedPolicies, 5), false);
  }

  // Organization context (agent events)
  const orgCtx = getOrganizationContext(data);
  if (orgCtx) {
    addFieldIf(
      fields,
      'Total Agents',
      orgCtx.totalAgents !== undefined ? String(orgCtx.totalAgents) : undefined,
      true,
    );
    addFieldIf(
      fields,
      'Remaining Agents',
      orgCtx.remainingAgents !== undefined ? String(orgCtx.remainingAgents) : undefined,
      true,
    );
  }

  // Event-specific fields
  if (event === WebhookEvent.SENSITIVE_RATE_LIMITED) {
    addFieldIf(
      fields,
      'Remaining',
      data.remaining !== undefined ? String(data.remaining) : undefined,
      true,
    );
    addFieldIf(fields, 'Reset At', data.resetAt ? String(data.resetAt) : undefined, true);
  }

  if (event === WebhookEvent.SENSITIVE_APPROVAL_NEEDED) {
    addFieldIf(fields, 'Request ID', data.requestId ? String(data.requestId) : undefined, true);
    addFieldIf(fields, 'Expires At', data.expiresAt ? String(data.expiresAt) : undefined, true);
  }

  // Parameters (sanitized)
  if (data.parameters && typeof data.parameters === 'object') {
    const paramStr = JSON.stringify(data.parameters, null, 2);
    if (paramStr.length <= 1000) {
      addFieldIf(fields, 'Parameters', '```json\n' + paramStr + '\n```', false);
    }
  }

  // Test messages
  if (data.test === true) {
    addFieldIf(fields, 'Test', 'This is a test message', false);
    addFieldIf(fields, 'Message', data.message ? String(data.message) : undefined, false);
  }

  const embed: DiscordEmbed = {
    title: `Sentinel: ${formatEventName(event)}`,
    color: EVENT_COLORS[event] ?? 0x6b7280, // Gray default
    fields: fields.length > 0 ? fields : undefined,
    timestamp,
    footer: { text: 'Sentinel Control Plane' },
  };

  return { embeds: [embed] };
}

// ============================================================================
// Slack Formatting
// ============================================================================

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{ type: string; text: string }>;
}

interface SlackPayload {
  text: string; // Fallback for notifications
  blocks: SlackBlock[];
}

/**
 * Helper to add a Slack field if value is truthy
 */
function addSlackField(
  fields: Array<{ type: string; text: string }>,
  label: string,
  value: unknown,
): void {
  if (value !== undefined && value !== null && value !== '') {
    fields.push({ type: 'mrkdwn', text: `*${label}:*\n${value}` });
  }
}

/**
 * Helper to add a Slack section block if text is provided
 */
function addSlackSection(blocks: SlackBlock[], label: string, value: string | undefined): void {
  if (value) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${label}:*\n${value}` } });
  }
}

/**
 * Helper to add a Slack inline section (label: value on same line)
 */
function addSlackInlineSection(
  blocks: SlackBlock[],
  label: string,
  value: string | undefined,
): void {
  if (value) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${label}:* ${value}` } });
  }
}

/**
 * Formats resolved items for Slack (bullet list format)
 */
function formatResolvedItemsSlack<T extends { raw: string }>(
  items: T[] | undefined,
  formatter: (item: T) => string,
  maxItems: number,
): string | undefined {
  if (!items || items.length === 0) return undefined;
  const formatted = items
    .slice(0, maxItems)
    .map((item) => `• ${formatter(item)}`)
    .join('\n');
  const suffix = items.length > maxItems ? `\n(+${items.length - maxItems} more)` : '';
  return formatted + suffix;
}

/**
 * Formats the webhook payload for Slack
 */
export function formatSlackPayload(payload: WebhookPayload): SlackPayload {
  const { event, timestamp, data } = payload;
  const eventName = formatEventName(event);
  const color = hexToSlackColor(EVENT_COLORS[event] ?? 0x6b7280);

  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: `Sentinel: ${eventName}`, emoji: true } },
  ];

  // Build fields section
  const fields: Array<{ type: string; text: string }> = [];
  const toolName = data.toolFriendlyName ?? data.toolName;
  addSlackField(fields, 'Tool', toolName);
  addSlackField(fields, 'Pattern', data.toolPattern);
  addSlackField(fields, 'User ID', data.userId);
  addSlackField(fields, 'Agent ID', data.agentId);
  addSlackField(fields, 'Policy', data.policySlug);
  addSlackField(fields, 'Effect', data.effect);
  addSlackField(fields, 'Created By', data.createdBy);
  addSlackField(fields, 'Updated By', data.updatedBy);
  addSlackField(fields, 'Deleted By', data.deletedBy);
  addSlackField(fields, 'Agent Name', data.agentName);

  if (fields.length > 0) {
    blocks.push({ type: 'section', fields });
  }

  // Description
  if (data.description && String(data.description).length > 0) {
    addSlackSection(blocks, 'Description', truncate(String(data.description), 200));
  }

  // Matchers and tool patterns
  if (Array.isArray(data.matchers) && data.matchers.length > 0) {
    addSlackSection(blocks, 'Matchers', formatListWithOverflow(data.matchers.map(String), 5));
  }
  if (Array.isArray(data.toolPatterns) && data.toolPatterns.length > 0) {
    addSlackSection(
      blocks,
      'Tool Patterns',
      formatListWithOverflow(data.toolPatterns.map(String), 5),
    );
  }

  // Verbose enrichment fields
  addSlackInlineSection(blocks, 'Impact', formatImpact(getImpact(data)));

  const resolved = getResolvedMatchers(data);
  addSlackSection(
    blocks,
    'Resolved Matchers',
    formatResolvedItemsSlack(
      resolved,
      (m) => `${m.raw} → ${m.targetName ?? m.type} (${m.affectedCount})`,
      3,
    ),
  );

  const matcherChangeParts = formatChanges(getMatcherChanges(data));
  if (matcherChangeParts.length > 0) {
    addSlackSection(blocks, 'Matcher Changes', matcherChangeParts.join('\n'));
  }

  const patternChangeParts = formatChanges(getToolPatternChanges(data));
  if (patternChangeParts.length > 0) {
    addSlackSection(blocks, 'Pattern Changes', patternChangeParts.join('\n'));
  }

  addSlackInlineSection(blocks, 'User', formatUserWithRoles(getUserContext(data)));

  // Flag config (for sensitive events)
  const flag = getFlagConfig(data);
  if (flag) {
    const flagParts: string[] = [];
    if (flag.toolPattern) flagParts.push(`Pattern: ${flag.toolPattern}`);
    if (flag.behaviors && flag.behaviors.length > 0) {
      flagParts.push(`Behaviors: ${flag.behaviors.join(', ')}`);
    }
    const rateLimitStr = formatRateLimit(flag.rateLimit);
    if (rateLimitStr) flagParts.push(`Rate Limit: ${rateLimitStr}`);
    if (flag.approvalConfig?.allowedApprovers && flag.approvalConfig.allowedApprovers.length > 0) {
      flagParts.push(`Approvers: ${flag.approvalConfig.allowedApprovers.join(', ')}`);
    }
    if (flagParts.length > 0) {
      addSlackSection(blocks, 'Flag Config', flagParts.join('\n'));
    }
  }

  // Matched policies
  const matchedPolicies = getMatchedPolicies(data);
  if (matchedPolicies && matchedPolicies.length > 0) {
    addSlackSection(blocks, 'Matched Policies', formatPolicyList(matchedPolicies, 3));
  }

  // Server context
  const serverCtx = getServerContext(data);
  if (serverCtx?.name) {
    addSlackInlineSection(
      blocks,
      'Server',
      `${serverCtx.name}${serverCtx.trusted ? ' (trusted)' : ''}`,
    );
  }

  // Agent override
  const agentOverride = getAgentOverride(data);
  if (agentOverride?.exempted) {
    addSlackInlineSection(blocks, 'Agent Exempted', 'Yes');
  } else if (agentOverride?.customBehaviors && agentOverride.customBehaviors.length > 0) {
    addSlackInlineSection(blocks, 'Agent Behaviors', agentOverride.customBehaviors.join(', '));
  }

  // Requesting user
  const reqUser = getRequestingUser(data);
  if (reqUser?.email) {
    const adminRole = reqUser.roles?.find((r) => r.isAdmin);
    addSlackInlineSection(blocks, 'Requesting User', reqUser.email + (adminRole ? ' (admin)' : ''));
  }

  // Rate limit context
  const rateLimitCtx = getRateLimitContext(data);
  if (rateLimitCtx) {
    const rateParts: string[] = [];
    if (rateLimitCtx.currentUsage !== undefined)
      rateParts.push(`Current Usage: ${rateLimitCtx.currentUsage}`);
    if (rateLimitCtx.resetAt) rateParts.push(`Resets At: ${rateLimitCtx.resetAt}`);
    if (rateParts.length > 0) {
      addSlackSection(blocks, 'Rate Limit Status', rateParts.join('\n'));
    }
  }

  // Resolved tool patterns
  const resolvedToolPatterns = getResolvedToolPatterns(data);
  addSlackSection(
    blocks,
    'Resolved Tool Patterns',
    formatResolvedItemsSlack(
      resolvedToolPatterns,
      (p) => `${p.raw} → ${p.serverName ?? 'unknown'} (${p.matchedToolCount} tools)`,
      3,
    ),
  );

  // Policy diff
  const diffChanges = formatDiffChanges(getTypedDiff(data));
  if (diffChanges) {
    addSlackSection(blocks, 'Changes', diffChanges);
  }

  // Applicable/Affected policies
  const applicablePolicies = getApplicablePolicies(data);
  if (applicablePolicies && applicablePolicies.length > 0) {
    addSlackSection(blocks, 'Applicable Policies', formatPolicyList(applicablePolicies, 5));
  }

  const affectedPolicies = getAffectedPolicies(data);
  if (affectedPolicies && affectedPolicies.length > 0) {
    addSlackSection(blocks, 'Affected Policies', formatPolicyList(affectedPolicies, 5));
  }

  // Organization context
  const orgCtx = getOrganizationContext(data);
  if (orgCtx) {
    const orgParts: string[] = [];
    if (orgCtx.totalAgents !== undefined) orgParts.push(`Total Agents: ${orgCtx.totalAgents}`);
    if (orgCtx.remainingAgents !== undefined)
      orgParts.push(`Remaining Agents: ${orgCtx.remainingAgents}`);
    if (orgParts.length > 0) {
      addSlackSection(blocks, 'Organization', orgParts.join('\n'));
    }
  }

  // Context block with timestamp and event-specific fields
  const contextFields: Array<{ type: string; text: string }> = [
    { type: 'mrkdwn', text: `*Time:* ${timestamp}` },
  ];
  if (data.sessionId) {
    contextFields.push({
      type: 'mrkdwn',
      text: `*Session:* ${String(data.sessionId).slice(0, 8)}...`,
    });
  }
  if (event === WebhookEvent.SENSITIVE_RATE_LIMITED && data.remaining !== undefined) {
    contextFields.push({ type: 'mrkdwn', text: `*Remaining:* ${data.remaining}` });
  }
  if (event === WebhookEvent.SENSITIVE_APPROVAL_NEEDED && data.requestId) {
    contextFields.push({ type: 'mrkdwn', text: `*Request ID:* ${data.requestId}` });
  }
  blocks.push({ type: 'context', elements: contextFields });

  // Test messages
  if (data.test === true) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_This is a test message from Sentinel_${data.message ? `\n${data.message}` : ''}`,
      },
    });
  }

  // Color indicator
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Color: ${color} | Sentinel Control Plane` }],
  });

  return { text: `Sentinel: ${eventName}`, blocks };
}

// ============================================================================
// Email Formatting
// ============================================================================

interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}

/**
 * Email configuration schema for webhook endpoints
 */
interface EmailConfig {
  recipients: string[];
}

/**
 * Validates and parses email config from Prisma JSON
 */
function parseEmailConfig(config: Prisma.JsonValue): EmailConfig | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return null;
  }

  // Use 'in' operator to safely check for recipients property
  if (
    !('recipients' in config) ||
    !Array.isArray(config.recipients) ||
    config.recipients.length === 0
  ) {
    return null;
  }

  // Validate all recipients are strings (email format validation done at API level)
  if (!config.recipients.every((r): r is string => typeof r === 'string')) {
    return null;
  }

  return { recipients: config.recipients };
}

/**
 * Formats resolved items for Email (semicolon-separated)
 */
function formatResolvedItemsEmail<T extends { raw: string }>(
  items: T[] | undefined,
  formatter: (item: T) => string,
  maxItems: number,
): string | undefined {
  if (!items || items.length === 0) return undefined;
  const formatted = items.slice(0, maxItems).map(formatter).join('; ');
  const suffix = items.length > maxItems ? ` (+${items.length - maxItems} more)` : '';
  return formatted + suffix;
}

/**
 * Formats the webhook payload for Email
 */
export function formatEmailPayload(payload: WebhookPayload): EmailPayload {
  const { event, timestamp, data } = payload;
  const eventName = formatEventName(event);
  const color = hexToSlackColor(EVENT_COLORS[event] ?? 0x6b7280);

  const rows: string[] = [];
  const textLines: string[] = [];

  // Helper to add both HTML and text versions
  function addField(label: string, value: string | undefined): void {
    if (!value) return;
    rows.push(`<tr><td><strong>${label}:</strong></td><td>${value}</td></tr>`);
    textLines.push(`${label}: ${value}`);
  }

  // Common fields - prefer friendly names when available
  const toolName = data.toolFriendlyName ?? data.toolName;
  addField('Tool', toolName ? String(toolName) : undefined);
  addField('Pattern', data.toolPattern ? String(data.toolPattern) : undefined);
  addField('User ID', data.userId ? String(data.userId) : undefined);
  addField('Agent ID', data.agentId ? String(data.agentId) : undefined);
  addField('Session', data.sessionId ? String(data.sessionId).slice(0, 8) + '...' : undefined);

  // Policy event fields
  addField('Policy', data.policySlug ? String(data.policySlug) : undefined);
  addField('Effect', data.effect ? String(data.effect) : undefined);
  addField('Created By', data.createdBy ? String(data.createdBy) : undefined);
  addField('Updated By', data.updatedBy ? String(data.updatedBy) : undefined);
  addField('Deleted By', data.deletedBy ? String(data.deletedBy) : undefined);

  // Agent event fields
  addField('Agent Name', data.agentName ? String(data.agentName) : undefined);

  // Description
  if (data.description && String(data.description).length > 0) {
    addField('Description', truncate(String(data.description), 100));
  }

  // Matchers and tool patterns
  if (Array.isArray(data.matchers) && data.matchers.length > 0) {
    addField('Matchers', formatListWithOverflow(data.matchers.map(String), 5));
  }
  if (Array.isArray(data.toolPatterns) && data.toolPatterns.length > 0) {
    addField('Tool Patterns', formatListWithOverflow(data.toolPatterns.map(String), 5));
  }

  // Verbose enrichment fields
  addField('Impact', formatImpact(getImpact(data)));

  const matcherChangeParts = formatChanges(getMatcherChanges(data));
  if (matcherChangeParts.length > 0) {
    addField('Matcher Changes', matcherChangeParts.join('; '));
  }

  const patternChangeParts = formatChanges(getToolPatternChanges(data));
  if (patternChangeParts.length > 0) {
    addField('Pattern Changes', patternChangeParts.join('; '));
  }

  addField('User', formatUserWithRoles(getUserContext(data)));

  // Flag config (for sensitive events)
  const flag = getFlagConfig(data);
  if (flag) {
    addField('Flag Pattern', flag.toolPattern);
    if (flag.behaviors && flag.behaviors.length > 0) {
      addField('Behaviors', flag.behaviors.join(', '));
    }
    addField('Rate Limit', formatRateLimit(flag.rateLimit));
    if (flag.approvalConfig?.allowedApprovers && flag.approvalConfig.allowedApprovers.length > 0) {
      addField('Approvers', flag.approvalConfig.allowedApprovers.join(', '));
    }
  }

  // Matched policies
  const matchedPolicies = getMatchedPolicies(data);
  if (matchedPolicies && matchedPolicies.length > 0) {
    addField('Matched Policies', formatPolicyList(matchedPolicies, 3));
  }

  // Server context
  const serverCtx = getServerContext(data);
  if (serverCtx?.name) {
    addField('Server', `${serverCtx.name}${serverCtx.trusted ? ' (trusted)' : ''}`);
  }

  // Agent override
  const agentOverride = getAgentOverride(data);
  if (agentOverride?.exempted) {
    addField('Agent Exempted', 'Yes');
  } else if (agentOverride?.customBehaviors && agentOverride.customBehaviors.length > 0) {
    addField('Agent Behaviors', agentOverride.customBehaviors.join(', '));
  }

  // Requesting user
  const reqUser = getRequestingUser(data);
  if (reqUser?.email) {
    const adminRole = reqUser.roles?.find((r) => r.isAdmin);
    addField('Requesting User', reqUser.email + (adminRole ? ' (admin)' : ''));
  }

  // Rate limit context
  const rateLimitCtx = getRateLimitContext(data);
  if (rateLimitCtx) {
    addField(
      'Current Usage',
      rateLimitCtx.currentUsage !== undefined ? String(rateLimitCtx.currentUsage) : undefined,
    );
    addField('Resets At', rateLimitCtx.resetAt);
  }

  // Resolved matchers
  addField(
    'Resolved Matchers',
    formatResolvedItemsEmail(
      getResolvedMatchers(data),
      (m) => `${m.raw} → ${m.targetName ?? m.type} (${m.affectedCount})`,
      3,
    ),
  );

  // Resolved tool patterns
  addField(
    'Resolved Tool Patterns',
    formatResolvedItemsEmail(
      getResolvedToolPatterns(data),
      (p) => `${p.raw} → ${p.serverName ?? 'unknown'} (${p.matchedToolCount} tools)`,
      3,
    ),
  );

  // Policy diff
  const diffChanges = formatDiffChanges(getTypedDiff(data));
  if (diffChanges) {
    addField('Changes', diffChanges.replace(/\n/g, '; '));
  }

  // Applicable/Affected policies
  const applicablePolicies = getApplicablePolicies(data);
  if (applicablePolicies && applicablePolicies.length > 0) {
    addField('Applicable Policies', formatPolicyList(applicablePolicies, 5));
  }

  const affectedPolicies = getAffectedPolicies(data);
  if (affectedPolicies && affectedPolicies.length > 0) {
    addField('Affected Policies', formatPolicyList(affectedPolicies, 5));
  }

  // Organization context
  const orgCtx = getOrganizationContext(data);
  if (orgCtx) {
    addField(
      'Total Agents',
      orgCtx.totalAgents !== undefined ? String(orgCtx.totalAgents) : undefined,
    );
    addField(
      'Remaining Agents',
      orgCtx.remainingAgents !== undefined ? String(orgCtx.remainingAgents) : undefined,
    );
  }

  // Timestamp
  addField('Time', timestamp);

  // Test messages
  if (data.test === true) {
    rows.push(`<tr><td colspan="2"><em>This is a test message from Sentinel</em></td></tr>`);
    textLines.push('This is a test message from Sentinel');
    if (data.message) {
      rows.push(`<tr><td colspan="2">${data.message}</td></tr>`);
      textLines.push(String(data.message));
    }
  }

  return {
    subject: `Sentinel Alert: ${eventName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${color}; height: 4px; border-radius: 4px 4px 0 0;"></div>
        <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 4px 4px;">
          <h2 style="margin: 0 0 16px 0; color: #111827;">Sentinel: ${eventName}</h2>
          <table style="width: 100%; border-collapse: collapse;">
            ${rows.join('\n')}
          </table>
          <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 12px;">Sentinel Control Plane</p>
        </div>
      </div>
    `,
    text: `Sentinel: ${eventName}\n\n${textLines.join('\n')}\n\n--\nSentinel Control Plane`,
  };
}

// ============================================================================
// URL Validators
// ============================================================================

/**
 * Validates a Discord webhook URL format
 */
export function isValidDiscordWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'discord.com' || parsed.hostname === 'discordapp.com') &&
      parsed.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

/**
 * Validates a Slack webhook URL format
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'hooks.slack.com' && parsed.pathname.startsWith('/services/');
  } catch {
    return false;
  }
}

/**
 * Sends a webhook notification to all subscribed endpoints
 * This should never throw - webhook failures are logged but don't block operations
 * @param organizationId - The organization ID
 * @param event - The webhook event type
 * @param data - The event data
 * @param workspaceId - Optional workspace ID for workspace-scoped filtering
 * @param verboseContext - Optional context for verbose enrichment (before snapshots, etc.)
 * @returns Array of delivery IDs
 */
export async function sendWebhook(
  organizationId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  workspaceId?: string | null,
  verboseContext?: VerboseEnrichmentContext,
): Promise<string[]> {
  const deliveryIds: string[] = [];

  try {
    // Find all enabled endpoints subscribed to this event
    // Filter by workspace: org-wide webhooks (null) OR workspace-specific webhooks
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        organizationId,
        enabled: true,
        events: { has: event },
        OR: [
          { workspaceId: null }, // Org-wide webhooks always fire
          { workspaceId: workspaceId ?? undefined }, // Workspace-specific webhooks only for matching workspace
        ],
      },
    });

    if (endpoints.length > 0) {
      const basePayload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        organizationId,
        data,
      };

      // Send to each endpoint in parallel
      const deliveries = await Promise.all(
        endpoints.map(async (endpoint) => {
          // Enrich payload if endpoint has verbose=true
          let payload = basePayload;
          if (endpoint.verbose) {
            try {
              payload = await enrichPayloadIfVerbose(basePayload, true, verboseContext);
            } catch (error) {
              logger.error('Failed to enrich verbose payload:', error);
              // Fall back to base payload on enrichment error
            }
          }
          return await deliverWebhook(endpoint, payload);
        }),
      );

      deliveryIds.push(...deliveries.filter((id): id is string => id !== null));
    }
  } catch (error) {
    logger.error('Failed to send webhooks:', error);
  }

  return deliveryIds;
}

// Re-export for use in trigger sites
export type { VerboseEnrichmentContext };

/**
 * Delivers a webhook to a single endpoint
 * Creates a delivery record and attempts delivery based on endpoint type
 * @returns Delivery ID or null on failure
 */
async function deliverWebhook(
  endpoint: {
    id: string;
    organizationId: string;
    type: WebhookEndpointType;
    url: string | null;
    secret: string | null;
    config: Prisma.JsonValue;
    maxRetries: number;
    retryDelayMs: number;
  },
  payload: WebhookPayload,
): Promise<string | null> {
  // Validate payload schema before storing (HIGH-002)
  const validatedPayload = webhookPayloadSchema.parse(payload);

  // Create delivery record with validated payload
  const delivery = await prisma.webhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      event: validatedPayload.event,
      payload: toJsonValue(validatedPayload),
    },
  });

  try {
    const result = await dispatchDelivery(endpoint, payload, delivery.id);

    if (result.success) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          responseStatus: result.status,
          // Ensure null is stored instead of undefined (LOW-002)
          responseBody: result.body?.slice(0, 1000) ?? null,
          deliveredAt: new Date(),
        },
      });
    } else {
      await handleDeliveryFailure(
        delivery.id,
        endpoint.organizationId,
        endpoint.maxRetries,
        endpoint.retryDelayMs,
        result.status ?? null,
        result.error ?? result.body ?? 'Unknown error',
      );
    }

    return delivery.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await handleDeliveryFailure(
      delivery.id,
      endpoint.organizationId,
      endpoint.maxRetries,
      endpoint.retryDelayMs,
      null,
      errorMessage,
    );
    return delivery.id;
  }
}

/**
 * Delivers a custom webhook with HMAC signature
 */
async function deliverCustomWebhook(
  endpoint: { url: string | null; secret: string | null },
  payload: WebhookPayload,
  deliveryId: string,
): Promise<DeliveryResult> {
  if (!endpoint.url) {
    return { success: false, error: 'No URL configured for custom webhook' };
  }

  const payloadString = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': payload.event,
    'X-Webhook-Timestamp': payload.timestamp,
    'X-Webhook-Delivery-Id': deliveryId,
  };

  if (endpoint.secret) {
    headers['X-Webhook-Signature'] = generateWebhookSignature(payloadString, endpoint.secret);
  }

  return fetchWithTimeout(endpoint.url, payloadString, headers);
}

/**
 * Delivers a formatted payload to Discord
 */
async function deliverToDiscord(
  url: string | null,
  payload: WebhookPayload,
): Promise<DeliveryResult> {
  if (!url) {
    return { success: false, error: 'No URL configured for Discord webhook' };
  }
  return fetchWithTimeout(url, JSON.stringify(formatDiscordPayload(payload)), {
    'Content-Type': 'application/json',
  });
}

/**
 * Delivers a formatted payload to Slack
 */
async function deliverToSlack(
  url: string | null,
  payload: WebhookPayload,
): Promise<DeliveryResult> {
  if (!url) {
    return { success: false, error: 'No URL configured for Slack webhook' };
  }
  return fetchWithTimeout(url, JSON.stringify(formatSlackPayload(payload)), {
    'Content-Type': 'application/json',
  });
}

/**
 * Delivers a formatted email notification using Resend API
 * Requires RESEND_API_KEY environment variable to be set
 */
async function deliverEmail(
  config: Prisma.JsonValue,
  payload: WebhookPayload,
): Promise<DeliveryResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { success: false, error: 'Email delivery requires RESEND_API_KEY environment variable' };
  }

  const emailConfig = parseEmailConfig(config);
  if (!emailConfig) {
    return { success: false, error: 'Invalid email configuration: recipients array is required' };
  }

  const emailPayload = formatEmailPayload(payload);
  const fromAddress = process.env.EMAIL_FROM || 'Sentinel <onboarding@resend.dev>';

  const result = await fetchWithTimeout(
    'https://api.resend.com/emails',
    JSON.stringify({
      from: fromAddress,
      to: emailConfig.recipients,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text,
    }),
    { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
  );

  // Add more descriptive error for Resend failures
  if (!result.success && result.body) {
    try {
      const errorData = JSON.parse(result.body);
      if (errorData.message) {
        return { ...result, error: `Resend API: ${errorData.message}` };
      }
    } catch {
      // Use existing error
    }
  }

  return result;
}

/**
 * Dispatches webhook delivery based on endpoint type
 */
async function dispatchDelivery(
  endpoint: {
    type: WebhookEndpointType;
    url: string | null;
    secret: string | null;
    config: Prisma.JsonValue;
  },
  payload: WebhookPayload,
  deliveryId: string,
): Promise<DeliveryResult> {
  switch (endpoint.type) {
    case WebhookEndpointType.CUSTOM:
      return deliverCustomWebhook(endpoint, payload, deliveryId);
    case WebhookEndpointType.DISCORD:
      return deliverToDiscord(endpoint.url, payload);
    case WebhookEndpointType.SLACK:
      return deliverToSlack(endpoint.url, payload);
    case WebhookEndpointType.EMAIL:
      return deliverEmail(endpoint.config, payload);
    default:
      return { success: false, error: `Unknown endpoint type: ${endpoint.type}` };
  }
}

/**
 * Handles delivery failure and schedules retry if appropriate
 */
async function handleDeliveryFailure(
  deliveryId: string,
  organizationId: string,
  maxRetries: number,
  retryDelayMs: number,
  responseStatus: number | null,
  responseBody: string,
): Promise<void> {
  // Scope query to organization via endpoint join (MED-004)
  const delivery = await prisma.webhookDelivery.findFirst({
    where: {
      id: deliveryId,
      endpoint: { organizationId },
    },
  });

  if (!delivery) return;

  const newRetryCount = delivery.retryCount + 1;
  const shouldRetry = newRetryCount <= maxRetries;

  // Calculate next retry time with exponential backoff
  const backoffMultiplier = Math.pow(2, newRetryCount - 1);
  const nextRetryAt = shouldRetry ? new Date(Date.now() + retryDelayMs * backoffMultiplier) : null;

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      responseStatus,
      responseBody: responseBody.slice(0, 1000),
      failedAt: shouldRetry ? null : new Date(),
      retryCount: newRetryCount,
      nextRetryAt,
    },
  });

  if (!shouldRetry) {
    logger.warn(`Webhook delivery ${deliveryId} failed after ${maxRetries} retries`);
  }
}

/**
 * System-wide maintenance function for retrying failed webhook deliveries across all organizations.
 * Should only be called from trusted cron jobs.
 */
export async function retryFailedDeliveries(): Promise<number> {
  let retriedCount = 0;

  try {
    // Find deliveries due for retry
    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        nextRetryAt: { lte: new Date() },
        failedAt: null,
        deliveredAt: null,
      },
      include: {
        endpoint: true,
      },
      take: 100, // Process in batches
    });

    for (const delivery of deliveries) {
      const parseResult = webhookPayloadSchema.safeParse(delivery.payload);
      if (!parseResult.success) {
        logger.error(`Invalid webhook payload for delivery ${delivery.id}:`, parseResult.error);
        // Mark as failed - payload is corrupted
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            failedAt: new Date(),
            responseBody: 'Invalid payload schema',
          },
        });
        continue;
      }
      const payload = parseResult.data;

      try {
        const result = await dispatchDelivery(delivery.endpoint, payload, delivery.id);

        if (result.success) {
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              responseStatus: result.status,
              // Ensure null is stored instead of undefined (LOW-002)
              responseBody: result.body?.slice(0, 1000) ?? null,
              deliveredAt: new Date(),
              nextRetryAt: null,
            },
          });
          retriedCount++;
        } else {
          await handleDeliveryFailure(
            delivery.id,
            delivery.endpoint.organizationId,
            delivery.endpoint.maxRetries,
            delivery.endpoint.retryDelayMs,
            result.status ?? null,
            result.error ?? result.body ?? 'Unknown error',
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await handleDeliveryFailure(
          delivery.id,
          delivery.endpoint.organizationId,
          delivery.endpoint.maxRetries,
          delivery.endpoint.retryDelayMs,
          null,
          errorMessage,
        );
      }
    }
  } catch (error) {
    logger.error('Failed to retry webhook deliveries:', error);
  }

  return retriedCount;
}

/**
 * Gets delivery status for a specific delivery
 */
export async function getDeliveryStatus(organizationId: string, deliveryId: string) {
  return prisma.webhookDelivery.findFirst({
    where: {
      id: deliveryId,
      endpoint: { organizationId },
    },
    include: {
      endpoint: {
        select: {
          name: true,
          url: true,
        },
      },
    },
  });
}

/**
 * Gets delivery history for an endpoint
 */
export async function getDeliveryHistory(
  organizationId: string,
  endpointId: string,
  options?: {
    limit?: number;
    offset?: number;
    event?: WebhookEvent;
  },
) {
  const where: Prisma.WebhookDeliveryWhereInput = {
    endpointId,
    endpoint: { organizationId },
  };

  if (options?.event) {
    where.event = options.event;
  }

  const [total, deliveries] = await Promise.all([
    prisma.webhookDelivery.count({ where }),
    prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
  ]);

  return { total, deliveries };
}

/**
 * Sends a test webhook to verify endpoint configuration
 */
export async function sendTestWebhook(
  organizationId: string,
  endpointId: string,
): Promise<{
  success: boolean;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
}> {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, organizationId },
  });

  if (!endpoint) {
    return { success: false, error: 'Endpoint not found' };
  }

  const payload: WebhookPayload = {
    event: WebhookEvent.TOOL_INVOCATION_ALLOWED, // Use a common event for test
    timestamp: new Date().toISOString(),
    organizationId: endpoint.organizationId,
    data: {
      test: true,
      message: 'This is a test webhook from Sentinel',
    },
  };

  const result = await dispatchDelivery(endpoint, payload, 'test');

  return {
    success: result.success,
    responseStatus: result.status,
    responseBody: result.body?.slice(0, 1000),
    error: result.error,
  };
}
