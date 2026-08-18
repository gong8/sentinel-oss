/**
 * Admin Global Variables Router
 * Handles namespace and field management for global variables
 */

import { AdminActionType, AdminResourceType, Prisma, prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getRequestMetaFromTrpc } from '../../lib/requestMeta.js';
import { logAdminAction } from '../../services/adminActionLog.js';
import {
  serializeFieldValue,
  validateFieldName,
  validateFieldValue,
  validateNamespaceName,
} from '../../services/globalVariables.js';
import { adminProcedure, router } from '../init.js';

// ============================================================================
// SCHEMAS
// ============================================================================

const fieldTypeSchema = z.enum([
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'STRING_ARRAY',
  'NUMBER_ARRAY',
]);

// ============================================================================
// ROUTER
// ============================================================================

export const adminGlobalVariablesRouter = router({
  // ============================================================================
  // NAMESPACE OPERATIONS
  // ============================================================================

  /**
   * List all namespaces in the organization
   * When workspaceId is provided, returns global + workspace-specific namespaces
   * When workspaceId is null (All Workspaces view), returns all namespaces
   */
  listNamespaces: adminProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean().optional(),
          workspaceId: z.string().cuid().nullable().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Build workspace filter
      let workspaceFilter:
        | { workspaceId?: string | null }
        | { OR: { workspaceId: string | null }[] }
        | undefined;

      if (input?.workspaceId === undefined) {
        // No filter - return all namespaces (for All Workspaces view)
        workspaceFilter = undefined;
      } else if (input?.workspaceId === null) {
        // Only global namespaces
        workspaceFilter = { workspaceId: null };
      } else {
        // Global + specific workspace
        workspaceFilter = {
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
        };
      }

      const namespaces = await prisma.globalVariableNamespace.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          ...(input?.includeDeleted ? {} : { deletedAt: null }),
          ...workspaceFilter,
        },
        include: {
          fields: {
            select: {
              id: true,
              name: true,
              description: true,
              fieldType: true,
              value: true,
            },
          },
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      return namespaces.map((ns) => ({
        ...ns,
        fieldCount: ns.fields.length,
      }));
    }),

  /**
   * Get a single namespace with all fields
   */
  getNamespace: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const namespace = await prisma.globalVariableNamespace.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.auth.organizationId,
      },
      include: {
        fields: {
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!namespace) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Namespace not found',
      });
    }

    // Validate workspace access for workspace-scoped namespaces
    if (
      namespace.workspaceId &&
      !ctx.auth.isOrgOwner &&
      !ctx.auth.workspaceIds.includes(namespace.workspaceId)
    ) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Namespace not found',
      });
    }

    return namespace;
  }),

  /**
   * Create a new namespace
   */
  createNamespace: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().max(500).optional(),
        workspaceId: z.string().cuid().nullable().optional(), // null = global (org-wide)
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate namespace name
      const nameValidation = validateNamespaceName(input.name);
      if (!nameValidation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: nameValidation.error ?? 'Invalid namespace name',
        });
      }

      // Non-org-owners cannot create global namespaces
      const workspaceId = input.workspaceId ?? null;
      if (workspaceId === null && !ctx.auth.isOrgOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owners can create global namespaces',
        });
      }

      // Verify workspace access if workspace-scoped
      if (workspaceId !== null) {
        const workspace = await prisma.workspace.findFirst({
          where: {
            id: workspaceId,
            organizationId: ctx.auth.organizationId,
            deletedAt: null,
          },
        });
        if (!workspace) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Workspace not found',
          });
        }
      }

      // Check for existing namespace in the same scope
      const existing = await prisma.globalVariableNamespace.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          workspaceId: workspaceId,
          name: input.name,
          deletedAt: null,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: workspaceId
            ? 'A namespace with this name already exists in this workspace'
            : 'A global namespace with this name already exists',
        });
      }

      const namespace = await prisma.globalVariableNamespace.create({
        data: {
          name: input.name,
          description: input.description,
          organizationId: ctx.auth.organizationId,
          workspaceId: workspaceId,
          createdBy: ctx.auth.user.id,
        },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.GLOBAL_VAR_NAMESPACE_CREATE,
        resourceType: AdminResourceType.GLOBAL_VAR_NAMESPACE,
        resourceId: namespace.id,
        resourceName: namespace.name,
        actionDetails: {
          name: namespace.name,
          description: namespace.description,
          workspaceId: namespace.workspaceId,
          workspaceName: namespace.workspace?.name ?? 'Global',
        },
        afterSnapshot: {
          id: namespace.id,
          name: namespace.name,
          description: namespace.description,
          workspaceId: namespace.workspaceId,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return namespace;
    }),

  /**
   * Update a namespace
   */
  updateNamespace: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        description: z.string().max(500).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const namespace = await prisma.globalVariableNamespace.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!namespace) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Namespace not found',
        });
      }

      // Validate workspace access for workspace-scoped namespaces
      if (
        namespace.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(namespace.workspaceId)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      // Validate new name if provided
      if (input.name && input.name !== namespace.name) {
        const nameValidation = validateNamespaceName(input.name);
        if (!nameValidation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: nameValidation.error ?? 'Invalid namespace name',
          });
        }

        // Check for name conflict
        const existing = await prisma.globalVariableNamespace.findFirst({
          where: {
            organizationId: ctx.auth.organizationId,
            name: input.name,
            id: { not: input.id },
            deletedAt: null,
          },
        });

        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A namespace with this name already exists',
          });
        }
      }

      const beforeSnapshot = {
        id: namespace.id,
        name: namespace.name,
        description: namespace.description,
      };

      const updated = await prisma.globalVariableNamespace.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.GLOBAL_VAR_NAMESPACE_UPDATE,
        resourceType: AdminResourceType.GLOBAL_VAR_NAMESPACE,
        resourceId: updated.id,
        resourceName: updated.name,
        actionDetails: {
          previousName: namespace.name,
          newName: updated.name,
          previousDescription: namespace.description,
          newDescription: updated.description,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Delete a namespace (soft delete)
   */
  deleteNamespace: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const namespace = await prisma.globalVariableNamespace.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
        include: {
          fields: true,
        },
      });

      if (!namespace) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Namespace not found',
        });
      }

      // Validate workspace access for workspace-scoped namespaces
      if (
        namespace.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(namespace.workspaceId)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      const beforeSnapshot = {
        id: namespace.id,
        name: namespace.name,
        description: namespace.description,
        fieldCount: namespace.fields.length,
        fieldNames: namespace.fields.map((f) => f.name),
      };

      await prisma.globalVariableNamespace.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.auth.user.id,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.GLOBAL_VAR_NAMESPACE_DELETE,
        resourceType: AdminResourceType.GLOBAL_VAR_NAMESPACE,
        resourceId: namespace.id,
        resourceName: namespace.name,
        actionDetails: {
          name: namespace.name,
          fieldCount: namespace.fields.length,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * Restore a soft-deleted namespace
   */
  restoreNamespace: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const namespace = await prisma.globalVariableNamespace.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.auth.organizationId,
          deletedAt: { not: null },
        },
      });

      if (!namespace) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Namespace not found or not deleted',
        });
      }

      // Validate workspace access for workspace-scoped namespaces
      if (
        namespace.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(namespace.workspaceId)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      // Check for name conflict with active namespaces
      const existing = await prisma.globalVariableNamespace.findFirst({
        where: {
          organizationId: ctx.auth.organizationId,
          name: namespace.name,
          id: { not: input.id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An active namespace with this name already exists',
        });
      }

      const beforeSnapshot = {
        id: namespace.id,
        name: namespace.name,
        deletedAt: namespace.deletedAt,
        deletedBy: namespace.deletedBy,
      };

      const restored = await prisma.globalVariableNamespace.update({
        where: { id: input.id },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.GLOBAL_VAR_NAMESPACE_RESTORE,
        resourceType: AdminResourceType.GLOBAL_VAR_NAMESPACE,
        resourceId: restored.id,
        resourceName: restored.name,
        actionDetails: {
          name: restored.name,
          previousDeletedAt: namespace.deletedAt?.toISOString(),
        },
        beforeSnapshot,
        afterSnapshot: {
          id: restored.id,
          name: restored.name,
          description: restored.description,
          deletedAt: null,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  // ============================================================================
  // FIELD OPERATIONS
  // ============================================================================

  /**
   * Create a new field in a namespace
   */
  createField: adminProcedure
    .input(
      z.object({
        namespaceId: z.string(),
        name: z.string().min(1).max(50),
        description: z.string().max(500).optional(),
        fieldType: fieldTypeSchema,
        value: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify namespace exists and belongs to org
      const namespace = await prisma.globalVariableNamespace.findFirst({
        where: {
          id: input.namespaceId,
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
        },
      });

      if (!namespace) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Namespace not found',
        });
      }

      // Validate workspace access for workspace-scoped namespaces
      if (
        namespace.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(namespace.workspaceId)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      // Validate field name
      const nameValidation = validateFieldName(input.name);
      if (!nameValidation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: nameValidation.error ?? 'Invalid field name',
        });
      }

      // Validate field value
      const valueValidation = validateFieldValue(input.value, input.fieldType);
      if (!valueValidation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: valueValidation.error ?? 'Invalid field value',
        });
      }

      // Check for existing field
      const existingField = await prisma.globalVariableField.findFirst({
        where: {
          namespaceId: input.namespaceId,
          name: input.name,
        },
      });

      if (existingField) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A field with this name already exists in this namespace',
        });
      }

      const serializedValue = serializeFieldValue(
        valueValidation.normalizedValue!,
        input.fieldType,
      );

      const field = await prisma.globalVariableField.create({
        data: {
          namespaceId: input.namespaceId,
          name: input.name,
          description: input.description,
          fieldType: input.fieldType,
          value: serializedValue,
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.GLOBAL_VAR_FIELD_CREATE,
        resourceType: AdminResourceType.GLOBAL_VAR_FIELD,
        resourceId: field.id,
        resourceName: `${namespace.name}.${field.name}`,
        actionDetails: {
          namespaceName: namespace.name,
          fieldName: field.name,
          fieldType: field.fieldType,
          description: field.description,
        },
        afterSnapshot: {
          id: field.id,
          namespaceId: field.namespaceId,
          name: field.name,
          fieldType: field.fieldType,
          value: serializedValue,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return field;
    }),

  /**
   * Update a field
   */
  updateField: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        description: z.string().max(500).optional().nullable(),
        fieldType: fieldTypeSchema.optional(),
        value: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const field = await prisma.globalVariableField.findFirst({
        where: {
          id: input.id,
        },
        include: {
          namespace: true,
        },
      });

      if (!field || field.namespace.organizationId !== ctx.auth.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Field not found',
        });
      }

      // Validate workspace access for workspace-scoped namespaces
      if (
        field.namespace.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(field.namespace.workspaceId)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      if (field.namespace.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot update field in a deleted namespace',
        });
      }

      // Validate new name if provided
      if (input.name && input.name !== field.name) {
        const nameValidation = validateFieldName(input.name);
        if (!nameValidation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: nameValidation.error ?? 'Invalid field name',
          });
        }

        // Check for name conflict
        const existingField = await prisma.globalVariableField.findFirst({
          where: {
            namespaceId: field.namespaceId,
            name: input.name,
            id: { not: input.id },
          },
        });

        if (existingField) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A field with this name already exists in this namespace',
          });
        }
      }

      // Determine the field type (use new if provided, otherwise existing)
      const targetFieldType = input.fieldType ?? field.fieldType;

      // Validate and serialize value if provided
      let serializedValue: Prisma.InputJsonValue | undefined = undefined;
      if (input.value !== undefined) {
        const valueValidation = validateFieldValue(input.value, targetFieldType);
        if (!valueValidation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: valueValidation.error ?? 'Invalid field value',
          });
        }
        serializedValue = serializeFieldValue(valueValidation.normalizedValue!, targetFieldType);
      }

      const beforeSnapshot = {
        id: field.id,
        name: field.name,
        fieldType: field.fieldType,
        value: field.value,
        description: field.description,
      };

      const updated = await prisma.globalVariableField.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          fieldType: input.fieldType,
          ...(serializedValue !== undefined && { value: serializedValue }),
        },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.GLOBAL_VAR_FIELD_UPDATE,
        resourceType: AdminResourceType.GLOBAL_VAR_FIELD,
        resourceId: updated.id,
        resourceName: `${field.namespace.name}.${updated.name}`,
        actionDetails: {
          namespaceName: field.namespace.name,
          previousName: field.name,
          newName: updated.name,
          previousFieldType: field.fieldType,
          newFieldType: updated.fieldType,
        },
        beforeSnapshot,
        afterSnapshot: {
          id: updated.id,
          name: updated.name,
          fieldType: updated.fieldType,
          value: updated.value,
          description: updated.description,
        },
        ...getRequestMetaFromTrpc(ctx),
      });

      return updated;
    }),

  /**
   * Delete a field (hard delete)
   */
  deleteField: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const field = await prisma.globalVariableField.findFirst({
        where: {
          id: input.id,
        },
        include: {
          namespace: true,
        },
      });

      if (!field || field.namespace.organizationId !== ctx.auth.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Field not found',
        });
      }

      // Validate workspace access for workspace-scoped namespaces
      if (
        field.namespace.workspaceId &&
        !ctx.auth.isOrgOwner &&
        !ctx.auth.workspaceIds.includes(field.namespace.workspaceId)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this workspace',
        });
      }

      const beforeSnapshot = {
        id: field.id,
        name: field.name,
        fieldType: field.fieldType,
        value: field.value,
        description: field.description,
        namespaceId: field.namespaceId,
      };

      await prisma.globalVariableField.delete({
        where: { id: input.id },
      });

      await logAdminAction({
        organizationId: ctx.auth.organizationId,
        adminUserId: ctx.auth.user.id,
        actionType: AdminActionType.GLOBAL_VAR_FIELD_DELETE,
        resourceType: AdminResourceType.GLOBAL_VAR_FIELD,
        resourceId: field.id,
        resourceName: `${field.namespace.name}.${field.name}`,
        actionDetails: {
          namespaceName: field.namespace.name,
          fieldName: field.name,
          fieldType: field.fieldType,
        },
        beforeSnapshot,
        ...getRequestMetaFromTrpc(ctx),
      });

      return { success: true };
    }),

  /**
   * List variables formatted for condition builder
   * Returns namespaces with fields, including fullPath for easy selection
   * Filters by workspace access: global namespaces + user's workspace namespaces
   */
  listVariablesForConditionBuilder: adminProcedure
    .input(
      z
        .object({
          compatibleTypes: z.array(fieldTypeSchema).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const namespaces = await prisma.globalVariableNamespace.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
        include: {
          fields: {
            where: input?.compatibleTypes?.length
              ? { fieldType: { in: input.compatibleTypes } }
              : undefined,
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Filter out namespaces with no matching fields
      return namespaces
        .filter((ns) => ns.fields.length > 0)
        .map((ns) => ({
          id: ns.id,
          name: ns.name,
          description: ns.description,
          fields: ns.fields.map((field) => ({
            id: field.id,
            name: field.name,
            description: field.description,
            fieldType: field.fieldType,
            fullPath: `${ns.name}.${field.name}`,
            value: field.value,
          })),
        }));
    }),

  /**
   * Get all global variables as a flat map (for debugging/preview)
   * Filters by workspace access: global namespaces + user's workspace namespaces
   */
  getVariablesPreview: adminProcedure.query(async ({ ctx }) => {
    const namespaces = await prisma.globalVariableNamespace.findMany({
      where: {
        organizationId: ctx.auth.organizationId,
        deletedAt: null,
        OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
      },
      include: {
        fields: true,
      },
      orderBy: { name: 'asc' },
    });

    const preview: Record<string, Record<string, unknown>> = {};

    for (const namespace of namespaces) {
      const fields: Record<string, unknown> = {};
      for (const field of namespace.fields) {
        fields[field.name] = field.value;
      }
      preview[namespace.name] = fields;
    }

    return preview;
  }),
});
