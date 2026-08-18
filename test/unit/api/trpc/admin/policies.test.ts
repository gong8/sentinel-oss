/**
 * Tests for Admin Policies Router
 * Tests policy management operations including CRUD, conflict detection, and testing
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type TestableHandler } from '../../../../helpers/trpc-unit-mock.js';
import {
  createAdminContext,
  createMockPolicy,
  createMockUserWithRoles,
  type MockPrisma,
} from '../../../../helpers/unit-test-mocks.js';

// Hoist mocks for proper initialization
const {
  mockPrisma,
  mockValidateMatcher,
  mockValidateToolPattern,
  mockValidateMatchers,
  mockValidateToolPatterns,
  mockGeneratePolicySlug,
  mockMatchersOverlap,
  mockToolPatternsOverlap,
  mockCheckMatcher,
  mockCheckToolPattern,
  mockEvaluatePolicy,
  mockValidateToolNamesForOrganization,
  mockGetToolValidationErrorMessage,
  mockFindMcpServerByToolName,
  mockAnalyzePolicyDeletion,
  mockLogAdminAction,
  mockSendWebhook,
  mockValidateConditions,
} = vi.hoisted(() => ({
  mockPrisma: {
    policy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    policyTest: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    policyAssertion: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    permissionRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    agent: {
      findFirst: vi.fn(),
    },
  } satisfies Partial<MockPrisma>,
  mockValidateMatcher: vi.fn(),
  mockValidateToolPattern: vi.fn(),
  mockValidateMatchers: vi.fn(),
  mockValidateToolPatterns: vi.fn(),
  mockGeneratePolicySlug: vi.fn(),
  mockMatchersOverlap: vi.fn(),
  mockToolPatternsOverlap: vi.fn(),
  mockCheckMatcher: vi.fn(),
  mockCheckToolPattern: vi.fn(),
  mockEvaluatePolicy: vi.fn(),
  mockValidateToolNamesForOrganization: vi.fn(),
  mockGetToolValidationErrorMessage: vi.fn(),
  mockFindMcpServerByToolName: vi.fn(),
  mockAnalyzePolicyDeletion: vi.fn(),
  mockLogAdminAction: vi.fn(),
  mockSendWebhook: vi.fn(),
  mockValidateConditions: vi.fn(),
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  Prisma: { JsonNull: null },
  PolicyEffect: { ALLOW: 'ALLOW', DENY: 'DENY' },
  PermissionRequestStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    MODIFIED: 'MODIFIED',
    DENIED: 'DENIED',
  },
  AdminActionType: {
    POLICY_CREATE: 'POLICY_CREATE',
    POLICY_UPDATE: 'POLICY_UPDATE',
    POLICY_DELETE: 'POLICY_DELETE',
    POLICY_ENABLE: 'POLICY_ENABLE',
    POLICY_DISABLE: 'POLICY_DISABLE',
    POLICY_RESTORE: 'POLICY_RESTORE',
    POLICY_CONFLICT_RESOLVE: 'POLICY_CONFLICT_RESOLVE',
    PERMISSION_REQUEST_APPROVE: 'PERMISSION_REQUEST_APPROVE',
  },
  AdminResourceType: { POLICY: 'POLICY', PERMISSION_REQUEST: 'PERMISSION_REQUEST' },
  WebhookEvent: {
    POLICY_CREATED: 'POLICY_CREATED',
    POLICY_UPDATED: 'POLICY_UPDATED',
    POLICY_DELETED: 'POLICY_DELETED',
  },
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  validateMatcher: mockValidateMatcher,
  validateToolPattern: mockValidateToolPattern,
  validateMatchers: mockValidateMatchers,
  validateToolPatterns: mockValidateToolPatterns,
  generatePolicySlug: mockGeneratePolicySlug,
  generatePolicyDescription: vi.fn().mockReturnValue('Test policy description'),
  matchersOverlap: mockMatchersOverlap,
  toolPatternsOverlap: mockToolPatternsOverlap,
  matcherArraysOverlap: mockMatchersOverlap,
  toolPatternArraysOverlap: mockToolPatternsOverlap,
  evaluatePolicy: mockEvaluatePolicy,
  checkMatcher: mockCheckMatcher,
  checkToolPattern: mockCheckToolPattern,
}));

vi.mock('../../../../../packages/api/src/services/policyCondition.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../../packages/api/src/services/policyCondition.js')
    >();
  return {
    ...actual,
    validateConditions: mockValidateConditions,
    validateConditionsTree: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  };
});

vi.mock('../../../../../packages/api/src/services/toolValidation.js', () => ({
  validateToolNamesForOrganization: mockValidateToolNamesForOrganization,
  getToolValidationErrorMessage: mockGetToolValidationErrorMessage,
}));

vi.mock('../../../../../packages/api/src/services/mcp.js', () => ({
  findMcpServerByToolName: mockFindMcpServerByToolName,
}));

vi.mock('../../../../../packages/api/src/services/deletionImpact.js', () => ({
  analyzePolicyDeletion: mockAnalyzePolicyDeletion,
}));

vi.mock('../../../../../packages/api/src/services/policyAssertion.js', () => ({
  runAffectedAssertions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../packages/api/src/services/adminActionLog.js', () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock('../../../../../packages/api/src/services/webhook.js', () => ({
  sendWebhook: mockSendWebhook,
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
    policiesProcedure: createChain(),
    allPoliciesProcedure: createChain(),
  };
});

import { PolicyEffect } from '@sentinel/db';
import { adminPoliciesRouter as _adminPoliciesRouter } from '../../../../../packages/api/src/trpc/admin/policies.js';

type ListHandler = TestableHandler<Record<string, unknown>[]>;

const adminPoliciesRouter = _adminPoliciesRouter as unknown as {
  create: TestableHandler<{
    policy: Record<string, unknown>;
    linkedRequestUpdated: boolean;
    assertionWarnings: unknown[];
  }>;
  delete: TestableHandler<{ success: boolean; impact: unknown; assertionWarnings: unknown[] }>;
  deleteTest: TestableHandler;
  detectConflicts: ListHandler;
  get: TestableHandler;
  getDeletionImpact: TestableHandler;
  getTest: TestableHandler;
  list: ListHandler;
  listTests: TestableHandler<{ total: number; tests: unknown[] }>;
  restore: TestableHandler;
  test: TestableHandler<{
    decision: string;
    justification: string;
    policyIds: string[];
    testId: string;
    matchingPolicies: unknown[];
    allEnabledPolicies: unknown[];
    user: { id: string; email: string; roles: string[] };
    agent: { id: string; name: string } | null;
  }>;
  update: TestableHandler<{ description: string; [key: string]: unknown }>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateMatcher.mockReturnValue(true);
  mockValidateToolPattern.mockReturnValue(true);
  mockValidateMatchers.mockReturnValue(true);
  mockValidateToolPatterns.mockReturnValue(true);
  mockGetToolValidationErrorMessage.mockReturnValue(null);
  mockValidateToolNamesForOrganization.mockResolvedValue({
    valid: true,
    toolNames: ['domain.com::tool'],
  });
  mockGeneratePolicySlug.mockReturnValue('test-slug');
  mockLogAdminAction.mockResolvedValue(undefined);
  mockCheckMatcher.mockReturnValue(true);
  mockCheckToolPattern.mockReturnValue(true);
  mockEvaluatePolicy.mockResolvedValue({
    decision: 'ALLOWED',
    justification: 'Test justification',
    policyIds: ['policy-1'],
  });
  mockFindMcpServerByToolName.mockResolvedValue(null);
  mockSendWebhook.mockResolvedValue(undefined);
  mockValidateConditions.mockReturnValue({ valid: true, errors: [] });
});

describe('adminPoliciesRouter', () => {
  describe('list', () => {
    test('should return all non-deleted policies', async () => {
      const mockPolicies = [
        { id: 'policy-1', slug: 'allow-all', effect: 'ALLOW', tags: [] },
        { id: 'policy-2', slug: 'deny-read', effect: 'DENY', tags: [] },
      ];
      mockPrisma.policy.findMany.mockResolvedValue(mockPolicies);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.list({ ctx, input: undefined });

      expect(result).toEqual([
        { id: 'policy-1', slug: 'allow-all', effect: 'ALLOW', tags: [] },
        { id: 'policy-2', slug: 'deny-read', effect: 'DENY', tags: [] },
      ]);
      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123', deletedAt: null },
        include: {
          tags: {
            include: {
              policyTag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    test('should include deleted policies when requested', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminPoliciesRouter.list({ ctx, input: { includeDeleted: true } });

      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        include: {
          tags: {
            include: {
              policyTag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('get', () => {
    test('should return policy by id', async () => {
      const mockPolicy = {
        id: 'policy-1',
        slug: 'test-policy',
        tags: [{ policyTag: { id: 'tag-1', name: 'Test', color: '#123456' } }],
      };
      mockPrisma.policy.findFirst.mockResolvedValue(mockPolicy);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.get({ ctx, input: { id: 'policy-1' } });

      expect(result).toEqual({
        id: 'policy-1',
        slug: 'test-policy',
        tags: [{ id: 'tag-1', name: 'Test', color: '#123456' }],
      });
    });

    test('should throw NOT_FOUND when policy does not exist', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(adminPoliciesRouter.get({ ctx, input: { id: 'nonexistent' } })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('create', () => {
    const defaultInput = {
      matchers: ['role:ADMIN'],
      toolPatterns: ['domain.com::tool'],
      effect: PolicyEffect.ALLOW,
      description: 'Test policy',
    };

    function createMockPolicyForCreate() {
      return createMockPolicy({
        slug: 'test-slug',
        matchers: ['role:ADMIN'],
        toolPatterns: ['domain.com::tool'],
        effect: 'ALLOW',
        description: 'Test policy',
        enabled: true,
      });
    }

    test('should create policy successfully', async () => {
      const mockPolicy = createMockPolicyForCreate();
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue(mockPolicy);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.create({ ctx, input: defaultInput });

      expect(result.policy).toEqual(mockPolicy);
      expect(result.linkedRequestUpdated).toBe(false);
      expect(result.assertionWarnings).toEqual([]);
      expect(mockLogAdminAction).toHaveBeenCalled();
    });

    test('should throw BAD_REQUEST for invalid matcher', async () => {
      mockValidateMatchers.mockReturnValue(false);
      mockValidateMatcher.mockReturnValue(false);

      const ctx = createAdminContext();
      const input = { ...defaultInput, matchers: ['invalid'] };

      await expect(adminPoliciesRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid matcher format: invalid',
      });
    });

    test('should throw BAD_REQUEST for invalid tool pattern', async () => {
      mockValidateToolPatterns.mockReturnValue(false);
      mockValidateToolPattern.mockReturnValue(false);

      const ctx = createAdminContext();
      const input = { ...defaultInput, toolPatterns: ['invalid'] };

      await expect(adminPoliciesRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid tool pattern format: invalid',
      });
    });

    test('should throw BAD_REQUEST for tool validation error', async () => {
      mockGetToolValidationErrorMessage.mockReturnValue('Tool not found');

      const ctx = createAdminContext();
      const input = { ...defaultInput, toolPatterns: ['invalid.com::tool'] };

      await expect(adminPoliciesRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Tool not found',
      });
    });

    test('should send POLICY_CREATED webhook on create', async () => {
      const mockPolicy = createMockPolicyForCreate();
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue(mockPolicy);

      const ctx = createAdminContext({ userEmail: 'admin@example.com' });
      await adminPoliciesRouter.create({ ctx, input: defaultInput });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'POLICY_CREATED',
        expect.objectContaining({
          policyId: mockPolicy.id,
          policySlug: 'test-slug',
          effect: 'ALLOW',
          createdBy: 'admin@example.com',
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should not block on webhook failure during create', async () => {
      const mockPolicy = createMockPolicyForCreate();
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue(mockPolicy);
      mockSendWebhook.mockRejectedValue(new Error('Webhook failed'));

      const ctx = createAdminContext({ userEmail: 'admin@example.com' });
      const result = await adminPoliciesRouter.create({ ctx, input: defaultInput });

      expect(result.policy).toEqual(mockPolicy);
    });

    test('should throw BAD_REQUEST for invalid conditions on create', async () => {
      mockValidateConditions.mockReturnValue({
        valid: false,
        errors: [
          { field: 'operator', message: 'Invalid operator for field' },
          { field: 'field', message: 'Unknown field reference' },
        ],
      });

      const ctx = createAdminContext();
      const input = {
        ...defaultInput,
        conditions: [{ field: 'invalid_field', operator: 'unknown', value: 'test' }],
      };

      await expect(adminPoliciesRouter.create({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message:
          'Invalid conditions: operator: Invalid operator for field; field: Unknown field reference',
      });
    });

    test('should create policy with valid conditions', async () => {
      const mockPolicy = createMockPolicyForCreate();
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue({
        ...mockPolicy,
        conditions: [{ field: 'path', operator: 'contains', value: '/admin' }],
      });
      mockValidateConditions.mockReturnValue({ valid: true, errors: [] });

      const ctx = createAdminContext();
      const input = {
        ...defaultInput,
        conditions: [{ field: 'path', operator: 'contains', value: '/admin' }],
      };

      const result = await adminPoliciesRouter.create({ ctx, input });

      expect(result.policy).toBeDefined();
      expect(mockValidateConditions).toHaveBeenCalledWith(input.conditions);
    });
  });

  describe('update', () => {
    const existingPolicy = createMockPolicy({
      slug: 'existing-slug',
      matchers: ['role:USER'],
      toolPatterns: ['domain.com::tool'],
      effect: 'ALLOW',
      description: 'Old desc',
      enabled: true,
    });

    test('should update policy successfully', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockPrisma.policy.findMany.mockResolvedValue([existingPolicy]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, description: 'New desc' });

      const ctx = createAdminContext();
      const input = { id: 'policy-123', description: 'New desc' };

      const result = await adminPoliciesRouter.update({ ctx, input });

      expect(result.description).toBe('New desc');
    });

    test('should throw NOT_FOUND when policy does not exist', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.update({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toThrow(TRPCError);
    });

    test('should regenerate slug when slug-generating fields change', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockPrisma.policy.findMany.mockResolvedValue([existingPolicy]);
      mockGeneratePolicySlug.mockReturnValue('new-generated-slug');
      mockPrisma.policy.update.mockResolvedValue({
        ...existingPolicy,
        slug: 'new-generated-slug',
        matchers: ['role:ADMIN'],
      });

      const ctx = createAdminContext();
      await adminPoliciesRouter.update({
        ctx,
        input: { id: 'policy-123', matchers: ['role:ADMIN'] },
      });

      expect(mockGeneratePolicySlug).toHaveBeenCalled();
    });

    test('should log POLICY_ENABLE when enabling', async () => {
      const disabledPolicy = { ...existingPolicy, enabled: false };
      mockPrisma.policy.findFirst.mockResolvedValue(disabledPolicy);
      mockPrisma.policy.update.mockResolvedValue({ ...disabledPolicy, enabled: true });

      const ctx = createAdminContext();
      await adminPoliciesRouter.update({ ctx, input: { id: 'policy-123', enabled: true } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'POLICY_ENABLE' }),
      );
    });

    test('should log POLICY_DISABLE when disabling', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, enabled: false });

      const ctx = createAdminContext();
      await adminPoliciesRouter.update({ ctx, input: { id: 'policy-123', enabled: false } });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'POLICY_DISABLE' }),
      );
    });

    test('should send POLICY_UPDATED webhook on update', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockPrisma.policy.findMany.mockResolvedValue([existingPolicy]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, description: 'New desc' });

      const ctx = createAdminContext({ userEmail: 'admin@example.com' });
      await adminPoliciesRouter.update({
        ctx,
        input: { id: 'policy-123', description: 'New desc' },
      });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'POLICY_UPDATED',
        expect.objectContaining({
          policyId: existingPolicy.id,
          policySlug: 'existing-slug',
          updatedBy: 'admin@example.com',
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should not block on webhook failure during update', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockPrisma.policy.findMany.mockResolvedValue([existingPolicy]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, description: 'New desc' });
      mockSendWebhook.mockRejectedValue(new Error('Webhook failed'));

      const ctx = createAdminContext({ userEmail: 'admin@example.com' });
      const result = await adminPoliciesRouter.update({
        ctx,
        input: { id: 'policy-123', description: 'New desc' },
      });

      expect(result.description).toBe('New desc');
    });

    test('should throw BAD_REQUEST for invalid conditions on update', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockValidateConditions.mockReturnValue({
        valid: false,
        errors: [
          { field: 'operator', message: 'Invalid condition operator' },
          { field: 'field', message: 'Missing required field' },
        ],
      });

      const ctx = createAdminContext();
      const input = {
        id: 'policy-123',
        conditions: [{ field: 'bad_field', operator: 'invalid' }],
      };

      await expect(adminPoliciesRouter.update({ ctx, input })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message:
          'Invalid conditions: operator: Invalid condition operator; field: Missing required field',
      });
    });

    test('should update policy with valid conditions', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockPrisma.policy.findMany.mockResolvedValue([existingPolicy]);
      mockPrisma.policy.update.mockResolvedValue({
        ...existingPolicy,
        conditions: [{ field: 'path', operator: 'startsWith', value: '/api' }],
      });
      mockValidateConditions.mockReturnValue({ valid: true, errors: [] });

      const ctx = createAdminContext();
      const input = {
        id: 'policy-123',
        conditions: [{ field: 'path', operator: 'startsWith', value: '/api' }],
      };

      const result = await adminPoliciesRouter.update({ ctx, input });

      expect(result).toBeDefined();
      expect(mockValidateConditions).toHaveBeenCalledWith(input.conditions);
    });
  });

  describe('delete', () => {
    const existingPolicy = createMockPolicy({
      slug: 'test-slug',
      matchers: ['role:ADMIN'],
      toolPatterns: ['domain.com::tool'],
      effect: 'ALLOW',
      description: 'Test',
      enabled: true,
    });

    test('should soft delete policy', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.delete({ ctx, input: { id: 'policy-123' } });

      expect(result.success).toBe(true);
      expect(mockPrisma.policy.update).toHaveBeenCalledWith({
        where: { id: 'policy-123' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedBy: 'admin-user-123',
          enabled: false,
        }),
      });
    });

    test('should throw NOT_FOUND when policy does not exist', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.delete({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toThrow(TRPCError);
    });

    test('should log conflict resolution when reason contains conflict', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });

      const ctx = createAdminContext();
      await adminPoliciesRouter.delete({
        ctx,
        input: { id: 'policy-123', reason: 'Conflict resolution' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledTimes(2);
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'POLICY_CONFLICT_RESOLVE' }),
      );
    });

    test('should send POLICY_DELETED webhook on delete', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });

      const ctx = createAdminContext({ userEmail: 'admin@example.com' });
      await adminPoliciesRouter.delete({ ctx, input: { id: 'policy-123' } });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'POLICY_DELETED',
        expect.objectContaining({
          policyId: existingPolicy.id,
          policySlug: 'test-slug',
          deletedBy: 'admin@example.com',
          deletedViaConflictResolution: false,
        }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should send POLICY_DELETED webhook with conflict flag when deleting via conflict resolution', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });

      const ctx = createAdminContext({ userEmail: 'admin@example.com' });
      await adminPoliciesRouter.delete({
        ctx,
        input: { id: 'policy-123', reason: 'Conflict resolution' },
      });

      expect(mockSendWebhook).toHaveBeenCalledWith(
        'org-123',
        'POLICY_DELETED',
        expect.objectContaining({ deletedViaConflictResolution: true }),
        undefined,
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });

    test('should not block on webhook failure during delete', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });
      mockSendWebhook.mockRejectedValue(new Error('Webhook failed'));

      const ctx = createAdminContext({ userEmail: 'admin@example.com' });
      const result = await adminPoliciesRouter.delete({ ctx, input: { id: 'policy-123' } });

      expect(result.success).toBe(true);
    });
  });

  describe('restore', () => {
    const deletedPolicy = createMockPolicy({
      slug: 'test-slug',
      deletedAt: new Date(),
    });
    Object.assign(deletedPolicy, { deletedBy: 'admin-1' });

    test('should restore deleted policy', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(deletedPolicy);
      mockPrisma.policy.update.mockResolvedValue({
        ...deletedPolicy,
        deletedAt: null,
        deletedBy: null,
      });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.restore({ ctx, input: { id: 'policy-123' } });

      expect(result.success).toBe(true);
      expect(mockPrisma.policy.update).toHaveBeenCalledWith({
        where: { id: 'policy-123' },
        data: { deletedAt: null, deletedBy: null },
      });
    });

    test('should throw NOT_FOUND when policy not deleted', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.restore({ ctx, input: { id: 'policy-123' } }),
      ).rejects.toMatchObject({ message: 'Policy not found or not deleted' });
    });
  });

  describe('getDeletionImpact', () => {
    test('should return deletion impact analysis', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue({ id: 'policy-123' });
      mockAnalyzePolicyDeletion.mockResolvedValue({
        blockers: [],
        warnings: [{ message: 'Will affect 5 users' }],
      });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.getDeletionImpact({
        ctx,
        input: { id: 'policy-123' },
      });

      expect(result).toEqual({
        blockers: [],
        warnings: [{ message: 'Will affect 5 users' }],
      });
    });

    test('should throw NOT_FOUND when policy does not exist', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.getDeletionImpact({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('detectConflicts', () => {
    test('should return empty array when no policies', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.detectConflicts({ ctx, input: undefined });

      expect(result).toEqual([]);
    });

    test('should detect contradiction between ALLOW and DENY', async () => {
      const policies = [
        createMockPolicy({ id: 'p1', slug: 'allow-admin', effect: 'ALLOW' }),
        createMockPolicy({ id: 'p2', slug: 'deny-admin', effect: 'DENY' }),
      ];
      mockPrisma.policy.findMany.mockResolvedValue(policies);
      mockMatchersOverlap.mockReturnValue(true);
      mockToolPatternsOverlap.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.detectConflicts({ ctx, input: undefined });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('contradiction');
      expect(result[0].severity).toBe('high');
    });

    test('should detect redundant ALLOW policies', async () => {
      const policies = [
        createMockPolicy({ id: 'p1', slug: 'allow-1', effect: 'ALLOW' }),
        createMockPolicy({ id: 'p2', slug: 'allow-2', effect: 'ALLOW' }),
      ];
      mockPrisma.policy.findMany.mockResolvedValue(policies);
      mockMatchersOverlap.mockReturnValue(true);
      mockToolPatternsOverlap.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.detectConflicts({ ctx, input: undefined });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('overlap');
      expect(result[0].severity).toBe('low');
    });

    test('should detect redundant DENY policies', async () => {
      const policies = [
        createMockPolicy({ id: 'p1', slug: 'deny-1', effect: 'DENY' }),
        createMockPolicy({ id: 'p2', slug: 'deny-2', effect: 'DENY' }),
      ];
      mockPrisma.policy.findMany.mockResolvedValue(policies);
      mockMatchersOverlap.mockReturnValue(true);
      mockToolPatternsOverlap.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.detectConflicts({ ctx, input: undefined });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('overlap');
    });

    test('should not detect conflict for non-overlapping policies', async () => {
      const policies = [
        createMockPolicy({ id: 'p1', slug: 'allow-admin', effect: 'ALLOW' }),
        createMockPolicy({ id: 'p2', slug: 'deny-user', effect: 'DENY' }),
      ];
      mockPrisma.policy.findMany.mockResolvedValue(policies);
      mockMatchersOverlap.mockReturnValue(false);
      mockToolPatternsOverlap.mockReturnValue(false);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.detectConflicts({ ctx, input: undefined });

      expect(result).toEqual([]);
    });
  });

  describe('listTests', () => {
    test('should return policy tests with pagination', async () => {
      const mockTests = [{ id: 'test-1', toolName: 'domain.com::tool' }];
      mockPrisma.policyTest.count.mockResolvedValue(10);
      mockPrisma.policyTest.findMany.mockResolvedValue(mockTests);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.listTests({ ctx, input: { limit: 5, offset: 0 } });

      expect(result).toEqual({ total: 10, tests: mockTests });
    });

    test('should use default pagination', async () => {
      mockPrisma.policyTest.count.mockResolvedValue(0);
      mockPrisma.policyTest.findMany.mockResolvedValue([]);

      const ctx = createAdminContext();
      await adminPoliciesRouter.listTests({ ctx, input: {} });

      expect(mockPrisma.policyTest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 0 }),
      );
    });
  });

  describe('getTest', () => {
    test('should return policy test by id', async () => {
      const mockTest = { id: 'test-1', toolName: 'domain.com::tool' };
      mockPrisma.policyTest.findFirst.mockResolvedValue(mockTest);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.getTest({ ctx, input: { id: 'test-1' } });

      expect(result).toEqual(mockTest);
    });

    test('should throw NOT_FOUND when test does not exist', async () => {
      mockPrisma.policyTest.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.getTest({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Policy test not found' });
    });
  });

  describe('deleteTest', () => {
    test('should delete policy test', async () => {
      mockPrisma.policyTest.findFirst.mockResolvedValue({ id: 'test-1' });
      mockPrisma.policyTest.delete.mockResolvedValue({ id: 'test-1' });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.deleteTest({ ctx, input: { id: 'test-1' } });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.policyTest.delete).toHaveBeenCalledWith({ where: { id: 'test-1' } });
    });

    test('should throw NOT_FOUND when test does not exist', async () => {
      mockPrisma.policyTest.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.deleteTest({ ctx, input: { id: 'nonexistent' } }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Policy test not found' });
    });
  });

  describe('organization isolation', () => {
    test('list should filter by organization', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const ctx = createAdminContext({ organizationId: 'custom-org' });
      await adminPoliciesRouter.list({ ctx, input: undefined });

      expect(mockPrisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'custom-org' }),
        }),
      );
    });

    test('get should filter by organization', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext({ organizationId: 'custom-org' });

      try {
        await adminPoliciesRouter.get({ ctx, input: { id: 'policy-123' } });
      } catch {
        // Expected
      }

      expect(mockPrisma.policy.findFirst).toHaveBeenCalledWith({
        where: { id: 'policy-123', organizationId: 'custom-org' },
        include: {
          tags: {
            include: {
              policyTag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
      });
    });
  });

  describe('test', () => {
    const mockUser = createMockUserWithRoles({
      id: 'user-1',
      email: 'test@example.com',
    });

    const mockPolicies = [
      createMockPolicy({
        id: 'policy-1',
        slug: 'allow-users',
        matchers: ['role:User'],
        toolPatterns: ['domain.com::*'],
        effect: 'ALLOW',
        description: 'Allow users',
        enabled: true,
      }),
    ];

    function setupPolicyTestMocks() {
      mockPrisma.policy.findMany.mockResolvedValue(mockPolicies);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.policyTest.create.mockResolvedValue({
        id: 'test-123',
        toolName: 'domain.com::tool',
        decision: 'ALLOWED',
        justification: 'Test justification',
      });
    }

    test('should test policy evaluation with provided user', async () => {
      setupPolicyTestMocks();

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.test({
        ctx,
        input: { toolName: 'domain.com::tool', userId: 'user-1' },
      });

      expect(result.decision).toBe('ALLOWED');
      expect(result.testId).toBe('test-123');
      expect(result.user.email).toBe('test@example.com');
      expect(mockEvaluatePolicy).toHaveBeenCalled();
    });

    test('should test policy evaluation with current admin user when no userId provided', async () => {
      setupPolicyTestMocks();

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.test({
        ctx,
        input: { toolName: 'domain.com::tool' },
      });

      expect(result.decision).toBe('ALLOWED');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'admin-user-123' } }),
      );
    });

    test('should throw NOT_FOUND when provided user does not exist', async () => {
      mockPrisma.policy.findMany.mockResolvedValue(mockPolicies);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.test({
          ctx,
          input: { toolName: 'domain.com::tool', userId: 'nonexistent' },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'User not found' });
    });

    test('should throw NOT_FOUND when current user not found', async () => {
      mockPrisma.policy.findMany.mockResolvedValue(mockPolicies);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.test({ ctx, input: { toolName: 'domain.com::tool' } }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Current user not found' });
    });

    test('should test with agent when agentId provided', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test Agent', organizationId: 'org-123' };
      setupPolicyTestMocks();
      mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.test({
        ctx,
        input: { toolName: 'domain.com::tool', userId: 'user-1', agentId: 'agent-1' },
      });

      expect(result.agent).toEqual({ id: 'agent-1', name: 'Test Agent' });
      expect(mockEvaluatePolicy).toHaveBeenCalledWith(
        expect.objectContaining({ agent: mockAgent }),
        expect.anything(),
      );
    });

    test('should throw NOT_FOUND when agent does not exist', async () => {
      setupPolicyTestMocks();
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();

      await expect(
        adminPoliciesRouter.test({
          ctx,
          input: { toolName: 'domain.com::tool', userId: 'user-1', agentId: 'nonexistent' },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Agent not found' });
    });

    test('should return DENIED for untrusted MCP server', async () => {
      mockPrisma.policy.findMany.mockResolvedValue(mockPolicies);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockFindMcpServerByToolName.mockResolvedValue({
        id: 'server-1',
        name: 'Untrusted Server',
        trusted: false,
      });
      mockPrisma.policyTest.create.mockResolvedValue({
        id: 'test-123',
        toolName: 'domain.com::tool',
        decision: 'DENIED',
        justification: 'MCP server "Untrusted Server" is untrusted',
      });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.test({
        ctx,
        input: { toolName: 'domain.com::tool', userId: 'user-1' },
      });

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('untrusted');
    });

    test('should return matching policies when evaluating', async () => {
      setupPolicyTestMocks();
      mockCheckMatcher.mockReturnValue(true);
      mockCheckToolPattern.mockReturnValue(true);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.test({
        ctx,
        input: { toolName: 'domain.com::tool', userId: 'user-1' },
      });

      expect(result.matchingPolicies.length).toBeGreaterThan(0);
      expect(result.allEnabledPolicies.length).toBeGreaterThan(0);
    });

    test('should filter matching policies by enabled status', async () => {
      const mixedPolicies = [
        { ...mockPolicies[0], enabled: true },
        { ...mockPolicies[0], id: 'policy-2', slug: 'disabled', enabled: false },
      ];
      mockPrisma.policy.findMany.mockResolvedValue(mixedPolicies);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.policyTest.create.mockResolvedValue({
        id: 'test-123',
        toolName: 'domain.com::tool',
        decision: 'ALLOWED',
        justification: 'Test justification',
      });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.test({
        ctx,
        input: { toolName: 'domain.com::tool', userId: 'user-1' },
      });

      expect(result.allEnabledPolicies.length).toBe(1);
    });
  });

  describe('create with linkedRequestId', () => {
    const mockPolicy = createMockPolicy({
      slug: 'test-slug',
      matchers: ['user:test@example.com'],
      toolPatterns: ['domain.com::tool'],
      effect: 'ALLOW',
      description: 'Test policy',
      enabled: true,
    });

    const mockPendingRequest = {
      id: 'request-1',
      userId: 'user-1',
      type: 'TOOL_ACCESS',
      status: 'PENDING',
      toolNames: ['domain.com::tool'],
      reason: 'Need access',
      linkedPolicyId: null,
      user: { email: 'test@example.com' },
    };

    test('should link policy to permission request and set status to APPROVED when exact match', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue(mockPolicy);
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockPendingRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: 'APPROVED',
        linkedPolicyId: mockPolicy.id,
      });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.create({
        ctx,
        input: {
          matchers: ['user:test@example.com'],
          toolPatterns: ['domain.com::tool'],
          effect: 'ALLOW' as const,
          description: 'Test policy',
          linkedRequestId: 'request-1',
        },
      });

      expect(result.linkedRequestUpdated).toBe(true);
      expect(mockPrisma.permissionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'request-1' },
          data: expect.objectContaining({
            status: 'APPROVED',
            linkedPolicyId: mockPolicy.id,
          }),
        }),
      );
      expect(mockLogAdminAction).toHaveBeenCalledTimes(2);
    });

    test('should set status to MODIFIED when policy differs from request', async () => {
      const modifiedPolicy = { ...mockPolicy, matchers: ['role:Admin'] };
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue(modifiedPolicy);
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockPendingRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: 'MODIFIED',
        linkedPolicyId: mockPolicy.id,
      });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.create({
        ctx,
        input: {
          matchers: ['role:Admin'],
          toolPatterns: ['domain.com::tool'],
          effect: 'ALLOW' as const,
          description: 'Test policy',
          linkedRequestId: 'request-1',
        },
      });

      expect(result.linkedRequestUpdated).toBe(true);
      expect(mockPrisma.permissionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'MODIFIED' }),
        }),
      );
    });

    test('should not update request if not found or not pending', async () => {
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue(mockPolicy);
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.create({
        ctx,
        input: {
          matchers: ['user:test@example.com'],
          toolPatterns: ['domain.com::tool'],
          effect: 'ALLOW' as const,
          description: 'Test policy',
          linkedRequestId: 'nonexistent',
        },
      });

      expect(result.linkedRequestUpdated).toBe(false);
      expect(mockPrisma.permissionRequest.update).not.toHaveBeenCalled();
    });

    test('should generate grantDiff for MODIFIED requests', async () => {
      const modifiedPolicy = { ...mockPolicy, toolPatterns: ['domain.com::*'] };
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.create.mockResolvedValue(modifiedPolicy);
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(mockPendingRequest);
      mockPrisma.permissionRequest.update.mockResolvedValue({
        ...mockPendingRequest,
        status: 'MODIFIED',
      });

      const ctx = createAdminContext();
      await adminPoliciesRouter.create({
        ctx,
        input: {
          matchers: ['user:test@example.com'],
          toolPatterns: ['domain.com::*'],
          effect: 'ALLOW' as const,
          description: 'Test policy',
          linkedRequestId: 'request-1',
        },
      });

      expect(mockPrisma.permissionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ grantDiff: expect.anything() }),
        }),
      );
    });
  });

  describe('delete with conflict resolution', () => {
    const existingPolicy = createMockPolicy({
      slug: 'test-slug',
      matchers: ['role:User'],
      toolPatterns: ['domain.com::tool'],
      effect: 'ALLOW',
      description: 'Test',
      enabled: true,
    });

    test('should find and log conflicting policies when reason contains conflict', async () => {
      const conflictingPolicy = createMockPolicy({
        id: 'policy-2',
        slug: 'conflicting-slug',
        matchers: ['role:User'],
        toolPatterns: ['domain.com::*'],
        effect: 'DENY',
        enabled: true,
      });

      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.findMany.mockResolvedValue([conflictingPolicy]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });
      mockMatchersOverlap.mockReturnValue(true);
      mockToolPatternsOverlap.mockReturnValue(true);

      const ctx = createAdminContext();
      await adminPoliciesRouter.delete({
        ctx,
        input: { id: 'policy-123', reason: 'Conflict resolution' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledTimes(2);
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'POLICY_CONFLICT_RESOLVE',
          actionDetails: expect.objectContaining({
            conflictingPolicies: expect.arrayContaining([
              expect.objectContaining({ id: 'policy-2', slug: 'conflicting-slug' }),
            ]),
          }),
        }),
      );
    });

    test('should handle no conflicting policies found', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });

      const ctx = createAdminContext();
      await adminPoliciesRouter.delete({
        ctx,
        input: { id: 'policy-123', reason: 'Conflict resolution' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'POLICY_CONFLICT_RESOLVE',
          actionDetails: expect.objectContaining({ conflictingPolicies: [] }),
        }),
      );
    });

    test('should only detect conflicts when both matchers and tool patterns overlap', async () => {
      const nonConflictingPolicy = createMockPolicy({
        id: 'policy-2',
        slug: 'non-conflicting',
        matchers: ['role:Admin'],
        toolPatterns: ['other.com::*'],
        effect: 'DENY',
        enabled: true,
      });

      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.findMany.mockResolvedValue([nonConflictingPolicy]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });
      mockMatchersOverlap.mockReturnValue(false);
      mockToolPatternsOverlap.mockReturnValue(false);

      const ctx = createAdminContext();
      await adminPoliciesRouter.delete({
        ctx,
        input: { id: 'policy-123', reason: 'Conflict resolution' },
      });

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'POLICY_CONFLICT_RESOLVE',
          actionDetails: expect.objectContaining({ conflictingPolicies: [] }),
        }),
      );
    });

    test('should return assertion warnings after delete', async () => {
      const { runAffectedAssertions } =
        await import('../../../../../packages/api/src/services/policyAssertion.js');
      const mockRunAffectedAssertions = vi.mocked(runAffectedAssertions);
      mockRunAffectedAssertions.mockResolvedValue([
        {
          assertionId: 'assertion-1',
          assertionName: 'Test Assertion',
          passed: false,
          expectedDecision: 'ALLOWED',
          actualDecision: 'DENIED',
          justification: null,
          matchedPolicyIds: [],
        },
      ]);

      mockPrisma.policy.findFirst.mockResolvedValue(existingPolicy);
      mockAnalyzePolicyDeletion.mockResolvedValue({ blockers: [], warnings: [] });
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.policy.update.mockResolvedValue({ ...existingPolicy, deletedAt: new Date() });

      const ctx = createAdminContext();
      const result = await adminPoliciesRouter.delete({ ctx, input: { id: 'policy-123' } });

      expect(result.assertionWarnings).toHaveLength(1);
      expect(result.assertionWarnings[0]).toMatchObject({
        assertionId: 'assertion-1',
        assertionName: 'Test Assertion',
      });
    });
  });
});
