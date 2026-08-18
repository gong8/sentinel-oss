/**
 * Policy Assertion Service Unit Tests
 * Tests for policy assertion evaluation and management logic
 */

import { AssertionContextType, AssertionSource, PolicyEffect } from '@sentinel/db';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist mocks to avoid initialization order issues
const {
  mockMcpServerFindMany,
  mockPolicyFindMany,
  mockPolicyAssertionFindMany,
  mockPolicyAssertionUpdate,
  mockUserFindFirst,
  mockUserFindMany,
  mockAgentFindFirst,
} = vi.hoisted(() => ({
  mockMcpServerFindMany: vi.fn(),
  mockPolicyFindMany: vi.fn(),
  mockPolicyAssertionFindMany: vi.fn(),
  mockPolicyAssertionUpdate: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockAgentFindFirst: vi.fn(),
}));

// Mock db
vi.mock('@sentinel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentinel/db')>();
  return {
    ...actual,
    prisma: {
      policyAssertion: {
        findMany: mockPolicyAssertionFindMany,
        create: vi.fn(),
        update: mockPolicyAssertionUpdate,
      },
      policy: {
        findMany: mockPolicyFindMany,
      },
      user: {
        findFirst: mockUserFindFirst,
        findMany: mockUserFindMany,
      },
      agent: {
        findFirst: mockAgentFindFirst,
      },
      mcpServer: {
        findMany: mockMcpServerFindMany,
      },
    },
  };
});

// Mock policy evaluation
vi.mock('../../../../packages/api/src/services/policy.js', () => ({
  evaluatePolicy: vi.fn(),
  toolPatternsOverlap: vi.fn(),
}));

// Mock logger
vi.mock('../../../../packages/api/src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  evaluatePolicy,
  toolPatternsOverlap,
} from '../../../../packages/api/src/services/policy.js';
import {
  getAffectedAssertions,
  getAssertionSummary,
  previewAssertionImpact,
  runAffectedAssertions,
  runAllAssertions,
  runAssertion,
} from '../../../../packages/api/src/services/policyAssertion.js';

const mockEvaluatePolicy = vi.mocked(evaluatePolicy);
const mockToolPatternsOverlap = vi.mocked(toolPatternsOverlap);

// Local type matching Prisma's JsonValue for test mocks
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

// =============================================================================
// Mock Data Factories
// =============================================================================

function createMockServer(
  id: string,
  url: string,
  tools: { name: string }[],
  orgId: string = 'org-1',
) {
  return {
    id,
    name: `Server ${id}`,
    url,
    organizationId: orgId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    authenticationType: 'NONE' as const,
    authenticationConfig: null,
    webhookSecret: null,
    tools,
  };
}

function createMockUser(id: string, email: string, roles: string[], orgId: string = 'org-1') {
  return {
    id,
    email,
    accessToken: 'token',
    organizationId: orgId,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActivityAt: null,
    deletedAt: null,
    deletedBy: null,
    userRoles: roles.map((roleName, idx) => ({
      id: `role-${idx}`,
      userId: id,
      roleId: `role-id-${idx}`,
      createdAt: new Date(),
      role: {
        id: `role-id-${idx}`,
        name: roleName,
        organizationId: orgId,
        isAdmin: roleName === 'Admin',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        deletedBy: null,
      },
    })),
  };
}

function createMockAssertion(
  overrides: Partial<{
    id: string;
    name: string;
    organizationId: string;
    contextType: AssertionContextType;
    userId: string | null;
    agentId: string | null;
    roleName: string | null;
    toolPattern: string;
    expectedDecision: string;
    enabled: boolean;
    lastRunAt: Date | null;
    lastRunPassed: boolean | null;
    failureCount: number;
    createdById: string;
    source: AssertionSource;
    sourceId: string | null;
    toolParameters: JsonValue;
    contextOverrides: JsonValue;
    extractedContext: JsonValue;
    extractedMode: string | null;
    parameterMode: string;
  }> = {},
) {
  return {
    id: 'assertion-1',
    name: 'Test Assertion',
    organizationId: 'org-1',
    createdById: 'admin-1',
    contextType: AssertionContextType.USER,
    userId: 'user-1',
    agentId: null,
    roleName: null,
    toolPattern: 'github.com::createPR',
    expectedDecision: 'ALLOWED',
    description: null,
    source: AssertionSource.MANUAL,
    sourceId: null,
    enabled: true,
    lastRunAt: null,
    lastRunPassed: null,
    lastRunDecision: null,
    lastRunJustification: null,
    lastRunPolicyIds: [],
    lastRunSubResults: null,
    failureCount: 0,
    // Tool invocation fields
    toolParameters: null,
    contextOverrides: null,
    extractedContext: null,
    extractedMode: null,
    parameterMode: 'exact',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockPolicy(
  id: string,
  matchers: string[],
  toolPatterns: string[],
  effect: typeof PolicyEffect.ALLOW | typeof PolicyEffect.DENY,
  orgId: string = 'org-1',
) {
  return {
    id,
    slug: `policy-${id}`,
    organizationId: orgId,
    matchers,
    toolPatterns,
    effect,
    description: `Policy ${id}`,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
  };
}

function createMockAgent(id: string, name: string, orgId: string = 'org-1') {
  return {
    id,
    name,
    organizationId: orgId,
    createdAt: new Date(),
    deletedAt: null,
    deletedBy: null,
  };
}

// =============================================================================
// Mock Setup Helpers
// =============================================================================

interface PolicyEvalResult {
  decision: 'ALLOWED' | 'DENIED';
  policyIds: string[];
  justification: string;
}

function setupBasicMocks(
  options: {
    policies?: ReturnType<typeof createMockPolicy>[];
    servers?: ReturnType<typeof createMockServer>[];
    user?: ReturnType<typeof createMockUser> | null;
    users?: ReturnType<typeof createMockUser>[];
    agent?: ReturnType<typeof createMockAgent> | null;
    evalResult?: PolicyEvalResult;
    evalResults?: PolicyEvalResult[];
  } = {},
) {
  mockPolicyFindMany.mockResolvedValue(options.policies ?? []);
  mockMcpServerFindMany.mockResolvedValue(options.servers ?? []);

  if (options.user !== undefined) {
    mockUserFindFirst.mockResolvedValue(options.user);
  }
  if (options.users) {
    mockUserFindMany.mockResolvedValue(options.users);
  }
  if (options.agent !== undefined) {
    mockAgentFindFirst.mockResolvedValue(options.agent);
  }
  if (options.evalResult) {
    mockEvaluatePolicy.mockResolvedValue(options.evalResult);
  }
  if (options.evalResults) {
    options.evalResults.forEach((result) => {
      mockEvaluatePolicy.mockResolvedValueOnce(result);
    });
  }
}

function allowedResult(policyIds: string[] = ['p1'], justification = 'Matched'): PolicyEvalResult {
  return { decision: 'ALLOWED', policyIds, justification };
}

function deniedResult(justification = 'No matching policy'): PolicyEvalResult {
  return { decision: 'DENIED', policyIds: [], justification };
}

describe('Policy Assertion Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runAssertion', () => {
    describe('USER context', () => {
      test('should evaluate assertion for a specific user', async () => {
        const user = createMockUser('user-1', 'test@example.com', ['Developer']);
        setupBasicMocks({
          policies: [
            createMockPolicy('p1', ['role:Developer'], ['github.com::*'], PolicyEffect.ALLOW),
          ],
          user,
          evalResult: allowedResult(['p1'], 'Matched policy p1'),
        });

        const result = await runAssertion(createMockAssertion());

        expect(result.passed).toBe(true);
        expect(result.actualDecision).toBe('ALLOWED');
        expect(result.expectedDecision).toBe('ALLOWED');
      });

      test('should fail assertion when decision does not match expected', async () => {
        setupBasicMocks({
          policies: [createMockPolicy('p1', ['role:Admin'], ['github.com::*'], PolicyEffect.ALLOW)],
          user: createMockUser('user-1', 'test@example.com', ['Developer']),
          evalResult: deniedResult(),
        });

        const result = await runAssertion(createMockAssertion({ expectedDecision: 'ALLOWED' }));

        expect(result.passed).toBe(false);
        expect(result.actualDecision).toBe('DENIED');
        expect(result.expectedDecision).toBe('ALLOWED');
      });

      test('should throw error when userId is missing', async () => {
        setupBasicMocks();

        const assertion = createMockAssertion({
          contextType: AssertionContextType.USER,
          userId: null,
        });
        await expect(runAssertion(assertion)).rejects.toThrow('USER context requires userId');
      });

      test('should throw error when user is not found', async () => {
        setupBasicMocks({ user: null });

        const assertion = createMockAssertion({ userId: 'nonexistent' });
        await expect(runAssertion(assertion)).rejects.toThrow('User nonexistent not found');
      });
    });

    describe('AGENT context', () => {
      test('should evaluate assertion for a specific agent', async () => {
        setupBasicMocks({
          policies: [createMockPolicy('p1', ['agent:Test Agent'], ['*::*'], PolicyEffect.ALLOW)],
          agent: createMockAgent('agent-1', 'Test Agent'),
          user: createMockUser('user-1', 'test@example.com', ['Developer']),
          evalResult: allowedResult(['p1'], 'Agent matched'),
        });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.AGENT,
          userId: null,
          agentId: 'agent-1',
          expectedDecision: 'ALLOWED',
        });

        expect((await runAssertion(assertion)).passed).toBe(true);
      });

      test('should throw error when agentId is missing', async () => {
        setupBasicMocks();

        const assertion = createMockAssertion({
          contextType: AssertionContextType.AGENT,
          userId: null,
          agentId: null,
        });

        await expect(runAssertion(assertion)).rejects.toThrow('AGENT context requires agentId');
      });

      test('should throw error when agent is not found', async () => {
        setupBasicMocks({ agent: null });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.AGENT,
          userId: null,
          agentId: 'nonexistent',
        });

        await expect(runAssertion(assertion)).rejects.toThrow('Agent nonexistent not found');
      });

      test('should throw error when no users available for agent context', async () => {
        setupBasicMocks({
          agent: createMockAgent('agent-1', 'Test Agent'),
          user: null,
        });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.AGENT,
          userId: null,
          agentId: 'agent-1',
        });

        await expect(runAssertion(assertion)).rejects.toThrow(
          'No users available for agent context',
        );
      });
    });

    describe('ROLE context', () => {
      test('should evaluate assertion for all users with a role', async () => {
        const users = [
          createMockUser('user-1', 'alice@example.com', ['Developer']),
          createMockUser('user-2', 'bob@example.com', ['Developer']),
        ];
        setupBasicMocks({
          policies: [
            createMockPolicy('p1', ['role:Developer'], ['github.com::*'], PolicyEffect.ALLOW),
          ],
          users,
          evalResult: allowedResult(['p1'], 'Role matched'),
        });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.ROLE,
          userId: null,
          roleName: 'Developer',
          expectedDecision: 'ALLOWED',
        });

        const result = await runAssertion(assertion);

        expect(result.passed).toBe(true);
        expect(result.subResults).toHaveLength(2);
      });

      test('should throw error when roleName is missing', async () => {
        setupBasicMocks();

        const assertion = createMockAssertion({
          contextType: AssertionContextType.ROLE,
          userId: null,
          roleName: null,
        });

        await expect(runAssertion(assertion)).rejects.toThrow('ROLE context requires roleName');
      });

      test('should throw error when no users found with role', async () => {
        setupBasicMocks({ users: [] });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.ROLE,
          userId: null,
          roleName: 'NonexistentRole',
        });

        await expect(runAssertion(assertion)).rejects.toThrow(
          'No users found with role NonexistentRole',
        );
      });
    });

    describe('WILDCARD context', () => {
      test('should evaluate assertion with wildcard user', async () => {
        const policies = [createMockPolicy('p1', ['*'], ['*::*'], PolicyEffect.ALLOW)];
        setupBasicMocks({ policies, evalResult: allowedResult(['p1'], 'Wildcard matched') });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.WILDCARD,
          userId: null,
          expectedDecision: 'ALLOWED',
        });

        const result = await runAssertion(assertion);

        expect(result.passed).toBe(true);
        expect(mockEvaluatePolicy).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({ email: 'wildcard@test.local' }),
          }),
          policies,
        );
      });
    });

    describe('unknown context type', () => {
      test('should throw error for unknown context type', async () => {
        setupBasicMocks();

        const assertion = createMockAssertion({
          contextType: 'UNKNOWN' as AssertionContextType,
          userId: null,
        });
        await expect(runAssertion(assertion)).rejects.toThrow('Unknown context type: UNKNOWN');
      });
    });

    describe('tool pattern resolution', () => {
      test('should use exact tool pattern when no wildcards present', async () => {
        setupBasicMocks({
          policies: [createMockPolicy('p1', ['*'], ['github.com::createPR'], PolicyEffect.ALLOW)],
          user: createMockUser('user-1', 'test@example.com', ['Developer']),
          evalResult: allowedResult(['p1'], 'Exact match'),
        });

        const result = await runAssertion(
          createMockAssertion({ toolPattern: 'github.com::createPR' }),
        );

        expect(result.passed).toBe(true);
        expect(mockEvaluatePolicy).toHaveBeenCalledWith(
          expect.objectContaining({ toolName: 'github.com::createPR' }),
          expect.anything(),
        );
      });

      test('should expand *::* to all tools from all servers', async () => {
        setupBasicMocks({
          servers: [
            createMockServer('s1', 'https://github.com', [
              { name: 'createPR' },
              { name: 'mergePR' },
            ]),
            createMockServer('s2', 'https://slack.com', [{ name: 'sendMessage' }]),
          ],
          user: createMockUser('user-1', 'test@example.com', ['Developer']),
          evalResult: deniedResult('No policy'),
        });

        const result = await runAssertion(
          createMockAssertion({ toolPattern: '*::*', expectedDecision: 'DENIED' }),
        );

        expect(mockEvaluatePolicy).toHaveBeenCalledTimes(3);
        expect(result.subResults).toHaveLength(3);
      });

      test('should expand domain::* to all tools from matching server', async () => {
        setupBasicMocks({
          servers: [
            createMockServer('s1', 'https://github.com', [
              { name: 'createPR' },
              { name: 'mergePR' },
            ]),
            createMockServer('s2', 'https://slack.com', [{ name: 'sendMessage' }]),
          ],
          user: createMockUser('user-1', 'test@example.com', ['Developer']),
          evalResult: deniedResult('No policy'),
        });

        await runAssertion(
          createMockAssertion({ toolPattern: 'github.com::*', expectedDecision: 'DENIED' }),
        );

        expect(mockEvaluatePolicy).toHaveBeenCalledTimes(2);
      });

      test('should expand *::toolName to matching tools across servers', async () => {
        setupBasicMocks({
          servers: [
            createMockServer('s1', 'https://github.com', [{ name: 'createPR' }]),
            createMockServer('s2', 'https://gitlab.com', [{ name: 'createPR' }]),
            createMockServer('s3', 'https://slack.com', [{ name: 'sendMessage' }]),
          ],
          user: createMockUser('user-1', 'test@example.com', ['Developer']),
          evalResult: deniedResult('No policy'),
        });

        await runAssertion(
          createMockAssertion({ toolPattern: '*::createPR', expectedDecision: 'DENIED' }),
        );

        expect(mockEvaluatePolicy).toHaveBeenCalledTimes(2);
      });

      test('should handle server URLs with ports', async () => {
        setupBasicMocks({
          servers: [createMockServer('s1', 'https://api.example.com:8080', [{ name: 'testTool' }])],
          user: createMockUser('user-1', 'test@example.com', ['Developer']),
          evalResult: allowedResult(['p1']),
        });

        await runAssertion(createMockAssertion({ toolPattern: 'api.example.com:8080::*' }));

        expect(mockEvaluatePolicy).toHaveBeenCalledWith(
          expect.objectContaining({ toolName: 'api.example.com:8080::testTool' }),
          expect.anything(),
        );
      });

      test('should return DENIED when no tools match pattern', async () => {
        setupBasicMocks();

        const result = await runAssertion(
          createMockAssertion({ toolPattern: '*::*', expectedDecision: 'ALLOWED' }),
        );

        expect(result.passed).toBe(false);
        expect(result.actualDecision).toBe('DENIED');
        expect(result.justification).toBe('No tools match the pattern');
      });

      test('should pass when no tools and expected DENIED', async () => {
        setupBasicMocks();

        const result = await runAssertion(
          createMockAssertion({ toolPattern: '*::*', expectedDecision: 'DENIED' }),
        );

        expect(result.passed).toBe(true);
      });
    });

    describe('result aggregation', () => {
      test('should aggregate results for multiple contexts', async () => {
        const mockUsers = [
          createMockUser('user-1', 'alice@example.com', ['Developer']),
          createMockUser('user-2', 'bob@example.com', ['Developer']),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindMany.mockResolvedValue(mockUsers);

        // First user passes, second fails
        mockEvaluatePolicy
          .mockResolvedValueOnce({
            decision: 'ALLOWED',
            policyIds: ['p1'],
            justification: 'User 1 allowed',
          })
          .mockResolvedValueOnce({
            decision: 'DENIED',
            policyIds: [],
            justification: 'User 2 denied',
          });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.ROLE,
          userId: null,
          roleName: 'Developer',
          expectedDecision: 'ALLOWED',
        });

        const result = await runAssertion(assertion);

        expect(result.passed).toBe(false);
        expect(result.justification).toContain('1 of 2 tests failed');
      });
    });
  });

  describe('runAllAssertions', () => {
    test('should run all enabled assertions', async () => {
      const assertions = [
        createMockAssertion({ id: 'a1', name: 'Assertion 1' }),
        createMockAssertion({ id: 'a2', name: 'Assertion 2' }),
      ];
      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockPolicyAssertionUpdate.mockResolvedValue(
        {} as ReturnType<typeof mockPolicyAssertionUpdate>,
      );
      setupBasicMocks({
        user: createMockUser('user-1', 'test@example.com', ['Developer']),
        evalResult: allowedResult(['p1'], 'Allowed'),
      });

      const result = await runAllAssertions('org-1');

      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockPolicyAssertionUpdate).toHaveBeenCalledTimes(2);
    });

    test('should count failed assertions', async () => {
      const assertions = [
        createMockAssertion({ id: 'a1', name: 'Assertion 1' }),
        createMockAssertion({ id: 'a2', name: 'Assertion 2' }),
      ];
      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockPolicyAssertionUpdate.mockResolvedValue(
        {} as ReturnType<typeof mockPolicyAssertionUpdate>,
      );
      setupBasicMocks({
        user: createMockUser('user-1', 'test@example.com', ['Developer']),
        evalResults: [allowedResult(['p1'], 'Allowed'), deniedResult('Denied')],
      });

      const result = await runAllAssertions('org-1');

      expect(result.total).toBe(2);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(1);
    });

    test('should handle assertion errors gracefully', async () => {
      mockPolicyAssertionFindMany.mockResolvedValue([
        createMockAssertion({ id: 'a1', contextType: AssertionContextType.USER, userId: null }),
      ]);
      setupBasicMocks();

      const result = await runAllAssertions('org-1');

      expect(result.total).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].justification).toContain('USER context requires userId');
    });
  });

  describe('getAffectedAssertions', () => {
    test('should return assertions with overlapping tool patterns', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          toolPattern: 'github.com::createPR',
          contextType: AssertionContextType.WILDCARD,
        }),
        createMockAssertion({
          id: 'a2',
          toolPattern: 'slack.com::sendMessage',
          contextType: AssertionContextType.WILDCARD,
        }),
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockToolPatternsOverlap.mockImplementation((p1, p2) => {
        return p1.includes('github') && p2.includes('github');
      });

      const result = await getAffectedAssertions('org-1', ['github.com::*'], ['*']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    test('should filter USER context assertions by matcher', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.USER,
          userId: 'user-1',
          toolPattern: 'github.com::createPR',
        }),
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockToolPatternsOverlap.mockReturnValue(true);

      // With user: matcher
      let result = await getAffectedAssertions(
        'org-1',
        ['github.com::*'],
        ['user:test@example.com'],
      );
      expect(result).toHaveLength(1);

      // With * matcher
      result = await getAffectedAssertions('org-1', ['github.com::*'], ['*']);
      expect(result).toHaveLength(1);

      // With non-matching matcher
      result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:Admin']);
      expect(result).toHaveLength(0);
    });

    test('should filter AGENT context assertions by matcher', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.AGENT,
          userId: null,
          agentId: 'agent-1',
          toolPattern: 'github.com::createPR',
        }),
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockToolPatternsOverlap.mockReturnValue(true);

      // With agent: matcher
      let result = await getAffectedAssertions('org-1', ['github.com::*'], ['agent:TestAgent']);
      expect(result).toHaveLength(1);

      // With non-matching matcher
      result = await getAffectedAssertions('org-1', ['github.com::*'], ['user:test@example.com']);
      expect(result).toHaveLength(0);
    });

    test('should filter ROLE context assertions by matcher', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.ROLE,
          userId: null,
          roleName: 'Developer',
          toolPattern: 'github.com::createPR',
        }),
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockToolPatternsOverlap.mockReturnValue(true);

      // With matching role matcher
      let result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:Developer']);
      expect(result).toHaveLength(1);

      // With non-matching role matcher
      result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:Admin']);
      expect(result).toHaveLength(0);
    });

    test('should always include WILDCARD context assertions when tools overlap', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.WILDCARD,
          userId: null,
          toolPattern: 'github.com::createPR',
        }),
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockToolPatternsOverlap.mockReturnValue(true);

      const result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:Admin']);

      expect(result).toHaveLength(1);
    });
  });

  describe('runAffectedAssertions', () => {
    test('should run only affected assertions', async () => {
      const _mockUser = createMockUser('user-1', 'test@example.com', ['Developer']);
      const assertions = [createMockAssertion({ id: 'a1', contextType: 'WILDCARD' })];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockPolicyFindMany.mockResolvedValue([]);
      mockMcpServerFindMany.mockResolvedValue([]);
      mockPolicyAssertionUpdate.mockResolvedValue({} as never);

      mockToolPatternsOverlap.mockReturnValue(true);
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'ALLOWED',
        policyIds: [],
        justification: 'Allowed',
      });

      const results = await runAffectedAssertions('org-1', ['github.com::*'], ['*']);

      expect(results).toHaveLength(1);
      expect(mockPolicyAssertionUpdate).toHaveBeenCalled();
    });

    test('should handle errors during assertion run', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.USER,
          userId: null, // Will cause error
        }),
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockPolicyFindMany.mockResolvedValue([]);
      mockMcpServerFindMany.mockResolvedValue([]);

      mockToolPatternsOverlap.mockReturnValue(true);

      const results = await runAffectedAssertions('org-1', ['github.com::*'], ['*']);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].justification).toContain('USER context requires userId');
    });
  });

  describe('getAssertionSummary', () => {
    test('should return correct summary statistics', async () => {
      const now = new Date();
      const assertions = [
        { enabled: true, lastRunAt: now, lastRunPassed: true },
        { enabled: true, lastRunAt: now, lastRunPassed: false },
        { enabled: true, lastRunAt: null, lastRunPassed: null },
        { enabled: false, lastRunAt: null, lastRunPassed: null },
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);

      const summary = await getAssertionSummary('org-1');

      expect(summary.total).toBe(4);
      expect(summary.enabled).toBe(3);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.neverRun).toBe(2);
      expect(summary.lastRunAt).toEqual(now);
    });

    test('should return null lastRunAt when no assertions have run', async () => {
      const assertions = [
        { enabled: true, lastRunAt: null, lastRunPassed: null },
        { enabled: true, lastRunAt: null, lastRunPassed: null },
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);

      const summary = await getAssertionSummary('org-1');

      expect(summary.lastRunAt).toBeNull();
    });

    test('should return latest lastRunAt from multiple runs', async () => {
      const older = new Date('2024-01-01');
      const newer = new Date('2024-06-01');
      const assertions = [
        { enabled: true, lastRunAt: older, lastRunPassed: true },
        { enabled: true, lastRunAt: newer, lastRunPassed: true },
      ];

      mockPolicyAssertionFindMany.mockResolvedValue(assertions);

      const summary = await getAssertionSummary('org-1');

      expect(summary.lastRunAt).toEqual(newer);
    });

    test('should handle empty assertions list', async () => {
      mockPolicyAssertionFindMany.mockResolvedValue([]);

      const summary = await getAssertionSummary('org-1');

      expect(summary.total).toBe(0);
      expect(summary.enabled).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.neverRun).toBe(0);
      expect(summary.lastRunAt).toBeNull();
    });
  });

  describe('previewAssertionImpact', () => {
    test('should preview impact of proposed policy', async () => {
      const _mockUser = createMockUser('user-1', 'test@example.com', ['Developer']);
      const currentPolicies = [
        createMockPolicy('p1', ['role:Admin'], ['*::*'], PolicyEffect.ALLOW),
      ];
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.WILDCARD,
          toolPattern: 'github.com::createPR',
          expectedDecision: 'ALLOWED',
        }),
      ];

      mockPolicyFindMany.mockResolvedValue(currentPolicies);
      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockMcpServerFindMany.mockResolvedValue([]);

      mockToolPatternsOverlap.mockReturnValue(true);
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'DENIED',
        policyIds: [],
        justification: 'New policy denies',
      });

      const results = await previewAssertionImpact('org-1', {
        matchers: ['*'],
        toolPatterns: ['github.com::createPR'],
        effect: PolicyEffect.DENY,
      });

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
    });

    test('should exclude policy being updated', async () => {
      mockPolicyFindMany.mockResolvedValue([]);
      mockPolicyAssertionFindMany.mockResolvedValue([]);

      await previewAssertionImpact(
        'org-1',
        {
          matchers: ['*'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
        },
        'existing-policy-id',
      );

      expect(mockPolicyFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'existing-policy-id' },
          }),
        }),
      );
    });

    test('should return only failing assertions', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.WILDCARD,
          expectedDecision: 'ALLOWED',
        }),
        createMockAssertion({
          id: 'a2',
          contextType: AssertionContextType.WILDCARD,
          expectedDecision: 'DENIED',
        }),
      ];

      mockPolicyFindMany.mockResolvedValue([]);
      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockMcpServerFindMany.mockResolvedValue([]);

      mockToolPatternsOverlap.mockReturnValue(true);
      mockEvaluatePolicy.mockResolvedValue({
        decision: 'DENIED',
        policyIds: [],
        justification: 'Denied',
      });

      const results = await previewAssertionImpact('org-1', {
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.DENY,
      });

      // Only a1 should fail (expected ALLOWED, got DENIED)
      expect(results).toHaveLength(1);
      expect(results[0].assertionId).toBe('a1');
    });

    test('should handle preview errors gracefully', async () => {
      const assertions = [
        createMockAssertion({
          id: 'a1',
          contextType: AssertionContextType.USER,
          userId: null, // Will cause error
        }),
      ];

      mockPolicyFindMany.mockResolvedValue([]);
      mockPolicyAssertionFindMany.mockResolvedValue(assertions);
      mockMcpServerFindMany.mockResolvedValue([]);

      mockToolPatternsOverlap.mockReturnValue(true);

      const results = await previewAssertionImpact('org-1', {
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].justification).toContain('USER context requires userId');
    });

    describe('runAssertionWithPolicies context types (via preview)', () => {
      test('should preview USER context assertion successfully', async () => {
        const mockUser = createMockUser('user-1', 'test@example.com', ['Developer']);
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.USER,
            userId: 'user-1',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindFirst.mockResolvedValue(mockUser);
        mockToolPatternsOverlap.mockReturnValue(true);

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'No matching policy',
        });

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.DENY,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].actualDecision).toBe('DENIED');
      });

      test('should preview USER context assertion - user not found error', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.USER,
            userId: 'nonexistent-user',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindFirst.mockResolvedValue(null);
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toContain('User nonexistent-user not found');
      });

      test('should preview AGENT context assertion successfully', async () => {
        const mockUser = createMockUser('user-1', 'test@example.com', ['Developer']);
        const mockAgent = {
          id: 'agent-1',
          name: 'Test Agent',
          organizationId: 'org-1',
          createdAt: new Date(),
          deletedAt: null,
          deletedBy: null,
        };
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.AGENT,
            userId: null,
            agentId: 'agent-1',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockAgentFindFirst.mockResolvedValue(mockAgent);
        mockUserFindFirst.mockResolvedValue(mockUser);
        mockToolPatternsOverlap.mockReturnValue(true);

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'Agent denied',
        });

        const results = await previewAssertionImpact('org-1', {
          matchers: ['agent:*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.DENY,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
      });

      test('should preview AGENT context - agent not found error', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.AGENT,
            userId: null,
            agentId: 'nonexistent-agent',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockAgentFindFirst.mockResolvedValue(null);
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toContain('Agent nonexistent-agent not found');
      });

      test('should preview AGENT context - no users available error', async () => {
        const mockAgent = {
          id: 'agent-1',
          name: 'Test Agent',
          organizationId: 'org-1',
          createdAt: new Date(),
          deletedAt: null,
          deletedBy: null,
        };
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.AGENT,
            userId: null,
            agentId: 'agent-1',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockAgentFindFirst.mockResolvedValue(mockAgent);
        mockUserFindFirst.mockResolvedValue(null); // No users available
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toContain('No users available for agent context');
      });

      test('should preview ROLE context assertion successfully', async () => {
        const mockUsers = [
          createMockUser('user-1', 'alice@example.com', ['Developer']),
          createMockUser('user-2', 'bob@example.com', ['Developer']),
        ];
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.ROLE,
            userId: null,
            roleName: 'Developer',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindMany.mockResolvedValue(mockUsers);
        mockToolPatternsOverlap.mockReturnValue(true);

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'Role denied',
        });

        const results = await previewAssertionImpact('org-1', {
          matchers: ['role:Developer'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.DENY,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        // Should have tested both users (2 sub-results)
        expect(results[0].subResults).toHaveLength(2);
      });

      test('should preview ROLE context - no users found with role error', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.ROLE,
            userId: null,
            roleName: 'NonexistentRole',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindMany.mockResolvedValue([]);
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toContain('No users found with role NonexistentRole');
      });

      test('should preview ROLE context - missing roleName error', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.ROLE,
            userId: null,
            roleName: null, // Missing roleName
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toContain('ROLE context requires roleName');
      });

      test('should preview WILDCARD context assertion', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.WILDCARD,
            userId: null,
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockToolPatternsOverlap.mockReturnValue(true);

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'Wildcard denied',
        });

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.DENY,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
      });

      test('should preview with unknown context type - error handling', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: 'UNKNOWN_TYPE' as AssertionContextType,
            userId: null,
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toContain('Unknown context type: UNKNOWN_TYPE');
      });

      test('should preview ROLE context with multiple failures - aggregated justification', async () => {
        const mockUsers = [
          createMockUser('user-1', 'alice@example.com', ['Developer']),
          createMockUser('user-2', 'bob@example.com', ['Developer']),
          createMockUser('user-3', 'carol@example.com', ['Developer']),
        ];
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.ROLE,
            userId: null,
            roleName: 'Developer',
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindMany.mockResolvedValue(mockUsers);
        mockToolPatternsOverlap.mockReturnValue(true);

        // All users get denied
        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'Role denied',
        });

        const results = await previewAssertionImpact('org-1', {
          matchers: ['role:Developer'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.DENY,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].subResults).toHaveLength(3);
        // Line 558: aggregated failure message
        expect(results[0].justification).toContain('3 of 3 tests failed');
      });

      test('should preview with no tools matching pattern - expected DENIED passes', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.WILDCARD,
            toolPattern: '*::*',
            expectedDecision: 'DENIED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]); // No servers = no tools
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
        });

        // Assertion passes when no tools and expected DENIED
        expect(results).toHaveLength(0);
      });

      test('should preview with no tools matching pattern - expected ALLOWED fails', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.WILDCARD,
            toolPattern: '*::*',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]); // No servers = no tools
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
        });

        // Assertion fails when no tools and expected ALLOWED
        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toBe('No tools match the pattern');
      });

      test('should preview AGENT context - missing agentId error', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.AGENT,
            userId: null,
            agentId: null, // Missing agentId
            toolPattern: 'github.com::createPR',
            expectedDecision: 'ALLOWED',
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockToolPatternsOverlap.mockReturnValue(true);

        const results = await previewAssertionImpact('org-1', {
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(false);
        expect(results[0].justification).toContain('AGENT context requires agentId');
      });
    });
  });

  describe('edge cases', () => {
    describe('tool pattern case insensitivity', () => {
      test('should match domain case-insensitively', async () => {
        const mockUser = createMockUser('user-1', 'test@example.com', ['Developer']);
        const mockServers = [
          createMockServer('s1', 'https://GitHub.Com:8080', [{ name: 'createPR' }]),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockMcpServerFindMany.mockResolvedValue(mockServers);
        mockUserFindFirst.mockResolvedValue(mockUser);

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'ALLOWED',
          policyIds: [],
          justification: 'Allowed',
        });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.USER,
          userId: 'user-1',
          toolPattern: 'github.com:8080::*', // lowercase pattern
          expectedDecision: 'ALLOWED',
        });

        const result = await runAssertion(assertion);
        expect(result.passed).toBe(true);
      });
    });

    describe('result aggregation with multiple failures', () => {
      test('should show failure count when multiple sub-results fail', async () => {
        const mockUsers = [
          createMockUser('user-1', 'alice@example.com', ['Developer']),
          createMockUser('user-2', 'bob@example.com', ['Developer']),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindMany.mockResolvedValue(mockUsers);
        mockUserFindFirst.mockResolvedValueOnce(mockUsers[0]).mockResolvedValueOnce(mockUsers[1]);

        // First user fails, second user fails
        mockEvaluatePolicy
          .mockResolvedValueOnce({
            decision: 'DENIED',
            policyIds: [],
            justification: 'No policy matches',
          })
          .mockResolvedValueOnce({
            decision: 'DENIED',
            policyIds: [],
            justification: 'No policy matches',
          });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.ROLE,
          roleName: 'Developer',
          toolPattern: 'github.com::createPR',
          expectedDecision: 'ALLOWED',
        });

        const result = await runAssertion(assertion);

        expect(result.passed).toBe(false);
        expect(result.subResults).toBeDefined();
        expect(result.subResults!.length).toBe(2);
        expect(result.justification).toContain('2 of 2 tests failed');
      });

      test('should pass when all sub-results pass', async () => {
        const mockUsers = [
          createMockUser('user-1', 'alice@example.com', ['Developer']),
          createMockUser('user-2', 'bob@example.com', ['Developer']),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindMany.mockResolvedValue(mockUsers);

        // Both users get ALLOWED
        mockEvaluatePolicy.mockResolvedValue({
          decision: 'ALLOWED',
          policyIds: ['p1'],
          justification: 'Policy matched',
        });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.ROLE,
          roleName: 'Developer',
          toolPattern: 'github.com::createPR',
          expectedDecision: 'ALLOWED',
        });

        const result = await runAssertion(assertion);

        expect(result.passed).toBe(true);
        expect(result.subResults).toBeDefined();
        expect(result.subResults!.length).toBe(2);
        expect(result.justification).toBeNull();
        expect(result.actualDecision).toBe('ALLOWED');
      });
    });

    describe('getAffectedAssertions matcher filtering', () => {
      test('should return true for unknown context type in getAffectedAssertions (default case)', async () => {
        // This tests line 751 - the default case that returns true for unknown context types
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: 'SOME_FUTURE_TYPE' as AssertionContextType,
            userId: null,
            toolPattern: 'github.com::createPR',
          }),
        ];

        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockToolPatternsOverlap.mockReturnValue(true);

        // Should include the assertion because default case returns true
        const result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:admin']);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('a1');
      });

      test('should not include USER assertions when matcher does not match user pattern', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.USER,
            userId: 'user-1',
            toolPattern: 'github.com::createPR',
          }),
        ];

        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockToolPatternsOverlap.mockReturnValue(true);

        // Matcher is role-based, not user-based
        const result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:admin']);

        expect(result).toHaveLength(0);
      });

      test('should include USER assertions when matcher is wildcard', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.USER,
            userId: 'user-1',
            toolPattern: 'github.com::createPR',
          }),
        ];

        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockToolPatternsOverlap.mockReturnValue(true);

        const result = await getAffectedAssertions('org-1', ['github.com::*'], ['*']);

        expect(result).toHaveLength(1);
      });

      test('should not include AGENT assertions when matcher does not match agent pattern', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.AGENT,
            agentId: 'agent-1',
            toolPattern: 'github.com::createPR',
          }),
        ];

        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockToolPatternsOverlap.mockReturnValue(true);

        // Matcher is user-based, not agent-based
        const result = await getAffectedAssertions(
          'org-1',
          ['github.com::*'],
          ['user:test@example.com'],
        );

        expect(result).toHaveLength(0);
      });

      test('should not include ROLE assertions when role name does not match', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.ROLE,
            roleName: 'Developer',
            toolPattern: 'github.com::createPR',
          }),
        ];

        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockToolPatternsOverlap.mockReturnValue(true);

        // Matcher is for Admin role, not Developer
        const result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:Admin']);

        expect(result).toHaveLength(0);
      });

      test('should include ROLE assertions when role name matches', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.ROLE,
            roleName: 'Developer',
            toolPattern: 'github.com::createPR',
          }),
        ];

        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockToolPatternsOverlap.mockReturnValue(true);

        const result = await getAffectedAssertions('org-1', ['github.com::*'], ['role:Developer']);

        expect(result).toHaveLength(1);
      });

      test('should not include assertions when tool patterns do not overlap', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.WILDCARD,
            toolPattern: 'github.com::createPR',
          }),
        ];

        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockToolPatternsOverlap.mockReturnValue(false);

        const result = await getAffectedAssertions('org-1', ['slack.com::sendMessage'], ['*']);

        expect(result).toHaveLength(0);
      });
    });

    describe('expectedDecision edge cases', () => {
      test('should normalize invalid expectedDecision to DENIED in result but fail comparison', async () => {
        const mockUser = createMockUser('user-1', 'test@example.com', ['Developer']);

        mockPolicyFindMany.mockResolvedValue([]);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockUserFindFirst.mockResolvedValue(mockUser);

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'No policy',
        });

        const assertion = createMockAssertion({
          contextType: AssertionContextType.USER,
          userId: 'user-1',
          toolPattern: 'github.com::createPR',
          expectedDecision: 'INVALID' as 'ALLOWED', // Invalid value
        });

        const result = await runAssertion(assertion);

        // The result's expectedDecision is normalized via asDecision() to 'DENIED'
        // But the comparison uses raw value: 'DENIED' === 'INVALID' is false
        // This is correct behavior - invalid config values should cause failures
        expect(result.expectedDecision).toBe('DENIED');
        expect(result.passed).toBe(false);
      });
    });

    describe('runAllAssertions updates', () => {
      test('should reset failure count when assertion passes', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.WILDCARD,
            expectedDecision: 'DENIED',
            failureCount: 5, // Had previous failures
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockPolicyAssertionUpdate.mockResolvedValue({});

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'No policy',
        });

        const result = await runAllAssertions('org-1');

        expect(result.passed).toBe(1);
        expect(result.failed).toBe(0);

        // Check that update was called with failureCount NOT incremented
        expect(mockPolicyAssertionUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'a1' },
            data: expect.objectContaining({
              lastRunPassed: true,
              failureCount: 5, // Stays the same when passed
            }),
          }),
        );
      });

      test('should increment failure count when assertion fails', async () => {
        const assertions = [
          createMockAssertion({
            id: 'a1',
            contextType: AssertionContextType.WILDCARD,
            expectedDecision: 'ALLOWED',
            failureCount: 3,
          }),
        ];

        mockPolicyFindMany.mockResolvedValue([]);
        mockPolicyAssertionFindMany.mockResolvedValue(assertions);
        mockMcpServerFindMany.mockResolvedValue([]);
        mockPolicyAssertionUpdate.mockResolvedValue({});

        mockEvaluatePolicy.mockResolvedValue({
          decision: 'DENIED',
          policyIds: [],
          justification: 'No policy',
        });

        const result = await runAllAssertions('org-1');

        expect(result.passed).toBe(0);
        expect(result.failed).toBe(1);

        // Check that update was called with failureCount incremented
        expect(mockPolicyAssertionUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'a1' },
            data: expect.objectContaining({
              lastRunPassed: false,
              failureCount: 4, // Incremented from 3 to 4
            }),
          }),
        );
      });
    });
  });
});
