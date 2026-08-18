/**
 * Agent Confirmation Router
 * tRPC endpoints for managing write operation confirmations
 *
 * Uses TOOL_EXECUTORS from adminMcpExecutors as the source of truth
 * for executing confirmed write operations.
 */

import { prisma } from '@sentinel/db';
import { getAdminToolName } from '@sentinel/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  cancelAction,
  confirmAction,
  getConfirmation,
  getPendingConfirmations,
  isSuccess,
  markExecuted,
  updateToolResultByConfirmationId,
} from '../../agent/index.js';
import { TOOL_EXECUTORS } from '../../services/adminMcpExecutors.js';
import type { AuthContext } from '../../services/auth.js';
import { adminProcedure, router } from '../init.js';

/**
 * Validate workspace access for confirmation execution.
 * Ensures the user has admin access to the workspace associated with the confirmation.
 *
 * @param auth - The authenticated user context
 * @param workspaceId - The workspace ID from the confirmation (optional - null means org-wide)
 * @throws TRPCError if workspace access is denied
 */
async function validateWorkspaceAccessForConfirmation(
  auth: AuthContext,
  workspaceId: string | null | undefined,
): Promise<void> {
  // No workspace = org-wide operation (allowed for admins)
  if (!workspaceId) {
    return;
  }

  // Org owners can access any workspace in their organization
  if (auth.isOrgOwner) {
    // Verify the workspace belongs to this organization
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        organizationId: auth.organizationId,
        deletedAt: null,
      },
    });

    if (!workspace) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found or does not belong to this organization',
      });
    }
    return;
  }

  // Non-org-owners must be workspace admins
  if (!auth.adminWorkspaceIds.includes(workspaceId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Workspace admin access required to execute this action',
    });
  }
}

type ToolContext = { organizationId: string; userId: string; workspaceId?: string | null };
type ToolResult = { success: boolean; result?: unknown; error?: string };

type ConfirmationResult = ToolResult;

type FinalizeParams = {
  confirmationId: string;
  conversationId: string | null;
  organizationId: string;
  result: ToolResult;
};

/**
 * Finalize a confirmation by marking it executed and updating the tool result message
 */
async function finalizeConfirmation(params: FinalizeParams): Promise<ConfirmationResult> {
  const { confirmationId, conversationId, result } = params;

  await markExecuted(confirmationId, result.result, result.error);

  // Update the original TOOL_RESULT message with the actual execution result
  // Include userDecision to distinguish accepted actions from other results
  if (conversationId) {
    const newToolResult = result.success
      ? { ...((result.result as object) ?? {}), userDecision: 'accepted' }
      : { error: result.error, userDecision: 'accepted' }; // Accepted but execution failed
    // Note: We need organizationId from the caller context
    // This will be passed through the params
    await updateToolResultByConfirmationId(
      conversationId,
      params.organizationId,
      confirmationId,
      newToolResult,
    );
  }

  return result;
}

/**
 * Execute a confirmed tool action using TOOL_EXECUTORS
 *
 * Maps the base tool name (without 'admin_' prefix) to the executor
 * and runs it with the confirmed input.
 */
async function executeConfirmedTool(
  toolName: string,
  toolInput: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    // Map to admin tool name (add 'admin_' prefix)
    const adminToolName = getAdminToolName(toolName);
    const executor = TOOL_EXECUTORS[adminToolName];

    if (!executor) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    // Execute the tool (pass workspaceId for workspace-scoped operations)
    const result = await executor(
      context.organizationId,
      context.userId,
      toolInput,
      context.workspaceId ?? undefined,
    );

    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error executing tool';
    return { success: false, error: message };
  }
}

const confirmationIdInput = z.object({ confirmationId: z.string().cuid() });

const confirmWithModifiedInputSchema = z.object({
  confirmationId: z.string(),
  modifiedInput: z.unknown().optional(),
});

export const agentConfirmationRouter = router({
  getPending: adminProcedure
    .input(z.object({ conversationId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const confirmations = await getPendingConfirmations(
        input.conversationId,
        ctx.auth.organizationId,
      );

      return confirmations.map((c) => ({
        id: c.id,
        toolName: c.toolName,
        toolInput: c.toolInput,
        description: c.description,
        createdAt: c.createdAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
      }));
    }),

  confirm: adminProcedure.input(confirmationIdInput).mutation(async ({ ctx, input }) => {
    const { organizationId, user } = ctx.auth;
    const confirmResult = await confirmAction(input.confirmationId, organizationId, user.id);

    if (!isSuccess(confirmResult)) {
      return { success: false, error: confirmResult.error };
    }

    const { confirmation } = confirmResult.data;

    // SECURITY: Validate workspace access before executing the confirmed action
    // This ensures the user still has access to the workspace (e.g., wasn't removed)
    await validateWorkspaceAccessForConfirmation(ctx.auth, confirmation.workspaceId);

    const result = await executeConfirmedTool(confirmation.toolName, confirmation.toolInput, {
      organizationId,
      userId: user.id,
      workspaceId: confirmation.workspaceId,
    });

    return finalizeConfirmation({
      confirmationId: input.confirmationId,
      conversationId: confirmation.conversationId,
      organizationId,
      result,
    });
  }),

  cancel: adminProcedure.input(confirmationIdInput).mutation(async ({ ctx, input }) => {
    // Get the confirmation first to access conversationId
    const confirmation = await getConfirmation(input.confirmationId, ctx.auth.organizationId);

    const cancelResult = await cancelAction(input.confirmationId, ctx.auth.organizationId);

    // Update the original TOOL_RESULT message to show it was rejected by user
    // userDecision: 'rejected' distinguishes this from actual errors
    if (isSuccess(cancelResult) && confirmation?.conversationId) {
      await updateToolResultByConfirmationId(
        confirmation.conversationId,
        ctx.auth.organizationId,
        input.confirmationId,
        { userDecision: 'rejected' },
      );
    }

    return isSuccess(cancelResult)
      ? { success: true }
      : { success: false, error: cancelResult.error };
  }),

  /**
   * Confirm an action with modified input
   * Used by the policy review modal to submit user-edited policy values
   */
  confirmWithModifiedInput: adminProcedure
    .input(confirmWithModifiedInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, user } = ctx.auth;
      const confirmResult = await confirmAction(input.confirmationId, organizationId, user.id);

      if (!isSuccess(confirmResult)) {
        return { success: false, error: confirmResult.error };
      }

      const { confirmation } = confirmResult.data;

      // SECURITY: Validate workspace access before executing the confirmed action
      // This ensures the user still has access to the workspace (e.g., wasn't removed)
      await validateWorkspaceAccessForConfirmation(ctx.auth, confirmation.workspaceId);

      // Use modifiedInput if provided, otherwise use original toolInput
      const toolInput = input.modifiedInput ?? confirmation.toolInput;

      const result = await executeConfirmedTool(confirmation.toolName, toolInput, {
        organizationId,
        userId: user.id,
        workspaceId: confirmation.workspaceId,
      });

      return finalizeConfirmation({
        confirmationId: input.confirmationId,
        conversationId: confirmation.conversationId,
        organizationId,
        result,
      });
    }),

  get: adminProcedure.input(confirmationIdInput).query(async ({ ctx, input }) => {
    const confirmation = await getConfirmation(input.confirmationId, ctx.auth.organizationId);

    if (!confirmation) {
      return null;
    }

    return {
      id: confirmation.id,
      toolName: confirmation.toolName,
      toolInput: confirmation.toolInput,
      description: confirmation.description,
      status: confirmation.status,
      createdAt: confirmation.createdAt.toISOString(),
      expiresAt: confirmation.expiresAt.toISOString(),
      confirmedAt: confirmation.confirmedAt?.toISOString(),
      executedAt: confirmation.executedAt?.toISOString(),
      result: confirmation.result,
      error: confirmation.error,
    };
  }),
});
