/**
 * Admin MCP Executors Service Unit Tests
 * Tests for admin MCP tool executor registry
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogger } = vi.hoisted(() => {
  const prismaModels = {
    policy: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    role: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    mcpServer: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    agent: {
      create: vi.fn(),
      update: vi.fn(),
    },
    sensitiveToolFlag: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sensitiveFlagApprovalRequest: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    webhookEndpoint: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permissionRequest: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  return {
    mockPrisma: {
      ...prismaModels,
      // Transaction support - executes callback with same mock prisma client
      $transaction: vi
        .fn()
        .mockImplementation(async (callback: (tx: typeof prismaModels) => Promise<unknown>) => {
          return callback(prismaModels);
        }),
    },
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  SensitiveFlagBehavior: {
    RATE_LIMIT: 'RATE_LIMIT',
    REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
    ALERT: 'ALERT',
  },
  WebhookEvent: {
    TOOL_INVOCATION_ALLOWED: 'TOOL_INVOCATION_ALLOWED',
    TOOL_INVOCATION_DENIED: 'TOOL_INVOCATION_DENIED',
    SENSITIVE_TOOL_INVOKED: 'SENSITIVE_TOOL_INVOKED',
    SENSITIVE_APPROVAL_NEEDED: 'SENSITIVE_APPROVAL_NEEDED',
    SENSITIVE_RATE_LIMITED: 'SENSITIVE_RATE_LIMITED',
    POLICY_CREATED: 'POLICY_CREATED',
    POLICY_UPDATED: 'POLICY_UPDATED',
    POLICY_DELETED: 'POLICY_DELETED',
    AGENT_CREATED: 'AGENT_CREATED',
    AGENT_DELETED: 'AGENT_DELETED',
    SESSION_TERMINATED: 'SESSION_TERMINATED',
  },
  WebhookEndpointType: {
    CUSTOM: 'CUSTOM',
    DISCORD: 'DISCORD',
    SLACK: 'SLACK',
    EMAIL: 'EMAIL',
  },
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

import {
  executeConfirmedAction,
  hasExecutor,
} from '../../../../packages/api/src/services/adminMcpExecutors.js';

// ============================================================================
// Test Helpers
// ============================================================================

interface MockConfirmation {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  adminUserId: string;
  toolName: string;
  toolInput: unknown;
  mcpSessionId: string;
}

function createMockConfirmation(overrides: Partial<MockConfirmation> = {}): MockConfirmation {
  return {
    id: overrides.id ?? 'confirmation-1',
    organizationId: overrides.organizationId ?? 'org-1',
    workspaceId: overrides.workspaceId ?? null,
    adminUserId: overrides.adminUserId ?? 'admin-1',
    toolName: overrides.toolName ?? 'admin_create_policy',
    toolInput: overrides.toolInput ?? {},
    mcpSessionId: overrides.mcpSessionId ?? 'session-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock for mcpServer.findMany - returns a wildcard-compatible server
  mockPrisma.mcpServer.findMany.mockResolvedValue([
    {
      id: 'server-1',
      name: 'Test Server',
      url: 'https://test.example.com',
      tools: [{ name: 'test-tool' }],
    },
  ]);
  // Default mock for role.findMany - returns roles used in tests
  mockPrisma.role.findMany.mockResolvedValue([
    { name: 'Admin' },
    { name: 'Developer' },
    { name: 'Viewer' },
  ]);
});

describe('Admin MCP Executors Service', () => {
  describe('hasExecutor', () => {
    test('should return true for known policy tools', () => {
      expect(hasExecutor('admin_create_policy')).toBe(true);
      expect(hasExecutor('admin_update_policy')).toBe(true);
      expect(hasExecutor('admin_delete_policy')).toBe(true);
      expect(hasExecutor('admin_enable_policy')).toBe(true);
      expect(hasExecutor('admin_disable_policy')).toBe(true);
    });

    test('should return true for known user tools', () => {
      expect(hasExecutor('admin_create_user')).toBe(true);
      expect(hasExecutor('admin_update_user')).toBe(true);
      expect(hasExecutor('admin_delete_user')).toBe(true);
      expect(hasExecutor('admin_refresh_token')).toBe(true);
      expect(hasExecutor('admin_revoke_token')).toBe(true);
    });

    test('should return true for known role tools', () => {
      expect(hasExecutor('admin_create_role')).toBe(true);
      expect(hasExecutor('admin_update_role')).toBe(true);
      expect(hasExecutor('admin_delete_role')).toBe(true);
    });

    test('should return true for known MCP server tools', () => {
      expect(hasExecutor('admin_create_mcp_server')).toBe(true);
      expect(hasExecutor('admin_update_mcp_server')).toBe(true);
      expect(hasExecutor('admin_delete_mcp_server')).toBe(true);
      expect(hasExecutor('admin_set_org_api_key')).toBe(true);
    });

    test('should return true for known agent tools', () => {
      expect(hasExecutor('admin_create_agent')).toBe(true);
      expect(hasExecutor('admin_delete_agent')).toBe(true);
    });

    test('should return true for known sensitive flag tools', () => {
      expect(hasExecutor('admin_create_sensitive_flag')).toBe(true);
      expect(hasExecutor('admin_update_sensitive_flag')).toBe(true);
      expect(hasExecutor('admin_delete_sensitive_flag')).toBe(true);
      expect(hasExecutor('admin_approve_sensitive')).toBe(true);
      expect(hasExecutor('admin_deny_sensitive')).toBe(true);
    });

    test('should return true for known webhook tools', () => {
      expect(hasExecutor('admin_create_webhook')).toBe(true);
      expect(hasExecutor('admin_update_webhook')).toBe(true);
      expect(hasExecutor('admin_delete_webhook')).toBe(true);
    });

    test('should return true for known permission request tools', () => {
      expect(hasExecutor('admin_approve_request')).toBe(true);
      expect(hasExecutor('admin_deny_request')).toBe(true);
    });

    test('should return false for unknown tools', () => {
      expect(hasExecutor('admin_unknown_tool')).toBe(false);
      expect(hasExecutor('some_random_tool')).toBe(false);
      expect(hasExecutor('')).toBe(false);
    });
  });

  describe('executeConfirmedAction', () => {
    describe('error handling', () => {
      test('should throw error for unknown tool', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_unknown_tool',
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Unknown tool: admin_unknown_tool',
        );
      });

      test('should log execution start', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test',
          effect: 'ALLOW',
          toolPatterns: ['*::*'],
          matchers: ['role:Admin'],
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        mockPrisma.policy.findUnique.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test',
            effect: 'ALLOW',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Executing confirmed admin MCP action',
          expect.objectContaining({
            confirmationId: 'confirmation-1',
            toolName: 'admin_create_policy',
            organizationId: 'org-1',
          }),
        );
      });

      test('should log success after execution', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test',
          effect: 'ALLOW',
          toolPatterns: ['*::*'],
          matchers: ['*'],
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        mockPrisma.policy.findUnique.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Admin MCP action executed successfully',
          expect.objectContaining({
            confirmationId: 'confirmation-1',
            toolName: 'admin_create_policy',
          }),
        );
      });

      test('should log error and rethrow on failure', async () => {
        const dbError = new Error('Database connection lost');
        mockPrisma.policy.create.mockRejectedValue(dbError);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Database connection lost',
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Admin MCP action failed',
          expect.objectContaining({
            confirmationId: 'confirmation-1',
            toolName: 'admin_create_policy',
            error: dbError,
          }),
        );
      });
    });

    describe('policy executors', () => {
      test('should execute admin_create_policy', async () => {
        const inputToolPatterns = ['*::*'];
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test-policy',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          toolPatterns: inputToolPatterns,
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        mockPrisma.policy.findUnique.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            description: 'Allow admins to use all tools',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
        expect(mockPrisma.policy.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            workspaceId: null,
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            description: 'Allow admins to use all tools',
            conditions: undefined,
            enabled: true,
          },
        });
      });

      test('should use name as slug fallback for admin_create_policy', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'policy-name',
          effect: 'DENY',
          toolPatterns: ['*::*'],
          matchers: ['*'],
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        mockPrisma.policy.findUnique.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            name: 'policy-name',
            effect: 'DENY',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockPrisma.policy.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            slug: 'policy-name',
          }),
        });
      });

      test('should throw error when effect is missing for admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        // Zod validation catches missing/invalid effect
        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when matchers is missing for admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        // Zod validation catches missing matchers array
        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when matchers is empty for admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: [],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Policy matchers is required and must be a non-empty array',
        );
      });

      test('should throw error when toolPatterns is missing for admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            description: 'Test policy',
          },
        });

        // Zod validation catches missing toolPatterns array
        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when toolPatterns is empty for admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: [],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Policy toolPatterns is required and must be a non-empty array',
        );
      });

      test('should throw error when description is missing for admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
          },
        });

        // Zod validation catches missing description string
        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when description is empty for admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: '   ',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Policy description is required',
        );
      });

      test('should throw error for invalid matchers format in admin_create_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['invalid-matcher'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid matcher format',
        );
      });

      test('should throw error for invalid tool patterns in admin_create_policy', async () => {
        // No servers registered, so any specific server pattern will fail
        mockPrisma.mcpServer.findMany.mockResolvedValue([]);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['unknown.server.com::someTool'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Unknown server "unknown.server.com"',
        );
      });

      test('should throw error when policy not found after create', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test-policy',
          effect: 'ALLOW',
          matchers: ['*'],
          toolPatterns: ['*::*'],
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        // Verification fails - policy not found after create
        mockPrisma.policy.findUnique.mockResolvedValue(null);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: Policy policy-1 was not found after creation',
        );
      });

      test('should throw error and delete policy when toolPatterns mismatch after create', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test-policy',
          effect: 'ALLOW',
          matchers: ['*'],
          toolPatterns: ['*::*'],
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        // Verification shows toolPatterns were stored incorrectly
        mockPrisma.policy.findUnique.mockResolvedValue({
          ...mockPolicy,
          toolPatterns: ['wrong::pattern'],
        });
        mockPrisma.policy.delete.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: toolPatterns were not saved correctly',
        );

        expect(mockPrisma.policy.delete).toHaveBeenCalledWith({
          where: { id: 'policy-1' },
        });
      });

      test('should throw error and delete policy when matchers mismatch after create', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test-policy',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          toolPatterns: ['*::*'],
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        // Verification shows matchers were stored incorrectly
        mockPrisma.policy.findUnique.mockResolvedValue({
          ...mockPolicy,
          matchers: ['role:User'], // Wrong matchers
        });
        mockPrisma.policy.delete.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['role:Admin'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: matchers were not saved correctly',
        );

        expect(mockPrisma.policy.delete).toHaveBeenCalledWith({
          where: { id: 'policy-1' },
        });

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Post-execution verification failed: matchers mismatch',
          expect.objectContaining({
            policyId: 'policy-1',
            expected: ['role:Admin'],
            actual: ['role:User'],
          }),
        );
      });

      test('should throw error and delete policy when effect mismatch after create', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test-policy',
          effect: 'DENY',
          matchers: ['*'],
          toolPatterns: ['*::*'],
        };
        mockPrisma.policy.create.mockResolvedValue(mockPolicy);
        // Verification shows effect was stored incorrectly
        mockPrisma.policy.findUnique.mockResolvedValue({
          ...mockPolicy,
          effect: 'ALLOW', // Wrong effect
        });
        mockPrisma.policy.delete.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'DENY',
            matchers: ['*'],
            toolPatterns: ['*::*'],
            description: 'Test policy',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: effect was not saved correctly',
        );

        expect(mockPrisma.policy.delete).toHaveBeenCalledWith({
          where: { id: 'policy-1' },
        });

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Post-execution verification failed: effect mismatch',
          expect.objectContaining({
            policyId: 'policy-1',
            expected: 'DENY',
            actual: 'ALLOW',
          }),
        );
      });

      test('should execute admin_update_policy', async () => {
        const mockPolicy = { id: 'policy-1', slug: 'updated', effect: 'DENY' };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);
        // Mock the verification findUnique call
        mockPrisma.policy.findUnique.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            slug: 'updated',
            effect: 'DENY',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
        expect(mockPrisma.policy.update).toHaveBeenCalledWith({
          where: { id: 'policy-1', organizationId: 'org-1' },
          data: {
            slug: 'updated',
            effect: 'DENY',
          },
        });
      });

      test('should throw error when policy not found after update', async () => {
        const mockPolicy = { id: 'policy-1', slug: 'updated', effect: 'DENY' };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);
        // Verification fails - policy not found
        mockPrisma.policy.findUnique.mockResolvedValue(null);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            slug: 'updated',
            effect: 'DENY',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: Policy policy-1 was not found after update',
        );
      });

      test('should throw error when matchers mismatch after update', async () => {
        const mockUpdatedPolicy = {
          id: 'policy-1',
          slug: 'test',
          effect: 'ALLOW',
          matchers: ['role:Admin'],
          toolPatterns: ['*::*'],
        };
        mockPrisma.policy.update.mockResolvedValue(mockUpdatedPolicy);
        // Verification shows matchers were stored incorrectly
        mockPrisma.policy.findUnique.mockResolvedValue({
          ...mockUpdatedPolicy,
          matchers: ['role:User'], // Wrong matchers stored
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            matchers: ['role:Admin'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: matchers were not updated correctly',
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Post-execution verification failed: matchers mismatch on update',
          expect.objectContaining({
            policyId: 'policy-1',
            expected: ['role:Admin'],
            actual: ['role:User'],
          }),
        );
      });

      test('should throw error when effect mismatch after update', async () => {
        const mockUpdatedPolicy = {
          id: 'policy-1',
          slug: 'test',
          effect: 'DENY',
          matchers: ['*'],
          toolPatterns: ['*::*'],
        };
        mockPrisma.policy.update.mockResolvedValue(mockUpdatedPolicy);
        // Verification shows effect was stored incorrectly
        mockPrisma.policy.findUnique.mockResolvedValue({
          ...mockUpdatedPolicy,
          effect: 'ALLOW', // Wrong effect stored
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            effect: 'DENY',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: effect was not updated correctly',
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Post-execution verification failed: effect mismatch on update',
          expect.objectContaining({
            policyId: 'policy-1',
            expected: 'DENY',
            actual: 'ALLOW',
          }),
        );
      });

      test('should throw error when toolPatterns mismatch after update', async () => {
        // Set up mock server for tool pattern validation
        mockPrisma.mcpServer.findMany.mockResolvedValue([
          {
            id: 'server-1',
            name: 'GitHub MCP',
            url: 'https://github.com/mcp',
            tools: [{ name: 'createPR' }],
          },
        ]);

        const mockUpdatedPolicy = {
          id: 'policy-1',
          slug: 'test',
          effect: 'ALLOW',
          matchers: ['*'],
          toolPatterns: ['github.com::createPR'],
        };
        mockPrisma.policy.update.mockResolvedValue(mockUpdatedPolicy);
        // Verification shows toolPatterns were stored incorrectly
        mockPrisma.policy.findUnique.mockResolvedValue({
          ...mockUpdatedPolicy,
          toolPatterns: ['github.com::wrongTool'], // Wrong toolPatterns stored
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            toolPatterns: ['github.com::createPR'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Post-execution verification failed: toolPatterns were not updated correctly',
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Post-execution verification failed: toolPatterns mismatch on update',
          expect.objectContaining({
            policyId: 'policy-1',
            expected: ['github.com::createPR'],
            actual: ['github.com::wrongTool'],
          }),
        );
      });

      test('should update policy with description', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test',
          description: 'Updated description',
        };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);
        mockPrisma.policy.findUnique.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            description: 'Updated description',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
        expect(mockPrisma.policy.update).toHaveBeenCalledWith({
          where: { id: 'policy-1', organizationId: 'org-1' },
          data: {
            description: 'Updated description',
          },
        });
      });

      test('should update policy with conditions', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test',
          conditions: [{ field: 'time.hourOfDay', operator: 'between', value: [9, 17] }],
        };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);
        mockPrisma.policy.findUnique
          // First call for fetching existing toolPatterns
          .mockResolvedValueOnce({ toolPatterns: ['*::*'] })
          // Second call for verification
          .mockResolvedValueOnce(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            conditions: [{ field: 'time.hourOfDay', operator: 'between', value: [9, 17] }],
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
        expect(mockPrisma.policy.update).toHaveBeenCalledWith({
          where: { id: 'policy-1', organizationId: 'org-1' },
          data: {
            conditions: [{ field: 'time.hourOfDay', operator: 'between', value: [9, 17] }],
          },
        });
      });

      test('should update policy with conditions when no existing policy found', async () => {
        const mockPolicy = {
          id: 'policy-1',
          slug: 'test',
          conditions: [{ field: 'time.hourOfDay', operator: 'between', value: [9, 17] }],
        };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);
        mockPrisma.policy.findUnique
          // First call for fetching existing toolPatterns returns null
          .mockResolvedValueOnce(null)
          // Second call for verification
          .mockResolvedValueOnce(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            conditions: [{ field: 'time.hourOfDay', operator: 'between', value: [9, 17] }],
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
      });

      test('should throw error for invalid matchers format on update', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            matchers: ['invalid-matcher-format'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid matcher format',
        );
      });

      test('should throw error for invalid tool patterns on update', async () => {
        // No servers registered, so any specific server pattern will fail
        mockPrisma.mcpServer.findMany.mockResolvedValue([]);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            toolPatterns: ['unknown.server.com::someTool'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Unknown server "unknown.server.com"',
        );
      });

      test('should throw error for invalid condition fields on update', async () => {
        // Set up mock server for condition validation
        mockPrisma.mcpServer.findMany.mockResolvedValue([
          {
            id: 'server-1',
            name: 'Test Server',
            url: 'https://test.example.com/mcp',
            tools: [
              {
                name: 'testTool',
                inputSchema: {
                  type: 'object',
                  properties: {
                    validField: { type: 'string' },
                  },
                },
              },
            ],
          },
        ]);

        // First call returns existing toolPatterns
        mockPrisma.policy.findUnique.mockResolvedValueOnce({
          toolPatterns: ['test.example.com::testTool'],
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: 'policy-1',
            conditions: [{ field: 'params.nonexistentField', operator: 'equals', value: 'test' }],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid condition field',
        );
      });

      test('should throw error for invalid condition fields when creating policy', async () => {
        // Set up mock server for condition validation
        mockPrisma.mcpServer.findMany.mockResolvedValue([
          {
            id: 'server-1',
            name: 'Test Server',
            url: 'https://test.example.com/mcp',
            tools: [
              {
                name: 'testTool',
                inputSchema: {
                  type: 'object',
                  properties: {
                    validField: { type: 'string' },
                  },
                },
              },
            ],
          },
        ]);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_policy',
          toolInput: {
            slug: 'test-policy',
            effect: 'ALLOW',
            matchers: ['*'],
            toolPatterns: ['test.example.com::testTool'],
            description: 'Test policy',
            conditions: [{ field: 'params.nonexistentField', operator: 'equals', value: 'test' }],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid condition field',
        );
      });

      test('should execute admin_delete_policy (soft delete)', async () => {
        const mockPolicy = { id: 'policy-1', deletedAt: new Date() };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_policy',
          toolInput: { id: 'policy-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
        expect(mockPrisma.policy.update).toHaveBeenCalledWith({
          where: { id: 'policy-1', organizationId: 'org-1' },
          data: {
            deletedAt: expect.any(Date),
            deletedBy: 'admin-1',
          },
        });
      });

      test('should execute admin_enable_policy', async () => {
        const mockPolicy = { id: 'policy-1', enabled: true };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_enable_policy',
          toolInput: { id: 'policy-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
        expect(mockPrisma.policy.update).toHaveBeenCalledWith({
          where: { id: 'policy-1', organizationId: 'org-1' },
          data: { enabled: true },
        });
      });

      test('should execute admin_disable_policy', async () => {
        const mockPolicy = { id: 'policy-1', enabled: false };
        mockPrisma.policy.update.mockResolvedValue(mockPolicy);

        const confirmation = createMockConfirmation({
          toolName: 'admin_disable_policy',
          toolInput: { id: 'policy-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockPolicy);
        expect(mockPrisma.policy.update).toHaveBeenCalledWith({
          where: { id: 'policy-1', organizationId: 'org-1' },
          data: { enabled: false },
        });
      });

      test('should throw error when id is missing for admin_delete_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_policy',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_delete_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_policy',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Policy id is required');
      });

      test('should throw error when id is missing for admin_enable_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_enable_policy',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_enable_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_enable_policy',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Policy id is required');
      });

      test('should throw error when id is missing for admin_disable_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_disable_policy',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_disable_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_disable_policy',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Policy id is required');
      });

      test('should throw error when id is missing for admin_update_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            slug: 'new-slug',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_update_policy', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_policy',
          toolInput: {
            id: '',
            slug: 'new-slug',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Policy id is required');
      });
    });

    describe('user executors', () => {
      test('should execute admin_create_user without roles', async () => {
        const mockUser = { id: 'user-1', email: 'new@example.com' };
        mockPrisma.user.create.mockResolvedValue(mockUser);
        mockPrisma.user.findUnique.mockResolvedValue({
          ...mockUser,
          userRoles: [],
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_user',
          toolInput: { email: 'new@example.com' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual({ ...mockUser, userRoles: [] });
        expect(mockPrisma.user.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            email: 'new@example.com',
          },
        });
        expect(mockPrisma.userRole.createMany).not.toHaveBeenCalled();
      });

      test('should throw error when email is missing for admin_create_user', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_user',
          toolInput: {
            roleIds: ['role-1'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when email is invalid for admin_create_user', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_user',
          toolInput: {
            email: 'not-an-email',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Invalid email format');
      });

      test('should execute admin_create_user with roles', async () => {
        const mockUser = { id: 'user-1', email: 'new@example.com' };
        mockPrisma.user.create.mockResolvedValue(mockUser);
        mockPrisma.userRole.createMany.mockResolvedValue({ count: 2 });
        mockPrisma.user.findUnique.mockResolvedValue({
          ...mockUser,
          userRoles: [
            { role: { id: 'role-1', name: 'Admin' } },
            { role: { id: 'role-2', name: 'Developer' } },
          ],
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_user',
          toolInput: {
            email: 'new@example.com',
            roleIds: ['role-1', 'role-2'],
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(mockPrisma.userRole.createMany).toHaveBeenCalledWith({
          data: [
            { userId: 'user-1', roleId: 'role-1' },
            { userId: 'user-1', roleId: 'role-2' },
          ],
        });
        expect((result as { userRoles?: unknown[] })?.userRoles).toHaveLength(2);
      });

      test('should execute admin_update_user with email', async () => {
        const mockUser = { id: 'user-1', email: 'updated@example.com' };
        mockPrisma.user.update.mockResolvedValue(mockUser);
        mockPrisma.user.findUnique.mockResolvedValue({
          ...mockUser,
          userRoles: [],
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_user',
          toolInput: {
            id: 'user-1',
            email: 'updated@example.com',
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1', organizationId: 'org-1' },
          data: { email: 'updated@example.com' },
        });
      });

      test('should execute admin_update_user with role changes', async () => {
        const mockUser = { id: 'user-1', email: 'user@example.com' };
        mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 1 });
        mockPrisma.userRole.createMany.mockResolvedValue({ count: 2 });
        mockPrisma.user.findUnique.mockResolvedValue({
          ...mockUser,
          userRoles: [{ role: { id: 'role-2' } }, { role: { id: 'role-3' } }],
        });

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_user',
          toolInput: {
            id: 'user-1',
            roleIds: ['role-2', 'role-3'],
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
        });
        expect(mockPrisma.userRole.createMany).toHaveBeenCalledWith({
          data: [
            { userId: 'user-1', roleId: 'role-2' },
            { userId: 'user-1', roleId: 'role-3' },
          ],
        });
      });

      test('should execute admin_delete_user (soft delete)', async () => {
        const mockUser = { id: 'user-1', deletedAt: new Date() };
        mockPrisma.user.update.mockResolvedValue(mockUser);

        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_user',
          toolInput: { id: 'user-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockUser);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1', organizationId: 'org-1' },
          data: {
            deletedAt: expect.any(Date),
            deletedBy: 'admin-1',
          },
        });
      });

      test('should execute admin_refresh_token', async () => {
        const mockUser = {
          id: 'user-1',
          email: 'user@example.com',
          accessToken: 'new-token-uuid',
        };
        mockPrisma.user.update.mockResolvedValue(mockUser);

        const confirmation = createMockConfirmation({
          toolName: 'admin_refresh_token',
          toolInput: { id: 'user-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockUser);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1', organizationId: 'org-1' },
          data: { accessToken: expect.any(String) },
          select: { id: true, email: true, accessToken: true },
        });
      });

      test('should execute admin_revoke_token', async () => {
        const mockUser = { id: 'user-1', email: 'user@example.com' };
        mockPrisma.user.update.mockResolvedValue(mockUser);

        const confirmation = createMockConfirmation({
          toolName: 'admin_revoke_token',
          toolInput: { id: 'user-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockUser);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1', organizationId: 'org-1' },
          data: { accessToken: expect.any(String) },
          select: { id: true, email: true },
        });
      });

      test('should throw error when id is missing for admin_update_user', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_user',
          toolInput: {
            email: 'new@example.com',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_update_user', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_user',
          toolInput: {
            id: '',
            email: 'new@example.com',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('User id is required');
      });

      test('should throw error when email is invalid for admin_update_user', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_user',
          toolInput: {
            id: 'user-1',
            email: 'not-an-email',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Invalid email format');
      });

      test('should throw error when id is missing for admin_delete_user', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_user',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_delete_user', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_user',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('User id is required');
      });

      test('should throw error when id is missing for admin_refresh_token', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_refresh_token',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_refresh_token', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_refresh_token',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('User id is required');
      });

      test('should throw error when id is missing for admin_revoke_token', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_revoke_token',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_revoke_token', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_revoke_token',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('User id is required');
      });
    });

    describe('role executors', () => {
      test('should execute admin_create_role', async () => {
        const mockRole = { id: 'role-1', name: 'Developer', isAdmin: false };
        mockPrisma.role.create.mockResolvedValue(mockRole);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_role',
          toolInput: {
            name: 'Developer',
            description: 'Software developer role',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRole);
        expect(mockPrisma.role.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            name: 'Developer',
            description: 'Software developer role',
            isAdmin: false,
          },
        });
      });

      test('should execute admin_create_role with isAdmin flag', async () => {
        const mockRole = { id: 'role-1', name: 'Super Admin', isAdmin: true };
        mockPrisma.role.create.mockResolvedValue(mockRole);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_role',
          toolInput: {
            name: 'Super Admin',
            isAdmin: true,
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockPrisma.role.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            isAdmin: true,
          }),
        });
      });

      test('should throw error when name is missing for admin_create_role', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_role',
          toolInput: {
            description: 'Some description',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when name is empty for admin_create_role', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_role',
          toolInput: {
            name: '',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Role name is required');
      });

      test('should execute admin_update_role', async () => {
        const mockRole = { id: 'role-1', name: 'Updated Role' };
        mockPrisma.role.update.mockResolvedValue(mockRole);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_role',
          toolInput: {
            id: 'role-1',
            name: 'Updated Role',
            description: 'Updated description',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRole);
        expect(mockPrisma.role.update).toHaveBeenCalledWith({
          where: { id: 'role-1', organizationId: 'org-1' },
          data: {
            name: 'Updated Role',
            description: 'Updated description',
          },
        });
      });

      test('should update role isAdmin flag', async () => {
        const mockRole = { id: 'role-1', isAdmin: true };
        mockPrisma.role.update.mockResolvedValue(mockRole);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_role',
          toolInput: {
            id: 'role-1',
            isAdmin: true,
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRole);
        expect(mockPrisma.role.update).toHaveBeenCalledWith({
          where: { id: 'role-1', organizationId: 'org-1' },
          data: {
            isAdmin: true,
          },
        });
      });

      test('should throw error when id is missing for admin_update_role', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_role',
          toolInput: {
            name: 'Updated Name',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_update_role', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_role',
          toolInput: {
            id: '',
            name: 'Updated Name',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Role ID is required');
      });

      test('should execute admin_delete_role (soft delete)', async () => {
        const mockRole = { id: 'role-1', deletedAt: new Date() };
        mockPrisma.role.update.mockResolvedValue(mockRole);

        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_role',
          toolInput: { id: 'role-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRole);
        expect(mockPrisma.role.update).toHaveBeenCalledWith({
          where: { id: 'role-1', organizationId: 'org-1' },
          data: {
            deletedAt: expect.any(Date),
            deletedBy: 'admin-1',
          },
        });
      });

      test('should throw error when id is missing for admin_delete_role', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_role',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_delete_role', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_role',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Role ID is required');
      });
    });

    describe('MCP server executors', () => {
      test('should execute admin_create_mcp_server', async () => {
        const mockServer = {
          id: 'server-1',
          name: 'GitHub MCP',
          url: 'https://github.com/mcp',
        };
        mockPrisma.mcpServer.create.mockResolvedValue(mockServer);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_mcp_server',
          toolInput: {
            name: 'GitHub MCP',
            url: 'https://github.com/mcp',
            authType: 'API_KEY',
            trusted: true,
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockServer);
        expect(mockPrisma.mcpServer.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            workspaceId: null,
            name: 'GitHub MCP',
            url: 'https://github.com/mcp',
            authType: 'API_KEY',
            trusted: true,
          },
        });
      });

      test('should use default values for admin_create_mcp_server', async () => {
        const mockServer = { id: 'server-1' };
        mockPrisma.mcpServer.create.mockResolvedValue(mockServer);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_mcp_server',
          toolInput: {
            name: 'Test Server',
            url: 'https://test.com',
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockPrisma.mcpServer.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            authType: 'NONE',
            trusted: false,
          }),
        });
      });

      test('should execute admin_update_mcp_server', async () => {
        const mockServer = { id: 'server-1', name: 'Updated Server' };
        mockPrisma.mcpServer.update.mockResolvedValue(mockServer);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_mcp_server',
          toolInput: {
            id: 'server-1',
            name: 'Updated Server',
            trusted: true,
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockServer);
        expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith({
          where: { id: 'server-1', organizationId: 'org-1' },
          data: {
            name: 'Updated Server',
            trusted: true,
          },
        });
      });

      test('should execute admin_delete_mcp_server (soft delete)', async () => {
        const mockServer = { id: 'server-1', deletedAt: new Date() };
        mockPrisma.mcpServer.update.mockResolvedValue(mockServer);

        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_mcp_server',
          toolInput: { id: 'server-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockServer);
        expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith({
          where: { id: 'server-1', organizationId: 'org-1' },
          data: {
            deletedAt: expect.any(Date),
            deletedBy: 'admin-1',
          },
        });
      });

      test('should execute admin_set_org_api_key', async () => {
        const mockServer = { id: 'server-1', name: 'Server' };
        mockPrisma.mcpServer.update.mockResolvedValue(mockServer);

        const confirmation = createMockConfirmation({
          toolName: 'admin_set_org_api_key',
          toolInput: {
            serverId: 'server-1',
            apiKey: 'secret-api-key',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockServer);
        expect(mockPrisma.mcpServer.update).toHaveBeenCalledWith({
          where: { id: 'server-1', organizationId: 'org-1' },
          data: { apiKey: expect.any(String) }, // API key is encrypted before storage
          select: { id: true, name: true },
        });
        // Verify the API key was encrypted (not stored as plaintext)
        const call = mockPrisma.mcpServer.update.mock.calls[0][0] as {
          data: { apiKey: string };
        };
        expect(call.data.apiKey).not.toBe('secret-api-key');
      });

      test('should throw error when name is missing for admin_create_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_mcp_server',
          toolInput: {
            url: 'https://test.com',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when name is empty for admin_create_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_mcp_server',
          toolInput: {
            name: '',
            url: 'https://test.com',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'MCP server name is required',
        );
      });

      test('should throw error when url is missing for admin_create_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_mcp_server',
          toolInput: {
            name: 'Test Server',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when url is invalid for admin_create_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_mcp_server',
          toolInput: {
            name: 'Test Server',
            url: 'not-a-valid-url',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid MCP server URL format',
        );
      });

      test('should throw error when id is missing for admin_update_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_mcp_server',
          toolInput: {
            name: 'Updated Name',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_update_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_mcp_server',
          toolInput: {
            id: '',
            name: 'Updated Name',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'MCP server ID is required',
        );
      });

      test('should throw error when url is invalid for admin_update_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_mcp_server',
          toolInput: {
            id: 'server-1',
            url: 'not-a-valid-url',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid MCP server URL format',
        );
      });

      test('should throw error when id is missing for admin_delete_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_mcp_server',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_delete_mcp_server', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_mcp_server',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'MCP server ID is required',
        );
      });

      test('should throw error when serverId is missing for admin_set_org_api_key', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_set_org_api_key',
          toolInput: {
            apiKey: 'secret-key',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when serverId is empty for admin_set_org_api_key', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_set_org_api_key',
          toolInput: {
            serverId: '',
            apiKey: 'secret-key',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Server ID is required');
      });

      test('should throw error when apiKey is missing for admin_set_org_api_key', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_set_org_api_key',
          toolInput: {
            serverId: 'server-1',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when apiKey is empty for admin_set_org_api_key', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_set_org_api_key',
          toolInput: {
            serverId: 'server-1',
            apiKey: '',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('API key is required');
      });
    });

    describe('agent executors', () => {
      test('should execute admin_create_agent', async () => {
        const mockAgent = { id: 'agent-1', name: 'Claude Agent' };
        mockPrisma.agent.create.mockResolvedValue(mockAgent);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_agent',
          toolInput: {
            name: 'Claude Agent',
            protocolType: 'A2A',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockAgent);
        expect(mockPrisma.agent.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            workspaceId: null,
            name: 'Claude Agent',
            protocolType: 'A2A',
          },
        });
      });

      test('should use default protocolType for admin_create_agent', async () => {
        const mockAgent = { id: 'agent-1' };
        mockPrisma.agent.create.mockResolvedValue(mockAgent);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_agent',
          toolInput: { name: 'Test Agent' },
        });

        await executeConfirmedAction(confirmation);

        expect(mockPrisma.agent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            protocolType: 'MCP',
          }),
        });
      });

      test('should execute admin_delete_agent (soft delete)', async () => {
        const mockAgent = { id: 'agent-1', deletedAt: new Date() };
        mockPrisma.agent.update.mockResolvedValue(mockAgent);

        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_agent',
          toolInput: { id: 'agent-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockAgent);
        expect(mockPrisma.agent.update).toHaveBeenCalledWith({
          where: { id: 'agent-1', organizationId: 'org-1' },
          data: {
            deletedAt: expect.any(Date),
            deletedBy: 'admin-1',
          },
        });
      });

      test('should create agent with publicKeyUrl', async () => {
        const mockAgent = {
          id: 'agent-1',
          name: 'A2A Agent',
          publicKeyUrl: 'https://example.com/.well-known/jwks.json',
        };
        mockPrisma.agent.create.mockResolvedValue(mockAgent);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_agent',
          toolInput: {
            name: 'A2A Agent',
            protocolType: 'A2A',
            publicKeyUrl: 'https://example.com/.well-known/jwks.json',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockAgent);
        expect(mockPrisma.agent.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            workspaceId: null,
            name: 'A2A Agent',
            protocolType: 'A2A',
            publicKeyUrl: 'https://example.com/.well-known/jwks.json',
          },
        });
      });

      test('should throw error when name is missing for admin_create_agent', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_agent',
          toolInput: {
            protocolType: 'MCP',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when name is empty for admin_create_agent', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_agent',
          toolInput: {
            name: '',
            protocolType: 'MCP',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Agent name is required',
        );
      });

      test('should throw error when publicKeyUrl is invalid for admin_create_agent', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_agent',
          toolInput: {
            name: 'Test Agent',
            publicKeyUrl: 'not-a-valid-url',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid public key URL format',
        );
      });

      test('should throw error when id is missing for admin_delete_agent', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_agent',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_delete_agent', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_agent',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow('Agent ID is required');
      });
    });

    describe('sensitive flag executors', () => {
      test('should execute admin_create_sensitive_flag', async () => {
        const mockFlag = { id: 'flag-1', toolPattern: 'github.com::delete_repo' };
        mockPrisma.sensitiveToolFlag.create.mockResolvedValue(mockFlag);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_sensitive_flag',
          toolInput: {
            toolPattern: 'github.com::delete_repo',
            behaviors: ['RATE_LIMIT', 'ALERT'],
            description: 'Rate limit delete operations',
            rateLimitConfig: { maxPerSession: 5, windowMinutes: 60 },
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockFlag);
        expect(mockPrisma.sensitiveToolFlag.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            workspaceId: null,
            toolPattern: 'github.com::delete_repo',
            behaviors: ['RATE_LIMIT', 'ALERT'],
            description: 'Rate limit delete operations',
            rateLimitConfig: { maxPerSession: 5, windowMinutes: 60 },
            approvalConfig: undefined,
            alertConfig: undefined,
            createdBy: 'admin-1',
          },
        });
      });

      test('should execute admin_update_sensitive_flag', async () => {
        const mockFlag = { id: 'flag-1', enabled: false };
        mockPrisma.sensitiveToolFlag.update.mockResolvedValue(mockFlag);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_sensitive_flag',
          toolInput: {
            id: 'flag-1',
            enabled: false,
            behaviors: ['REQUIRE_APPROVAL'],
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockFlag);
        expect(mockPrisma.sensitiveToolFlag.update).toHaveBeenCalledWith({
          where: { id: 'flag-1', organizationId: 'org-1' },
          data: {
            behaviors: ['REQUIRE_APPROVAL'],
            enabled: false,
          },
        });
      });

      test('should execute admin_delete_sensitive_flag (hard delete)', async () => {
        const mockFlag = { id: 'flag-1' };
        mockPrisma.sensitiveToolFlag.delete.mockResolvedValue(mockFlag);

        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_sensitive_flag',
          toolInput: { id: 'flag-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockFlag);
        expect(mockPrisma.sensitiveToolFlag.delete).toHaveBeenCalledWith({
          where: { id: 'flag-1', organizationId: 'org-1' },
        });
      });

      test('should execute admin_approve_sensitive', async () => {
        const mockRequest = { id: 'request-1', status: 'APPROVED' };
        mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.sensitiveFlagApprovalRequest.findUnique.mockResolvedValue(mockRequest);

        const confirmation = createMockConfirmation({
          toolName: 'admin_approve_sensitive',
          toolInput: { id: 'request-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRequest);
        expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'request-1', organizationId: 'org-1', status: 'PENDING' },
          data: {
            status: 'APPROVED',
            approvedBy: 'admin-1',
            approvedAt: expect.any(Date),
          },
        });
        expect(mockPrisma.sensitiveFlagApprovalRequest.findUnique).toHaveBeenCalledWith({
          where: { id: 'request-1' },
        });
      });

      test('should execute admin_deny_sensitive with reason', async () => {
        const mockRequest = { id: 'request-1', status: 'DENIED' };
        mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.sensitiveFlagApprovalRequest.findUnique.mockResolvedValue(mockRequest);

        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_sensitive',
          toolInput: {
            id: 'request-1',
            reason: 'Not authorized for this operation',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRequest);
        expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'request-1', organizationId: 'org-1', status: 'PENDING' },
          data: {
            status: 'DENIED',
            approvedBy: 'admin-1',
            approvedAt: expect.any(Date),
            deniedReason: 'Not authorized for this operation',
          },
        });
        expect(mockPrisma.sensitiveFlagApprovalRequest.findUnique).toHaveBeenCalledWith({
          where: { id: 'request-1' },
        });
      });

      test('should execute admin_deny_sensitive without reason', async () => {
        const mockRequest = { id: 'request-1', status: 'DENIED' };
        mockPrisma.sensitiveFlagApprovalRequest.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.sensitiveFlagApprovalRequest.findUnique.mockResolvedValue(mockRequest);

        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_sensitive',
          toolInput: {
            id: 'request-1',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRequest);
        expect(mockPrisma.sensitiveFlagApprovalRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'request-1', organizationId: 'org-1', status: 'PENDING' },
          data: {
            status: 'DENIED',
            approvedBy: 'admin-1',
            approvedAt: expect.any(Date),
            deniedReason: undefined,
          },
        });
        expect(mockPrisma.sensitiveFlagApprovalRequest.findUnique).toHaveBeenCalledWith({
          where: { id: 'request-1' },
        });
      });

      test('should throw error when toolPattern is missing for admin_create_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_sensitive_flag',
          toolInput: {
            behaviors: ['RATE_LIMIT'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when toolPattern is empty for admin_create_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_sensitive_flag',
          toolInput: {
            toolPattern: '',
            behaviors: ['RATE_LIMIT'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Tool pattern is required',
        );
      });

      test('should throw error when toolPattern is invalid for admin_create_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_sensitive_flag',
          toolInput: {
            toolPattern: 'invalid-pattern',
            behaviors: ['RATE_LIMIT'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid tool pattern format',
        );
      });

      test('should throw error when behaviors is missing for admin_create_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_sensitive_flag',
          toolInput: {
            toolPattern: 'server::tool',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when behaviors is empty for admin_create_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_sensitive_flag',
          toolInput: {
            toolPattern: 'server::tool',
            behaviors: [],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'At least one behavior is required',
        );
      });

      test('should throw error when id is missing for admin_update_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_sensitive_flag',
          toolInput: {
            enabled: false,
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_update_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_sensitive_flag',
          toolInput: {
            id: '',
            enabled: false,
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Sensitive flag ID is required',
        );
      });

      test('should throw error when id is missing for admin_delete_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_sensitive_flag',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_delete_sensitive_flag', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_sensitive_flag',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Sensitive flag ID is required',
        );
      });

      test('should throw error when id is missing for admin_approve_sensitive', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_approve_sensitive',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_approve_sensitive', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_approve_sensitive',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Approval request ID is required',
        );
      });

      test('should throw error when id is missing for admin_deny_sensitive', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_sensitive',
          toolInput: {
            reason: 'Some reason',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_deny_sensitive', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_sensitive',
          toolInput: {
            id: '',
            reason: 'Some reason',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Approval request ID is required',
        );
      });
    });

    describe('webhook executors', () => {
      test('should execute admin_create_webhook', async () => {
        const mockWebhook = { id: 'webhook-1', name: 'Slack Notifier' };
        mockPrisma.webhookEndpoint.create.mockResolvedValue(mockWebhook);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            name: 'Slack Notifier',
            type: 'SLACK',
            url: 'https://hooks.slack.com/...',
            events: ['TOOL_INVOCATION_ALLOWED', 'TOOL_INVOCATION_DENIED'],
            config: { channel: '#alerts' },
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockWebhook);
        expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            name: 'Slack Notifier',
            type: 'SLACK',
            url: 'https://hooks.slack.com/...',
            events: ['TOOL_INVOCATION_ALLOWED', 'TOOL_INVOCATION_DENIED'],
            secret: undefined,
            config: { channel: '#alerts' },
            createdBy: 'admin-1',
          },
        });
      });

      test('should use default type for admin_create_webhook', async () => {
        const mockWebhook = { id: 'webhook-1' };
        mockPrisma.webhookEndpoint.create.mockResolvedValue(mockWebhook);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            name: 'Custom Webhook',
            events: ['TOOL_INVOCATION_ALLOWED'],
          },
        });

        await executeConfirmedAction(confirmation);

        expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            type: 'CUSTOM',
          }),
        });
      });

      test('should execute admin_update_webhook', async () => {
        const mockWebhook = { id: 'webhook-1', enabled: false };
        mockPrisma.webhookEndpoint.update.mockResolvedValue(mockWebhook);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_webhook',
          toolInput: {
            id: 'webhook-1',
            enabled: false,
            events: ['SENSITIVE_TOOL_INVOKED'],
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockWebhook);
        expect(mockPrisma.webhookEndpoint.update).toHaveBeenCalledWith({
          where: { id: 'webhook-1', organizationId: 'org-1' },
          data: {
            events: ['SENSITIVE_TOOL_INVOKED'],
            enabled: false,
          },
        });
      });

      test('should execute admin_delete_webhook (hard delete)', async () => {
        const mockWebhook = { id: 'webhook-1' };
        mockPrisma.webhookEndpoint.delete.mockResolvedValue(mockWebhook);

        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_webhook',
          toolInput: { id: 'webhook-1' },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockWebhook);
        expect(mockPrisma.webhookEndpoint.delete).toHaveBeenCalledWith({
          where: { id: 'webhook-1', organizationId: 'org-1' },
        });
      });

      test('should create webhook with secret', async () => {
        const mockWebhook = { id: 'webhook-1', name: 'Secure Webhook' };
        mockPrisma.webhookEndpoint.create.mockResolvedValue(mockWebhook);

        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            name: 'Secure Webhook',
            url: 'https://example.com/webhook',
            events: ['TOOL_INVOCATION_ALLOWED'],
            secret: 'my-secret-key',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockWebhook);
        expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
          data: {
            organizationId: 'org-1',
            name: 'Secure Webhook',
            type: 'CUSTOM',
            url: 'https://example.com/webhook',
            events: ['TOOL_INVOCATION_ALLOWED'],
            secret: 'my-secret-key',
            config: undefined,
            createdBy: 'admin-1',
          },
        });
      });

      test('should throw error when name is missing for admin_create_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            events: ['TOOL_INVOCATION_ALLOWED'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when name is empty for admin_create_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            name: '',
            events: ['TOOL_INVOCATION_ALLOWED'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Webhook name is required',
        );
      });

      test('should throw error when url is invalid for admin_create_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            name: 'Test Webhook',
            url: 'not-a-valid-url',
            events: ['TOOL_INVOCATION_ALLOWED'],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid webhook URL format',
        );
      });

      test('should throw error when events is missing for admin_create_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            name: 'Test Webhook',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when events is empty for admin_create_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_create_webhook',
          toolInput: {
            name: 'Test Webhook',
            events: [],
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'At least one event is required',
        );
      });

      test('should throw error when id is missing for admin_update_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_webhook',
          toolInput: {
            name: 'Updated Name',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_update_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_webhook',
          toolInput: {
            id: '',
            name: 'Updated Name',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Webhook ID is required',
        );
      });

      test('should throw error when url is invalid for admin_update_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_update_webhook',
          toolInput: {
            id: 'webhook-1',
            url: 'not-a-valid-url',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Invalid webhook URL format',
        );
      });

      test('should throw error when id is missing for admin_delete_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_webhook',
          toolInput: {},
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_delete_webhook', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_delete_webhook',
          toolInput: { id: '' },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Webhook ID is required',
        );
      });

      test('should update webhook with config', async () => {
        const mockWebhook = { id: 'webhook-1', config: { channel: '#new-alerts' } };
        mockPrisma.webhookEndpoint.update.mockResolvedValue(mockWebhook);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_webhook',
          toolInput: {
            id: 'webhook-1',
            config: { channel: '#new-alerts' },
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockWebhook);
        expect(mockPrisma.webhookEndpoint.update).toHaveBeenCalledWith({
          where: { id: 'webhook-1', organizationId: 'org-1' },
          data: {
            config: { channel: '#new-alerts' },
          },
        });
      });

      test('should update webhook with name and url', async () => {
        const mockWebhook = { id: 'webhook-1', name: 'New Name' };
        mockPrisma.webhookEndpoint.update.mockResolvedValue(mockWebhook);

        const confirmation = createMockConfirmation({
          toolName: 'admin_update_webhook',
          toolInput: {
            id: 'webhook-1',
            name: 'New Name',
            url: 'https://new.example.com/webhook',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockWebhook);
        expect(mockPrisma.webhookEndpoint.update).toHaveBeenCalledWith({
          where: { id: 'webhook-1', organizationId: 'org-1' },
          data: {
            name: 'New Name',
            url: 'https://new.example.com/webhook',
          },
        });
      });
    });

    describe('permission request executors', () => {
      test('should execute admin_approve_request', async () => {
        const mockRequest = { id: 'perm-1', status: 'APPROVED' };
        mockPrisma.permissionRequest.findFirst.mockResolvedValue({
          id: 'perm-1',
          workspaceId: null,
          status: 'PENDING',
        });
        mockPrisma.permissionRequest.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.permissionRequest.findUnique.mockResolvedValue(mockRequest);

        const confirmation = createMockConfirmation({
          toolName: 'admin_approve_request',
          toolInput: {
            id: 'perm-1',
            note: 'Approved for production use',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRequest);
        expect(mockPrisma.permissionRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'perm-1', user: { organizationId: 'org-1' }, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            reviewedBy: 'admin-1',
            reviewedAt: expect.any(Date),
            reviewNote: 'Approved for production use',
          },
        });
        expect(mockPrisma.permissionRequest.findUnique).toHaveBeenCalledWith({
          where: { id: 'perm-1' },
        });
      });

      test('should execute admin_approve_request without note', async () => {
        const mockRequest = { id: 'perm-1', status: 'APPROVED' };
        mockPrisma.permissionRequest.findFirst.mockResolvedValue({
          id: 'perm-1',
          workspaceId: null,
          status: 'PENDING',
        });
        mockPrisma.permissionRequest.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.permissionRequest.findUnique.mockResolvedValue(mockRequest);

        const confirmation = createMockConfirmation({
          toolName: 'admin_approve_request',
          toolInput: {
            id: 'perm-1',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRequest);
        expect(mockPrisma.permissionRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'perm-1', user: { organizationId: 'org-1' }, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            reviewedBy: 'admin-1',
            reviewedAt: expect.any(Date),
            reviewNote: undefined,
          },
        });
        expect(mockPrisma.permissionRequest.findUnique).toHaveBeenCalledWith({
          where: { id: 'perm-1' },
        });
      });

      test('should throw error when id is missing for admin_approve_request', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_approve_request',
          toolInput: {
            note: 'Some note',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_approve_request', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_approve_request',
          toolInput: {
            id: '',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Permission request ID is required',
        );
      });

      test('should execute admin_deny_request', async () => {
        const mockRequest = { id: 'perm-1', status: 'DENIED' };
        mockPrisma.permissionRequest.findFirst.mockResolvedValue({
          id: 'perm-1',
          workspaceId: null,
          status: 'PENDING',
        });
        mockPrisma.permissionRequest.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.permissionRequest.findUnique.mockResolvedValue(mockRequest);

        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_request',
          toolInput: {
            id: 'perm-1',
            note: 'Requires additional approval',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRequest);
        expect(mockPrisma.permissionRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'perm-1', user: { organizationId: 'org-1' }, status: 'PENDING' },
          data: {
            status: 'DENIED',
            reviewedBy: 'admin-1',
            reviewedAt: expect.any(Date),
            reviewNote: 'Requires additional approval',
          },
        });
        expect(mockPrisma.permissionRequest.findUnique).toHaveBeenCalledWith({
          where: { id: 'perm-1' },
        });
      });

      test('should execute admin_deny_request without note', async () => {
        const mockRequest = { id: 'perm-1', status: 'DENIED' };
        mockPrisma.permissionRequest.findFirst.mockResolvedValue({
          id: 'perm-1',
          workspaceId: null,
          status: 'PENDING',
        });
        mockPrisma.permissionRequest.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.permissionRequest.findUnique.mockResolvedValue(mockRequest);

        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_request',
          toolInput: {
            id: 'perm-1',
          },
        });

        const result = await executeConfirmedAction(confirmation);

        expect(result).toEqual(mockRequest);
        expect(mockPrisma.permissionRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'perm-1', user: { organizationId: 'org-1' }, status: 'PENDING' },
          data: {
            status: 'DENIED',
            reviewedBy: 'admin-1',
            reviewedAt: expect.any(Date),
            reviewNote: undefined,
          },
        });
        expect(mockPrisma.permissionRequest.findUnique).toHaveBeenCalledWith({
          where: { id: 'perm-1' },
        });
      });

      test('should throw error when id is missing for admin_deny_request', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_request',
          toolInput: {
            note: 'Some note',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(/Invalid input/);
      });

      test('should throw error when id is empty for admin_deny_request', async () => {
        const confirmation = createMockConfirmation({
          toolName: 'admin_deny_request',
          toolInput: {
            id: '',
          },
        });

        await expect(executeConfirmedAction(confirmation)).rejects.toThrow(
          'Permission request ID is required',
        );
      });
    });
  });
});
