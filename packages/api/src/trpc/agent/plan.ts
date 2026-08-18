/**
 * Agent Plan Router
 * tRPC endpoints for managing multi-step operation plans
 */

import { AgentPlanStatus } from '@sentinel/db';
import { z } from 'zod';
import { createToolRegistry } from '../../agent/tools/index.js';
import {
  abortPlan,
  approvePlan,
  executePlan,
  getPlan,
  listPlansForConversation,
  rollbackPlan,
} from '../../services/agentPlan.js';
import { adminProcedure, router } from '../init.js';

const planIdInput = z.object({ planId: z.string().cuid() });

const conversationIdInput = z.object({ conversationId: z.string().cuid() });

export const agentPlanRouter = router({
  /**
   * Get a specific plan by ID
   */
  get: adminProcedure.input(planIdInput).query(async ({ ctx, input }) => {
    const plan = await getPlan(input.planId, ctx.auth.organizationId);

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
   * List plans for a conversation
   */
  listForConversation: adminProcedure.input(conversationIdInput).query(async ({ ctx, input }) => {
    const plans = await listPlansForConversation(input.conversationId, ctx.auth.organizationId);

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
  approve: adminProcedure.input(planIdInput).mutation(async ({ ctx, input }) => {
    try {
      await approvePlan(input.planId, ctx.auth.organizationId, ctx.auth.user.id);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve plan';
      return { success: false, error: message };
    }
  }),

  /**
   * Abort a plan
   */
  abort: adminProcedure.input(planIdInput).mutation(async ({ ctx, input }) => {
    try {
      await abortPlan(input.planId, ctx.auth.organizationId, ctx.auth.user.id);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to abort plan';
      return { success: false, error: message };
    }
  }),

  /**
   * Execute an approved plan
   */
  execute: adminProcedure.input(planIdInput).mutation(async ({ ctx, input }) => {
    const { organizationId, user } = ctx.auth;

    // Get the plan first to check status
    const plan = await getPlan(input.planId, organizationId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    if (plan.status !== AgentPlanStatus.PENDING && plan.status !== AgentPlanStatus.PAUSED) {
      return {
        success: false,
        error: `Cannot execute plan in status: ${plan.status}`,
      };
    }

    // Create tool registry for execution
    const toolRegistry = createToolRegistry({ includeWriteTools: true });

    // Create context for tool execution
    const context = {
      organizationId,
      userId: user.id,
    };

    const result = await executePlan(input.planId, context, toolRegistry);

    return {
      success: result.success,
      completedSteps: result.completedSteps,
      totalSteps: result.totalSteps,
      error: result.error,
      results: result.results,
    };
  }),

  /**
   * Rollback a failed plan
   */
  rollback: adminProcedure.input(planIdInput).mutation(async ({ ctx, input }) => {
    const { organizationId, user } = ctx.auth;

    // Create tool registry for execution
    const toolRegistry = createToolRegistry({ includeWriteTools: true });

    // Create context for tool execution
    const context = {
      organizationId,
      userId: user.id,
    };

    const result = await rollbackPlan(input.planId, context, toolRegistry);

    return {
      success: result.success,
      rolledBackSteps: result.rolledBackSteps,
      errors: result.errors,
    };
  }),
});
