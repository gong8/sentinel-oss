/**
 * Tests for User Tools Router
 * Tests listing tools with policy evaluation for users
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks for proper initialization
const { mockPrisma, mockEvaluatePolicy, mockCheckToolPattern, mockGetServerKeyFromUrl } =
  vi.hoisted(() => ({
    mockPrisma: {
      user: {
        findUnique: vi.fn(),
      },
      mcpServer: {
        findMany: vi.fn(),
      },
      policy: {
        findMany: vi.fn(),
      },
      sensitiveToolFlag: {
        findMany: vi.fn(),
      },
    },
    mockEvaluatePolicy: vi.fn(),
    mockCheckToolPattern: vi.fn(),
    mockGetServerKeyFromUrl: vi.fn(),
  }));

vi.mock('@sentinel/db', () => ({
  prisma: mockPrisma,
  McpAuthType: {
    NONE: 'NONE',
    API_KEY: 'API_KEY',
    OAUTH: 'OAUTH',
    CUSTOM: 'CUSTOM',
  },
}));

vi.mock('../../../../../packages/api/src/trpc/init.js', () => ({
  router: vi.fn((routes) => routes),
  protectedProcedure: {
    query: vi.fn((fn) => (args: unknown) => fn(args)),
  },
}));

vi.mock('../../../../../packages/api/src/services/policy.js', () => ({
  evaluatePolicy: mockEvaluatePolicy,
  checkToolPattern: mockCheckToolPattern,
}));

vi.mock('../../../../../packages/api/src/lib/serverUtils.js', () => ({
  getServerKeyFromUrl: mockGetServerKeyFromUrl,
}));

import { userToolsRouter as _userToolsRouter } from '../../../../../packages/api/src/trpc/user/tools.js';

// Re-type the router to use our test-friendly handler type
type TestableHandler<T = Record<string, unknown>> = (opts: {
  ctx: unknown;
  input?: unknown;
}) => Promise<T>;

interface ServerWithTools {
  serverId: string;
  serverName: string;
  serverUrl: string;
  authenticated: boolean;
  authType: string;
  tools: Array<{
    id: string;
    name: string;
    qualifiedName: string;
    description: string | null;
    access: string;
    justification: string | null;
    blockedByDeny: boolean;
    blockingPolicyId: string | null;
    isFlagged: boolean;
    flagBehaviors: string[];
  }>;
}

const userToolsRouter = _userToolsRouter as unknown as {
  list: TestableHandler<ServerWithTools[]>;
};

function createMockContext(
  overrides: {
    organizationId?: string;
    userId?: string;
  } = {},
) {
  return {
    auth: {
      organizationId: overrides.organizationId ?? 'org-123',
      user: { id: overrides.userId ?? 'user-123' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerKeyFromUrl.mockImplementation((url: string) => {
    const urlObj = new URL(url);
    return urlObj.hostname;
  });
  mockCheckToolPattern.mockReturnValue(false);
  mockEvaluatePolicy.mockResolvedValue({
    decision: 'ALLOWED',
    justification: null,
    policyIds: [],
  });
});

describe('userToolsRouter', () => {
  describe('list', () => {
    test('should return empty array when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result).toEqual([]);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
          workspaceMemberships: {
            select: {
              workspaceId: true,
              role: true,
            },
          },
        },
      });
    });

    test('should list tools with policy evaluation for valid user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        userRoles: [{ role: { name: 'Developer' } }],
      });

      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          url: 'https://api.example.com',
          authType: 'NONE',
          tools: [
            {
              id: 'tool-1',
              name: 'createFile',
              description: 'Creates a file',
            },
          ],
          userConfigs: [],
        },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result).toHaveLength(1);
      expect(result[0].serverId).toBe('server-1');
      expect(result[0].serverName).toBe('Test Server');
      expect(result[0].authenticated).toBe(true); // NONE auth type
      expect(result[0].tools).toHaveLength(1);
      expect(result[0].tools[0].name).toBe('createFile');
      expect(result[0].tools[0].access).toBe('ALLOWED');
    });

    test('should mark tool as DENIED when policy denies it', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        userRoles: [],
      });

      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          url: 'https://api.example.com',
          authType: 'NONE',
          tools: [{ id: 'tool-1', name: 'deleteFile', description: 'Deletes a file' }],
          userConfigs: [],
        },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([
        { id: 'policy-1', effect: 'DENY', toolPattern: '*::deleteFile' },
      ]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      mockEvaluatePolicy.mockResolvedValue({
        decision: 'DENIED',
        justification: 'Blocked by deny policy',
        policyIds: ['policy-1'],
      });

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result[0].tools[0].access).toBe('DENIED');
      expect(result[0].tools[0].blockedByDeny).toBe(true);
      expect(result[0].tools[0].blockingPolicyId).toBe('policy-1');
    });

    test('should show authenticated=false when API_KEY server has no user config', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        userRoles: [],
      });

      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'API Server',
          url: 'https://api.example.com',
          authType: 'API_KEY',
          tools: [],
          userConfigs: [], // No user config
        },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result[0].authenticated).toBe(false);
    });

    test('should show authenticated=true when API_KEY server has user config', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        userRoles: [],
      });

      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'API Server',
          url: 'https://api.example.com',
          authType: 'API_KEY',
          tools: [],
          userConfigs: [{ id: 'config-1' }], // Has user config
        },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result[0].authenticated).toBe(true);
    });

    test('should include flag behaviors for sensitive tools', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        userRoles: [],
      });

      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          url: 'https://api.example.com',
          authType: 'NONE',
          tools: [{ id: 'tool-1', name: 'sendEmail', description: 'Sends email' }],
          userConfigs: [],
        },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([
        { toolPattern: '*::sendEmail', behaviors: ['REQUIRES_APPROVAL', 'AUDIT_LOG'] },
      ]);

      mockCheckToolPattern.mockImplementation((pattern: string, toolName: string) => {
        return pattern === '*::sendEmail' && toolName.endsWith('::sendEmail');
      });

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result[0].tools[0].isFlagged).toBe(true);
      expect(result[0].tools[0].flagBehaviors).toContain('REQUIRES_APPROVAL');
      expect(result[0].tools[0].flagBehaviors).toContain('AUDIT_LOG');
    });

    test('should deduplicate flag behaviors from multiple matching patterns', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        userRoles: [],
      });

      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          url: 'https://api.example.com',
          authType: 'NONE',
          tools: [{ id: 'tool-1', name: 'deleteFile', description: 'Deletes file' }],
          userConfigs: [],
        },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([
        { toolPattern: '*::deleteFile', behaviors: ['AUDIT_LOG', 'REQUIRES_APPROVAL'] },
        { toolPattern: '*::delete*', behaviors: ['AUDIT_LOG', 'NOTIFY_ADMIN'] }, // Duplicate AUDIT_LOG
      ]);

      mockCheckToolPattern.mockReturnValue(true); // All patterns match

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result[0].tools[0].isFlagged).toBe(true);
      // Should have unique behaviors only
      const behaviors = result[0].tools[0].flagBehaviors;
      expect(behaviors).toContain('AUDIT_LOG');
      expect(behaviors).toContain('REQUIRES_APPROVAL');
      expect(behaviors).toContain('NOTIFY_ADMIN');
      expect(behaviors.filter((b: string) => b === 'AUDIT_LOG')).toHaveLength(1);
    });

    test('should handle DENIED decision without policy IDs', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        userRoles: [],
      });

      mockPrisma.mcpServer.findMany.mockResolvedValue([
        {
          id: 'server-1',
          name: 'Test Server',
          url: 'https://api.example.com',
          authType: 'NONE',
          tools: [{ id: 'tool-1', name: 'tool', description: null }],
          userConfigs: [],
        },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.sensitiveToolFlag.findMany.mockResolvedValue([]);

      // DENIED but no policyIds (e.g., default deny)
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'DENIED',
        justification: 'Default deny',
        policyIds: [],
      });

      const ctx = createMockContext();
      const result = await userToolsRouter.list({ ctx });

      expect(result[0].tools[0].access).toBe('DENIED');
      expect(result[0].tools[0].blockedByDeny).toBe(false);
      expect(result[0].tools[0].blockingPolicyId).toBeNull();
    });
  });
});
