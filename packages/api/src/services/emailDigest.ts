/**
 * Email Digest Service
 * Handles monthly usage digest generation and delivery
 */

import { AdminActionType, prisma } from '@sentinel/db';
import { featureDiscovery } from '@sentinel/shared';
import { generateDigestEmailHtml, generateDigestEmailText, sendEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';

type MonthlyStats = featureDiscovery.MonthlyStats;
type FeatureTip = featureDiscovery.FeatureTip;

/**
 * Map of feature tip actionTypes to AdminActionType enums
 * Maps string keys from FEATURE_TIPS to actual AdminActionType enum values
 * Note: Missing mappings will be filtered out, making those features appear "unused"
 */
const ACTION_TYPE_MAP: Record<string, AdminActionType> = {
  SENSITIVE_FLAG_CREATE: AdminActionType.SENSITIVE_FLAG_CREATE,
  GLOBAL_VARIABLE_CREATE: AdminActionType.GLOBAL_VAR_FIELD_CREATE,
  WORKSPACE_CREATE: AdminActionType.WORKSPACE_CREATE,
  A2A_CREDENTIAL_CREATE: AdminActionType.A2A_CREDENTIAL_SET,
  // POLICY_ASSERTION_CREATE is referenced in tips but doesn't exist yet in AdminActionType
};

const FEATURE_TIPS = featureDiscovery.FEATURE_TIPS;

/**
 * Day of week names for peak hour calculation
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Compute monthly statistics for an organization
 */
export async function computeMonthlyStats(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<MonthlyStats> {
  // Query audit log entries for the period
  const entries = await prisma.auditLogEntry.findMany({
    where: {
      organizationId: orgId,
      timestamp: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    select: {
      decision: true,
      userId: true,
      agentId: true,
      policyIds: true,
      timestamp: true,
    },
  });

  // Calculate tool call statistics
  const totalCalls = entries.length;
  const allowedCalls = entries.filter((e) => e.decision === 'ALLOWED').length;
  const deniedCalls = entries.filter((e) => e.decision === 'DENIED').length;

  // Count distinct users and agents
  const uniqueUsers = new Set(entries.filter((e) => e.userId).map((e) => e.userId));
  const uniqueAgents = new Set(entries.filter((e) => e.agentId).map((e) => e.agentId));

  // Count distinct policies triggered
  const uniquePolicies = new Set<string>();
  for (const entry of entries) {
    if (entry.policyIds && entry.policyIds.length > 0) {
      for (const policyId of entry.policyIds) {
        uniquePolicies.add(policyId);
      }
    }
  }

  // Calculate peak hour (group by hour and day of week)
  const peakHour = computePeakHour(entries.map((e) => e.timestamp));

  return {
    toolCalls: {
      total: totalCalls,
      allowed: allowedCalls,
      denied: deniedCalls,
    },
    activeUsers: uniqueUsers.size,
    activeAgents: uniqueAgents.size,
    policiesTriggered: uniquePolicies.size,
    peakHour,
  };
}

/**
 * Compute peak usage hour from timestamps
 */
function computePeakHour(timestamps: Date[]): { hour: number; dayOfWeek: string } | null {
  if (timestamps.length === 0) {
    return null;
  }

  // Group by hour and day combination
  const hourDayCounts = new Map<string, number>();

  for (const timestamp of timestamps) {
    const hour = timestamp.getUTCHours();
    const dayOfWeek = timestamp.getUTCDay();
    const key = `${hour}-${dayOfWeek}`;
    hourDayCounts.set(key, (hourDayCounts.get(key) ?? 0) + 1);
  }

  // Find the most common hour-day combination
  let maxCount = 0;
  let peakKey = '';

  for (const [key, count] of hourDayCounts) {
    if (count > maxCount) {
      maxCount = count;
      peakKey = key;
    }
  }

  if (!peakKey) {
    return null;
  }

  const [hourStr, dayStr] = peakKey.split('-');
  const hour = parseInt(hourStr, 10);
  const dayIndex = parseInt(dayStr, 10);

  return {
    hour,
    dayOfWeek: DAY_NAMES[dayIndex] ?? 'Unknown',
  };
}

/**
 * Get recipients for the monthly digest
 * Returns org owners and admin users who haven't disabled the digest
 */
export async function getDigestRecipients(
  orgId: string,
): Promise<Array<{ userId: string; email: string }>> {
  // Get org owners
  const owners = await prisma.orgOwner.findMany({
    where: { organizationId: orgId },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          deletedAt: true,
        },
      },
    },
  });

  // Get admin users (users with admin roles)
  const adminUsers = await prisma.user.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      userRoles: {
        some: {
          role: {
            isAdmin: true,
            deletedAt: null,
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  // Combine and dedupe
  const recipientMap = new Map<string, string>();

  for (const owner of owners) {
    if (owner.user && !owner.user.deletedAt) {
      recipientMap.set(owner.user.id, owner.user.email);
    }
  }

  for (const admin of adminUsers) {
    recipientMap.set(admin.id, admin.email);
  }

  // Filter out those who have disabled the digest
  const disabledPrefs = await prisma.emailDigestPreference.findMany({
    where: {
      organizationId: orgId,
      enabled: false,
      userId: { in: Array.from(recipientMap.keys()) },
    },
    select: { userId: true },
  });

  const disabledUserIds = new Set(disabledPrefs.map((p) => p.userId));

  const recipients: Array<{ userId: string; email: string }> = [];
  for (const [userId, email] of recipientMap) {
    if (!disabledUserIds.has(userId)) {
      recipients.push({ userId, email });
    }
  }

  return recipients;
}

/**
 * Pick a random unused feature to highlight in the digest
 */
export async function pickRandomUnusedFeature(orgId: string): Promise<FeatureTip | null> {
  // Get feature usage status by checking admin action logs
  const usedFeatureIds = new Set<string>();

  // Check action types for features that use actionTypes detection
  for (const tip of FEATURE_TIPS) {
    if (tip.detectUsage.actionTypes && tip.detectUsage.actionTypes.length > 0) {
      // Map string action types to AdminActionType enum
      const mappedActionTypes = tip.detectUsage.actionTypes
        .map((at) => ACTION_TYPE_MAP[at])
        .filter((at): at is AdminActionType => at !== undefined);

      if (mappedActionTypes.length > 0) {
        const hasAction = await prisma.adminActionLog.findFirst({
          where: {
            organizationId: orgId,
            actionType: { in: mappedActionTypes },
          },
          select: { id: true },
        });

        if (hasAction) {
          usedFeatureIds.add(tip.id);
        }
      }
    }
  }

  // Check custom checks for some common features
  // Advanced conditions - check if any policy has conditionExpression (ADVANCED mode)
  const hasAdvancedCondition = await prisma.policy.findFirst({
    where: {
      organizationId: orgId,
      deletedAt: null,
      conditionMode: 'ADVANCED',
    },
    select: { id: true },
  });
  if (hasAdvancedCondition) {
    usedFeatureIds.add('advanced-conditions');
  }

  // Slack webhook
  const hasSlackWebhook = await prisma.webhookEndpoint.findFirst({
    where: {
      organizationId: orgId,
      type: 'SLACK',
      enabled: true,
    },
    select: { id: true },
  });
  if (hasSlackWebhook) {
    usedFeatureIds.add('webhooks-slack');
  }

  // Email webhook
  const hasEmailWebhook = await prisma.webhookEndpoint.findFirst({
    where: {
      organizationId: orgId,
      type: 'EMAIL',
      enabled: true,
    },
    select: { id: true },
  });
  if (hasEmailWebhook) {
    usedFeatureIds.add('webhooks-email');
  }

  // Filter for unused features
  const unusedFeatures = FEATURE_TIPS.filter((tip) => !usedFeatureIds.has(tip.id));

  if (unusedFeatures.length === 0) {
    return null;
  }

  // Pick a random one, weighted by priority
  const totalWeight = unusedFeatures.reduce((sum, tip) => sum + tip.priority, 0);
  let randomValue = Math.random() * totalWeight;

  for (const tip of unusedFeatures) {
    randomValue -= tip.priority;
    if (randomValue <= 0) {
      return tip;
    }
  }

  // Fallback to first unused feature
  return unusedFeatures[0] ?? null;
}

/**
 * Generate the monthly digest for an organization
 */
export async function generateMonthlyDigest(
  orgId: string,
): Promise<{ stats: MonthlyStats; featureSpotlight: FeatureTip | null }> {
  // Compute period: previous full month
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, -1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1));

  const stats = await computeMonthlyStats(orgId, periodStart, periodEnd);
  const featureSpotlight = await pickRandomUnusedFeature(orgId);

  return { stats, featureSpotlight };
}

/**
 * Send digest email to a recipient using Resend API
 */
export async function sendDigestEmail(
  recipient: { userId: string; email: string },
  orgName: string,
  stats: MonthlyStats,
  featureSpotlight: FeatureTip | null,
): Promise<void> {
  // Compute period label (previous month)
  const now = new Date();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const periodLabel = previousMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const spotlight = featureSpotlight
    ? {
        title: featureSpotlight.title,
        description: featureSpotlight.description,
        docUrl: featureSpotlight.docUrl,
      }
    : null;

  const result = await sendEmail({
    to: recipient.email,
    subject: `Sentinel Monthly Report - ${periodLabel}`,
    html: generateDigestEmailHtml(orgName, stats, spotlight, periodLabel),
    text: generateDigestEmailText(orgName, stats, spotlight, periodLabel),
  });

  if (result.success) {
    logger.info('Monthly digest email sent', {
      email: recipient.email,
      orgName,
      emailId: result.id,
    });
  } else {
    logger.error('Failed to send digest email', {
      email: recipient.email,
      orgName,
      error: result.error,
    });
    // Re-throw to let caller handle failure tracking
    throw new Error(result.error ?? 'Failed to send digest email');
  }
}

/**
 * Send monthly digests to all enabled organizations
 */
export async function sendMonthlyDigests(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Get orgs with monthly digest enabled
  const enabledSettings = await prisma.organizationSettings.findMany({
    where: { monthlyDigestEnabled: true },
    select: {
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Compute period for logging
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, -1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1));

  for (const settings of enabledSettings) {
    const org = settings.organization;

    try {
      // Get recipients
      const recipients = await getDigestRecipients(org.id);

      if (recipients.length === 0) {
        logger.info('No digest recipients for org', { orgId: org.id });
        continue;
      }

      // Generate digest
      const { stats, featureSpotlight } = await generateMonthlyDigest(org.id);

      // Send to each recipient
      let orgSent = 0;
      let orgFailed = 0;

      for (const recipient of recipients) {
        try {
          await sendDigestEmail(recipient, org.name, stats, featureSpotlight);
          orgSent++;
        } catch (error) {
          logger.error('Failed to send digest email', {
            email: recipient.email,
            orgId: org.id,
            error,
          });
          orgFailed++;
        }
      }

      // Log to EmailDigestLog
      const status = orgFailed === 0 ? 'SENT' : orgSent === 0 ? 'FAILED' : 'PARTIAL';

      await prisma.emailDigestLog.create({
        data: {
          organizationId: org.id,
          recipientCount: orgSent,
          periodStart,
          periodEnd,
          status,
        },
      });

      sent += orgSent;
      failed += orgFailed;
    } catch (error) {
      logger.error('Failed to generate digest for org', { orgId: org.id, error });

      // Log failure
      await prisma.emailDigestLog.create({
        data: {
          organizationId: org.id,
          recipientCount: 0,
          periodStart,
          periodEnd,
          status: 'FAILED',
        },
      });

      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Get user's digest preference
 * Returns true if not found (default enabled)
 */
export async function getDigestPreference(userId: string, orgId: string): Promise<boolean> {
  const pref = await prisma.emailDigestPreference.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
    select: { enabled: true },
  });

  return pref?.enabled ?? true;
}

/**
 * Update user's digest preference
 */
export async function updateDigestPreference(
  userId: string,
  orgId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.emailDigestPreference.upsert({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
    create: {
      userId,
      organizationId: orgId,
      enabled,
    },
    update: {
      enabled,
    },
  });
}

/**
 * Get digest history for an organization
 */
export async function getDigestHistory(
  orgId: string,
  limit: number = 12,
): Promise<
  Array<{
    id: string;
    recipientCount: number;
    sentAt: Date;
    periodStart: Date;
    periodEnd: Date;
    status: string;
  }>
> {
  return prisma.emailDigestLog.findMany({
    where: { organizationId: orgId },
    orderBy: { sentAt: 'desc' },
    take: limit,
    select: {
      id: true,
      recipientCount: true,
      sentAt: true,
      periodStart: true,
      periodEnd: true,
      status: true,
    },
  });
}
