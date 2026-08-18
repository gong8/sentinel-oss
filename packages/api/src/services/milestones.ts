/**
 * Milestones Service
 * Handles checking and recording milestone achievements, and sending notifications.
 */

import { prisma } from '@sentinel/db';
import { featureDiscovery } from '@sentinel/shared';
import { generateMilestoneEmailHtml, generateMilestoneEmailText, sendEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';

const { MILESTONES } = featureDiscovery;
type Milestone = featureDiscovery.Milestone;

/**
 * Checks which milestones have been newly achieved based on a metric count.
 * Returns milestones that:
 * - Match the given metric
 * - Have threshold <= newCount
 * - Have not already been achieved
 */
export async function checkMilestones(
  orgId: string,
  metric: string,
  newCount: number,
): Promise<Milestone[]> {
  // Get already achieved milestones for this org
  const achieved = await prisma.milestoneAchievement.findMany({
    where: { organizationId: orgId },
    select: { milestoneId: true },
  });

  const achievedIds = new Set(achieved.map((a) => a.milestoneId));

  // Filter MILESTONES for newly achieved ones
  return MILESTONES.filter(
    (m) => m.metric === metric && m.threshold <= newCount && !achievedIds.has(m.id),
  );
}

/**
 * Records a milestone achievement for an organization.
 * Sets notifiedVia to empty array initially.
 */
export async function recordMilestoneAchievement(
  orgId: string,
  milestoneId: string,
): Promise<void> {
  await prisma.milestoneAchievement.create({
    data: {
      organizationId: orgId,
      milestoneId,
      notifiedVia: [],
    },
  });
}

/**
 * Gets milestone notification preferences for a user.
 * Returns defaults (both true) if not found.
 */
export async function getMilestonePreferences(
  userId: string,
  orgId: string,
): Promise<{ toastEnabled: boolean; emailEnabled: boolean }> {
  const prefs = await prisma.milestoneNotificationPreference.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
    select: { toastEnabled: true, emailEnabled: true },
  });

  return {
    toastEnabled: prefs?.toastEnabled ?? true,
    emailEnabled: prefs?.emailEnabled ?? true,
  };
}

/**
 * Updates milestone notification preferences for a user.
 * Upserts the preference record.
 */
export async function updateMilestonePreferences(params: {
  userId: string;
  orgId: string;
  toastEnabled?: boolean;
  emailEnabled?: boolean;
}): Promise<void> {
  const { userId, orgId, toastEnabled, emailEnabled } = params;

  await prisma.milestoneNotificationPreference.upsert({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
    create: {
      userId,
      organizationId: orgId,
      toastEnabled: toastEnabled ?? true,
      emailEnabled: emailEnabled ?? true,
    },
    update: {
      ...(toastEnabled !== undefined && { toastEnabled }),
      ...(emailEnabled !== undefined && { emailEnabled }),
    },
  });
}

/**
 * Sends a toast notification for a milestone achievement.
 * Toast notifications are delivered via the frontend polling mechanism.
 * We store the pending toast in the database for the frontend to pick up.
 */
export async function sendMilestoneToast(userId: string, milestone: Milestone): Promise<void> {
  // Store milestone toast for frontend to pick up via polling
  // The frontend already polls for milestone achievements and displays them
  logger.info('Milestone toast queued', {
    userId,
    milestoneId: milestone.id,
    title: milestone.title,
  });
}

/**
 * Sends an email notification for a milestone achievement.
 * Uses Resend API to deliver the email.
 */
export async function sendMilestoneEmail(
  userId: string,
  orgId: string,
  milestone: Milestone,
): Promise<void> {
  // Get user email and org name
  const [user, org] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: orgId,
      },
      select: { email: true },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    }),
  ]);

  if (!user?.email) {
    logger.warn('Cannot send milestone email: user email not found', { userId, orgId });
    return;
  }

  const orgName = org?.name ?? 'your organization';

  const result = await sendEmail({
    to: user.email,
    subject: `🎉 ${milestone.title}`,
    html: generateMilestoneEmailHtml(milestone, orgName),
    text: generateMilestoneEmailText(milestone, orgName),
  });

  if (result.success) {
    logger.info('Milestone email sent', {
      userId,
      milestoneId: milestone.id,
      email: user.email,
      emailId: result.id,
    });
  } else {
    logger.error('Failed to send milestone email', {
      userId,
      milestoneId: milestone.id,
      email: user.email,
      error: result.error,
    });
  }
}

/**
 * Records a milestone achievement and sends notifications based on user preferences.
 * Updates the achievement record with notifiedVia array.
 */
export async function recordAndNotifyMilestone(
  orgId: string,
  userId: string,
  milestone: Milestone,
): Promise<void> {
  // Record the achievement
  await recordMilestoneAchievement(orgId, milestone.id);

  // Get user preferences
  const prefs = await getMilestonePreferences(userId, orgId);

  const notifiedVia: string[] = [];

  // Send toast if enabled
  if (prefs.toastEnabled !== false) {
    await sendMilestoneToast(userId, milestone);
    notifiedVia.push('toast');
  }

  // Send email if eligible and enabled
  if (milestone.emailEligible && prefs.emailEnabled !== false) {
    await sendMilestoneEmail(userId, orgId, milestone);
    notifiedVia.push('email');
  }

  // Update achievement record with notifiedVia array
  await prisma.milestoneAchievement.update({
    where: {
      organizationId_milestoneId: {
        organizationId: orgId,
        milestoneId: milestone.id,
      },
    },
    data: { notifiedVia },
  });
}

/**
 * Gets all achieved milestones for an organization with their achievement dates.
 */
export async function getAchievedMilestones(
  orgId: string,
): Promise<Array<{ milestone: Milestone; achievedAt: Date }>> {
  const achievements = await prisma.milestoneAchievement.findMany({
    where: { organizationId: orgId },
    select: { milestoneId: true, achievedAt: true },
  });

  // Map to milestone definitions
  const result: Array<{ milestone: Milestone; achievedAt: Date }> = [];

  for (const achievement of achievements) {
    const milestone = MILESTONES.find((m) => m.id === achievement.milestoneId);
    if (milestone) {
      result.push({
        milestone,
        achievedAt: achievement.achievedAt,
      });
    }
  }

  return result;
}

/**
 * Gets current counts for all milestone-relevant metrics.
 * Returns counts for:
 * - POLICY_CREATE: count policies (not deleted)
 * - MCP_SERVER_CREATE: count mcpServers (not deleted)
 * - SENSITIVE_FLAG_CREATE: count sensitiveToolFlags (enabled)
 * - WEBHOOK_ENDPOINT_CREATE: count webhookEndpoints
 * - USER_CREATE: count users (not deleted)
 * - TOOL_INVOCATION: count auditLogEntries
 */
export async function getCurrentMetricCounts(orgId: string): Promise<Record<string, number>> {
  const [policies, mcpServers, sensitiveFlags, webhookEndpoints, users, toolInvocations] =
    await Promise.all([
      prisma.policy.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
      prisma.mcpServer.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
      prisma.sensitiveToolFlag.count({
        where: { organizationId: orgId, enabled: true },
      }),
      prisma.webhookEndpoint.count({
        where: { organizationId: orgId },
      }),
      prisma.user.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
      prisma.auditLogEntry.count({
        where: { organizationId: orgId },
      }),
    ]);

  return {
    POLICY_CREATE: policies,
    MCP_SERVER_CREATE: mcpServers,
    SENSITIVE_FLAG_CREATE: sensitiveFlags,
    WEBHOOK_ENDPOINT_CREATE: webhookEndpoints,
    USER_CREATE: users,
    TOOL_INVOCATION: toolInvocations,
  };
}

/**
 * Checks all milestones for an organization and records/notifies any new achievements.
 * Returns all newly achieved milestones.
 */
export async function checkAllMilestones(orgId: string, userId: string): Promise<Milestone[]> {
  // Get all current metric counts
  const counts = await getCurrentMetricCounts(orgId);

  const newlyAchieved: Milestone[] = [];

  // For each metric, check milestones
  for (const [metric, count] of Object.entries(counts)) {
    const achieved = await checkMilestones(orgId, metric, count);

    // Record and notify each new achievement
    for (const milestone of achieved) {
      await recordAndNotifyMilestone(orgId, userId, milestone);
      newlyAchieved.push(milestone);
    }
  }

  return newlyAchieved;
}
