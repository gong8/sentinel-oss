/**
 * LLM Usage Logging Service
 * Handles logging of LLM usage for billing and analytics
 */

import { prisma } from '@sentinel/db';

import { getProviderPricing, type LLMProviderType } from '../agent/llm-providers.js';

export interface LlmUsageParams {
  organizationId: string;
  sessionId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requestType?: string; // 'agent' | 'chat' | etc
}

/**
 * Log LLM usage for billing and analytics
 */
export async function logLlmUsage(params: LlmUsageParams): Promise<void> {
  const pricing = getProviderPricing(params.provider as LLMProviderType, params.model);

  let estimatedCostCents: number | null = null;
  if (pricing && (pricing.inputPer1M > 0 || pricing.outputPer1M > 0)) {
    // Calculate cost in cents: (tokens / 1M) * $/1M * 100
    const inputCost = (params.inputTokens / 1_000_000) * pricing.inputPer1M * 100;
    const outputCost = (params.outputTokens / 1_000_000) * pricing.outputPer1M * 100;
    estimatedCostCents = Math.ceil(inputCost + outputCost);
  }

  await prisma.llmUsageLog.create({
    data: {
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens,
      estimatedCostCents,
      requestType: params.requestType,
    },
  });
}

export interface ProviderUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface ModelUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface UsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostCents: number;
  byProvider: Record<string, ProviderUsage>;
  byModel: Record<string, ModelUsage>;
}

/**
 * Get usage summary for a date range
 */
export async function getUsageSummary(
  organizationId: string,
  startDate: Date,
  endDate: Date,
): Promise<UsageSummary> {
  const logs = await prisma.llmUsageLog.findMany({
    where: {
      organizationId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const summary: UsageSummary = {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCostCents: 0,
    byProvider: {},
    byModel: {},
  };

  for (const log of logs) {
    summary.totalRequests++;
    summary.totalInputTokens += log.inputTokens;
    summary.totalOutputTokens += log.outputTokens;
    summary.totalTokens += log.totalTokens;
    summary.totalCostCents += log.estimatedCostCents ?? 0;

    // By provider
    if (!summary.byProvider[log.provider]) {
      summary.byProvider[log.provider] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      };
    }
    summary.byProvider[log.provider].requests++;
    summary.byProvider[log.provider].inputTokens += log.inputTokens;
    summary.byProvider[log.provider].outputTokens += log.outputTokens;
    summary.byProvider[log.provider].costCents += log.estimatedCostCents ?? 0;

    // By model
    if (!summary.byModel[log.model]) {
      summary.byModel[log.model] = { requests: 0, inputTokens: 0, outputTokens: 0, costCents: 0 };
    }
    summary.byModel[log.model].requests++;
    summary.byModel[log.model].inputTokens += log.inputTokens;
    summary.byModel[log.model].outputTokens += log.outputTokens;
    summary.byModel[log.model].costCents += log.estimatedCostCents ?? 0;
  }

  return summary;
}
