/**
 * Workspace Chat Usage Service
 * Tracks and enforces monthly chat usage quotas per user per workspace
 */

import { prisma } from '@sentinel/db';

export interface QuotaInfo {
  messagesUsed: number;
  messagesLimit: number | null;
  tokensUsed: number;
  tokensLimit: number | null;
}

export interface UsageStats {
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byUser: Array<{
    userId: string;
    email: string;
    messageCount: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

/**
 * Get the first day of the month at midnight UTC for a given date
 */
function getMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Check if a user is within their quota limits for a workspace
 */
export async function checkQuota(
  workspaceId: string,
  userId: string,
): Promise<{ allowed: boolean; remaining: QuotaInfo }> {
  const currentMonth = getMonthStart(new Date());

  const [settings, usage] = await Promise.all([
    prisma.workspaceChatSettings.findUnique({
      where: { workspaceId },
      select: {
        monthlyMessageQuota: true,
        monthlyTokenQuota: true,
      },
    }),
    prisma.workspaceChatUsage.findUnique({
      where: {
        workspaceId_userId_month: {
          workspaceId,
          userId,
          month: currentMonth,
        },
      },
      select: {
        messageCount: true,
        inputTokens: true,
        outputTokens: true,
      },
    }),
  ]);

  const messagesUsed = usage?.messageCount ?? 0;
  const tokensUsed = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  const messagesLimit = settings?.monthlyMessageQuota ?? null;
  const tokensLimit = settings?.monthlyTokenQuota ?? null;

  const messageQuotaOk = messagesLimit === null || messagesUsed < messagesLimit;
  const tokenQuotaOk = tokensLimit === null || tokensUsed < tokensLimit;

  return {
    allowed: messageQuotaOk && tokenQuotaOk,
    remaining: {
      messagesUsed,
      messagesLimit,
      tokensUsed,
      tokensLimit,
    },
  };
}

/**
 * Record usage after a chat interaction
 */
export async function recordUsage(
  workspaceId: string,
  userId: string,
  tokens: { input: number; output: number },
): Promise<void> {
  const currentMonth = getMonthStart(new Date());

  await prisma.workspaceChatUsage.upsert({
    where: {
      workspaceId_userId_month: {
        workspaceId,
        userId,
        month: currentMonth,
      },
    },
    create: {
      workspaceId,
      userId,
      month: currentMonth,
      messageCount: 1,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
    },
    update: {
      messageCount: { increment: 1 },
      inputTokens: { increment: tokens.input },
      outputTokens: { increment: tokens.output },
    },
  });
}

/**
 * Get usage statistics for a workspace
 */
export async function getUsageStats(workspaceId: string, month?: Date): Promise<UsageStats> {
  const targetMonth = getMonthStart(month ?? new Date());

  const usageRecords = await prisma.workspaceChatUsage.findMany({
    where: {
      workspaceId,
      month: targetMonth,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  let totalMessages = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const byUser = usageRecords.map((record) => {
    totalMessages += record.messageCount;
    totalInputTokens += record.inputTokens;
    totalOutputTokens += record.outputTokens;

    return {
      userId: record.user.id,
      email: record.user.email,
      messageCount: record.messageCount,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
    };
  });

  return {
    totalMessages,
    totalInputTokens,
    totalOutputTokens,
    byUser,
  };
}

/**
 * Get quota information for a user without checking if allowed
 */
export async function getQuotaInfo(workspaceId: string, userId: string): Promise<QuotaInfo> {
  const result = await checkQuota(workspaceId, userId);
  return result.remaining;
}

/**
 * Reset usage for a specific user in a workspace for the current month
 * Useful for admin overrides
 */
export async function resetUsage(workspaceId: string, userId: string): Promise<void> {
  const currentMonth = getMonthStart(new Date());

  await prisma.workspaceChatUsage.deleteMany({
    where: {
      workspaceId,
      userId,
      month: currentMonth,
    },
  });
}

/**
 * Get usage history for a user across multiple months
 */
export async function getUserUsageHistory(
  workspaceId: string,
  userId: string,
  monthsBack: number = 6,
): Promise<
  Array<{
    month: Date;
    messageCount: number;
    inputTokens: number;
    outputTokens: number;
  }>
> {
  const now = new Date();
  const months: Date[] = [];

  for (let i = 0; i < monthsBack; i++) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0, 0));
    months.push(month);
  }

  const usageRecords = await prisma.workspaceChatUsage.findMany({
    where: {
      workspaceId,
      userId,
      month: { in: months },
    },
    orderBy: { month: 'desc' },
  });

  const usageMap = new Map(usageRecords.map((record) => [record.month.toISOString(), record]));

  return months.map((month) => {
    const record = usageMap.get(month.toISOString());
    return {
      month,
      messageCount: record?.messageCount ?? 0,
      inputTokens: record?.inputTokens ?? 0,
      outputTokens: record?.outputTokens ?? 0,
    };
  });
}
