/**
 * Tests for Admin Policy Assertions Router
 * Tests policy assertion management and execution
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockLogAdminAction,
  mockRunAssertion,
  mockRunAllAssertions,
  mockGetAssertionSummary,
  mockPreviewAssertionImpact,
  mockValidateToolPattern,
  mockValidateToolPatterns,
  mockDbNull,
} = vi.hoisted(() => ({
  mockPrisma: {
    policyAssertion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    policyTest: {
      findFirst: vi.fn(),
    },
    auditLogEntry: {
      findFirst: vi.fn(),
    },
    mcpServer: {
      findMany: vi.fn(),
    },
  },
  mockLogAdminAction: vi.fn(),
  mockRunAssertion: vi.fn(),
  mockRunAllAssertions: vi.fn(),
  mockGetAssertionSummary: vi.fn(),
  mockPreviewAssertionImpact: vi.fn(),
  mockValidateToolPattern: vi.fn(),
  mockValidateToolPatterns: vi.fn(),
  mockDbNull: Symbol('DbNull'),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: {
    DbNull: mockDbNull,
    JsonNull: Symbol('JsonNull'),
    InputJsonValue: {},
  },
  AssertionSource: {
    MANUAL: 'MANUAL',
    PLAYGROUND: 'PLAYGROUND',
    AUDIT_LOG: 'AUDIT_LOG',
  },
  AssertionContextType: {
    USER: 'USER',
    AGENT: 'AGENT',
    ROLE: 'ROLE',
    WILDCARD: 'WILDCARD',
  },
  AdminActionType: {
    POLICY_CREATE: 'POLICY_CREATE',
    POLICY_UPDATE: 'POLICY_UPDATE',
    POLICY_DELETE: 'POLICY_DELETE',
  },
  AdminResourceType: {
    POLICY: 'POLICY',
  },
  PolicyEffect: {
    ALLOW: 'ALLOW',
    DENY: 'DENY',
  },
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/policyAssertion.js', () => ({
  runAssertion: mockRunAssertion,
  runAllAssertions: mockRunAllAssertions,
  getAssertionSummary: mockGetAssertionSummary,
  previewAssertionImpact: mockPreviewAssertionImpact,
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  validateToolPattern: mockValidateToolPattern,
  validateToolPatterns: mockValidateToolPatterns,
}));

// Mock init module to provide test-friendly procedures
vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  adminProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
    input: vi.fn(() => ({
      query: vi.fn((fn) => (args: unknown) => fn(args)),
      mutation: vi.fn((fn) => (args: unknown) => fn(args)),
    })),
    mutation: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

import { adminPolicyAssertionsRouter as _adminPolicyAssertionsRouter } from '../../../../../packages/api/src/trpc/admin/policyAssertions.js';

// Re-type the router to use our test-friendly handler type
// This breaks the tRPC type inference and allows simple { ctx, input } calls
// Using Record<string, unknown> allows accessing any property on the result
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

const adminPolicyAssertionsRouter = _adminPolicyAssertionsRouter as unknown as {
  create: TestableHandler;
  createFromAuditLog: TestableHandler;
  createFromPlaygroundTest: TestableHandler;
  delete: TestableHandler;
  get: TestableHandler;
  list: TestableHandler;
  previewImpact: TestableHandler;
  run: TestableHandler;
  runAll: TestableHandler;
  summary: TestableHandler;
  update: TestableHandler;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogAdminAction.mockResolvedValue(undefined);
  mockValidateToolPattern.mockReturnValue(true);
  mockValidateToolPatterns.mockReturnValue(true);
  mockPrisma.mcpServer.findMany.mockResolvedValue([]);
});

// Create a mock context
function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
    workspaceIds?: string[];
  } = {},
) {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
      workspaceIds: overrides.workspaceIds ?? ['workspace-1', 'workspace-2'],
    },
  };
}

describe('adminPolicyAssertionsRouter', () => {
  describe('list', () => {
    test('should list assertions with default filters', async () => {
      const mockAssertions = [{ id: 'assertion-1', name: 'Test Assertion', enabled: true }];
      mockPrisma.policyAssertion.findMany.mockResolvedValue(mockAssertions);
      mockPrisma.policyAssertion.count.mockResolvedValue(1);

      const ctx = createMockContext();
      const input = {};

      const result = await adminPolicyAssertionsRouter.list({ ctx, input });

      expect(result).toEqual({ assertions: mockAssertions, total: 1 });
      expect(mockPrisma.policyAssertion.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    test('should filter by enabled status', async () => {
      mockPrisma.policyAssertion.findMany.mockResolvedValue([]);
      mockPrisma.policyAssertion.count.mockResolvedValue(0);

      const ctx = createMockContext();
      const input = { enabled: true };

      await adminPolicyAssertionsRouter.list({ ctx, input });

      expect(mockPrisma.policyAssertion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ enabled: true }),
        }),
      );
    });

    test('should filter by passed status', async () => {
      mockPrisma.policyAssertion.findMany.mockResolvedValue([]);
      mockPrisma.policyAssertion.count.mockResolvedValue(0);

      const ctx = createMockContext();
      const input = { passed: false };

      await adminPolicyAssertionsRouter.list({ ctx, input });

      expect(mockPrisma.policyAssertion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lastRunPassed: false }),
        }),
      );
    });

    test('should apply pagination', async () => {
      mockPrisma.policyAssertion.findMany.mockResolvedValue([]);
      mockPrisma.policyAssertion.count.mockResolvedValue(100);

      const ctx = createMockContext();
      const input = { limit: 20, offset: 40 };

      await adminPolicyAssertionsRouter.list({ ctx, input });

      expect(mockPrisma.policyAssertion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 40,
        }),
      );
    });
  });

  describe('get', () => {
    test('should get assertion by id', async () => {
      const mockAssertion = { id: 'assertion-1', name: 'Test Assertion' };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(mockAssertion);

      const ctx = createMockContext();
      const input = { id: 'assertion-1' };

      const result = await adminPolicyAssertionsRouter.get({ ctx, input });

      expect(result).toEqual(mockAssertion);
    });

    test('should throw NOT_FOUND when assertion does not exist', async () => {
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminPolicyAssertionsRouter.get({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.get({ ctx, input })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('create', () => {
    test('should create assertion with USER context', async () => {
      const mockAssertion = {
        id: 'assertion-new',
        name: 'Test Assertion',
        contextType: 'USER',
        toolPattern: 'github.com::*',
      };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);
      mockPrisma.policyAssertion.create.mockResolvedValue(mockAssertion);

      const ctx = createMockContext();
      const input = {
        name: 'Test Assertion',
        toolPattern: 'github.com::*',
        contextType: 'USER',
        userId: 'user-1',
        expectedDecision: 'ALLOWED',
      };

      const result = await adminPolicyAssertionsRouter.create({ ctx, input });

      expect(result).toEqual(mockAssertion);
      expect(mockPrisma.policyAssertion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
          name: 'Test Assertion',
          source: 'MANUAL',
        }),
      });
    });

    test('should throw BAD_REQUEST when invalid tool pattern', async () => {
      mockValidateToolPattern.mockReturnValue(false);

      const ctx = createMockContext();
      const input = {
        name: 'Test Assertion',
        toolPattern: 'invalid',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
      };

      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid tool pattern format',
      });
    });

    test('should throw BAD_REQUEST when USER context without userId', async () => {
      const ctx = createMockContext();
      const input = {
        name: 'Test Assertion',
        toolPattern: 'github.com::*',
        contextType: 'USER',
        expectedDecision: 'ALLOWED',
      };

      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'USER context requires userId',
      });
    });

    test('should throw BAD_REQUEST when AGENT context without agentId', async () => {
      const ctx = createMockContext();
      const input = {
        name: 'Test Assertion',
        toolPattern: 'github.com::*',
        contextType: 'AGENT',
        expectedDecision: 'ALLOWED',
      };

      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'AGENT context requires agentId',
      });
    });

    test('should throw BAD_REQUEST when ROLE context without roleName', async () => {
      const ctx = createMockContext();
      const input = {
        name: 'Test Assertion',
        toolPattern: 'github.com::*',
        contextType: 'ROLE',
        expectedDecision: 'ALLOWED',
      };

      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'ROLE context requires roleName',
      });
    });

    test('should throw CONFLICT when name already exists', async () => {
      mockPrisma.policyAssertion.findFirst.mockResolvedValue({ id: 'existing' });

      const ctx = createMockContext();
      const input = {
        name: 'Existing Assertion',
        toolPattern: 'github.com::*',
        contextType: 'WILDCARD',
        expectedDecision: 'ALLOWED',
      };

      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('createFromPlaygroundTest', () => {
    test('should create assertion from playground test', async () => {
      const mockTest = {
        id: 'test-1',
        toolName: 'github.com::createPR',
        agentId: 'agent-1',
        userId: null,
      };
      mockPrisma.policyTest.findFirst.mockResolvedValue(mockTest);
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);
      mockPrisma.policyAssertion.create.mockResolvedValue({
        id: 'assertion-new',
        source: 'PLAYGROUND',
        toolPattern: 'github.com::createPR',
      });

      const ctx = createMockContext();
      const input = {
        playgroundTestId: 'test-1',
        name: 'Test Assertion',
        expectedDecision: 'ALLOWED',
      };

      const result = await adminPolicyAssertionsRouter.createFromPlaygroundTest({ ctx, input });

      expect(result.source).toBe('PLAYGROUND');
      expect(mockPrisma.policyAssertion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'PLAYGROUND',
          sourceId: 'test-1',
          contextType: 'AGENT',
        }),
      });
    });

    test('should use WILDCARD context when playground test has neither agentId nor userId', async () => {
      const mockTest = {
        id: 'test-1',
        toolName: 'github.com::createPR',
        agentId: null,
        userId: null,
      };
      mockPrisma.policyTest.findFirst.mockResolvedValue(mockTest);
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);
      mockPrisma.policyAssertion.create.mockResolvedValue({
        id: 'assertion-new',
        source: 'PLAYGROUND',
        toolPattern: 'github.com::createPR',
        contextType: 'WILDCARD',
      });

      const ctx = createMockContext();
      const input = {
        playgroundTestId: 'test-1',
        name: 'Test Assertion',
        expectedDecision: 'ALLOWED',
      };

      const result = await adminPolicyAssertionsRouter.createFromPlaygroundTest({ ctx, input });

      expect(result.contextType).toBe('WILDCARD');
      expect(mockPrisma.policyAssertion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contextType: 'WILDCARD',
        }),
      });
    });

    test('should use USER context when playground test has userId', async () => {
      const mockTest = {
        id: 'test-1',
        toolName: 'github.com::createPR',
        agentId: null,
        userId: 'user-1',
      };
      mockPrisma.policyTest.findFirst.mockResolvedValue(mockTest);
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);
      mockPrisma.policyAssertion.create.mockResolvedValue({
        id: 'assertion-new',
        source: 'PLAYGROUND',
        toolPattern: 'github.com::createPR',
        contextType: 'USER',
      });

      const ctx = createMockContext();
      const input = {
        playgroundTestId: 'test-1',
        name: 'Test Assertion',
        expectedDecision: 'ALLOWED',
      };

      const result = await adminPolicyAssertionsRouter.createFromPlaygroundTest({ ctx, input });

      expect(result.contextType).toBe('USER');
      expect(mockPrisma.policyAssertion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contextType: 'USER',
        }),
      });
    });

    test('should throw NOT_FOUND when test does not exist', async () => {
      mockPrisma.policyTest.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = {
        playgroundTestId: 'nonexistent',
        name: 'Test Assertion',
        expectedDecision: 'ALLOWED',
      };

      await expect(
        adminPolicyAssertionsRouter.createFromPlaygroundTest({ ctx, input }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('createFromAuditLog', () => {
    test('should create assertion from audit log entry', async () => {
      const mockEntry = {
        id: 'entry-1',
        toolName: 'github.com::createPR',
        userId: 'user-1',
        agentId: null,
      };
      mockPrisma.auditLogEntry.findFirst.mockResolvedValue(mockEntry);
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);
      mockPrisma.policyAssertion.create.mockResolvedValue({
        id: 'assertion-new',
        source: 'AUDIT_LOG',
        toolPattern: 'github.com::createPR',
      });

      const ctx = createMockContext();
      const input = {
        auditLogEntryId: 'entry-1',
        name: 'Test Assertion',
        expectedDecision: 'DENIED',
      };

      const result = await adminPolicyAssertionsRouter.createFromAuditLog({ ctx, input });

      expect(result.source).toBe('AUDIT_LOG');
      expect(mockPrisma.policyAssertion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'AUDIT_LOG',
          sourceId: 'entry-1',
          contextType: 'USER',
        }),
      });
    });

    test('should use WILDCARD context when audit log has neither userId nor agentId', async () => {
      const mockEntry = {
        id: 'entry-1',
        toolName: 'github.com::createPR',
        userId: null,
        agentId: null,
      };
      mockPrisma.auditLogEntry.findFirst.mockResolvedValue(mockEntry);
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);
      mockPrisma.policyAssertion.create.mockResolvedValue({
        id: 'assertion-new',
        source: 'AUDIT_LOG',
        toolPattern: 'github.com::createPR',
        contextType: 'WILDCARD',
      });

      const ctx = createMockContext();
      const input = {
        auditLogEntryId: 'entry-1',
        name: 'Test Assertion',
        expectedDecision: 'ALLOWED',
      };

      const result = await adminPolicyAssertionsRouter.createFromAuditLog({ ctx, input });

      expect(result.contextType).toBe('WILDCARD');
      expect(mockPrisma.policyAssertion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contextType: 'WILDCARD',
        }),
      });
    });

    test('should throw NOT_FOUND when audit log entry does not exist', async () => {
      mockPrisma.auditLogEntry.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = {
        auditLogEntryId: 'nonexistent',
        name: 'Test Assertion',
        expectedDecision: 'ALLOWED',
      };

      await expect(adminPolicyAssertionsRouter.createFromAuditLog({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('update', () => {
    test('should update assertion', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Old Name',
        toolPattern: 'github.com::*',
      };
      const updatedAssertion = { ...existingAssertion, name: 'New Name' };
      // First call: find existing assertion, Second call: check name conflict (null = no conflict)
      mockPrisma.policyAssertion.findFirst
        .mockResolvedValueOnce(existingAssertion)
        .mockResolvedValueOnce(null);
      mockPrisma.policyAssertion.update.mockResolvedValue(updatedAssertion);

      const ctx = createMockContext();
      const input = { id: 'assertion-1', name: 'New Name' };

      const result = await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(result.name).toBe('New Name');
    });

    test('should update toolParameters to null using DbNull', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        toolParameters: { key: 'value' },
      };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        toolParameters: null,
      });

      const ctx = createMockContext();
      const input = { id: 'assertion-1', toolParameters: null };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          toolParameters: mockDbNull,
        }),
      });
    });

    test('should update contextOverrides to null using DbNull', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        contextOverrides: { user: 'override' },
      };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        contextOverrides: null,
      });

      const ctx = createMockContext();
      const input = { id: 'assertion-1', contextOverrides: null };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          contextOverrides: mockDbNull,
        }),
      });
    });

    test('should update extractedContext to null using DbNull', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        extractedContext: { extracted: 'data' },
      };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        extractedContext: null,
      });

      const ctx = createMockContext();
      const input = { id: 'assertion-1', extractedContext: null };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          extractedContext: mockDbNull,
        }),
      });
    });

    test('should update toolParameters with actual values using toJsonValue', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        toolParameters: null,
      };
      const newToolParameters = { key: 'value', nested: { data: 123 } };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        toolParameters: newToolParameters,
      });

      const ctx = createMockContext();
      const input = { id: 'assertion-1', toolParameters: newToolParameters };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          toolParameters: newToolParameters,
        }),
      });
    });

    test('should update contextOverrides with actual values using toJsonValue', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        contextOverrides: null,
      };
      const newContextOverrides = { userId: 'user-override', agentId: 'agent-override' };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        contextOverrides: newContextOverrides,
      });

      const ctx = createMockContext();
      const input = { id: 'assertion-1', contextOverrides: newContextOverrides };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          contextOverrides: newContextOverrides,
        }),
      });
    });

    test('should update extractedContext with actual values using toJsonValue', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        extractedContext: null,
      };
      const newExtractedContext = { fieldA: 'valueA', fieldB: ['item1', 'item2'] };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        extractedContext: newExtractedContext,
      });

      const ctx = createMockContext();
      const input = { id: 'assertion-1', extractedContext: newExtractedContext };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          extractedContext: newExtractedContext,
        }),
      });
    });

    test('should update all JSON fields with actual values at once', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        toolParameters: null,
        contextOverrides: null,
        extractedContext: null,
      };
      const newToolParameters = { param: 'value' };
      const newContextOverrides = { override: 'context' };
      const newExtractedContext = { extracted: 'context' };

      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        toolParameters: newToolParameters,
        contextOverrides: newContextOverrides,
        extractedContext: newExtractedContext,
      });

      const ctx = createMockContext();
      const input = {
        id: 'assertion-1',
        toolParameters: newToolParameters,
        contextOverrides: newContextOverrides,
        extractedContext: newExtractedContext,
      };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          toolParameters: newToolParameters,
          contextOverrides: newContextOverrides,
          extractedContext: newExtractedContext,
        }),
      });
    });

    test('should update all JSON fields to null at once', async () => {
      const existingAssertion = {
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
        toolParameters: { key: 'value' },
        contextOverrides: { user: 'override' },
        extractedContext: { extracted: 'data' },
      };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(existingAssertion);
      mockPrisma.policyAssertion.update.mockResolvedValue({
        ...existingAssertion,
        toolParameters: null,
        contextOverrides: null,
        extractedContext: null,
      });

      const ctx = createMockContext();
      const input = {
        id: 'assertion-1',
        toolParameters: null,
        contextOverrides: null,
        extractedContext: null,
      };

      await adminPolicyAssertionsRouter.update({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          toolParameters: mockDbNull,
          contextOverrides: mockDbNull,
          extractedContext: mockDbNull,
        }),
      });
    });

    test('should throw NOT_FOUND when assertion does not exist', async () => {
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent', name: 'New Name' };

      await expect(adminPolicyAssertionsRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
    });

    test('should validate tool pattern on update', async () => {
      mockPrisma.policyAssertion.findFirst.mockResolvedValue({ id: 'assertion-1' });
      mockValidateToolPattern.mockReturnValue(false);

      const ctx = createMockContext();
      const input = { id: 'assertion-1', toolPattern: 'invalid' };

      await expect(adminPolicyAssertionsRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    test('should throw CONFLICT when new name already exists', async () => {
      mockPrisma.policyAssertion.findFirst
        .mockResolvedValueOnce({ id: 'assertion-1', name: 'Old Name' })
        .mockResolvedValueOnce({ id: 'assertion-other', name: 'Existing Name' });

      const ctx = createMockContext();
      const input = { id: 'assertion-1', name: 'Existing Name' };

      await expect(adminPolicyAssertionsRouter.update({ ctx, input })).rejects.toThrow(TRPCError);
      await expect(adminPolicyAssertionsRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('delete', () => {
    test('should delete assertion', async () => {
      mockPrisma.policyAssertion.findFirst.mockResolvedValue({
        id: 'assertion-1',
        name: 'Test',
        toolPattern: 'github.com::*',
      });
      mockPrisma.policyAssertion.delete.mockResolvedValue({});

      const ctx = createMockContext();
      const input = { id: 'assertion-1' };

      const result = await adminPolicyAssertionsRouter.delete({ ctx, input });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.policyAssertion.delete).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
      });
    });

    test('should throw NOT_FOUND when assertion does not exist', async () => {
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminPolicyAssertionsRouter.delete({ ctx, input })).rejects.toThrow(TRPCError);
    });
  });

  describe('run', () => {
    test('should run a single assertion', async () => {
      const mockAssertion = { id: 'assertion-1', failureCount: 0 };
      const mockResult = {
        passed: true,
        actualDecision: 'ALLOWED',
        justification: null,
        matchedPolicyIds: ['policy-1'],
      };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(mockAssertion);
      mockRunAssertion.mockResolvedValue(mockResult);
      mockPrisma.policyAssertion.update.mockResolvedValue({});

      const ctx = createMockContext();
      const input = { id: 'assertion-1' };

      const result = await adminPolicyAssertionsRouter.run({ ctx, input });

      expect(result).toEqual(mockResult);
      expect(mockRunAssertion).toHaveBeenCalledWith(mockAssertion, undefined, [
        'workspace-1',
        'workspace-2',
      ]);
      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          lastRunAt: expect.any(Date),
          lastRunPassed: true,
          lastRunDecision: 'ALLOWED',
        }),
      });
    });

    test('should increment failure count on failed assertion', async () => {
      const mockAssertion = { id: 'assertion-1', failureCount: 2 };
      const mockResult = {
        passed: false,
        actualDecision: 'DENIED',
        justification: 'No matching policy',
        matchedPolicyIds: [],
      };
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(mockAssertion);
      mockRunAssertion.mockResolvedValue(mockResult);
      mockPrisma.policyAssertion.update.mockResolvedValue({});

      const ctx = createMockContext();
      const input = { id: 'assertion-1' };

      await adminPolicyAssertionsRouter.run({ ctx, input });

      expect(mockPrisma.policyAssertion.update).toHaveBeenCalledWith({
        where: { id: 'assertion-1' },
        data: expect.objectContaining({
          failureCount: 3,
        }),
      });
    });

    test('should throw NOT_FOUND when assertion does not exist', async () => {
      mockPrisma.policyAssertion.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const input = { id: 'nonexistent' };

      await expect(adminPolicyAssertionsRouter.run({ ctx, input })).rejects.toThrow(TRPCError);
    });
  });

  describe('runAll', () => {
    test('should run all enabled assertions', async () => {
      const mockSummary = {
        total: 10,
        passed: 8,
        failed: 2,
        results: [],
      };
      mockRunAllAssertions.mockResolvedValue(mockSummary);

      const ctx = createMockContext();

      const result = await adminPolicyAssertionsRouter.runAll({ ctx });

      expect(result).toEqual(mockSummary);
      expect(mockRunAllAssertions).toHaveBeenCalledWith('org-123', ['workspace-1', 'workspace-2']);
    });
  });

  describe('summary', () => {
    test('should return assertion summary', async () => {
      const mockSummary = {
        total: 20,
        enabled: 15,
        passing: 12,
        failing: 3,
      };
      mockGetAssertionSummary.mockResolvedValue(mockSummary);

      const ctx = createMockContext();

      const result = await adminPolicyAssertionsRouter.summary({ ctx });

      expect(result).toEqual(mockSummary);
      expect(mockGetAssertionSummary).toHaveBeenCalledWith('org-123');
    });
  });

  describe('previewImpact', () => {
    test('should preview assertion impact', async () => {
      const mockFailures = [
        {
          assertionId: 'assertion-1',
          assertionName: 'Test Assertion',
          expectedDecision: 'ALLOWED',
          actualDecision: 'DENIED',
          justification: 'Blocked by proposed policy',
        },
      ];
      mockPreviewAssertionImpact.mockResolvedValue(mockFailures);

      const ctx = createMockContext();
      const input = {
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: 'DENY',
      };

      const result = await adminPolicyAssertionsRouter.previewImpact({ ctx, input });

      expect(result.wouldFail).toBe(true);
      expect(result.failures).toHaveLength(1);
      expect(mockPreviewAssertionImpact).toHaveBeenCalledWith(
        'org-123',
        {
          matchers: ['role:User'],
          toolPatterns: ['github.com::*'],
          effect: 'DENY',
        },
        undefined,
        ['workspace-1', 'workspace-2'],
      );
    });

    test('should return no failures when assertions pass', async () => {
      mockPreviewAssertionImpact.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = {
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: 'ALLOW',
      };

      const result = await adminPolicyAssertionsRouter.previewImpact({ ctx, input });

      expect(result.wouldFail).toBe(false);
      expect(result.failures).toHaveLength(0);
    });

    test('should throw BAD_REQUEST when invalid tool patterns', async () => {
      mockValidateToolPatterns.mockReturnValue(false);

      const ctx = createMockContext();
      const input = {
        matchers: ['role:User'],
        toolPatterns: ['invalid'],
        effect: 'ALLOW',
      };

      await expect(adminPolicyAssertionsRouter.previewImpact({ ctx, input })).rejects.toThrow(
        TRPCError,
      );
      await expect(adminPolicyAssertionsRouter.previewImpact({ ctx, input })).rejects.toMatchObject(
        {
          code: 'BAD_REQUEST',
        },
      );
    });

    test('should pass excludePolicyId for updates', async () => {
      mockPreviewAssertionImpact.mockResolvedValue([]);

      const ctx = createMockContext();
      const input = {
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: 'ALLOW',
        excludePolicyId: 'policy-being-updated',
      };

      await adminPolicyAssertionsRouter.previewImpact({ ctx, input });

      expect(mockPreviewAssertionImpact).toHaveBeenCalledWith(
        'org-123',
        expect.any(Object),
        'policy-being-updated',
        ['workspace-1', 'workspace-2'],
      );
    });
  });
});
