/**
 * Tests for Admin Global Variables Router
 * Tests namespace and field management operations
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';
import { createAdminContext } from '../../../../helpers/unit-test-mocks.js';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockValidateNamespaceName,
  mockValidateFieldName,
  mockValidateFieldValue,
  mockSerializeFieldValue,
} = vi.hoisted(() => ({
  mockPrisma: {
    globalVariableNamespace: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    globalVariableField: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  mockLogAdminAction: vi.fn(),
  mockValidateNamespaceName: vi.fn(),
  mockValidateFieldName: vi.fn(),
  mockValidateFieldValue: vi.fn(),
  mockSerializeFieldValue: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: { JsonNull: null },
  AdminActionType: {
    GLOBAL_VAR_NAMESPACE_CREATE: 'GLOBAL_VAR_NAMESPACE_CREATE',
    GLOBAL_VAR_NAMESPACE_UPDATE: 'GLOBAL_VAR_NAMESPACE_UPDATE',
    GLOBAL_VAR_NAMESPACE_DELETE: 'GLOBAL_VAR_NAMESPACE_DELETE',
    GLOBAL_VAR_NAMESPACE_RESTORE: 'GLOBAL_VAR_NAMESPACE_RESTORE',
    GLOBAL_VAR_FIELD_CREATE: 'GLOBAL_VAR_FIELD_CREATE',
    GLOBAL_VAR_FIELD_UPDATE: 'GLOBAL_VAR_FIELD_UPDATE',
    GLOBAL_VAR_FIELD_DELETE: 'GLOBAL_VAR_FIELD_DELETE',
  },
  AdminResourceType: {
    GLOBAL_VAR_NAMESPACE: 'GLOBAL_VAR_NAMESPACE',
    GLOBAL_VAR_FIELD: 'GLOBAL_VAR_FIELD',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/globalVariables.js', () => ({
  validateNamespaceName: mockValidateNamespaceName,
  validateFieldName: mockValidateFieldName,
  validateFieldValue: mockValidateFieldValue,
  serializeFieldValue: mockSerializeFieldValue,
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => {
  const createChain = () => ({
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    output: vi.fn(() => createChain()),
    input: vi.fn(() => createChain()),
  });
  return {
    router: vi.fn((routes) => routes),
    adminProcedure: createChain(),
  };
});

import { adminGlobalVariablesRouter as _adminGlobalVariablesRouter } from '../../../../../packages/api/src/trpc/admin/globalVariables.js';

// Re-type the router for testing
interface NamespaceResult {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  deletedAt: Date | null;
  deletedBy: string | null;
  fields: FieldResult[];
  fieldCount?: number;
}

interface FieldResult {
  id: string;
  namespaceId: string;
  name: string;
  description: string | null;
  fieldType: string;
  value: unknown;
  namespace?: NamespaceResult;
}

interface VariablesPreview {
  [namespace: string]: {
    [field: string]: unknown;
  };
}

interface ConditionBuilderNamespace {
  id: string;
  name: string;
  description: string | null;
  fields: Array<{
    id: string;
    name: string;
    description: string | null;
    fieldType: string;
    fullPath: string;
    value: unknown;
  }>;
}

const adminGlobalVariablesRouter = _adminGlobalVariablesRouter as unknown as {
  listNamespaces: TestableHandler<NamespaceResult[]>;
  getNamespace: TestableHandler<NamespaceResult>;
  createNamespace: TestableHandler<NamespaceResult>;
  updateNamespace: TestableHandler<NamespaceResult>;
  deleteNamespace: TestableHandler<{ success: boolean }>;
  restoreNamespace: TestableHandler<{ success: boolean }>;
  createField: TestableHandler<FieldResult>;
  updateField: TestableHandler<FieldResult>;
  deleteField: TestableHandler<{ success: boolean }>;
  listVariablesForConditionBuilder: TestableHandler<ConditionBuilderNamespace[]>;
  getVariablesPreview: TestableHandler<VariablesPreview>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateNamespaceName.mockReturnValue({ valid: true });
  mockValidateFieldName.mockReturnValue({ valid: true });
  mockValidateFieldValue.mockReturnValue({ valid: true, normalizedValue: 'test-value' });
  mockSerializeFieldValue.mockImplementation((value) => value);
  mockLogAdminAction.mockResolvedValue(undefined);
});

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockNamespace(overrides: Partial<NamespaceResult> = {}): NamespaceResult {
  return {
    id: 'ns-123',
    name: 'TEST_NAMESPACE',
    description: 'Test namespace description',
    organizationId: 'org-123',
    createdBy: 'admin-user-123',
    createdAt: new Date('2024-01-01'),
    deletedAt: null,
    deletedBy: null,
    fields: [],
    ...overrides,
  };
}

function createMockField(overrides: Partial<FieldResult> = {}): FieldResult {
  return {
    id: 'field-123',
    namespaceId: 'ns-123',
    name: 'testField',
    description: 'Test field description',
    fieldType: 'STRING',
    value: 'test-value',
    ...overrides,
  };
}

// ============================================================================
// NAMESPACE OPERATIONS
// ============================================================================

describe('adminGlobalVariablesRouter', () => {
  describe('listNamespaces', () => {
    test('should list all active namespaces with field counts', async () => {
      const mockNamespaces = [
        createMockNamespace({
          id: 'ns-1',
          name: 'CONFIG',
          fields: [createMockField({ id: 'f1' }), createMockField({ id: 'f2' })],
        }),
        createMockNamespace({
          id: 'ns-2',
          name: 'SETTINGS',
          fields: [createMockField({ id: 'f3' })],
        }),
      ];
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue(mockNamespaces);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.listNamespaces({ ctx, input: undefined });

      expect(result).toHaveLength(2);
      expect(result[0].fieldCount).toBe(2);
      expect(result[1].fieldCount).toBe(1);
      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-123',
            deletedAt: null,
          },
          include: expect.objectContaining({
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
          }),
          orderBy: { name: 'asc' },
        }),
      );
    });

    test('should include deleted namespaces when includeDeleted is true', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.listNamespaces({ ctx, input: { includeDeleted: true } });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
        },
        include: expect.anything(),
        orderBy: { name: 'asc' },
      });
    });

    test('should exclude deleted namespaces by default', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.listNamespaces({ ctx, input: {} });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test('should handle undefined input', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.listNamespaces({ ctx, input: undefined });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  describe('getNamespace', () => {
    test('should get namespace by id with fields', async () => {
      const mockNamespace = createMockNamespace({
        fields: [createMockField()],
      });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.getNamespace({
        ctx,
        input: { id: 'ns-123' },
      });

      expect(result).toEqual(mockNamespace);
      expect(mockPrisma.globalVariableNamespace.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'ns-123',
          organizationId: 'org-123',
        },
        include: {
          fields: {
            orderBy: { name: 'asc' },
          },
        },
      });
    });

    test('should throw NOT_FOUND when namespace does not exist', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.getNamespace({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toThrow(TRPCError);
      await expect(
        adminGlobalVariablesRouter.getNamespace({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Namespace not found',
      });
    });
  });

  describe('createNamespace', () => {
    test('should create a new namespace', async () => {
      const mockNamespace = createMockNamespace({ name: 'NEW_NAMESPACE' });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);
      mockPrisma.globalVariableNamespace.create.mockResolvedValue(mockNamespace);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.createNamespace({
        ctx,
        input: { name: 'NEW_NAMESPACE', description: 'A new namespace' },
      });

      expect(result).toEqual(mockNamespace);
      expect(mockPrisma.globalVariableNamespace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'NEW_NAMESPACE',
            description: 'A new namespace',
            organizationId: 'org-123',
            createdBy: 'admin-user-123',
            workspaceId: null,
          }),
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
      );
    });

    test('should throw BAD_REQUEST for invalid namespace name', async () => {
      mockValidateNamespaceName.mockReturnValue({
        valid: false,
        error: 'Namespace name must be uppercase',
      });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.createNamespace({ ctx, input: { name: 'invalid' } }),
      ).rejects.toThrow(TRPCError);
      await expect(
        adminGlobalVariablesRouter.createNamespace({ ctx, input: { name: 'invalid' } }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Namespace name must be uppercase',
      });
    });

    test('should throw CONFLICT when namespace name already exists', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(createMockNamespace());

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.createNamespace({ ctx, input: { name: 'TEST_NAMESPACE' } }),
      ).rejects.toThrow(TRPCError);
      await expect(
        adminGlobalVariablesRouter.createNamespace({ ctx, input: { name: 'TEST_NAMESPACE' } }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A global namespace with this name already exists',
      });
    });

    test('should log admin action on create', async () => {
      const mockNamespace = createMockNamespace({ name: 'LOG_TEST' });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);
      mockPrisma.globalVariableNamespace.create.mockResolvedValue(mockNamespace);

      const ctx = createAdminContext({ userId: 'admin-456' });
      await adminGlobalVariablesRouter.createNamespace({
        ctx,
        input: { name: 'LOG_TEST', description: 'Test description' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          adminUserId: 'admin-456',
          actionType: 'GLOBAL_VAR_NAMESPACE_CREATE',
          resourceType: 'GLOBAL_VAR_NAMESPACE',
          resourceId: mockNamespace.id,
          resourceName: 'LOG_TEST',
          actionDetails: expect.objectContaining({
            name: 'LOG_TEST',
            description: mockNamespace.description,
            workspaceId: undefined,
            workspaceName: 'Global',
          }),
          afterSnapshot: expect.objectContaining({
            id: mockNamespace.id,
            name: 'LOG_TEST',
            description: mockNamespace.description,
            workspaceId: undefined,
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
        }),
      );
    });
  });

  describe('updateNamespace', () => {
    test('should update namespace name and description', async () => {
      const existingNamespace = createMockNamespace();
      const updatedNamespace = {
        ...existingNamespace,
        name: 'UPDATED_NAME',
        description: 'New desc',
      };

      mockPrisma.globalVariableNamespace.findFirst
        .mockResolvedValueOnce(existingNamespace) // First call: verify namespace exists
        .mockResolvedValueOnce(null); // Second call: check name conflict
      mockPrisma.globalVariableNamespace.update.mockResolvedValue(updatedNamespace);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.updateNamespace({
        ctx,
        input: { id: 'ns-123', name: 'UPDATED_NAME', description: 'New desc' },
      });

      expect(result.name).toBe('UPDATED_NAME');
      expect(mockPrisma.globalVariableNamespace.update).toHaveBeenCalledWith({
        where: { id: 'ns-123' },
        data: {
          name: 'UPDATED_NAME',
          description: 'New desc',
        },
      });
    });

    test('should throw NOT_FOUND when namespace does not exist', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateNamespace({
          ctx,
          input: { id: 'nonexistent', name: 'NEW' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Namespace not found',
      });
    });

    test('should throw NOT_FOUND when namespace is deleted', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null); // deletedAt: null filter excludes it

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateNamespace({ ctx, input: { id: 'deleted-ns' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should throw BAD_REQUEST for invalid new name', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(createMockNamespace());
      mockValidateNamespaceName.mockReturnValue({
        valid: false,
        error: 'Invalid namespace name format',
      });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateNamespace({
          ctx,
          input: { id: 'ns-123', name: 'invalid' },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid namespace name format',
      });
    });

    test('should throw CONFLICT when new name already exists', async () => {
      const existingNamespace = createMockNamespace();
      mockPrisma.globalVariableNamespace.findFirst
        .mockResolvedValueOnce(existingNamespace)
        .mockResolvedValueOnce({ id: 'other-ns', name: 'EXISTING_NAME' });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateNamespace({
          ctx,
          input: { id: 'ns-123', name: 'EXISTING_NAME' },
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A namespace with this name already exists',
      });
    });

    test('should skip name validation if name unchanged', async () => {
      const existingNamespace = createMockNamespace({ name: 'SAME_NAME' });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(existingNamespace);
      mockPrisma.globalVariableNamespace.update.mockResolvedValue({
        ...existingNamespace,
        description: 'Only desc changed',
      });

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.updateNamespace({
        ctx,
        input: { id: 'ns-123', name: 'SAME_NAME', description: 'Only desc changed' },
      });

      // validateNamespaceName should not be called for name check since name is unchanged
      // The second findFirst (conflict check) should not be called
      expect(mockPrisma.globalVariableNamespace.findFirst).toHaveBeenCalledTimes(1);
    });

    test('should log admin action on update', async () => {
      const existingNamespace = createMockNamespace({ name: 'OLD_NAME' });
      const updatedNamespace = { ...existingNamespace, name: 'NEW_NAME' };

      mockPrisma.globalVariableNamespace.findFirst
        .mockResolvedValueOnce(existingNamespace)
        .mockResolvedValueOnce(null);
      mockPrisma.globalVariableNamespace.update.mockResolvedValue(updatedNamespace);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.updateNamespace({
        ctx,
        input: { id: 'ns-123', name: 'NEW_NAME' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'GLOBAL_VAR_NAMESPACE_UPDATE',
          actionDetails: expect.objectContaining({
            previousName: 'OLD_NAME',
            newName: 'NEW_NAME',
          }),
          beforeSnapshot: expect.objectContaining({
            name: 'OLD_NAME',
          }),
          afterSnapshot: expect.objectContaining({
            name: 'NEW_NAME',
          }),
        }),
      );
    });
  });

  describe('deleteNamespace', () => {
    test('should soft delete a namespace', async () => {
      const mockNamespace = createMockNamespace({
        fields: [createMockField()],
      });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableNamespace.update.mockResolvedValue({
        ...mockNamespace,
        deletedAt: new Date(),
        deletedBy: 'admin-user-123',
      });

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.deleteNamespace({
        ctx,
        input: { id: 'ns-123' },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.globalVariableNamespace.update).toHaveBeenCalledWith({
        where: { id: 'ns-123' },
        data: {
          deletedAt: expect.any(Date),
          deletedBy: 'admin-user-123',
        },
      });
    });

    test('should throw NOT_FOUND when namespace does not exist', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.deleteNamespace({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Namespace not found',
      });
    });

    test('should log admin action with field count on delete', async () => {
      const mockNamespace = createMockNamespace({
        fields: [
          createMockField({ id: 'f1', name: 'field1' }),
          createMockField({ id: 'f2', name: 'field2' }),
        ],
      });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableNamespace.update.mockResolvedValue({
        ...mockNamespace,
        deletedAt: new Date(),
      });

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.deleteNamespace({ ctx, input: { id: 'ns-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'GLOBAL_VAR_NAMESPACE_DELETE',
          actionDetails: expect.objectContaining({
            fieldCount: 2,
          }),
          beforeSnapshot: expect.objectContaining({
            fieldCount: 2,
            fieldNames: ['field1', 'field2'],
          }),
        }),
      );
    });
  });

  describe('restoreNamespace', () => {
    test('should restore a soft-deleted namespace', async () => {
      const deletedNamespace = createMockNamespace({
        deletedAt: new Date('2024-01-01'),
        deletedBy: 'admin-old',
      });
      mockPrisma.globalVariableNamespace.findFirst
        .mockResolvedValueOnce(deletedNamespace) // First call: find deleted namespace
        .mockResolvedValueOnce(null); // Second call: check name conflict
      mockPrisma.globalVariableNamespace.update.mockResolvedValue({
        ...deletedNamespace,
        deletedAt: null,
        deletedBy: null,
      });

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.restoreNamespace({
        ctx,
        input: { id: 'ns-123' },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.globalVariableNamespace.update).toHaveBeenCalledWith({
        where: { id: 'ns-123' },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });
    });

    test('should throw NOT_FOUND when namespace is not deleted', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.restoreNamespace({ ctx, input: { id: 'active-ns' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Namespace not found or not deleted',
      });
    });

    test('should throw CONFLICT when active namespace with same name exists', async () => {
      const deletedNamespace = createMockNamespace({
        deletedAt: new Date(),
        name: 'CONFLICT_NAME',
      });
      mockPrisma.globalVariableNamespace.findFirst
        .mockResolvedValueOnce(deletedNamespace) // Find deleted
        .mockResolvedValueOnce({ id: 'other-ns', name: 'CONFLICT_NAME' }); // Found active conflict

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.restoreNamespace({ ctx, input: { id: 'ns-123' } }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'An active namespace with this name already exists',
      });
    });

    test('should log admin action on restore', async () => {
      const deletedDate = new Date('2024-01-01');
      const deletedNamespace = createMockNamespace({
        deletedAt: deletedDate,
        deletedBy: 'admin-old',
      });
      mockPrisma.globalVariableNamespace.findFirst
        .mockResolvedValueOnce(deletedNamespace)
        .mockResolvedValueOnce(null);
      mockPrisma.globalVariableNamespace.update.mockResolvedValue({
        ...deletedNamespace,
        deletedAt: null,
        deletedBy: null,
      });

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.restoreNamespace({ ctx, input: { id: 'ns-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'GLOBAL_VAR_NAMESPACE_RESTORE',
          beforeSnapshot: expect.objectContaining({
            deletedAt: deletedDate,
            deletedBy: 'admin-old',
          }),
          afterSnapshot: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  // ============================================================================
  // FIELD OPERATIONS
  // ============================================================================

  describe('createField', () => {
    test('should create a new field in a namespace', async () => {
      const mockNamespace = createMockNamespace();
      const mockField = createMockField({ name: 'newField', fieldType: 'STRING' });

      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);
      mockPrisma.globalVariableField.create.mockResolvedValue(mockField);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.createField({
        ctx,
        input: {
          namespaceId: 'ns-123',
          name: 'newField',
          description: 'A new field',
          fieldType: 'STRING',
          value: 'test-value',
        },
      });

      expect(result).toEqual(mockField);
      expect(mockPrisma.globalVariableField.create).toHaveBeenCalledWith({
        data: {
          namespaceId: 'ns-123',
          name: 'newField',
          description: 'A new field',
          fieldType: 'STRING',
          value: 'test-value',
        },
      });
    });

    test('should throw NOT_FOUND when namespace does not exist', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.createField({
          ctx,
          input: {
            namespaceId: 'nonexistent',
            name: 'field',
            fieldType: 'STRING',
            value: 'test',
          },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Namespace not found',
      });
    });

    test('should throw NOT_FOUND when namespace is deleted', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.createField({
          ctx,
          input: {
            namespaceId: 'deleted-ns',
            name: 'field',
            fieldType: 'STRING',
            value: 'test',
          },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('should throw BAD_REQUEST for invalid field name', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(createMockNamespace());
      mockValidateFieldName.mockReturnValue({
        valid: false,
        error: 'Field name must start with a letter',
      });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.createField({
          ctx,
          input: {
            namespaceId: 'ns-123',
            name: '123invalid',
            fieldType: 'STRING',
            value: 'test',
          },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Field name must start with a letter',
      });
    });

    test('should throw BAD_REQUEST for invalid field value', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(createMockNamespace());
      mockValidateFieldValue.mockReturnValue({
        valid: false,
        error: 'Value must be a number',
      });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.createField({
          ctx,
          input: {
            namespaceId: 'ns-123',
            name: 'numField',
            fieldType: 'NUMBER',
            value: 'not-a-number',
          },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Value must be a number',
      });
    });

    test('should throw CONFLICT when field name already exists in namespace', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(createMockNamespace());
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(createMockField());

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.createField({
          ctx,
          input: {
            namespaceId: 'ns-123',
            name: 'testField',
            fieldType: 'STRING',
            value: 'test',
          },
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A field with this name already exists in this namespace',
      });
    });

    test('should log admin action with full path on create', async () => {
      const mockNamespace = createMockNamespace({ name: 'CONFIG' });
      const mockField = createMockField({ name: 'maxRetries', fieldType: 'NUMBER' });

      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);
      mockPrisma.globalVariableField.create.mockResolvedValue(mockField);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.createField({
        ctx,
        input: {
          namespaceId: 'ns-123',
          name: 'maxRetries',
          fieldType: 'NUMBER',
          value: 3,
        },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'GLOBAL_VAR_FIELD_CREATE',
          resourceType: 'GLOBAL_VAR_FIELD',
          resourceName: 'CONFIG.maxRetries',
          actionDetails: expect.objectContaining({
            namespaceName: 'CONFIG',
            fieldName: 'maxRetries',
          }),
        }),
      );
    });

    test('should handle different field types', async () => {
      const mockNamespace = createMockNamespace();
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);

      const fieldTypes = [
        { type: 'STRING', value: 'test' },
        { type: 'NUMBER', value: 42 },
        { type: 'BOOLEAN', value: true },
        { type: 'DATE', value: '2024-01-01T00:00:00Z' },
        { type: 'STRING_ARRAY', value: ['a', 'b', 'c'] },
        { type: 'NUMBER_ARRAY', value: [1, 2, 3] },
      ];

      for (const { type, value } of fieldTypes) {
        mockValidateFieldValue.mockReturnValue({ valid: true, normalizedValue: value });
        mockPrisma.globalVariableField.create.mockResolvedValue(
          createMockField({ fieldType: type, value }),
        );

        const ctx = createAdminContext();
        const result = await adminGlobalVariablesRouter.createField({
          ctx,
          input: {
            namespaceId: 'ns-123',
            name: `field_${type}`,
            fieldType: type as
              | 'STRING'
              | 'NUMBER'
              | 'BOOLEAN'
              | 'DATE'
              | 'STRING_ARRAY'
              | 'NUMBER_ARRAY',
            value,
          },
        });

        expect(result.fieldType).toBe(type);
      }
    });
  });

  describe('updateField', () => {
    test('should update field name, type, and value', async () => {
      const existingField = createMockField({
        namespace: createMockNamespace(),
      });
      const updatedField = { ...existingField, name: 'updatedName', value: 'new-value' };

      mockPrisma.globalVariableField.findFirst
        .mockResolvedValueOnce(existingField) // First call: find existing field
        .mockResolvedValueOnce(null); // Second call: check name conflict
      mockPrisma.globalVariableField.update.mockResolvedValue(updatedField);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.updateField({
        ctx,
        input: { id: 'field-123', name: 'updatedName', value: 'new-value' },
      });

      expect(result.name).toBe('updatedName');
      expect(result.value).toBe('new-value');
    });

    test('should throw NOT_FOUND when field does not exist', async () => {
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateField({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Field not found',
      });
    });

    test('should throw NOT_FOUND when field belongs to different organization', async () => {
      const fieldWithWrongOrg = createMockField({
        namespace: createMockNamespace({ organizationId: 'other-org' }),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(fieldWithWrongOrg);

      const ctx = createAdminContext({ organizationId: 'org-123' });

      await expect(
        adminGlobalVariablesRouter.updateField({ ctx, input: { id: 'field-123' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Field not found',
      });
    });

    test('should throw BAD_REQUEST when namespace is deleted', async () => {
      const fieldInDeletedNs = createMockField({
        namespace: createMockNamespace({ deletedAt: new Date() }),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(fieldInDeletedNs);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateField({ ctx, input: { id: 'field-123', value: 'new' } }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot update field in a deleted namespace',
      });
    });

    test('should throw BAD_REQUEST for invalid new field name', async () => {
      const existingField = createMockField({
        namespace: createMockNamespace(),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(existingField);
      mockValidateFieldName.mockReturnValue({
        valid: false,
        error: 'Invalid field name',
      });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateField({ ctx, input: { id: 'field-123', name: '123bad' } }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid field name',
      });
    });

    test('should throw CONFLICT when new name already exists in namespace', async () => {
      const existingField = createMockField({
        namespace: createMockNamespace(),
      });
      mockPrisma.globalVariableField.findFirst
        .mockResolvedValueOnce(existingField)
        .mockResolvedValueOnce({ id: 'other-field', name: 'existingName' });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateField({
          ctx,
          input: { id: 'field-123', name: 'existingName' },
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A field with this name already exists in this namespace',
      });
    });

    test('should throw BAD_REQUEST for invalid value', async () => {
      const existingField = createMockField({
        fieldType: 'NUMBER',
        namespace: createMockNamespace(),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(existingField);
      mockValidateFieldValue.mockReturnValue({
        valid: false,
        error: 'Value must be a number',
      });

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.updateField({
          ctx,
          input: { id: 'field-123', value: 'not-a-number' },
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Value must be a number',
      });
    });

    test('should validate value against new field type when type changes', async () => {
      const existingField = createMockField({
        fieldType: 'STRING',
        namespace: createMockNamespace(),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(existingField);
      mockValidateFieldValue.mockReturnValue({ valid: true, normalizedValue: 42 });
      mockPrisma.globalVariableField.update.mockResolvedValue({
        ...existingField,
        fieldType: 'NUMBER',
        value: 42,
      });

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.updateField({
        ctx,
        input: { id: 'field-123', fieldType: 'NUMBER', value: 42 },
      });

      expect(mockValidateFieldValue).toHaveBeenCalledWith(42, 'NUMBER');
    });

    test('should log admin action on update', async () => {
      const existingField = createMockField({
        name: 'oldName',
        fieldType: 'STRING',
        namespace: createMockNamespace({ name: 'CONFIG' }),
      });
      const updatedField = { ...existingField, name: 'newName' };

      mockPrisma.globalVariableField.findFirst
        .mockResolvedValueOnce(existingField)
        .mockResolvedValueOnce(null);
      mockPrisma.globalVariableField.update.mockResolvedValue(updatedField);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.updateField({
        ctx,
        input: { id: 'field-123', name: 'newName' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'GLOBAL_VAR_FIELD_UPDATE',
          resourceName: 'CONFIG.newName',
          actionDetails: expect.objectContaining({
            previousName: 'oldName',
            newName: 'newName',
          }),
        }),
      );
    });
  });

  describe('deleteField', () => {
    test('should hard delete a field', async () => {
      const mockField = createMockField({
        namespace: createMockNamespace({ name: 'CONFIG' }),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(mockField);
      mockPrisma.globalVariableField.delete.mockResolvedValue(mockField);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.deleteField({
        ctx,
        input: { id: 'field-123' },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.globalVariableField.delete).toHaveBeenCalledWith({
        where: { id: 'field-123' },
      });
    });

    test('should throw NOT_FOUND when field does not exist', async () => {
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminGlobalVariablesRouter.deleteField({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Field not found',
      });
    });

    test('should throw NOT_FOUND when field belongs to different organization', async () => {
      const fieldWithWrongOrg = createMockField({
        namespace: createMockNamespace({ organizationId: 'other-org' }),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(fieldWithWrongOrg);

      const ctx = createAdminContext({ organizationId: 'org-123' });

      await expect(
        adminGlobalVariablesRouter.deleteField({ ctx, input: { id: 'field-123' } }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Field not found',
      });
    });

    test('should log admin action on delete', async () => {
      const mockField = createMockField({
        name: 'deletedField',
        fieldType: 'BOOLEAN',
        namespace: createMockNamespace({ name: 'SETTINGS' }),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(mockField);
      mockPrisma.globalVariableField.delete.mockResolvedValue(mockField);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.deleteField({ ctx, input: { id: 'field-123' } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'GLOBAL_VAR_FIELD_DELETE',
          resourceName: 'SETTINGS.deletedField',
          actionDetails: expect.objectContaining({
            namespaceName: 'SETTINGS',
            fieldName: 'deletedField',
            fieldType: 'BOOLEAN',
          }),
          beforeSnapshot: expect.objectContaining({
            id: mockField.id,
            name: 'deletedField',
          }),
        }),
      );
    });
  });

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  describe('listVariablesForConditionBuilder', () => {
    test('should return namespaces with fields formatted for condition builder', async () => {
      const mockNamespaces = [
        createMockNamespace({
          id: 'ns-1',
          name: 'CONFIG',
          description: 'Configuration',
          fields: [
            createMockField({ id: 'f1', name: 'maxRetries', fieldType: 'NUMBER', value: 3 }),
            createMockField({ id: 'f2', name: 'enabled', fieldType: 'BOOLEAN', value: true }),
          ],
        }),
        createMockNamespace({
          id: 'ns-2',
          name: 'EMPTY',
          fields: [],
        }),
      ];
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue(mockNamespaces);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.listVariablesForConditionBuilder({
        ctx,
        input: undefined,
      });

      // Should filter out empty namespace
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('CONFIG');
      expect(result[0].fields).toHaveLength(2);
      expect(result[0].fields[0].fullPath).toBe('CONFIG.maxRetries');
      expect(result[0].fields[1].fullPath).toBe('CONFIG.enabled');
    });

    test('should filter by compatible types', async () => {
      const mockNamespaces = [
        createMockNamespace({
          name: 'CONFIG',
          fields: [createMockField({ id: 'f1', name: 'count', fieldType: 'NUMBER' })],
        }),
      ];
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue(mockNamespaces);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.listVariablesForConditionBuilder({
        ctx,
        input: { compatibleTypes: ['NUMBER', 'BOOLEAN'] },
      });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: { in: [] } }],
        },
        include: {
          fields: {
            where: { fieldType: { in: ['NUMBER', 'BOOLEAN'] } },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });
    });

    test('should handle empty compatible types array', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.listVariablesForConditionBuilder({
        ctx,
        input: { compatibleTypes: [] },
      });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: { in: [] } }],
        },
        include: {
          fields: {
            where: undefined,
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('getVariablesPreview', () => {
    test('should return flat map of all variables', async () => {
      const mockNamespaces = [
        createMockNamespace({
          name: 'CONFIG',
          fields: [
            createMockField({ name: 'maxRetries', value: 3 }),
            createMockField({ name: 'timeout', value: 5000 }),
          ],
        }),
        createMockNamespace({
          name: 'SETTINGS',
          fields: [createMockField({ name: 'enabled', value: true })],
        }),
      ];
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue(mockNamespaces);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.getVariablesPreview({
        ctx,
        input: undefined,
      });

      expect(result).toEqual({
        CONFIG: {
          maxRetries: 3,
          timeout: 5000,
        },
        SETTINGS: {
          enabled: true,
        },
      });
    });

    test('should return empty object when no namespaces exist', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.getVariablesPreview({
        ctx,
        input: undefined,
      });

      expect(result).toEqual({});
    });

    test('should exclude deleted namespaces', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.getVariablesPreview({ ctx, input: undefined });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          deletedAt: null,
          OR: [{ workspaceId: null }, { workspaceId: { in: [] } }],
        },
        include: {
          fields: true,
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  // ============================================================================
  // ORGANIZATION ISOLATION
  // ============================================================================

  describe('organization isolation', () => {
    test('listNamespaces should only return namespaces from current organization', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'isolated-org' });
      await adminGlobalVariablesRouter.listNamespaces({ ctx, input: undefined });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'isolated-org',
          }),
        }),
      );
    });

    test('getNamespace should enforce organization boundary', async () => {
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext({ organizationId: 'org-A' });

      await expect(
        adminGlobalVariablesRouter.getNamespace({ ctx, input: { id: 'ns-from-org-B' } }),
      ).rejects.toThrow(TRPCError);

      expect(mockPrisma.globalVariableNamespace.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'ns-from-org-B',
          organizationId: 'org-A',
        },
        include: expect.anything(),
      });
    });

    test('createNamespace should assign to current organization', async () => {
      const mockNamespace = createMockNamespace({ organizationId: 'org-A' });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);
      mockPrisma.globalVariableNamespace.create.mockResolvedValue(mockNamespace);

      const ctx = createAdminContext({ organizationId: 'org-A' });
      await adminGlobalVariablesRouter.createNamespace({ ctx, input: { name: 'TEST' } });

      expect(mockPrisma.globalVariableNamespace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-A',
            workspaceId: null,
          }),
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
      );
    });

    test('updateField should verify organization ownership', async () => {
      const fieldWithWrongOrg = createMockField({
        namespace: createMockNamespace({ organizationId: 'org-B' }),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(fieldWithWrongOrg);

      const ctx = createAdminContext({ organizationId: 'org-A' });

      await expect(
        adminGlobalVariablesRouter.updateField({ ctx, input: { id: 'field-123', value: 'new' } }),
      ).rejects.toThrow(TRPCError);
    });

    test('deleteField should verify organization ownership', async () => {
      const fieldWithWrongOrg = createMockField({
        namespace: createMockNamespace({ organizationId: 'org-B' }),
      });
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(fieldWithWrongOrg);

      const ctx = createAdminContext({ organizationId: 'org-A' });

      await expect(
        adminGlobalVariablesRouter.deleteField({ ctx, input: { id: 'field-123' } }),
      ).rejects.toThrow(TRPCError);
    });

    test('getVariablesPreview should only return variables from current organization', async () => {
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminGlobalVariablesRouter.getVariablesPreview({ ctx, input: undefined });

      expect(mockPrisma.globalVariableNamespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'custom-org',
          }),
        }),
      );
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('edge cases', () => {
    test('should handle namespace with many fields', async () => {
      const manyFields = Array.from({ length: 100 }, (_, i) =>
        createMockField({ id: `field-${i}`, name: `field${i}` }),
      );
      const mockNamespace = createMockNamespace({ fields: manyFields });
      mockPrisma.globalVariableNamespace.findMany.mockResolvedValue([mockNamespace]);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.listNamespaces({ ctx, input: undefined });

      expect(result[0].fieldCount).toBe(100);
    });

    test('should handle special characters in description', async () => {
      const mockNamespace = createMockNamespace({
        description: 'Description with "quotes" and \'apostrophes\' and <html>',
      });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(null);
      mockPrisma.globalVariableNamespace.create.mockResolvedValue(mockNamespace);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.createNamespace({
        ctx,
        input: {
          name: 'TEST',
          description: 'Description with "quotes" and \'apostrophes\' and <html>',
        },
      });

      expect(result.description).toBe('Description with "quotes" and \'apostrophes\' and <html>');
    });

    test('should handle null description', async () => {
      const mockNamespace = createMockNamespace({ description: null });
      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableNamespace.update.mockResolvedValue({
        ...mockNamespace,
        description: null,
      });

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.updateNamespace({
        ctx,
        input: { id: 'ns-123', description: null },
      });

      expect(result.description).toBeNull();
    });

    test('should handle array field values correctly', async () => {
      const mockNamespace = createMockNamespace();
      const mockField = createMockField({
        fieldType: 'STRING_ARRAY',
        value: ['item1', 'item2', 'item3'],
      });

      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);
      mockValidateFieldValue.mockReturnValue({
        valid: true,
        normalizedValue: ['item1', 'item2', 'item3'],
      });
      mockPrisma.globalVariableField.create.mockResolvedValue(mockField);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.createField({
        ctx,
        input: {
          namespaceId: 'ns-123',
          name: 'tags',
          fieldType: 'STRING_ARRAY',
          value: ['item1', 'item2', 'item3'],
        },
      });

      expect(result.value).toEqual(['item1', 'item2', 'item3']);
    });

    test('should handle date field values', async () => {
      const mockNamespace = createMockNamespace();
      const dateValue = new Date('2024-06-15T12:00:00Z');
      const mockField = createMockField({
        fieldType: 'DATE',
        value: dateValue.toISOString(),
      });

      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);
      mockValidateFieldValue.mockReturnValue({
        valid: true,
        normalizedValue: dateValue,
      });
      mockSerializeFieldValue.mockReturnValue(dateValue.toISOString());
      mockPrisma.globalVariableField.create.mockResolvedValue(mockField);

      const ctx = createAdminContext();
      await adminGlobalVariablesRouter.createField({
        ctx,
        input: {
          namespaceId: 'ns-123',
          name: 'expirationDate',
          fieldType: 'DATE',
          value: '2024-06-15T12:00:00Z',
        },
      });

      expect(mockSerializeFieldValue).toHaveBeenCalledWith(dateValue, 'DATE');
    });

    test('should handle empty array values', async () => {
      const mockNamespace = createMockNamespace();
      const mockField = createMockField({
        fieldType: 'STRING_ARRAY',
        value: [],
      });

      mockPrisma.globalVariableNamespace.findFirst.mockResolvedValue(mockNamespace);
      mockPrisma.globalVariableField.findFirst.mockResolvedValue(null);
      mockValidateFieldValue.mockReturnValue({ valid: true, normalizedValue: [] });
      mockPrisma.globalVariableField.create.mockResolvedValue(mockField);

      const ctx = createAdminContext();
      const result = await adminGlobalVariablesRouter.createField({
        ctx,
        input: {
          namespaceId: 'ns-123',
          name: 'emptyList',
          fieldType: 'STRING_ARRAY',
          value: [],
        },
      });

      expect(result.value).toEqual([]);
    });
  });
});
