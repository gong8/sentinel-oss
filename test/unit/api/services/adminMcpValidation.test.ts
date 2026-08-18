/**
 * Admin MCP Validation Service Unit Tests
 * Tests for pre-validation of admin MCP tool inputs before creating confirmations
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    policy: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    mcpServer: {
      findFirst: vi.fn(),
    },
    agent: {
      findFirst: vi.fn(),
    },
    webhookEndpoint: {
      findFirst: vi.fn(),
    },
    sensitiveToolFlag: {
      findFirst: vi.fn(),
    },
    sensitiveFlagApprovalRequest: {
      findFirst: vi.fn(),
    },
    permissionRequest: {
      findFirst: vi.fn(),
    },
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock modules
vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: mockLogger,
}));

import { validateAdminMcpInput } from '../../../../packages/api/src/services/adminMcpValidation.js';

// ============================================================================
// Test Constants
// ============================================================================

const TEST_ORG_ID = 'org-test-123';
const _OTHER_ORG_ID = 'org-other-456';

// ============================================================================
// Test Helpers
// ============================================================================

function resetMocks(): void {
  vi.clearAllMocks();
}

beforeEach(() => {
  resetMocks();
});

// ============================================================================
// Policy Validation Tests
// ============================================================================

describe('Admin MCP Validation Service', () => {
  describe('validateAdminMcpInput - Policy Validations', () => {
    describe('admin_create_policy', () => {
      test('should return valid for unique slug', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
          slug: 'new-policy',
          effect: 'ALLOW',
        });

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(mockPrisma.policy.findFirst).toHaveBeenCalledWith({
          where: {
            organizationId: TEST_ORG_ID,
            slug: 'new-policy',
            deletedAt: null,
          },
          select: { id: true },
        });
      });

      test('should return error when slug is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
          effect: 'ALLOW',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy slug is required');
        expect(mockPrisma.policy.findFirst).not.toHaveBeenCalled();
      });

      test('should return error when slug is not a string', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
          slug: 123,
          effect: 'ALLOW',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy slug is required');
      });

      test('should return error for duplicate slug', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue({ id: 'existing-policy-id' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
          slug: 'existing-policy',
          effect: 'ALLOW',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy with slug "existing-policy" already exists');
      });

      test('should scope uniqueness check to organization', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue(null);

        await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
          slug: 'test-policy',
        });

        expect(mockPrisma.policy.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: TEST_ORG_ID,
            }),
          }),
        );
      });
    });

    describe('admin_update_policy', () => {
      test('should return valid when policy exists and no slug conflict', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue({
          id: 'policy-123',
          slug: 'existing-slug',
        });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
          id: 'policy-123',
          description: 'Updated description',
        });

        expect(result.valid).toBe(true);
      });

      test('should return valid when using policyId parameter', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue({
          id: 'policy-123',
          slug: 'existing-slug',
        });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
          policyId: 'policy-123',
          description: 'Updated',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when policy ID is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
          description: 'Updated',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy ID is required');
      });

      test('should return error when policy not found', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
          id: 'nonexistent-policy',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy "nonexistent-policy" not found');
      });

      test('should return error for slug conflict on update', async () => {
        // First call: policy exists
        mockPrisma.policy.findFirst
          .mockResolvedValueOnce({
            id: 'policy-123',
            slug: 'original-slug',
          })
          // Second call: slug conflict
          .mockResolvedValueOnce({
            id: 'other-policy',
          });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
          id: 'policy-123',
          slug: 'conflicting-slug',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy with slug "conflicting-slug" already exists');
      });

      test('should allow updating to same slug', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue({
          id: 'policy-123',
          slug: 'same-slug',
        });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
          id: 'policy-123',
          slug: 'same-slug',
        });

        expect(result.valid).toBe(true);
        // Should only call findFirst once (for policy existence)
        expect(mockPrisma.policy.findFirst).toHaveBeenCalledTimes(1);
      });

      test('should return valid when new slug is unique', async () => {
        mockPrisma.policy.findFirst
          .mockResolvedValueOnce({
            id: 'policy-123',
            slug: 'old-slug',
          })
          .mockResolvedValueOnce(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
          id: 'policy-123',
          slug: 'new-unique-slug',
        });

        expect(result.valid).toBe(true);
      });
    });

    describe('admin_delete_policy', () => {
      test('should return valid when policy exists', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue({ id: 'policy-123' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_policy', {
          id: 'policy-123',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when policy ID is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_policy', {});

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy ID is required');
      });

      test('should return error when policy not found', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_policy', {
          policyId: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy "nonexistent" not found');
      });
    });

    describe('admin_enable_policy / admin_disable_policy', () => {
      test('should return valid when policy exists for enable', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue({ id: 'policy-123' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_enable_policy', {
          id: 'policy-123',
        });

        expect(result.valid).toBe(true);
      });

      test('should return valid when policy exists for disable', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue({ id: 'policy-123' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_disable_policy', {
          policyId: 'policy-123',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when policy not found for enable', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_enable_policy', {
          id: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy "nonexistent" not found');
      });

      test('should return error when policy not found for disable', async () => {
        mockPrisma.policy.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_disable_policy', {
          id: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Policy "nonexistent" not found');
      });
    });
  });

  // ============================================================================
  // User Validation Tests
  // ============================================================================

  describe('validateAdminMcpInput - User Validations', () => {
    describe('admin_create_user', () => {
      test('should return valid for unique email', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_user', {
          email: 'newuser@example.com',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
          where: {
            email: 'newuser@example.com',
            organizationId: TEST_ORG_ID,
            deletedAt: null,
          },
          select: { id: true },
        });
      });

      test('should return error when email is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_user', {
          name: 'John Doe',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('User email is required');
      });

      test('should return error when email is not a string', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_user', {
          email: 12345,
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('User email is required');
      });

      test('should return error for duplicate email', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_user', {
          email: 'existing@example.com',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('User with email "existing@example.com" already exists');
      });

      test('should scope email uniqueness to organization (CRIT-002 security fix)', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);

        await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_user', {
          email: 'test@example.com',
        });

        // Email uniqueness is org-scoped to prevent user enumeration across organizations
        expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
          where: {
            email: 'test@example.com',
            organizationId: TEST_ORG_ID,
            deletedAt: null,
          },
          select: { id: true },
        });
      });
    });

    describe('admin_update_user / admin_delete_user / admin_refresh_token / admin_revoke_token', () => {
      const userTools = [
        'admin_update_user',
        'admin_delete_user',
        'admin_refresh_token',
        'admin_revoke_token',
      ] as const;

      for (const toolName of userTools) {
        describe(toolName, () => {
          test('should return valid when user exists', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-123' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'user-123',
            });

            expect(result.valid).toBe(true);
          });

          test('should work with userId parameter', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-456' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              userId: 'user-456',
            });

            expect(result.valid).toBe(true);
          });

          test('should return error when user ID is missing', async () => {
            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {});

            expect(result.valid).toBe(false);
            expect(result.error).toBe('User ID is required');
          });

          test('should return error when user not found', async () => {
            mockPrisma.user.findFirst.mockResolvedValue(null);

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'nonexistent',
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('User "nonexistent" not found');
          });

          test('should scope user lookup to organization', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-123' });

            await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'user-123',
            });

            expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
              where: {
                id: 'user-123',
                organizationId: TEST_ORG_ID,
                deletedAt: null,
              },
              select: { id: true },
            });
          });
        });
      }
    });
  });

  // ============================================================================
  // Role Validation Tests
  // ============================================================================

  describe('validateAdminMcpInput - Role Validations', () => {
    describe('admin_create_role', () => {
      test('should return valid for unique name', async () => {
        mockPrisma.role.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_role', {
          name: 'NewRole',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.role.findFirst).toHaveBeenCalledWith({
          where: {
            organizationId: TEST_ORG_ID,
            name: 'NewRole',
            deletedAt: null,
          },
          select: { id: true },
        });
      });

      test('should return error when name is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_role', {
          description: 'A role without a name',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Role name is required');
      });

      test('should return error for duplicate name', async () => {
        mockPrisma.role.findFirst.mockResolvedValue({ id: 'existing-role' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_role', {
          name: 'ExistingRole',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Role with name "ExistingRole" already exists');
      });
    });

    describe('admin_update_role', () => {
      test('should return valid when role exists and no name conflict', async () => {
        mockPrisma.role.findFirst.mockResolvedValue({
          id: 'role-123',
          name: 'OriginalName',
        });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_role', {
          id: 'role-123',
          description: 'Updated description',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when role ID is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_role', {
          name: 'NewName',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Role ID is required');
      });

      test('should return error when role not found', async () => {
        mockPrisma.role.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_role', {
          roleId: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Role "nonexistent" not found');
      });

      test('should return error for name conflict on update', async () => {
        mockPrisma.role.findFirst
          .mockResolvedValueOnce({
            id: 'role-123',
            name: 'OriginalName',
          })
          .mockResolvedValueOnce({
            id: 'other-role',
          });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_role', {
          id: 'role-123',
          name: 'ConflictingName',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Role with name "ConflictingName" already exists');
      });

      test('should allow updating to same name', async () => {
        mockPrisma.role.findFirst.mockResolvedValue({
          id: 'role-123',
          name: 'SameName',
        });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_role', {
          id: 'role-123',
          name: 'SameName',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.role.findFirst).toHaveBeenCalledTimes(1);
      });
    });

    describe('admin_delete_role', () => {
      test('should return valid when role exists', async () => {
        mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-123' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_role', {
          id: 'role-123',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when role not found', async () => {
        mockPrisma.role.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_role', {
          roleId: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Role "nonexistent" not found');
      });
    });
  });

  // ============================================================================
  // MCP Server Validation Tests
  // ============================================================================

  describe('validateAdminMcpInput - MCP Server Validations', () => {
    describe('admin_create_mcp_server', () => {
      test('should return valid for unique name', async () => {
        mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_mcp_server', {
          name: 'New MCP Server',
          url: 'https://mcp.example.com',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
          where: {
            organizationId: TEST_ORG_ID,
            name: 'New MCP Server',
            deletedAt: null,
          },
          select: { id: true },
        });
      });

      test('should return error when name is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_mcp_server', {
          url: 'https://mcp.example.com',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('MCP server name is required');
      });

      test('should return error for duplicate name', async () => {
        mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'existing-server' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_mcp_server', {
          name: 'Existing Server',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('MCP server with name "Existing Server" already exists');
      });
    });

    describe('admin_update_mcp_server / admin_delete_mcp_server / admin_set_org_api_key / admin_register_oauth_client', () => {
      const mcpServerTools = [
        'admin_update_mcp_server',
        'admin_delete_mcp_server',
        'admin_set_org_api_key',
        'admin_register_oauth_client',
      ] as const;

      for (const toolName of mcpServerTools) {
        describe(toolName, () => {
          test('should return valid when server exists', async () => {
            mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-123' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'server-123',
            });

            expect(result.valid).toBe(true);
          });

          test('should work with serverId parameter', async () => {
            mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-456' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              serverId: 'server-456',
            });

            expect(result.valid).toBe(true);
          });

          test('should return error when server ID is missing', async () => {
            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {});

            expect(result.valid).toBe(false);
            expect(result.error).toBe('MCP server ID is required');
          });

          test('should return error when server not found', async () => {
            mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'nonexistent',
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('MCP server "nonexistent" not found');
          });

          test('should scope server lookup to organization', async () => {
            mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: 'server-123' });

            await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'server-123',
            });

            expect(mockPrisma.mcpServer.findFirst).toHaveBeenCalledWith({
              where: {
                id: 'server-123',
                organizationId: TEST_ORG_ID,
                deletedAt: null,
              },
              select: { id: true },
            });
          });
        });
      }
    });
  });

  // ============================================================================
  // Agent Validation Tests
  // ============================================================================

  describe('validateAdminMcpInput - Agent Validations', () => {
    describe('admin_create_agent', () => {
      test('should return valid for unique name', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_agent', {
          name: 'NewAgent',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
          where: {
            organizationId: TEST_ORG_ID,
            name: 'NewAgent',
            deletedAt: null,
          },
          select: { id: true },
        });
      });

      test('should return error when name is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_agent', {});

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Agent name is required');
      });

      test('should return error for duplicate name', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue({ id: 'existing-agent' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_agent', {
          name: 'ExistingAgent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Agent with name "ExistingAgent" already exists');
      });
    });

    describe('admin_delete_agent', () => {
      test('should return valid when agent exists', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue({ id: 'agent-123' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_agent', {
          id: 'agent-123',
        });

        expect(result.valid).toBe(true);
      });

      test('should work with agentId parameter', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue({ id: 'agent-456' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_agent', {
          agentId: 'agent-456',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when agent ID is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_agent', {});

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Agent ID is required');
      });

      test('should return error when agent not found', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_agent', {
          id: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Agent "nonexistent" not found');
      });
    });
  });

  // ============================================================================
  // Webhook Validation Tests
  // ============================================================================

  describe('validateAdminMcpInput - Webhook Validations', () => {
    describe('admin_create_webhook', () => {
      test('should return valid for unique name', async () => {
        mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_webhook', {
          name: 'NewWebhook',
          url: 'https://webhook.example.com',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({
          where: {
            organizationId: TEST_ORG_ID,
            name: 'NewWebhook',
          },
          select: { id: true },
        });
      });

      test('should return error when name is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_webhook', {
          url: 'https://webhook.example.com',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Webhook name is required');
      });

      test('should return error for duplicate name', async () => {
        mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'existing-webhook' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_webhook', {
          name: 'ExistingWebhook',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Webhook with name "ExistingWebhook" already exists');
      });
    });

    describe('admin_update_webhook', () => {
      test('should return valid when webhook exists and no name conflict', async () => {
        mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
          id: 'webhook-123',
          name: 'OriginalName',
        });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_webhook', {
          id: 'webhook-123',
          url: 'https://new-url.example.com',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when webhook ID is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_webhook', {
          name: 'NewName',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Webhook ID is required');
      });

      test('should return error when webhook not found', async () => {
        mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_webhook', {
          webhookId: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Webhook "nonexistent" not found');
      });

      test('should return error for name conflict on update', async () => {
        mockPrisma.webhookEndpoint.findFirst
          .mockResolvedValueOnce({
            id: 'webhook-123',
            name: 'OriginalName',
          })
          .mockResolvedValueOnce({
            id: 'other-webhook',
          });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_webhook', {
          id: 'webhook-123',
          name: 'ConflictingName',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Webhook with name "ConflictingName" already exists');
      });

      test('should allow updating to same name', async () => {
        mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({
          id: 'webhook-123',
          name: 'SameName',
        });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_webhook', {
          id: 'webhook-123',
          name: 'SameName',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.webhookEndpoint.findFirst).toHaveBeenCalledTimes(1);
      });
    });

    describe('admin_delete_webhook', () => {
      test('should return valid when webhook exists', async () => {
        mockPrisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'webhook-123' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_webhook', {
          id: 'webhook-123',
        });

        expect(result.valid).toBe(true);
      });

      test('should return error when webhook not found', async () => {
        mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_webhook', {
          webhookId: 'nonexistent',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Webhook "nonexistent" not found');
      });
    });
  });

  // ============================================================================
  // Sensitive Flag Validation Tests
  // ============================================================================

  describe('validateAdminMcpInput - Sensitive Flag Validations', () => {
    describe('admin_create_sensitive_flag', () => {
      test('should return valid for unique tool pattern', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_sensitive_flag', {
          toolPattern: 'github.com::delete*',
        });

        expect(result.valid).toBe(true);
        expect(mockPrisma.sensitiveToolFlag.findFirst).toHaveBeenCalledWith({
          where: {
            organizationId: TEST_ORG_ID,
            toolPattern: 'github.com::delete*',
          },
          select: { id: true },
        });
      });

      test('should return error when tool pattern is missing', async () => {
        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_sensitive_flag', {
          description: 'Missing pattern',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Tool pattern is required for sensitive flag');
      });

      test('should return error for duplicate pattern', async () => {
        mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({ id: 'existing-flag' });

        const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_sensitive_flag', {
          toolPattern: 'existing::pattern',
        });

        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          'Sensitive flag with toolPattern "existing::pattern" already exists',
        );
      });
    });

    describe('admin_update_sensitive_flag / admin_delete_sensitive_flag', () => {
      const sensitiveFlagTools = [
        'admin_update_sensitive_flag',
        'admin_delete_sensitive_flag',
      ] as const;

      for (const toolName of sensitiveFlagTools) {
        describe(toolName, () => {
          test('should return valid when flag exists', async () => {
            mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({ id: 'flag-123' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'flag-123',
            });

            expect(result.valid).toBe(true);
          });

          test('should work with flagId parameter', async () => {
            mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue({ id: 'flag-456' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              flagId: 'flag-456',
            });

            expect(result.valid).toBe(true);
          });

          test('should return error when flag ID is missing', async () => {
            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {});

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Sensitive flag ID is required');
          });

          test('should return error when flag not found', async () => {
            mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'nonexistent',
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Sensitive flag "nonexistent" not found');
          });
        });
      }
    });
  });

  // ============================================================================
  // Approval Request Validation Tests
  // ============================================================================

  describe('validateAdminMcpInput - Approval Request Validations', () => {
    describe('admin_approve_sensitive / admin_deny_sensitive', () => {
      const sensitiveApprovalTools = ['admin_approve_sensitive', 'admin_deny_sensitive'] as const;

      for (const toolName of sensitiveApprovalTools) {
        describe(toolName, () => {
          test('should return valid when pending request exists', async () => {
            mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue({
              id: 'request-123',
            });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'request-123',
            });

            expect(result.valid).toBe(true);
            expect(mockPrisma.sensitiveFlagApprovalRequest.findFirst).toHaveBeenCalledWith({
              where: {
                id: 'request-123',
                organizationId: TEST_ORG_ID,
                status: 'PENDING',
              },
              select: { id: true },
            });
          });

          test('should work with requestId parameter', async () => {
            mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue({
              id: 'request-456',
            });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              requestId: 'request-456',
            });

            expect(result.valid).toBe(true);
          });

          test('should return error when request ID is missing', async () => {
            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {});

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Approval request ID is required');
          });

          test('should return error when pending request not found', async () => {
            mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'nonexistent',
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Pending approval request "nonexistent" not found');
          });
        });
      }
    });

    describe('admin_approve_request / admin_deny_request', () => {
      const permissionRequestTools = ['admin_approve_request', 'admin_deny_request'] as const;

      for (const toolName of permissionRequestTools) {
        describe(toolName, () => {
          test('should return valid when pending request exists', async () => {
            mockPrisma.permissionRequest.findFirst.mockResolvedValue({ id: 'request-123' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'request-123',
            });

            expect(result.valid).toBe(true);
            expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith({
              where: {
                id: 'request-123',
                user: {
                  organizationId: TEST_ORG_ID,
                },
                status: 'PENDING',
              },
              select: { id: true },
            });
          });

          test('should work with requestId parameter', async () => {
            mockPrisma.permissionRequest.findFirst.mockResolvedValue({ id: 'request-456' });

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              requestId: 'request-456',
            });

            expect(result.valid).toBe(true);
          });

          test('should return error when request ID is missing', async () => {
            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {});

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Permission request ID is required');
          });

          test('should return error when pending request not found', async () => {
            mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

            const result = await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'nonexistent',
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Pending permission request "nonexistent" not found');
          });

          test('should scope via user relation to organization', async () => {
            mockPrisma.permissionRequest.findFirst.mockResolvedValue({ id: 'request-123' });

            await validateAdminMcpInput(TEST_ORG_ID, toolName, {
              id: 'request-123',
            });

            expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith({
              where: {
                id: 'request-123',
                user: {
                  organizationId: TEST_ORG_ID,
                },
                status: 'PENDING',
              },
              select: { id: true },
            });
          });
        });
      }
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('validateAdminMcpInput - Edge Cases', () => {
    test('should return valid for unknown tool names', async () => {
      const result = await validateAdminMcpInput(TEST_ORG_ID, 'unknown_tool_name', {
        someParam: 'value',
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should return valid when database throws error (fail-open)', async () => {
      // Set up the mock to reject with an error
      mockPrisma.policy.findFirst.mockImplementation(async () => {
        throw new Error('Database connection failed');
      });

      let result;
      try {
        result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
          slug: 'test-policy',
        });
      } catch (err) {
        // If this catches, the service is not catching properly
        console.error('Caught unexpected error:', err);
        throw err;
      }

      expect(result.valid).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error validating admin MCP input',
        expect.objectContaining({
          toolName: 'admin_create_policy',
          organizationId: TEST_ORG_ID,
          error: 'Database connection failed',
        }),
      );
    });

    test('should handle non-Error exceptions during validation', async () => {
      // Set up the mock to reject with a non-Error value
      mockPrisma.policy.findFirst.mockImplementation(async () => {
        throw 'String error';
      });

      const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
        slug: 'test-policy',
      });

      expect(result.valid).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error validating admin MCP input',
        expect.objectContaining({
          error: 'Unknown error',
        }),
      );
    });

    test('should convert non-object input to empty object', async () => {
      const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', 'not-object');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Policy slug is required');
    });

    test('should convert null input to empty object', async () => {
      const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Policy slug is required');
    });

    test('should convert undefined input to empty object', async () => {
      const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Policy slug is required');
    });

    test('should convert array input to empty object', async () => {
      const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', [
        'slug',
        'value',
      ]);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Policy slug is required');
    });

    test('should handle empty string values as missing', async () => {
      const result = await validateAdminMcpInput(TEST_ORG_ID, 'admin_create_policy', {
        slug: '',
      });

      // Empty string is still a string, so it passes the typeof check
      // but the database query would handle this
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Policy slug is required');
    });
  });

  // ============================================================================
  // Organization Isolation Tests
  // ============================================================================

  describe('validateAdminMcpInput - Organization Isolation', () => {
    test('should only find policies in the same organization', async () => {
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      await validateAdminMcpInput(TEST_ORG_ID, 'admin_update_policy', {
        id: 'policy-123',
      });

      expect(mockPrisma.policy.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
          }),
        }),
      );
    });

    test('should only find roles in the same organization', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_role', {
        id: 'role-123',
      });

      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
          }),
        }),
      );
    });

    test('should only find agents in the same organization', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_agent', {
        id: 'agent-123',
      });

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
          }),
        }),
      );
    });

    test('should only find webhooks in the same organization', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_webhook', {
        id: 'webhook-123',
      });

      expect(mockPrisma.webhookEndpoint.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
          }),
        }),
      );
    });

    test('should only find sensitive flags in the same organization', async () => {
      mockPrisma.sensitiveToolFlag.findFirst.mockResolvedValue(null);

      await validateAdminMcpInput(TEST_ORG_ID, 'admin_delete_sensitive_flag', {
        id: 'flag-123',
      });

      expect(mockPrisma.sensitiveToolFlag.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
          }),
        }),
      );
    });

    test('should scope sensitive approval requests to organization', async () => {
      mockPrisma.sensitiveFlagApprovalRequest.findFirst.mockResolvedValue(null);

      await validateAdminMcpInput(TEST_ORG_ID, 'admin_approve_sensitive', {
        id: 'request-123',
      });

      expect(mockPrisma.sensitiveFlagApprovalRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: TEST_ORG_ID,
          }),
        }),
      );
    });

    test('should scope permission requests via user relation to organization', async () => {
      mockPrisma.permissionRequest.findFirst.mockResolvedValue(null);

      await validateAdminMcpInput(TEST_ORG_ID, 'admin_approve_request', {
        id: 'request-123',
      });

      expect(mockPrisma.permissionRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: {
              organizationId: TEST_ORG_ID,
            },
          }),
        }),
      );
    });
  });
});
