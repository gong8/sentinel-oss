/**
 * Tests for Deletion Impact Analysis Service
 * Tests all functions for analyzing resource deletion impact
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks
const {
  mockMcpServerFindFirst,
  mockPolicyFindMany,
  mockPolicyCount,
  mockPolicyFindFirst,
  mockAuditLogCount,
  mockPolicyTestCount,
  mockRoleFindFirst,
  mockUserFindFirst,
  mockUserCount,
  mockAgentFindFirst,
} = vi.hoisted(() => ({
  mockMcpServerFindFirst: vi.fn(),
  mockPolicyFindMany: vi.fn(),
  mockPolicyCount: vi.fn(),
  mockPolicyFindFirst: vi.fn(),
  mockAuditLogCount: vi.fn(),
  mockPolicyTestCount: vi.fn(),
  mockRoleFindFirst: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUserCount: vi.fn(),
  mockAgentFindFirst: vi.fn(),
}));

vi.mock('@sentinel/db', () => ({
  prisma: {
    mcpServer: {
      findFirst: mockMcpServerFindFirst,
    },
    policy: {
      findMany: mockPolicyFindMany,
      count: mockPolicyCount,
      findFirst: mockPolicyFindFirst,
    },
    auditLogEntry: {
      count: mockAuditLogCount,
    },
    policyTest: {
      count: mockPolicyTestCount,
    },
    role: {
      findFirst: mockRoleFindFirst,
    },
    user: {
      findFirst: mockUserFindFirst,
      count: mockUserCount,
    },
    agent: {
      findFirst: mockAgentFindFirst,
    },
  },
}));

import {
  analyzeAgentDeletion,
  analyzeMcpServerDeletion,
  analyzePolicyDeletion,
  analyzeRoleDeletion,
  analyzeUserDeletion,
} from '../../../../packages/api/src/services/deletionImpact.js';

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deletionImpact', () => {
  const orgId = 'org-123';

  describe('analyzeMcpServerDeletion', () => {
    const serverId = 'server-123';

    test('should return cannot delete when server not found', async () => {
      mockMcpServerFindFirst.mockResolvedValue(null);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].details).toBe('Server not found');
    });

    test('should allow deletion when no references exist', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com/mcp',
        userConfigs: [],
      });
      mockPolicyFindMany.mockResolvedValue([]);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.canDelete).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should block deletion when policies reference the server', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com/mcp',
        userConfigs: [],
      });
      // Policies with toolPatterns array that match the server domain
      mockPolicyFindMany.mockResolvedValue([
        {
          id: 'policy-1',
          slug: 'policy-one',
          description: 'First policy',
          toolPatterns: ['api.example.com::read'],
        },
        {
          id: 'policy-2',
          slug: 'policy-two',
          description: 'Second policy',
          toolPatterns: ['api.example.com::write'],
        },
      ]);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].type).toBe('policy');
      expect(result.blockers[0].count).toBe(2);
      expect(result.blockers[0].items).toHaveLength(2);
    });

    test('should warn about user configurations', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com/mcp',
        userConfigs: [{ id: 'config-1' }, { id: 'config-2' }, { id: 'config-3' }],
      });
      mockPolicyFindMany.mockResolvedValue([]);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.canDelete).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('user_config');
      expect(result.warnings[0].count).toBe(3);
      expect(result.warnings[0].message).toContain('3 users have');
    });

    test('should warn about audit log entries', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com/mcp',
        userConfigs: [],
      });
      mockPolicyFindMany.mockResolvedValue([]);
      mockAuditLogCount.mockResolvedValue(42);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.canDelete).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('audit_log');
      expect(result.warnings[0].count).toBe(42);
    });

    test('should handle URL with port', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com:8080/mcp',
        userConfigs: [],
      });
      // Policy with toolPattern that matches the server domain with port
      mockPolicyFindMany.mockResolvedValue([
        {
          id: 'policy-1',
          slug: 'policy-one',
          description: 'Policy',
          toolPatterns: ['api.example.com:8080::tool'],
        },
      ]);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      // Verify the policy is detected as referencing the server
      expect(result.canDelete).toBe(false);
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].type).toBe('policy');
    });

    test('should handle singular/plural correctly for policies', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com/mcp',
        userConfigs: [],
      });
      mockPolicyFindMany.mockResolvedValue([
        {
          id: 'policy-1',
          slug: 'policy-one',
          description: 'Only policy',
          toolPatterns: ['api.example.com::tool'],
        },
      ]);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.blockers[0].details).toContain('1 active policy reference');
    });

    test('should handle singular user config', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com/mcp',
        userConfigs: [{ id: 'config-1' }],
      });
      mockPolicyFindMany.mockResolvedValue([]);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.warnings[0].message).toContain('1 user has');
    });

    test('should handle singular audit log entry', async () => {
      mockMcpServerFindFirst.mockResolvedValue({
        id: serverId,
        url: 'https://api.example.com/mcp',
        userConfigs: [],
      });
      mockPolicyFindMany.mockResolvedValue([]);
      mockAuditLogCount.mockResolvedValue(1);

      const result = await analyzeMcpServerDeletion(orgId, serverId);

      expect(result.warnings[0].message).toContain('1 audit log entry references');
    });
  });

  describe('analyzePolicyDeletion', () => {
    const policyId = 'policy-123';

    test('should return cannot delete when policy not found', async () => {
      mockPolicyFindFirst.mockResolvedValue(null);

      const result = await analyzePolicyDeletion(orgId, policyId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers[0].details).toBe('Policy not found');
    });

    test('should allow deletion with no references', async () => {
      mockPolicyFindFirst.mockResolvedValue({
        id: policyId,
        slug: 'test-policy',
      });
      mockAuditLogCount.mockResolvedValue(0);
      mockPolicyTestCount.mockResolvedValue(0);

      const result = await analyzePolicyDeletion(orgId, policyId);

      expect(result.canDelete).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should warn about audit log references', async () => {
      mockPolicyFindFirst.mockResolvedValue({
        id: policyId,
        slug: 'test-policy',
      });
      mockAuditLogCount.mockResolvedValue(10);
      mockPolicyTestCount.mockResolvedValue(0);

      const result = await analyzePolicyDeletion(orgId, policyId);

      expect(result.canDelete).toBe(true); // Policies can always be soft deleted
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('audit_log');
      expect(result.warnings[0].count).toBe(10);
    });

    test('should warn about policy test references', async () => {
      mockPolicyFindFirst.mockResolvedValue({
        id: policyId,
        slug: 'test-policy',
      });
      mockAuditLogCount.mockResolvedValue(0);
      mockPolicyTestCount.mockResolvedValue(5);

      const result = await analyzePolicyDeletion(orgId, policyId);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('admin_log');
      expect(result.warnings[0].count).toBe(5);
    });

    test('should handle singular entries correctly', async () => {
      mockPolicyFindFirst.mockResolvedValue({
        id: policyId,
        slug: 'test-policy',
      });
      mockAuditLogCount.mockResolvedValue(1);
      mockPolicyTestCount.mockResolvedValue(1);

      const result = await analyzePolicyDeletion(orgId, policyId);

      expect(result.warnings[0].message).toContain('1 audit log entry references');
      expect(result.warnings[1].message).toContain('1 policy test entry references');
    });
  });

  describe('analyzeRoleDeletion', () => {
    const roleId = 'role-123';

    test('should return cannot delete when role not found', async () => {
      mockRoleFindFirst.mockResolvedValue(null);

      const result = await analyzeRoleDeletion(orgId, roleId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers[0].details).toBe('Role not found');
    });

    test('should allow deletion when no blocking references', async () => {
      mockRoleFindFirst.mockResolvedValue({
        id: roleId,
        name: 'TestRole',
        userRoles: [],
      });
      mockPolicyCount.mockResolvedValue(0);

      const result = await analyzeRoleDeletion(orgId, roleId);

      expect(result.canDelete).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    test('should block deletion when users have only this role', async () => {
      mockRoleFindFirst.mockResolvedValue({
        id: roleId,
        name: 'TestRole',
        userRoles: [
          {
            user: {
              id: 'user-1',
              email: 'solo@example.com',
              userRoles: [{ roleId }], // Only has this role
            },
          },
        ],
      });
      mockPolicyCount.mockResolvedValue(0);

      const result = await analyzeRoleDeletion(orgId, roleId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].type).toBe('user_config');
      expect(result.blockers[0].details).toContain('Users must have at least one role');
    });

    test('should warn about policies referencing the role', async () => {
      mockRoleFindFirst.mockResolvedValue({
        id: roleId,
        name: 'TestRole',
        userRoles: [],
      });
      mockPolicyCount.mockResolvedValue(3);

      const result = await analyzeRoleDeletion(orgId, roleId);

      expect(result.canDelete).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('policy');
      expect(result.warnings[0].count).toBe(3);
    });

    test('should warn about users who will retain other roles', async () => {
      mockRoleFindFirst.mockResolvedValue({
        id: roleId,
        name: 'TestRole',
        userRoles: [
          {
            user: {
              id: 'user-1',
              email: 'multi@example.com',
              userRoles: [{ roleId }, { roleId: 'other-role' }], // Has multiple roles
            },
          },
        ],
      });
      mockPolicyCount.mockResolvedValue(0);

      const result = await analyzeRoleDeletion(orgId, roleId);

      expect(result.canDelete).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('user_config');
      expect(result.warnings[0].message).toContain('will lose this role but retain other roles');
    });

    test('should handle singular user correctly', async () => {
      mockRoleFindFirst.mockResolvedValue({
        id: roleId,
        name: 'TestRole',
        userRoles: [
          {
            user: {
              id: 'user-1',
              email: 'solo@example.com',
              userRoles: [{ roleId }],
            },
          },
        ],
      });
      mockPolicyCount.mockResolvedValue(0);

      const result = await analyzeRoleDeletion(orgId, roleId);

      expect(result.blockers[0].details).toContain('1 user only has');
    });

    test('should handle singular policy correctly', async () => {
      mockRoleFindFirst.mockResolvedValue({
        id: roleId,
        name: 'TestRole',
        userRoles: [],
      });
      mockPolicyCount.mockResolvedValue(1);

      const result = await analyzeRoleDeletion(orgId, roleId);

      expect(result.warnings[0].message).toContain('1 active policy references');
    });
  });

  describe('analyzeUserDeletion', () => {
    const userId = 'user-123';
    const currentUserId = 'admin-456';

    test('should return cannot delete when user not found', async () => {
      mockUserFindFirst.mockResolvedValue(null);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers[0].details).toBe('User not found');
    });

    test('should allow deletion of non-admin user', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        userRoles: [{ role: { isAdmin: false } }],
        mcpConfigs: [],
      });
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.canDelete).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    test('should block self-deletion', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: currentUserId,
        email: 'admin@example.com',
        userRoles: [{ role: { isAdmin: true } }],
        mcpConfigs: [],
      });
      mockAuditLogCount.mockResolvedValue(0);
      mockUserCount.mockResolvedValue(2);

      const result = await analyzeUserDeletion(orgId, currentUserId, currentUserId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          details: 'You cannot delete your own account',
        }),
      );
    });

    test('should block deletion of last admin', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: userId,
        email: 'last-admin@example.com',
        userRoles: [{ role: { isAdmin: true } }],
        mcpConfigs: [],
      });
      mockUserCount.mockResolvedValue(1); // Only one admin
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          details: 'Cannot delete the last admin user. Organization must have at least one admin.',
        }),
      );
    });

    test('should allow deletion of admin when other admins exist', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: userId,
        email: 'admin2@example.com',
        userRoles: [{ role: { isAdmin: true } }],
        mcpConfigs: [],
      });
      mockUserCount.mockResolvedValue(2); // Multiple admins
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.canDelete).toBe(true);
    });

    test('should warn about MCP configurations', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        userRoles: [{ role: { isAdmin: false } }],
        mcpConfigs: [{ id: 'config-1' }, { id: 'config-2' }],
      });
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'user_config',
          count: 2,
        }),
      );
    });

    test('should warn about audit log entries', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        userRoles: [{ role: { isAdmin: false } }],
        mcpConfigs: [],
      });
      mockAuditLogCount.mockResolvedValue(50);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'audit_log',
          count: 50,
        }),
      );
    });

    test('should handle singular MCP config', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        userRoles: [{ role: { isAdmin: false } }],
        mcpConfigs: [{ id: 'config-1' }],
      });
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.warnings[0].message).toContain('1 MCP server configuration');
    });

    test('should handle singular audit log entry', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        userRoles: [{ role: { isAdmin: false } }],
        mcpConfigs: [],
      });
      mockAuditLogCount.mockResolvedValue(1);

      const result = await analyzeUserDeletion(orgId, userId, currentUserId);

      expect(result.warnings[0].message).toContain('1 audit log entry');
    });
  });

  describe('analyzeAgentDeletion', () => {
    const agentId = 'agent-123';

    test('should return cannot delete when agent not found', async () => {
      mockAgentFindFirst.mockResolvedValue(null);

      const result = await analyzeAgentDeletion(orgId, agentId);

      expect(result.canDelete).toBe(false);
      expect(result.blockers[0].details).toBe('Agent not found');
    });

    test('should allow deletion with no references', async () => {
      mockAgentFindFirst.mockResolvedValue({
        id: agentId,
        name: 'Test Agent',
      });
      mockPolicyCount.mockResolvedValue(0);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeAgentDeletion(orgId, agentId);

      expect(result.canDelete).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should warn about policy references', async () => {
      mockAgentFindFirst.mockResolvedValue({
        id: agentId,
        name: 'Test Agent',
      });
      mockPolicyCount.mockResolvedValue(5);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeAgentDeletion(orgId, agentId);

      expect(result.canDelete).toBe(true); // Agents can always be soft deleted
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('policy');
      expect(result.warnings[0].count).toBe(5);
    });

    test('should warn about audit log entries', async () => {
      mockAgentFindFirst.mockResolvedValue({
        id: agentId,
        name: 'Test Agent',
      });
      mockPolicyCount.mockResolvedValue(0);
      mockAuditLogCount.mockResolvedValue(100);

      const result = await analyzeAgentDeletion(orgId, agentId);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('audit_log');
      expect(result.warnings[0].count).toBe(100);
    });

    test('should handle singular policy correctly', async () => {
      mockAgentFindFirst.mockResolvedValue({
        id: agentId,
        name: 'Test Agent',
      });
      mockPolicyCount.mockResolvedValue(1);
      mockAuditLogCount.mockResolvedValue(0);

      const result = await analyzeAgentDeletion(orgId, agentId);

      expect(result.warnings[0].message).toContain('1 active policy references');
    });

    test('should handle singular audit log entry', async () => {
      mockAgentFindFirst.mockResolvedValue({
        id: agentId,
        name: 'Test Agent',
      });
      mockPolicyCount.mockResolvedValue(0);
      mockAuditLogCount.mockResolvedValue(1);

      const result = await analyzeAgentDeletion(orgId, agentId);

      expect(result.warnings[0].message).toContain('1 audit log entry');
    });

    test('should verify correct policy matcher format', async () => {
      mockAgentFindFirst.mockResolvedValue({
        id: agentId,
        name: 'Test Agent',
      });
      mockPolicyCount.mockResolvedValue(0);
      mockAuditLogCount.mockResolvedValue(0);

      await analyzeAgentDeletion(orgId, agentId);

      // Verify the query uses matchers array with 'has' operator
      expect(mockPolicyCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            matchers: { has: `agent:${agentId}` },
          }),
        }),
      );
    });
  });
});
