/**
 * Agent Plan Service
 * Manages multi-step operation plans for the agent
 */

import {
  AgentPlanStatus,
  AgentPlanStepStatus,
  prisma,
  type AgentPlan,
  type AgentPlanStep,
} from '@sentinel/db';
import { executeTool, type AdminToolContext, type ToolRegistry } from '../agent/tools/index.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PlanStep {
  toolName: string;
  toolInput: unknown;
  description: string;
  dependsOn?: number[]; // Step indices this depends on
  canRollback?: boolean;
  rollbackToolName?: string;
  rollbackToolInput?: unknown;
}

export interface CreatePlanParams {
  organizationId: string;
  workspaceId?: string;
  conversationId: string;
  userId: string;
  name: string;
  description: string;
  steps: PlanStep[];
}

export interface PlanExecutionResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  results: Array<{ stepNumber: number; result?: unknown; error?: string }>;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  rolledBackSteps: number;
  errors: Array<{ stepNumber: number; error: string }>;
}

// ============================================================================
// PLAN DETECTION
// ============================================================================

/**
 * Patterns that suggest a multi-step operation
 */
const PLAN_TRIGGERS = [
  /\band\s+then\b/i,
  /\bafter\s+that\b/i,
  /\bfirst\s+.+\s+then\b/i,
  /\d+\.\s+.*\d+\.\s+/, // Numbered list (1. ... 2. ...)
  /\bsteps?:/i,
  /\bcreate\s+.+\s+and\s+.+\s+test/i,
  /\bsetup\s+.+\s+and\s+.+\s+configure/i,
  /\bmultiple\s+(policies|servers|users)/i,
  /\bbatch\b/i,
];

/**
 * Check if a user message suggests a multi-step operation
 */
export function detectMultiStepRequest(message: string): boolean {
  return PLAN_TRIGGERS.some((pattern) => pattern.test(message));
}

// ============================================================================
// PLAN CRUD
// ============================================================================

/**
 * Create a new plan with steps
 */
export async function createPlan(params: CreatePlanParams): Promise<string> {
  const { organizationId, workspaceId, conversationId, userId, name, description, steps } = params;

  const plan = await prisma.agentPlan.create({
    data: {
      organizationId,
      workspaceId: workspaceId ?? null,
      conversationId,
      userId,
      name,
      description,
      status: AgentPlanStatus.DRAFT,
      totalSteps: steps.length,
      steps: {
        create: steps.map((step, index) => ({
          stepNumber: index,
          toolName: step.toolName,
          toolInput: step.toolInput as object,
          description: step.description,
          dependsOn: step.dependsOn?.map((i) => `step_${i}`) ?? [],
          canRollback: step.canRollback ?? false,
          rollbackToolName: step.rollbackToolName,
          rollbackToolInput: step.rollbackToolInput as object | undefined,
          status: AgentPlanStepStatus.PENDING,
        })),
      },
    },
  });

  logger.info('Created agent plan', {
    planId: plan.id,
    organizationId,
    userId,
    stepCount: steps.length,
  });

  return plan.id;
}

/**
 * Get a plan by ID
 * @param planId - The plan ID to fetch
 * @param organizationId - The organization ID (required for scoping)
 * @param workspaceId - Optional workspace ID. If provided, filters to org-wide + that workspace's plans
 */
export async function getPlan(
  planId: string,
  organizationId: string,
  workspaceId?: string,
): Promise<(AgentPlan & { steps: AgentPlanStep[] }) | null> {
  return prisma.agentPlan.findFirst({
    where: {
      id: planId,
      organizationId,
      OR: [
        { workspaceId: null }, // org-wide plans
        ...(workspaceId ? [{ workspaceId }] : []), // workspace-specific if provided
      ],
    },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
  });
}

/**
 * List plans for a conversation
 * @param conversationId - The conversation ID to list plans for
 * @param organizationId - The organization ID (required for scoping)
 * @param workspaceId - Optional workspace ID. If provided, filters to org-wide + that workspace's plans
 */
export async function listPlansForConversation(
  conversationId: string,
  organizationId: string,
  workspaceId?: string,
): Promise<AgentPlan[]> {
  return prisma.agentPlan.findMany({
    where: {
      conversationId,
      organizationId,
      OR: [
        { workspaceId: null }, // org-wide plans
        ...(workspaceId ? [{ workspaceId }] : []), // workspace-specific if provided
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Update plan status
 * @param planId - The plan ID to update
 * @param organizationId - The organization ID (required for scoping)
 * @param status - The new status
 * @param updates - Optional additional updates
 * @param workspaceId - Optional workspace ID. If provided, filters to org-wide + that workspace's plans
 */
export async function updatePlanStatus(
  planId: string,
  organizationId: string,
  status: AgentPlanStatus,
  updates?: { currentStep?: number; result?: unknown; error?: string },
  workspaceId?: string,
): Promise<void> {
  const data: Record<string, unknown> = { status };

  if (updates?.currentStep !== undefined) {
    data.currentStep = updates.currentStep;
  }
  if (updates?.result !== undefined) {
    data.result = updates.result;
  }
  if (updates?.error !== undefined) {
    data.error = updates.error;
  }
  if (status === AgentPlanStatus.EXECUTING && !data.startedAt) {
    data.startedAt = new Date();
  }
  if (
    status === AgentPlanStatus.COMPLETED ||
    status === AgentPlanStatus.FAILED ||
    status === AgentPlanStatus.ABORTED ||
    status === AgentPlanStatus.ROLLED_BACK
  ) {
    data.completedAt = new Date();
  }

  await prisma.agentPlan.updateMany({
    where: {
      id: planId,
      organizationId,
      OR: [
        { workspaceId: null }, // org-wide plans
        ...(workspaceId ? [{ workspaceId }] : []), // workspace-specific if provided
      ],
    },
    data,
  });
}

/**
 * Approve a plan for execution
 * @param planId - The plan ID to approve
 * @param organizationId - The organization ID (required for scoping)
 * @param userId - The user ID approving the plan
 * @param workspaceId - Optional workspace ID. If provided, filters to org-wide + that workspace's plans
 */
export async function approvePlan(
  planId: string,
  organizationId: string,
  userId: string,
  workspaceId?: string,
): Promise<void> {
  const plan = await getPlan(planId, organizationId, workspaceId);
  if (!plan) {
    throw new Error('Plan not found');
  }
  if (plan.status !== AgentPlanStatus.DRAFT) {
    throw new Error(`Cannot approve plan in status: ${plan.status}`);
  }

  await updatePlanStatus(planId, organizationId, AgentPlanStatus.PENDING, undefined, workspaceId);

  logger.info('Plan approved', { planId, organizationId, userId });
}

/**
 * Abort a plan
 * @param planId - The plan ID to abort
 * @param organizationId - The organization ID (required for scoping)
 * @param userId - The user ID aborting the plan
 * @param workspaceId - Optional workspace ID. If provided, filters to org-wide + that workspace's plans
 */
export async function abortPlan(
  planId: string,
  organizationId: string,
  userId: string,
  workspaceId?: string,
): Promise<void> {
  const plan = await getPlan(planId, organizationId, workspaceId);
  if (!plan) {
    throw new Error('Plan not found');
  }
  if (
    plan.status === AgentPlanStatus.COMPLETED ||
    plan.status === AgentPlanStatus.ABORTED ||
    plan.status === AgentPlanStatus.ROLLED_BACK
  ) {
    throw new Error(`Cannot abort plan in status: ${plan.status}`);
  }

  await updatePlanStatus(planId, organizationId, AgentPlanStatus.ABORTED, undefined, workspaceId);

  logger.info('Plan aborted', { planId, organizationId, userId });
}

// ============================================================================
// PLAN EXECUTION
// ============================================================================

/**
 * Execute a plan step by step
 * Uses context.workspaceId for workspace scoping
 */
export async function executePlan(
  planId: string,
  context: AdminToolContext,
  toolRegistry: ToolRegistry,
): Promise<PlanExecutionResult> {
  const plan = await getPlan(planId, context.organizationId, context.workspaceId);
  if (!plan) {
    return {
      success: false,
      completedSteps: 0,
      totalSteps: 0,
      results: [],
      error: 'Plan not found',
    };
  }

  if (plan.status !== AgentPlanStatus.PENDING && plan.status !== AgentPlanStatus.PAUSED) {
    return {
      success: false,
      completedSteps: 0,
      totalSteps: plan.totalSteps,
      results: [],
      error: `Cannot execute plan in status: ${plan.status}`,
    };
  }

  // Mark plan as executing
  await updatePlanStatus(
    planId,
    context.organizationId,
    AgentPlanStatus.EXECUTING,
    undefined,
    context.workspaceId,
  );

  const results: PlanExecutionResult['results'] = [];
  let completedSteps = 0;

  // Execute each step in order
  for (const step of plan.steps) {
    // Skip already completed steps
    if (step.status === AgentPlanStepStatus.COMPLETED) {
      completedSteps++;
      continue;
    }

    // Update step to executing
    await updateStepStatus(step.id, AgentPlanStepStatus.EXECUTING);

    logger.info('Executing plan step', {
      planId,
      stepNumber: step.stepNumber,
      toolName: step.toolName,
    });

    try {
      const result = await executeTool(step.toolName, step.toolInput, context, toolRegistry);

      if (result.success) {
        await updateStepStatus(step.id, AgentPlanStepStatus.COMPLETED, {
          result: result.data,
        });
        results.push({ stepNumber: step.stepNumber, result: result.data });
        completedSteps++;

        // Update plan progress
        await updatePlanStatus(
          planId,
          context.organizationId,
          AgentPlanStatus.EXECUTING,
          { currentStep: step.stepNumber + 1 },
          context.workspaceId,
        );
      } else {
        // Step failed
        await updateStepStatus(step.id, AgentPlanStepStatus.FAILED, {
          error: result.error,
        });
        results.push({ stepNumber: step.stepNumber, error: result.error });

        // Mark plan as failed
        await updatePlanStatus(
          planId,
          context.organizationId,
          AgentPlanStatus.FAILED,
          { error: `Step ${step.stepNumber + 1} failed: ${result.error}` },
          context.workspaceId,
        );

        return {
          success: false,
          completedSteps,
          totalSteps: plan.totalSteps,
          results,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await updateStepStatus(step.id, AgentPlanStepStatus.FAILED, { error: errorMessage });
      results.push({ stepNumber: step.stepNumber, error: errorMessage });

      await updatePlanStatus(
        planId,
        context.organizationId,
        AgentPlanStatus.FAILED,
        { error: `Step ${step.stepNumber + 1} failed: ${errorMessage}` },
        context.workspaceId,
      );

      return {
        success: false,
        completedSteps,
        totalSteps: plan.totalSteps,
        results,
        error: errorMessage,
      };
    }
  }

  // All steps completed
  await updatePlanStatus(
    planId,
    context.organizationId,
    AgentPlanStatus.COMPLETED,
    { result: results },
    context.workspaceId,
  );

  logger.info('Plan completed successfully', {
    planId,
    completedSteps,
    totalSteps: plan.totalSteps,
  });

  return {
    success: true,
    completedSteps,
    totalSteps: plan.totalSteps,
    results,
  };
}

/**
 * Update a step's status
 */
async function updateStepStatus(
  stepId: string,
  status: AgentPlanStepStatus,
  updates?: { result?: unknown; error?: string },
): Promise<void> {
  const data: Record<string, unknown> = { status };

  if (updates?.result !== undefined) {
    data.result = updates.result;
  }
  if (updates?.error !== undefined) {
    data.error = updates.error;
  }
  if (status === AgentPlanStepStatus.EXECUTING) {
    data.startedAt = new Date();
  }
  if (
    status === AgentPlanStepStatus.COMPLETED ||
    status === AgentPlanStepStatus.FAILED ||
    status === AgentPlanStepStatus.SKIPPED ||
    status === AgentPlanStepStatus.ROLLED_BACK
  ) {
    data.completedAt = new Date();
  }

  await prisma.agentPlanStep.update({
    where: { id: stepId },
    data,
  });
}

// ============================================================================
// ROLLBACK
// ============================================================================

/**
 * Rollback a failed plan
 * Uses context.workspaceId for workspace scoping
 */
export async function rollbackPlan(
  planId: string,
  context: AdminToolContext,
  toolRegistry: ToolRegistry,
): Promise<RollbackResult> {
  const plan = await getPlan(planId, context.organizationId, context.workspaceId);
  if (!plan) {
    return {
      success: false,
      rolledBackSteps: 0,
      errors: [{ stepNumber: -1, error: 'Plan not found' }],
    };
  }

  // Only allow rollback of failed or completed plans
  if (plan.status !== AgentPlanStatus.FAILED && plan.status !== AgentPlanStatus.COMPLETED) {
    return {
      success: false,
      rolledBackSteps: 0,
      errors: [{ stepNumber: -1, error: `Cannot rollback plan in status: ${plan.status}` }],
    };
  }

  const errors: RollbackResult['errors'] = [];
  let rolledBackSteps = 0;

  // Rollback completed steps in reverse order
  const completedSteps = plan.steps
    .filter(
      (s) => s.status === AgentPlanStepStatus.COMPLETED && s.canRollback && s.rollbackToolName,
    )
    .sort((a, b) => b.stepNumber - a.stepNumber);

  for (const step of completedSteps) {
    if (!step.rollbackToolName) continue;

    logger.info('Rolling back plan step', {
      planId,
      stepNumber: step.stepNumber,
      rollbackTool: step.rollbackToolName,
    });

    try {
      const result = await executeTool(
        step.rollbackToolName,
        step.rollbackToolInput ?? {},
        context,
        toolRegistry,
      );

      if (result.success) {
        await updateStepStatus(step.id, AgentPlanStepStatus.ROLLED_BACK);
        rolledBackSteps++;
      } else {
        errors.push({ stepNumber: step.stepNumber, error: result.error ?? 'Unknown error' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ stepNumber: step.stepNumber, error: errorMessage });
    }
  }

  // Update plan status
  await updatePlanStatus(
    planId,
    context.organizationId,
    AgentPlanStatus.ROLLED_BACK,
    undefined,
    context.workspaceId,
  );

  logger.info('Plan rollback completed', {
    planId,
    rolledBackSteps,
    errorCount: errors.length,
  });

  return {
    success: errors.length === 0,
    rolledBackSteps,
    errors,
  };
}

// ============================================================================
// PLAN GENERATION (LLM Integration)
// ============================================================================

/**
 * Generate a plan from a user request using the LLM
 * Returns the steps that should be created
 */
export function generatePlanPrompt(userRequest: string): string {
  return `You are planning a multi-step operation. The user wants to:

${userRequest}

Break this down into discrete steps. For each step, specify:
1. The tool to call
2. The input parameters for that tool
3. A description of what this step does
4. Whether this step depends on previous steps (by step number)
5. Whether this step can be rolled back, and if so, what tool/input to use

Respond with a JSON object:
{
  "name": "Short name for this plan",
  "description": "Full description of what this plan accomplishes",
  "steps": [
    {
      "toolName": "tool_name",
      "toolInput": { ... },
      "description": "What this step does",
      "dependsOn": [0, 1],  // Optional: indices of steps this depends on
      "canRollback": true,
      "rollbackToolName": "delete_tool",
      "rollbackToolInput": { ... }
    }
  ]
}

Only include tools that are available. If you're unsure about a tool's existence, use a simpler approach.`;
}

/**
 * Normalize tool name - strip common prefixes LLMs might add
 * LLMs sometimes add "functions." prefix (OpenAI-style) or "admin_" prefix
 */
function normalizeToolName(name: string): string {
  return name
    .replace(/^functions\./, '') // Strip "functions." prefix (OpenAI-style)
    .replace(/^admin_/, ''); // Strip "admin_" prefix if present
}

/**
 * Parse LLM response into plan steps
 */
export function parsePlanFromLLM(llmResponse: string): {
  name: string;
  description: string;
  steps: PlanStep[];
} | null {
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch =
      llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/) || llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Failed to extract JSON from LLM plan response');
      return null;
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr) as {
      name?: string;
      description?: string;
      steps?: Array<{
        toolName?: string;
        toolInput?: unknown;
        description?: string;
        dependsOn?: number[];
        canRollback?: boolean;
        rollbackToolName?: string;
        rollbackToolInput?: unknown;
      }>;
    };

    if (!parsed.name || !parsed.steps || !Array.isArray(parsed.steps)) {
      logger.warn('Invalid plan structure from LLM');
      return null;
    }

    const steps: PlanStep[] = parsed.steps.map((s) => ({
      toolName: normalizeToolName(s.toolName ?? 'unknown'),
      toolInput: s.toolInput ?? {},
      description: s.description ?? '',
      dependsOn: s.dependsOn,
      canRollback: s.canRollback,
      rollbackToolName: s.rollbackToolName ? normalizeToolName(s.rollbackToolName) : undefined,
      rollbackToolInput: s.rollbackToolInput,
    }));

    return {
      name: parsed.name,
      description: parsed.description ?? '',
      steps,
    };
  } catch (error) {
    logger.error('Failed to parse plan from LLM response', { error });
    return null;
  }
}
