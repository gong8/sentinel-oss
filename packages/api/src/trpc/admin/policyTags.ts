/**
 * Admin Policy Tags Router
 * Handles policy tag CRUD operations
 * Tags can be scoped to workspaces or global (org-wide)
 */

import { z } from 'zod';
import { throwConflict, throwForbidden, throwNotFound } from '../../lib/trpcErrors.js';
import {
  bulkAssignTagToPolicies,
  bulkRemoveTagFromPolicies,
  createPolicyTag,
  deletePolicyTag,
  getPolicyTag,
  isTagNameAvailable,
  listPolicyTags,
  updatePolicyTag,
} from '../../services/policyTag.js';
import { adminProcedure, router } from '../init.js';

// Common color validation (hex color)
const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
  .optional();

export const adminPolicyTagsRouter = router({
  /**
   * List policy tags the user has access to
   * - Org owners see all tags (global + all workspaces)
   * - Workspace admins see global tags + their workspace tags
   */
  list: adminProcedure
    .input(
      z
        .object({
          workspaceId: z.string().cuid().nullable().optional(), // Filter to specific workspace
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return listPolicyTags({
        organizationId: ctx.auth.organizationId,
        isOrgOwner: ctx.auth.isOrgOwner,
        workspaceIds: ctx.auth.workspaceIds,
        workspaceId: input?.workspaceId,
      });
    }),

  /**
   * Get a specific policy tag
   */
  get: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const tag = await getPolicyTag(input.id, ctx.auth.organizationId);

    if (!tag) {
      throwNotFound('Policy tag not found');
    }

    // Check access: org owner can access all, workspace admins can access global + their workspace tags
    if (
      !ctx.auth.isOrgOwner &&
      tag.workspaceId &&
      !ctx.auth.workspaceIds.includes(tag.workspaceId)
    ) {
      throwForbidden('You do not have access to this tag');
    }

    return tag;
  }),

  /**
   * Create a new policy tag
   * - Org owners can create global tags (workspaceId = null)
   * - Workspace admins can only create workspace-scoped tags
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().max(200).optional(),
        color: colorSchema,
        workspaceId: z.string().cuid().nullable().optional(), // null = global (org owner only)
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspaceId = input.workspaceId ?? null;

      // Permission check: only org owners can create global tags
      if (workspaceId === null && !ctx.auth.isOrgOwner) {
        throwForbidden('Only organization owners can create global tags');
      }

      // Permission check: must have access to the workspace
      if (
        workspaceId !== null &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(workspaceId)
      ) {
        throwForbidden('You do not have access to this workspace');
      }

      // Check if tag name already exists in the same scope
      const available = await isTagNameAvailable(ctx.auth.organizationId, workspaceId, input.name);

      if (!available) {
        throwConflict('A tag with this name already exists in this scope');
      }

      return createPolicyTag({
        organizationId: ctx.auth.organizationId,
        workspaceId,
        name: input.name,
        description: input.description,
        color: input.color,
      });
    }),

  /**
   * Update a policy tag
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1).max(50).optional(),
        description: z.string().max(200).optional().nullable(),
        color: colorSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify tag exists
      const existing = await getPolicyTag(input.id, ctx.auth.organizationId);

      if (!existing) {
        throwNotFound('Policy tag not found');
      }

      // Permission check: org owners can update all, workspace admins only their workspace tags
      if (!ctx.auth.isOrgOwner) {
        if (existing.workspaceId === null) {
          throwForbidden('Only organization owners can update global tags');
        }
        if (!ctx.auth.workspaceIds.includes(existing.workspaceId)) {
          throwForbidden('You do not have access to this tag');
        }
      }

      // If changing name, check for conflicts within the same scope
      if (input.name && input.name !== existing.name) {
        const available = await isTagNameAvailable(
          ctx.auth.organizationId,
          existing.workspaceId,
          input.name,
          input.id,
        );

        if (!available) {
          throwConflict('A tag with this name already exists in this scope');
        }
      }

      return updatePolicyTag(input.id, ctx.auth.organizationId, {
        name: input.name,
        description: input.description,
        color: input.color,
      });
    }),

  /**
   * Delete a policy tag (unlinks from all policies)
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const tag = await getPolicyTag(input.id, ctx.auth.organizationId);

      if (!tag) {
        throwNotFound('Policy tag not found');
      }

      // Permission check: org owners can delete all, workspace admins only their workspace tags
      if (!ctx.auth.isOrgOwner) {
        if (tag.workspaceId === null) {
          throwForbidden('Only organization owners can delete global tags');
        }
        if (!ctx.auth.workspaceIds.includes(tag.workspaceId)) {
          throwForbidden('You do not have access to this tag');
        }
      }

      await deletePolicyTag(input.id, ctx.auth.organizationId);

      return { success: true };
    }),

  /**
   * Bulk assign a tag to multiple policies
   */
  bulkAssign: adminProcedure
    .input(
      z.object({
        tagId: z.string().cuid(),
        policyIds: z.array(z.string().cuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify tag exists and user has access
      const tag = await getPolicyTag(input.tagId, ctx.auth.organizationId);

      if (!tag) {
        throwNotFound('Policy tag not found');
      }

      // Check access to tag
      if (
        !ctx.auth.isOrgOwner &&
        tag.workspaceId &&
        !ctx.auth.workspaceIds.includes(tag.workspaceId)
      ) {
        throwForbidden('You do not have access to this tag');
      }

      return bulkAssignTagToPolicies(input.tagId, ctx.auth.organizationId, input.policyIds);
    }),

  /**
   * Bulk remove a tag from multiple policies
   */
  bulkRemove: adminProcedure
    .input(
      z.object({
        tagId: z.string().cuid(),
        policyIds: z.array(z.string().cuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify tag exists and user has access
      const tag = await getPolicyTag(input.tagId, ctx.auth.organizationId);

      if (!tag) {
        throwNotFound('Policy tag not found');
      }

      // Check access to tag
      if (
        !ctx.auth.isOrgOwner &&
        tag.workspaceId &&
        !ctx.auth.workspaceIds.includes(tag.workspaceId)
      ) {
        throwForbidden('You do not have access to this tag');
      }

      return bulkRemoveTagFromPolicies(input.tagId, ctx.auth.organizationId, input.policyIds);
    }),
});
