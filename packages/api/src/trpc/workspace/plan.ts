/**
 * Workspace Plan Router
 * tRPC endpoints for managing multi-step operation plans in workspace context
 */

import { AgentPlanStatus, AgentPlanStepStatus, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import {
  abortPlan,
  approvePlan,
  getPlan,
  listPlansForConversation,
  updatePlanStatus,
} from '../../services/agentPlan.js';
import { workspaceToolRouter, type ToolContext } from '../../services/workspace-tool-router.js';
import { router, workspaceMemberProcedure } from '../init.js';

// ============================================================================
// Input Schemas
// ============================================================================

const workspacePlanIdInput = z.object({
  workspaceId: z.string().cuid(),
  planId: z.string().cuid(),
});

const workspaceConversationIdInput = z.object({
  workspaceId: z.string().cuid(),
  conversationId: z.string().cuid(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verifies that a conversation belongs to the user and workspace
 */
async function verifyConversationOwnership(
  conversationId: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const conversation = await prisma.workspaceChatConversation.findFirst({
    where: {
      id: conversationId,
      workspaceId,
      userId,
    },
  });
  return conversation !== null;
}

/**
 * Verifies that a plan belongs to the user via its conversation
 */
async function verifyPlanOwnership(
  planId: string,
  workspaceId: string,
  userId: string,
  organizationId: string,
): Promise<{ valid: boolean; conversationId?: string }> {
  const plan = await getPlan(planId, organizationId, workspaceId);
  if (!plan) {
    return { valid: false };
  }

  // Verify the conversation belongs to the user and workspace
  const isOwner = await verifyConversationOwnership(plan.conversationId, workspaceId, userId);
  return { valid: isOwner, conversationId: plan.conversationId };
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
// Router Definition
// ============================================================================

export const workspacePlanRouter = router({
  /**
   * Get a specific plan by ID
   */
  get: workspaceMemberProcedure.input(workspacePlanIdInput).query(async ({ ctx, input }) => {
    const { workspaceId, planId } = input;
    const { organizationId, user } = ctx.auth;

    // Verify plan ownership
    const ownership = await verifyPlanOwnership(planId, workspaceId, user.id, organizationId);
    if (!ownership.valid) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Plan not found',
      });
    }

    const plan = await getPlan(planId, organizationId, workspaceId);
    if (!plan) {
      return null;
    }

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      currentStep: plan.currentStep,
      totalSteps: plan.totalSteps,
      error: plan.error,
      createdAt: plan.createdAt.toISOString(),
      startedAt: plan.startedAt?.toISOString(),
      completedAt: plan.completedAt?.toISOString(),
      steps: plan.steps.map((step) => ({
        id: step.id,
        stepNumber: step.stepNumber,
        toolName: step.toolName,
        toolInput: step.toolInput,
        description: step.description,
        dependsOn: step.dependsOn,
        status: step.status,
        result: step.result,
        error: step.error,
        canRollback: step.canRollback,
        startedAt: step.startedAt?.toISOString(),
        completedAt: step.completedAt?.toISOString(),
      })),
    };
  }),

  /**
   * List plans for a workspace conversation
   */
  listForConversation: workspaceMemberProcedure
    .input(workspaceConversationIdInput)
    .query(async ({ ctx, input }) => {
      const { workspaceId, conversationId } = input;
      const { organizationId, user } = ctx.auth;

      // Verify conversation ownership
      const isOwner = await verifyConversationOwnership(conversationId, workspaceId, user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      const plans = await listPlansForConversation(conversationId, organizationId, workspaceId);

      return plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        status: plan.status,
        currentStep: plan.currentStep,
        totalSteps: plan.totalSteps,
        error: plan.error,
        createdAt: plan.createdAt.toISOString(),
        completedAt: plan.completedAt?.toISOString(),
      }));
    }),

  /**
   * Approve a plan for execution
   */
  approve: workspaceMemberProcedure.input(workspacePlanIdInput).mutation(async ({ ctx, input }) => {
    const { workspaceId, planId } = input;
    const { organizationId, user } = ctx.auth;

    // Verify plan ownership
    const ownership = await verifyPlanOwnership(planId, workspaceId, user.id, organizationId);
    if (!ownership.valid) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Plan not found',
      });
    }

    try {
      await approvePlan(planId, organizationId, user.id, workspaceId);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve plan';
      return { success: false, error: message };
    }
  }),

  /**
   * Abort a plan
   */
  abort: workspaceMemberProcedure.input(workspacePlanIdInput).mutation(async ({ ctx, input }) => {
    const { workspaceId, planId } = input;
    const { organizationId, user } = ctx.auth;

    // Verify plan ownership
    const ownership = await verifyPlanOwnership(planId, workspaceId, user.id, organizationId);
    if (!ownership.valid) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Plan not found',
      });
    }

    try {
      await abortPlan(planId, organizationId, user.id, workspaceId);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to abort plan';
      return { success: false, error: message };
    }
  }),

  /**
   * Execute an approved plan using workspace MCP servers
   */
  execute: workspaceMemberProcedure.input(workspacePlanIdInput).mutation(async ({ ctx, input }) => {
    const { workspaceId, planId } = input;
    const { organizationId, user } = ctx.auth;

    // Verify plan ownership
    const ownership = await verifyPlanOwnership(planId, workspaceId, user.id, organizationId);
    if (!ownership.valid) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Plan not found',
      });
    }

    // Get the plan to check status
    const plan = await getPlan(planId, organizationId, workspaceId);
    if (!plan) {
      return {
        success: false,
        error: 'Plan not found',
        completedSteps: 0,
        totalSteps: 0,
        results: [],
      };
    }

    if (plan.status !== AgentPlanStatus.PENDING && plan.status !== AgentPlanStatus.PAUSED) {
      return {
        success: false,
        error: `Cannot execute plan in status: ${plan.status}`,
        completedSteps: 0,
        totalSteps: plan.totalSteps,
        results: [],
      };
    }

    // Get user info for tool execution context
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      include: { userRoles: { include: { role: true } } },
    });

    if (!userWithRoles) {
      return {
        success: false,
        error: 'User not found',
        completedSteps: 0,
        totalSteps: plan.totalSteps,
        results: [],
      };
    }

    // Create tool context for workspace execution
    const toolContext: ToolContext = {
      organizationId,
      workspaceId,
      userId: user.id,
      userEmail: userWithRoles.email,
      userRoles: userWithRoles.userRoles.map((ur) => ur.role.name),
    };

    // Mark plan as executing
    await updatePlanStatus(planId, organizationId, AgentPlanStatus.EXECUTING);

    const results: Array<{ stepNumber: number; result?: unknown; error?: string }> = [];
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

      logger.info('Executing workspace plan step', {
        planId,
        stepNumber: step.stepNumber,
        toolName: step.toolName,
        workspaceId,
      });

      try {
        // Execute tool via workspace tool router (uses MCP servers)
        const result = await workspaceToolRouter.executeTool(
          step.toolName,
          step.toolInput,
          toolContext,
        );

        if (result.success) {
          await updateStepStatus(step.id, AgentPlanStepStatus.COMPLETED, {
            result: result.result,
          });
          results.push({ stepNumber: step.stepNumber, result: result.result });
          completedSteps++;

          // Update plan progress
          await updatePlanStatus(planId, organizationId, AgentPlanStatus.EXECUTING, {
            currentStep: step.stepNumber + 1,
          });
        } else {
          // Step failed
          const errorMessage = result.error ?? result.deniedReason ?? 'Unknown error';
          await updateStepStatus(step.id, AgentPlanStepStatus.FAILED, {
            error: errorMessage,
          });
          results.push({ stepNumber: step.stepNumber, error: errorMessage });

          // Mark plan as failed
          await updatePlanStatus(planId, organizationId, AgentPlanStatus.FAILED, {
            error: `Step ${step.stepNumber + 1} failed: ${errorMessage}`,
          });

          return {
            success: false,
            completedSteps,
            totalSteps: plan.totalSteps,
            results,
            error: errorMessage,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await updateStepStatus(step.id, AgentPlanStepStatus.FAILED, { error: errorMessage });
        results.push({ stepNumber: step.stepNumber, error: errorMessage });

        await updatePlanStatus(planId, organizationId, AgentPlanStatus.FAILED, {
          error: `Step ${step.stepNumber + 1} failed: ${errorMessage}`,
        });

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
    await updatePlanStatus(planId, organizationId, AgentPlanStatus.COMPLETED, {
      result: results,
    });

    logger.info('Workspace plan completed successfully', {
      planId,
      completedSteps,
      totalSteps: plan.totalSteps,
      workspaceId,
    });

    return {
      success: true,
      completedSteps,
      totalSteps: plan.totalSteps,
      results,
    };
  }),

  /**
   * Rollback a failed plan using workspace MCP servers
   */
  rollback: workspaceMemberProcedure
    .input(workspacePlanIdInput)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, planId } = input;
      const { organizationId, user } = ctx.auth;

      // Verify plan ownership
      const ownership = await verifyPlanOwnership(planId, workspaceId, user.id, organizationId);
      if (!ownership.valid) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      const plan = await getPlan(planId, organizationId, workspaceId);
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

      // Get user info for tool execution context
      const userWithRoles = await prisma.user.findUnique({
        where: { id: user.id },
        include: { userRoles: { include: { role: true } } },
      });

      if (!userWithRoles) {
        return {
          success: false,
          rolledBackSteps: 0,
          errors: [{ stepNumber: -1, error: 'User not found' }],
        };
      }

      // Create tool context for workspace execution
      const toolContext: ToolContext = {
        organizationId,
        workspaceId,
        userId: user.id,
        userEmail: userWithRoles.email,
        userRoles: userWithRoles.userRoles.map((ur) => ur.role.name),
      };

      const errors: Array<{ stepNumber: number; error: string }> = [];
      let rolledBackSteps = 0;

      // Rollback completed steps in reverse order
      const completedSteps = plan.steps
        .filter(
          (s) => s.status === AgentPlanStepStatus.COMPLETED && s.canRollback && s.rollbackToolName,
        )
        .sort((a, b) => b.stepNumber - a.stepNumber);

      for (const step of completedSteps) {
        if (!step.rollbackToolName) continue;

        logger.info('Rolling back workspace plan step', {
          planId,
          stepNumber: step.stepNumber,
          rollbackTool: step.rollbackToolName,
          workspaceId,
        });

        try {
          const result = await workspaceToolRouter.executeTool(
            step.rollbackToolName,
            step.rollbackToolInput ?? {},
            toolContext,
          );

          if (result.success) {
            await updateStepStatus(step.id, AgentPlanStepStatus.ROLLED_BACK);
            rolledBackSteps++;
          } else {
            errors.push({
              stepNumber: step.stepNumber,
              error: result.error ?? result.deniedReason ?? 'Unknown error',
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({ stepNumber: step.stepNumber, error: errorMessage });
        }
      }

      // Update plan status
      await updatePlanStatus(planId, organizationId, AgentPlanStatus.ROLLED_BACK);

      logger.info('Workspace plan rollback completed', {
        planId,
        rolledBackSteps,
        errorCount: errors.length,
        workspaceId,
      });

      return {
        success: errors.length === 0,
        rolledBackSteps,
        errors,
      };
    }),
});
