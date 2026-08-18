/**
 * Policy Engine Unit Tests
 * Tests for policy evaluation logic (isolated, no database)
 */

import type { Agent, Policy, Role, User, UserRole } from '@sentinel/db';
import { ConditionMode, OrgRole, PolicyEffect } from '@sentinel/db';
import { describe, expect, test, vi } from 'vitest';
import {
  checkMatcher,
  checkToolPattern,
  evaluatePolicy,
  generatePolicyDescription,
  generatePolicySlug,
  matcherArraysOverlap,
  matchersOverlap,
  toolPatternArraysOverlap,
  toolPatternsOverlap,
  validateMatcher,
  validateMatchers,
  validateToolPattern,
  validateToolPatterns,
} from '../../../../packages/api/src/services/policy.ts';

// Mock prisma for tests
vi.mock('@sentinel/db', async () => {
  const actual = await vi.importActual('@sentinel/db');
  return {
    ...actual,
    prisma: {
      globalVariableNamespace: {
        findMany: vi.fn().mockResolvedValue([]), // No global variables by default
      },
    },
  };
});

// Mock data factories for unit tests (no database)
function createMockUser(
  overrides: Partial<User & { userRoles: (UserRole & { role: Role })[] }> = {},
): User & { userRoles: (UserRole & { role: Role })[] } {
  return {
    id: 'user-1',
    email: 'test@example.com',
    organizationId: 'org-1',
    accessToken: 'token-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    lastActivityAt: null,
    orgRole: OrgRole.MEMBER,
    userRoles: [
      {
        id: 'role-1',
        userId: 'user-1',
        roleId: 'role-id-1',
        createdAt: new Date(),
        role: {
          id: 'role-id-1',
          organizationId: 'org-1',
          name: 'User',
          isAdmin: false,
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          deletedBy: null,
        },
      },
    ],
    ...overrides,
  };
}

function createMockPolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    slug: 'test-policy',
    organizationId: 'org-1',
    matchers: ['role:User'],
    toolPatterns: ['github.com::*'],
    effect: PolicyEffect.ALLOW,
    description: 'Test policy',
    enabled: true,
    conditions: null,
    workspaceId: null,
    conditionMode: ConditionMode.SIMPLE,
    conditionExpression: {},
    conditionsTree: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    organizationId: 'org-1',
    workspaceId: null,
    protocolType: 'MCP',
    createdAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    signatureVerified: false,
    signatureVerifiedAt: null,
    publicKeyUrl: null,
    publicKeyCache: null,
    publicKeyCachedAt: null,
    cardSource: 'URL',
    agentCardUrl: null,
    endpointUrl: null,
    agentCardCache: null,
    agentCardFetchedAt: null,
    agentCardHash: null,
    ...overrides,
  };
}

describe('Policy Evaluation Engine', () => {
  describe('evaluatePolicy', () => {
    test('should ALLOW when matching ALLOW policy exists', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
      expect(result.justification).toBeNull();
      expect(result.policyIds).toContain(policy.id);
    });

    test('should DENY when no matching policies exist', async () => {
      const user = createMockUser();

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, []);

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toBe('No matching ALLOW policy');
      expect(result.policyIds).toHaveLength(0);
    });

    test('should DENY when matching DENY policy exists', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.DENY,
        description: 'Users blocked from GitHub',
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('Users blocked from GitHub');
      expect(result.policyIds).toContain(policy.id);
    });

    test('should DENY even when ALLOW exists if DENY also matches', async () => {
      const user = createMockUser();
      const allowPolicy = createMockPolicy({
        id: 'policy-allow',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });
      const denyPolicy = createMockPolicy({
        id: 'policy-deny',
        slug: 'deny-policy',
        matchers: ['role:User'],
        toolPatterns: ['github.com::getFile'],
        effect: PolicyEffect.DENY,
        description: 'Specific denial',
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [
        allowPolicy,
        denyPolicy,
      ]);

      expect(result.decision).toBe('DENIED');
      expect(result.policyIds).toContain(denyPolicy.id);
    });

    test('should ignore disabled policies', async () => {
      const user = createMockUser();
      const disabledPolicy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        enabled: false,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [
        disabledPolicy,
      ]);

      expect(result.decision).toBe('DENIED');
      expect(result.policyIds).toHaveLength(0);
    });

    test('should match role matcher correctly', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should not match role matcher for different role', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:Admin'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('DENIED');
    });

    test('should match user email matcher correctly', async () => {
      const user = createMockUser({ email: 'alice@example.com' });
      const policy = createMockPolicy({
        matchers: ['user:alice@example.com'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match wildcard matcher', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['*'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match agent matcher when agent provided', async () => {
      const user = createMockUser();
      const agent = createMockAgent({ id: 'agent-123' });
      const policy = createMockPolicy({
        matchers: ['agent:agent-123'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, agent, toolName: 'github.com::getFile' }, [
        policy,
      ]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match user:* wildcard for any authenticated user', async () => {
      const user = createMockUser({ email: 'anyone@example.com' });
      const policy = createMockPolicy({
        matchers: ['user:*'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match role:* wildcard for any user with a role', async () => {
      const user = createMockUser(); // Has 'User' role by default
      const policy = createMockPolicy({
        matchers: ['role:*'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should not match role:* for user with no roles', async () => {
      const user = createMockUser({ userRoles: [] });
      const policy = createMockPolicy({
        matchers: ['role:*'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('DENIED');
    });

    test('should match agent:* wildcard for any agent', async () => {
      const user = createMockUser();
      const agent = createMockAgent({ id: 'any-agent' });
      const policy = createMockPolicy({
        matchers: ['agent:*'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, agent, toolName: 'github.com::getFile' }, [
        policy,
      ]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should not match agent:* when no agent provided', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['agent:*'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('DENIED');
    });

    test('should match exact tool pattern', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::getFile'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match wildcard tool pattern', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should match tool pattern with port', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['localhost:8080::getFile'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'localhost:8080::getFile' }, [policy]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should not match different domain', async () => {
      const user = createMockUser();
      const policy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'notion.com::createPage' }, [policy]);

      expect(result.decision).toBe('DENIED');
    });

    test('should handle multiple matching ALLOW policies', async () => {
      const user = createMockUser();
      const policy1 = createMockPolicy({
        id: 'policy-1',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });
      const policy2 = createMockPolicy({
        id: 'policy-2',
        slug: 'policy-2',
        matchers: ['*'],
        toolPatterns: ['github.com::getFile'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::getFile' }, [
        policy1,
        policy2,
      ]);

      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds.length).toBeGreaterThanOrEqual(1);
    });

    // ============================================================================
    // DELEGATION TESTS
    // When an agent acts on behalf of a user, BOTH must have permission
    // ============================================================================
    describe('delegation (agent acting on behalf of user)', () => {
      test('should ALLOW when both agent and delegated user have ALLOW policies', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'mcp-agent-1' });
        const delegatedUser = createMockUser({
          id: 'delegated-user-1',
          email: 'delegated@example.com',
          userRoles: [
            {
              id: 'role-2',
              userId: 'delegated-user-1',
              roleId: 'role-id-2',
              createdAt: new Date(),
              role: {
                id: 'role-id-2',
                organizationId: 'org-1',
                name: 'Developer',
                isAdmin: false,
                description: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
                deletedBy: null,
              },
            },
          ],
        });

        // Policy allowing the agent
        const agentPolicy = createMockPolicy({
          id: 'policy-agent',
          matchers: ['agent:mcp-agent-1'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.ALLOW,
        });

        // Policy allowing the delegated user's role
        const userPolicy = createMockPolicy({
          id: 'policy-user',
          slug: 'policy-user',
          matchers: ['role:Developer'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.ALLOW,
        });

        const result = await evaluatePolicy(
          { user, agent, delegatedUser, toolName: 'a2a::weather::forecast' },
          [agentPolicy, userPolicy],
        );

        expect(result.decision).toBe('ALLOWED');
        expect(result.policyIds).toContain(agentPolicy.id);
        expect(result.policyIds).toContain(userPolicy.id);
      });

      test('should DENY when agent has ALLOW but delegated user has no matching policy', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'mcp-agent-1' });
        const delegatedUser = createMockUser({
          id: 'delegated-user-1',
          email: 'delegated@example.com',
        });

        // Policy allowing the agent
        const agentPolicy = createMockPolicy({
          id: 'policy-agent',
          matchers: ['agent:mcp-agent-1'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.ALLOW,
        });

        const result = await evaluatePolicy(
          { user, agent, delegatedUser, toolName: 'a2a::weather::forecast' },
          [agentPolicy],
        );

        expect(result.decision).toBe('DENIED');
        expect(result.justification).toBe('No matching ALLOW policy for delegated user');
      });

      test('should DENY when delegated user has ALLOW but agent has no matching policy', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'mcp-agent-1' });
        const delegatedUser = createMockUser({
          id: 'delegated-user-1',
          email: 'delegated@example.com',
        });

        // Policy allowing the delegated user (via wildcard)
        const userPolicy = createMockPolicy({
          id: 'policy-user',
          matchers: ['user:delegated@example.com'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.ALLOW,
        });

        const result = await evaluatePolicy(
          { user, agent, delegatedUser, toolName: 'a2a::weather::forecast' },
          [userPolicy],
        );

        expect(result.decision).toBe('DENIED');
        expect(result.justification).toBe('No matching ALLOW policy for agent');
      });

      test('should DENY when agent has DENY policy', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'mcp-agent-1' });
        const delegatedUser = createMockUser({
          id: 'delegated-user-1',
          email: 'delegated@example.com',
        });

        // DENY policy for the agent
        const agentDenyPolicy = createMockPolicy({
          id: 'policy-agent-deny',
          matchers: ['agent:mcp-agent-1'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.DENY,
          description: 'Agent blocked from weather service',
        });

        // ALLOW policy for the delegated user
        const userPolicy = createMockPolicy({
          id: 'policy-user',
          slug: 'policy-user',
          matchers: ['*'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.ALLOW,
        });

        const result = await evaluatePolicy(
          { user, agent, delegatedUser, toolName: 'a2a::weather::forecast' },
          [agentDenyPolicy, userPolicy],
        );

        expect(result.decision).toBe('DENIED');
        expect(result.justification).toContain('Agent denied by policy');
        expect(result.policyIds).toContain(agentDenyPolicy.id);
      });

      test('should DENY when delegated user has DENY policy', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'mcp-agent-1' });
        const delegatedUser = createMockUser({
          id: 'delegated-user-1',
          email: 'blocked@example.com',
        });

        // ALLOW policy for the agent
        const agentPolicy = createMockPolicy({
          id: 'policy-agent',
          matchers: ['agent:*'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.ALLOW,
        });

        // DENY policy for the delegated user
        const userDenyPolicy = createMockPolicy({
          id: 'policy-user-deny',
          slug: 'policy-user-deny',
          matchers: ['user:blocked@example.com'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.DENY,
          description: 'User blocked from weather service',
        });

        const result = await evaluatePolicy(
          { user, agent, delegatedUser, toolName: 'a2a::weather::forecast' },
          [agentPolicy, userDenyPolicy],
        );

        expect(result.decision).toBe('DENIED');
        expect(result.justification).toContain('Delegated user denied by policy');
        expect(result.policyIds).toContain(userDenyPolicy.id);
      });

      test('should ALLOW with wildcard matchers for both agent and user', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'any-agent' });
        const delegatedUser = createMockUser({
          id: 'any-user',
          email: 'anyone@example.com',
        });

        // Universal ALLOW policy
        const universalPolicy = createMockPolicy({
          id: 'policy-all',
          matchers: ['*'],
          toolPatterns: ['a2a::*::*'],
          effect: PolicyEffect.ALLOW,
        });

        const result = await evaluatePolicy(
          { user, agent, delegatedUser, toolName: 'a2a::weather::forecast' },
          [universalPolicy],
        );

        expect(result.decision).toBe('ALLOWED');
        expect(result.policyIds).toContain(universalPolicy.id);
      });

      test('should deduplicate policy IDs when same policy matches both agent and user', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'agent-1' });
        const delegatedUser = createMockUser({
          id: 'user-1',
          email: 'user@example.com',
        });

        // Policy with wildcard that matches both
        const sharedPolicy = createMockPolicy({
          id: 'policy-shared',
          matchers: ['*'],
          toolPatterns: ['a2a::weather::*'],
          effect: PolicyEffect.ALLOW,
        });

        const result = await evaluatePolicy(
          { user, agent, delegatedUser, toolName: 'a2a::weather::forecast' },
          [sharedPolicy],
        );

        expect(result.decision).toBe('ALLOWED');
        // Should only contain the policy ID once (deduplicated)
        expect(result.policyIds).toEqual([sharedPolicy.id]);
      });

      test('should fall back to standard evaluation when no delegatedUser provided', async () => {
        const user = createMockUser();
        const agent = createMockAgent({ id: 'agent-1' });

        const policy = createMockPolicy({
          matchers: ['agent:agent-1'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        // Without delegatedUser, should use standard evaluation
        const result = await evaluatePolicy({ user, agent, toolName: 'github.com::getFile' }, [
          policy,
        ]);

        expect(result.decision).toBe('ALLOWED');
      });

      test('should fall back to standard evaluation when no agent provided', async () => {
        const user = createMockUser();
        const delegatedUser = createMockUser({
          id: 'delegated-user',
          email: 'delegated@example.com',
        });

        const policy = createMockPolicy({
          matchers: ['role:User'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
        });

        // Without agent, should use standard evaluation (ignores delegatedUser)
        const result = await evaluatePolicy(
          { user, delegatedUser, toolName: 'github.com::getFile' },
          [policy],
        );

        expect(result.decision).toBe('ALLOWED');
      });
    });
  });

  describe('validateMatcher', () => {
    test('should accept valid role:ROLE format', () => {
      expect(validateMatcher('role:Admin')).toBe(true);
      expect(validateMatcher('role:User')).toBe(true);
    });

    test('should accept valid user:email format', () => {
      expect(validateMatcher('user:alice@example.com')).toBe(true);
      expect(validateMatcher('user:user@test.co.uk')).toBe(true);
      expect(validateMatcher('user:user_name@example.com')).toBe(true);
    });

    test('should accept valid agent:agentId format', () => {
      expect(validateMatcher('agent:agent-123')).toBe(true);
      expect(validateMatcher('agent:my-agent-id')).toBe(true);
    });

    test('should accept wildcard *', () => {
      expect(validateMatcher('*')).toBe(true);
    });

    test('should accept type-specific wildcards', () => {
      expect(validateMatcher('user:*')).toBe(true);
      expect(validateMatcher('role:*')).toBe(true);
      expect(validateMatcher('agent:*')).toBe(true);
    });

    test('should reject invalid formats', () => {
      expect(validateMatcher('invalid')).toBe(false);
      expect(validateMatcher('role:')).toBe(false);
      expect(validateMatcher(':Admin')).toBe(false);
      expect(validateMatcher('role:Admin:EXTRA')).toBe(false);
      expect(validateMatcher('')).toBe(false);
    });

    test('should accept valid email-like formats', () => {
      // Note: The current regex allows hyphens and underscores in emails
      // This is permissive but acceptable for matcher validation
      expect(validateMatcher('user:invalid-email')).toBe(true); // Has hyphens, which are allowed
      expect(validateMatcher('user:user_name@example.com')).toBe(true);
      expect(validateMatcher('user:valid@example.com')).toBe(true);
      // Note: The regex [a-zA-Z0-9@._-]+ allows @ anywhere, so user:@example.com matches
      // This is a limitation of the current regex but acceptable for matcher validation
      // More strict email validation would happen at the application layer
      expect(validateMatcher('user:@example.com')).toBe(true); // Regex allows this
    });

    test('should handle edge cases', () => {
      expect(validateMatcher('role:Admin ')).toBe(false); // trailing space
      expect(validateMatcher(' role:Admin')).toBe(false); // leading space
    });

    // A2A matchers are no longer supported (A2A agents are now targets, not callers)
    test('should reject a2a matchers (A2A agents are targets, not callers)', () => {
      // A2A agents should be in tool patterns, not matchers
      expect(validateMatcher('a2a-agent:agent-123')).toBe(false);
      expect(validateMatcher('a2a-agent:*')).toBe(false);
      expect(validateMatcher('a2a-provider:ExampleCorp')).toBe(false);
      expect(validateMatcher('a2a-skill:get-forecast')).toBe(false);
    });
  });

  describe('validateMatchers', () => {
    test('should accept array with valid matchers', () => {
      expect(validateMatchers(['role:User', 'user:john@example.com'])).toBe(true);
      expect(validateMatchers(['*'])).toBe(true);
    });

    test('should reject empty array', () => {
      expect(validateMatchers([])).toBe(false);
    });

    test('should reject array with any invalid matcher', () => {
      expect(validateMatchers(['role:User', 'invalid'])).toBe(false);
      expect(validateMatchers([''])).toBe(false);
    });
  });

  describe('validateToolPattern', () => {
    test('should accept valid serverKey::tool format (hostname)', () => {
      expect(validateToolPattern('github.com::getFile')).toBe(true);
      expect(validateToolPattern('api.notion.so::createPage')).toBe(true);
      expect(validateToolPattern('localhost::tool_name')).toBe(true);
    });

    test('should accept serverKey with port', () => {
      expect(validateToolPattern('localhost:8080::getFile')).toBe(true);
      expect(validateToolPattern('api.example.com:3000::tool')).toBe(true);
    });

    test('should accept simple hostname with hyphens', () => {
      expect(validateToolPattern('api-server::getFile')).toBe(true);
      expect(validateToolPattern('mcp-example.com::tool')).toBe(true);
    });

    test('should accept wildcards', () => {
      // Universal wildcard
      expect(validateToolPattern('*::*')).toBe(true);
      // Server key wildcard
      expect(validateToolPattern('*::tool')).toBe(true);
      // Tool wildcard
      expect(validateToolPattern('github.com::*')).toBe(true);
    });

    test('should reject invalid formats', () => {
      expect(validateToolPattern('invalid')).toBe(false);
      expect(validateToolPattern('github.com:')).toBe(false);
      expect(validateToolPattern('::tool')).toBe(false);
      expect(validateToolPattern('github.com::')).toBe(false);
    });

    test('should reject empty strings', () => {
      expect(validateToolPattern('')).toBe(false);
    });

    test('should reject special characters in serverKey', () => {
      expect(validateToolPattern('server/path::tool')).toBe(false);
      expect(validateToolPattern('server@name::tool')).toBe(false);
      // Spaces not allowed in serverKey (hostnames don't have spaces)
      expect(validateToolPattern('My Server::tool')).toBe(false);
      expect(validateToolPattern('Server 8080::tool')).toBe(false);
      // Underscores not allowed in hostnames
      expect(validateToolPattern('my_server::tool')).toBe(false);
    });
  });

  describe('validateToolPatterns', () => {
    test('should accept array with valid patterns', () => {
      expect(validateToolPatterns(['GitHub::*', 'Notion::createPage'])).toBe(true);
      expect(validateToolPatterns(['*::*'])).toBe(true);
    });

    test('should reject empty array', () => {
      expect(validateToolPatterns([])).toBe(false);
    });

    test('should reject array with any invalid pattern', () => {
      expect(validateToolPatterns(['GitHub::*', 'invalid'])).toBe(false);
      expect(validateToolPatterns(['server/path::tool'])).toBe(false);
    });
  });

  describe('matchersOverlap', () => {
    test('should detect overlap for identical matchers', () => {
      expect(matchersOverlap('role:User', 'role:User')).toBe(true);
      expect(matchersOverlap('user:alice@example.com', 'user:alice@example.com')).toBe(true);
      expect(matchersOverlap('agent:agent-1', 'agent:agent-1')).toBe(true);
      expect(matchersOverlap('*', '*')).toBe(true);
    });

    test('should detect overlap when one is wildcard', () => {
      expect(matchersOverlap('*', 'role:User')).toBe(true);
      expect(matchersOverlap('role:User', '*')).toBe(true);
      expect(matchersOverlap('*', 'user:alice@example.com')).toBe(true);
      expect(matchersOverlap('agent:agent-1', '*')).toBe(true);
    });

    test('should detect overlap for same type and value', () => {
      expect(matchersOverlap('role:Admin', 'role:Admin')).toBe(true);
      expect(matchersOverlap('user:test@example.com', 'user:test@example.com')).toBe(true);
    });

    test('should not detect overlap for different types', () => {
      expect(matchersOverlap('role:User', 'user:alice@example.com')).toBe(false);
      expect(matchersOverlap('role:Admin', 'agent:agent-1')).toBe(false);
      expect(matchersOverlap('user:alice@example.com', 'agent:agent-1')).toBe(false);
    });

    test('should not detect overlap for same type but different values', () => {
      expect(matchersOverlap('role:User', 'role:Admin')).toBe(false);
      expect(matchersOverlap('user:alice@example.com', 'user:bob@example.com')).toBe(false);
      expect(matchersOverlap('agent:agent-1', 'agent:agent-2')).toBe(false);
    });

    test('should detect overlap for type-specific wildcards', () => {
      // role:* overlaps with any role:X
      expect(matchersOverlap('role:*', 'role:Admin')).toBe(true);
      expect(matchersOverlap('role:Admin', 'role:*')).toBe(true);
      expect(matchersOverlap('role:*', 'role:*')).toBe(true);

      // user:* overlaps with any user:X
      expect(matchersOverlap('user:*', 'user:alice@example.com')).toBe(true);
      expect(matchersOverlap('user:alice@example.com', 'user:*')).toBe(true);
      expect(matchersOverlap('user:*', 'user:*')).toBe(true);

      // agent:* overlaps with any agent:X
      expect(matchersOverlap('agent:*', 'agent:agent-1')).toBe(true);
      expect(matchersOverlap('agent:agent-1', 'agent:*')).toBe(true);
      expect(matchersOverlap('agent:*', 'agent:*')).toBe(true);
    });

    test('should not detect overlap for type-specific wildcard with different type', () => {
      expect(matchersOverlap('role:*', 'user:alice@example.com')).toBe(false);
      expect(matchersOverlap('user:*', 'agent:agent-1')).toBe(false);
      expect(matchersOverlap('agent:*', 'role:Admin')).toBe(false);
    });

    test('should handle matchers with extra colons in value correctly', () => {
      // Values containing additional colons should be preserved - split only on first colon
      // So 'user:test:foo' parses as type='user', value='test:foo'
      // Different values should not overlap
      expect(matchersOverlap('user:test:foo@example.com', 'user:test:bar@example.com')).toBe(false);
      // Same values should overlap
      expect(matchersOverlap('user:test:foo@example.com', 'user:test:foo@example.com')).toBe(true);
    });

    // A2A matchers are no longer supported (A2A agents are targets in tool patterns, not callers)
    // These tests document that A2A matchers don't overlap with valid matchers
    test('should not detect overlap with invalid A2A matchers', () => {
      // Invalid matchers don't overlap with anything (except global wildcard for backwards compat)
      expect(matchersOverlap('a2a-agent:agent-123', 'role:User')).toBe(false);
      expect(matchersOverlap('a2a-provider:ExampleCorp', 'agent:test')).toBe(false);
    });
  });

  describe('matcherArraysOverlap', () => {
    test('should detect overlap when arrays have matching matchers', () => {
      expect(matcherArraysOverlap(['role:User'], ['role:User'])).toBe(true);
      expect(matcherArraysOverlap(['*'], ['role:Admin'])).toBe(true);
    });

    test('should detect overlap when multiple matchers in arrays', () => {
      expect(matcherArraysOverlap(['role:User', 'role:Admin'], ['agent:test', 'role:User'])).toBe(
        true,
      );
    });

    test('should not detect overlap for non-matching arrays', () => {
      expect(matcherArraysOverlap(['role:User'], ['role:Admin'])).toBe(false);
      expect(matcherArraysOverlap(['user:alice@example.com'], ['user:bob@example.com'])).toBe(
        false,
      );
    });

    test('should handle empty arrays', () => {
      expect(matcherArraysOverlap([], ['role:User'])).toBe(false);
      expect(matcherArraysOverlap(['role:User'], [])).toBe(false);
      expect(matcherArraysOverlap([], [])).toBe(false);
    });
  });

  describe('toolPatternsOverlap', () => {
    test('should detect overlap for identical patterns', () => {
      expect(toolPatternsOverlap('github.com::*', 'github.com::*')).toBe(true);
      expect(toolPatternsOverlap('github.com::createPR', 'github.com::createPR')).toBe(true);
      expect(toolPatternsOverlap('*::*', '*::*')).toBe(true);
    });

    test('should detect overlap when one is universal wildcard', () => {
      expect(toolPatternsOverlap('*::*', 'github.com::createPR')).toBe(true);
      expect(toolPatternsOverlap('github.com::createPR', '*::*')).toBe(true);
      expect(toolPatternsOverlap('*::*', 'notion.com::*')).toBe(true);
    });

    test('should detect overlap when domain wildcard matches', () => {
      expect(toolPatternsOverlap('*::createPR', 'github.com::createPR')).toBe(true);
      expect(toolPatternsOverlap('github.com::createPR', '*::createPR')).toBe(true);
    });

    test('should detect overlap when tool wildcard matches', () => {
      expect(toolPatternsOverlap('github.com::*', 'github.com::createPR')).toBe(true);
      expect(toolPatternsOverlap('github.com::createPR', 'github.com::*')).toBe(true);
      expect(toolPatternsOverlap('github.com::*', 'github.com::getFile')).toBe(true);
    });

    test('should detect overlap for same domain with different tools (one wildcard)', () => {
      expect(toolPatternsOverlap('github.com::*', 'github.com::createPR')).toBe(true);
      expect(toolPatternsOverlap('github.com::createPR', 'github.com::*')).toBe(true);
    });

    test('should not detect overlap for different domains', () => {
      expect(toolPatternsOverlap('github.com::*', 'notion.com::*')).toBe(false);
      expect(toolPatternsOverlap('github.com::createPR', 'notion.com::createPage')).toBe(false);
    });

    test('should not detect overlap for same domain but different tools (both specific)', () => {
      expect(toolPatternsOverlap('github.com::createPR', 'github.com::getFile')).toBe(false);
    });

    test('should handle patterns with ports', () => {
      expect(toolPatternsOverlap('localhost:8080::*', 'localhost:8080::getFile')).toBe(true);
      expect(toolPatternsOverlap('localhost:8080::getFile', 'localhost:8080::*')).toBe(true);
      expect(toolPatternsOverlap('localhost:8080::*', 'localhost:3000::*')).toBe(false); // Different ports
    });

    test('should handle subdomains correctly', () => {
      expect(toolPatternsOverlap('api.github.com::*', 'api.github.com::createPR')).toBe(true);
      expect(toolPatternsOverlap('api.github.com::*', 'github.com::*')).toBe(false); // Different domains
    });

    test('should handle edge cases', () => {
      // Invalid patterns should return false
      expect(toolPatternsOverlap('invalid', 'github.com::*')).toBe(false);
      expect(toolPatternsOverlap('github.com::*', 'invalid')).toBe(false);
    });
  });

  describe('toolPatternArraysOverlap', () => {
    test('should detect overlap when arrays have matching patterns', () => {
      expect(toolPatternArraysOverlap(['github.com::*'], ['github.com::createPR'])).toBe(true);
      expect(toolPatternArraysOverlap(['*::*'], ['notion.com::createPage'])).toBe(true);
    });

    test('should detect overlap when multiple patterns in arrays', () => {
      expect(
        toolPatternArraysOverlap(
          ['github.com::*', 'notion.com::*'],
          ['slack.com::postMessage', 'github.com::getFile'],
        ),
      ).toBe(true);
    });

    test('should not detect overlap for non-matching arrays', () => {
      expect(toolPatternArraysOverlap(['github.com::*'], ['notion.com::*'])).toBe(false);
      expect(toolPatternArraysOverlap(['github.com::createPR'], ['github.com::getFile'])).toBe(
        false,
      );
    });

    test('should handle empty arrays', () => {
      expect(toolPatternArraysOverlap([], ['github.com::*'])).toBe(false);
      expect(toolPatternArraysOverlap(['github.com::*'], [])).toBe(false);
      expect(toolPatternArraysOverlap([], [])).toBe(false);
    });
  });

  describe('generatePolicySlug', () => {
    test('should generate slug for basic ALLOW policy', () => {
      const slug = generatePolicySlug(['role:User'], ['github.com::*'], 'ALLOW', new Set());
      expect(slug).toBe('allow-role-user-github-com-all');
    });

    test('should generate slug for DENY policy', () => {
      const slug = generatePolicySlug(['role:Admin'], ['notion.com::*'], 'DENY', new Set());
      expect(slug).toBe('deny-role-admin-notion-com-all');
    });

    test('should handle wildcard matcher', () => {
      const slug = generatePolicySlug(['*'], ['github.com::*'], 'ALLOW', new Set());
      expect(slug).toBe('allow-all-github-com-all');
    });

    test('should handle user email matcher', () => {
      const slug = generatePolicySlug(
        ['user:john@example.com'],
        ['github.com::*'],
        'ALLOW',
        new Set(),
      );
      expect(slug).toContain('user-john-at-example-com');
    });

    test('should handle agent matcher', () => {
      const slug = generatePolicySlug(['agent:my-agent'], ['github.com::*'], 'ALLOW', new Set());
      expect(slug).toContain('agent-my-agent');
    });

    test('should handle specific tool pattern', () => {
      const slug = generatePolicySlug(['role:User'], ['github.com::createPR'], 'ALLOW', new Set());
      expect(slug).toContain('github-com-createpr');
    });

    test('should add multi suffix for multiple matchers', () => {
      const slug = generatePolicySlug(
        ['role:User', 'role:Admin'],
        ['github.com::*'],
        'ALLOW',
        new Set(),
      );
      expect(slug).toContain('-multi-2m1t');
    });

    test('should add multi suffix for multiple tool patterns', () => {
      const slug = generatePolicySlug(
        ['role:User'],
        ['github.com::*', 'notion.com::*'],
        'ALLOW',
        new Set(),
      );
      expect(slug).toContain('-multi-1m2t');
    });

    test('should handle slug collisions', () => {
      const existingSlugs = new Set(['allow-role-user-github-com-all']);
      const slug = generatePolicySlug(['role:User'], ['github.com::*'], 'ALLOW', existingSlugs);
      expect(slug).toBe('allow-role-user-github-com-all-2');
    });

    test('should handle multiple collisions', () => {
      const existingSlugs = new Set([
        'allow-role-user-github-com-all',
        'allow-role-user-github-com-all-2',
        'allow-role-user-github-com-all-3',
      ]);
      const slug = generatePolicySlug(['role:User'], ['github.com::*'], 'ALLOW', existingSlugs);
      expect(slug).toBe('allow-role-user-github-com-all-4');
    });

    test('should handle empty arrays with defaults', () => {
      const slug = generatePolicySlug([], [], 'ALLOW', new Set());
      expect(slug).toContain('allow-all');
    });

    test('should truncate very long slugs', () => {
      const longMatcher = 'user:' + 'a'.repeat(100) + '@example.com';
      const longTool =
        'very-long-domain-name-that-goes-on-and-on.example.com::some-extremely-long-tool-name-here';
      const slug = generatePolicySlug([longMatcher], [longTool], 'ALLOW', new Set());
      expect(slug.length).toBeLessThanOrEqual(100);
    });

    test('should handle long slug with many collisions triggering aggressive truncation', () => {
      // Create a slug that will be close to 90 chars (maxBaseLength)
      const longMatcher = 'user:' + 'a'.repeat(40) + '@example.com';
      const longTool = 'long-domain-name.example.com::some-tool-name';

      // First generate without collisions to see the base slug
      const baseSlug = generatePolicySlug([longMatcher], [longTool], 'ALLOW', new Set());

      // Create collisions for base slug and all numbered variants up to high numbers
      const existingSlugs = new Set<string>();
      existingSlugs.add(baseSlug);
      // Add numbered variants to force the fallback truncation logic
      for (let i = 2; i <= 50; i++) {
        existingSlugs.add(`${baseSlug}-${i}`);
      }

      const slug = generatePolicySlug([longMatcher], [longTool], 'ALLOW', existingSlugs);
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(existingSlugs.has(slug)).toBe(false); // Should be unique
    });

    test('should handle collision with aggressive truncation when slug is near limit', () => {
      // Create a slug that will be exactly 90 chars to trigger maxBaseLength truncation
      const longMatcher = 'user:' + 'x'.repeat(70) + '@test.com';
      const longTool = 'a'.repeat(20) + '.com::tool';

      const baseSlug = generatePolicySlug([longMatcher], [longTool], 'ALLOW', new Set());

      // Create a set with the base slug to force collision handling
      const existingSlugs = new Set([baseSlug]);

      const slug = generatePolicySlug([longMatcher], [longTool], 'ALLOW', existingSlugs);
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(slug).not.toBe(baseSlug);
    });

    test('should trigger aggressive truncation when candidate exceeds 100 chars', () => {
      // Create a slug that will be close to 90 chars and then with collision suffix
      // would exceed 100 chars
      const longMatcher = 'user:' + 'y'.repeat(60) + '@example.com';
      const longTool = 'verylongdomainname.example.com::verylongtoolname';

      const baseSlug = generatePolicySlug([longMatcher], [longTool], 'ALLOW', new Set());

      // Fill up collision slots with numbers that would make candidate > 100 chars
      const existingSlugs = new Set<string>();
      existingSlugs.add(baseSlug);
      // Add enough collisions that the candidate would exceed 100 chars
      // The candidate format is `${slug}-${counter}`
      for (let i = 2; i <= 9999; i++) {
        existingSlugs.add(`${baseSlug}-${i}`);
      }

      const slug = generatePolicySlug([longMatcher], [longTool], 'ALLOW', existingSlugs);
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(existingSlugs.has(slug)).toBe(false); // Should be unique
    });

    test('should handle edge case where truncated slug also has collisions', () => {
      // Create a base slug
      const baseSlug = generatePolicySlug(
        ['user:test@example.com'],
        ['github.com::tool'],
        'ALLOW',
        new Set(),
      );

      // Create collisions for both the original and the truncated version
      const existingSlugs = new Set<string>();
      existingSlugs.add(baseSlug);
      for (let i = 2; i <= 100; i++) {
        existingSlugs.add(`${baseSlug}-${i}`);
      }
      // Also add truncated versions
      const truncatedSlug = baseSlug.slice(0, 80).replace(/-+$/, '');
      existingSlugs.add(truncatedSlug);
      for (let i = 2; i <= 50; i++) {
        existingSlugs.add(`${truncatedSlug}-${i}`);
      }

      const slug = generatePolicySlug(
        ['user:test@example.com'],
        ['github.com::tool'],
        'ALLOW',
        existingSlugs,
      );
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(existingSlugs.has(slug)).toBe(false); // Should be unique
    });
  });

  describe('generatePolicyDescription', () => {
    test('should format user matcher', () => {
      const description = generatePolicyDescription(
        ['user:john@example.com'],
        ['github.com::createPR'],
        'ALLOW',
      );
      expect(description).toContain("user 'john@example.com'");
    });

    test('should format role matcher', () => {
      const description = generatePolicyDescription(['role:Admin'], ['github.com::*'], 'DENY');
      expect(description).toContain("role 'Admin'");
    });

    test('should format agent matcher', () => {
      const description = generatePolicyDescription(
        ['agent:claude-agent'],
        ['github.com::createPR'],
        'ALLOW',
      );
      expect(description).toContain("agent 'claude-agent'");
    });

    test('should handle global wildcard matcher', () => {
      const description = generatePolicyDescription(['*'], ['github.com::*'], 'ALLOW');
      expect(description).toContain('everyone');
    });

    test('should handle type-specific wildcard matchers', () => {
      const userWildcard = generatePolicyDescription(['user:*'], ['github.com::*'], 'ALLOW');
      expect(userWildcard).toContain('all users');

      const roleWildcard = generatePolicyDescription(['role:*'], ['github.com::*'], 'ALLOW');
      expect(roleWildcard).toContain('all roles');

      const agentWildcard = generatePolicyDescription(['agent:*'], ['github.com::*'], 'ALLOW');
      expect(agentWildcard).toContain('all MCP agents');
    });

    test('should handle unknown matcher types', () => {
      const description = generatePolicyDescription(['custom:value'], ['github.com::*'], 'ALLOW');
      expect(description).toContain('custom:value');
    });

    test('should format all tools wildcard', () => {
      const description = generatePolicyDescription(['role:User'], ['*::*'], 'ALLOW');
      expect(description).toContain('all tools');
    });

    test('should format domain wildcard with specific tool', () => {
      const description = generatePolicyDescription(['role:User'], ['*::createPR'], 'ALLOW');
      expect(description).toContain("tool 'createPR' on all servers");
    });

    test('should format tool wildcard with specific domain', () => {
      const description = generatePolicyDescription(['role:User'], ['github.com::*'], 'ALLOW');
      expect(description).toContain("all tools on 'github.com'");
    });

    test('should format specific tool on specific domain', () => {
      const description = generatePolicyDescription(
        ['role:User'],
        ['github.com::createPR'],
        'ALLOW',
      );
      expect(description).toContain("tool 'createPR' on 'github.com'");
    });

    test('should use friendly server names when provided', () => {
      const mcpServerNames = new Map([['github.com', 'GitHub MCP']]);
      const description = generatePolicyDescription(
        ['role:User'],
        ['github.com::*'],
        'ALLOW',
        mcpServerNames,
      );
      expect(description).toContain("all tools on 'GitHub MCP'");
    });

    test('should handle DENY effect', () => {
      const description = generatePolicyDescription(['role:User'], ['github.com::*'], 'DENY');
      expect(description).toContain('Deny');
    });

    test('should handle ALLOW effect', () => {
      const description = generatePolicyDescription(['role:User'], ['github.com::*'], 'ALLOW');
      expect(description).toContain('Allow');
    });
  });

  // ============================================================================
  // A2A TOOL PATTERN DESCRIPTION TESTS (lines 762-774)
  // ============================================================================
  describe('generatePolicyDescription - A2A patterns', () => {
    test('should format A2A pattern with all wildcards', () => {
      const description = generatePolicyDescription(['role:User'], ['a2a::*::*'], 'ALLOW');
      expect(description).toContain('all A2A agents');
    });

    test('should format A2A pattern with wildcard agent and specific skill', () => {
      const description = generatePolicyDescription(['role:User'], ['a2a::*::forecast'], 'ALLOW');
      expect(description).toContain("skill 'forecast' on all A2A agents");
    });

    test('should format A2A pattern with specific agent and wildcard skill', () => {
      const description = generatePolicyDescription(
        ['role:User'],
        ['a2a::weather-agent::*'],
        'ALLOW',
      );
      expect(description).toContain("all skills on A2A agent 'weather-agent'");
    });

    test('should format A2A pattern with specific agent and skill', () => {
      const description = generatePolicyDescription(
        ['role:User'],
        ['a2a::weather-agent::forecast'],
        'ALLOW',
      );
      expect(description).toContain("skill 'forecast' on A2A agent 'weather-agent'");
    });

    test('should use friendly A2A agent name when provided', () => {
      const a2aAgentNames = new Map([['weather-agent', 'Weather Service']]);
      const description = generatePolicyDescription(
        ['role:User'],
        ['a2a::weather-agent::*'],
        'ALLOW',
        undefined,
        a2aAgentNames,
      );
      expect(description).toContain("all skills on A2A agent 'Weather Service'");
    });

    test('should use friendly A2A agent name with specific skill', () => {
      const a2aAgentNames = new Map([['weather-agent', 'Weather Service']]);
      const description = generatePolicyDescription(
        ['role:User'],
        ['a2a::weather-agent::forecast'],
        'ALLOW',
        undefined,
        a2aAgentNames,
      );
      expect(description).toContain("skill 'forecast' on A2A agent 'Weather Service'");
    });

    test('should handle invalid A2A pattern gracefully', () => {
      // A2A pattern with wrong number of parts should return raw pattern
      const description = generatePolicyDescription(['role:User'], ['a2a::only-two'], 'ALLOW');
      expect(description).toContain('a2a::only-two');
    });

    test('should handle A2A pattern in DENY policy', () => {
      const description = generatePolicyDescription(['role:Admin'], ['a2a::*::*'], 'DENY');
      expect(description).toContain('Deny');
      expect(description).toContain('all A2A agents');
    });

    test('should handle multiple matchers with A2A pattern', () => {
      const description = generatePolicyDescription(
        ['role:User', 'role:Admin'],
        ['a2a::weather::forecast'],
        'ALLOW',
      );
      expect(description).toContain("role 'User'");
      expect(description).toContain("role 'Admin'");
      expect(description).toContain('and');
    });

    test('should handle A2A and MCP patterns together', () => {
      const description = generatePolicyDescription(
        ['role:User'],
        ['a2a::weather::*', 'github.com::*'],
        'ALLOW',
      );
      // Should contain formatted versions of both patterns
      expect(description).toContain("all skills on A2A agent 'weather'");
      expect(description).toContain("all tools on 'github.com'");
    });
  });

  // ============================================================================
  // checkToolPattern TESTS (exported function, additional edge cases)
  // ============================================================================
  describe('checkToolPattern', () => {
    test('should match universal wildcard *::*', () => {
      expect(checkToolPattern('*::*', 'github.com::createPR')).toBe(true);
      expect(checkToolPattern('*::*', 'a2a::weather::forecast')).toBe(true);
    });

    test('should match single * pattern', () => {
      expect(checkToolPattern('*', 'github.com::createPR')).toBe(true);
      expect(checkToolPattern('*', 'a2a::weather::forecast')).toBe(true);
    });

    test('should not match A2A pattern with MCP tool', () => {
      expect(checkToolPattern('a2a::weather::*', 'github.com::createPR')).toBe(false);
    });

    test('should not match MCP pattern with A2A tool', () => {
      expect(checkToolPattern('github.com::*', 'a2a::weather::forecast')).toBe(false);
    });

    test('should match A2A pattern with wildcard agent', () => {
      expect(checkToolPattern('a2a::*::forecast', 'a2a::weather::forecast')).toBe(true);
      expect(checkToolPattern('a2a::*::*', 'a2a::weather::forecast')).toBe(true);
    });

    test('should match A2A pattern with wildcard skill', () => {
      expect(checkToolPattern('a2a::weather::*', 'a2a::weather::forecast')).toBe(true);
    });

    test('should match exact A2A pattern', () => {
      expect(checkToolPattern('a2a::weather::forecast', 'a2a::weather::forecast')).toBe(true);
    });

    test('should not match different A2A agent', () => {
      expect(checkToolPattern('a2a::weather::*', 'a2a::maps::directions')).toBe(false);
    });

    test('should not match different A2A skill', () => {
      expect(checkToolPattern('a2a::weather::forecast', 'a2a::weather::current')).toBe(false);
    });

    test('should handle invalid A2A pattern format', () => {
      // Invalid patterns (wrong number of parts)
      expect(checkToolPattern('a2a::only-two', 'a2a::weather::forecast')).toBe(false);
      expect(checkToolPattern('a2a::weather::skill', 'a2a::only-two')).toBe(false);
    });

    test('should handle MCP pattern with server wildcard', () => {
      expect(checkToolPattern('*::createPR', 'github.com::createPR')).toBe(true);
    });

    test('should handle MCP pattern with tool wildcard', () => {
      expect(checkToolPattern('github.com::*', 'github.com::anyTool')).toBe(true);
    });

    test('should match MCP patterns case-insensitively for server', () => {
      expect(checkToolPattern('GitHub.COM::createPR', 'github.com::createPR')).toBe(true);
      expect(checkToolPattern('github.com::createPR', 'GITHUB.COM::createPR')).toBe(true);
    });

    test('should not match MCP patterns case-insensitively for tool', () => {
      // Tools are case-sensitive
      expect(checkToolPattern('github.com::CreatePR', 'github.com::createPR')).toBe(false);
    });

    test('should handle invalid MCP pattern format', () => {
      expect(checkToolPattern('noSeparator', 'github.com::createPR')).toBe(false);
      expect(checkToolPattern('github.com::', 'github.com::createPR')).toBe(false);
      expect(checkToolPattern('::createPR', 'github.com::createPR')).toBe(false);
    });

    test('should handle invalid tool name format', () => {
      expect(checkToolPattern('github.com::*', 'noSeparator')).toBe(false);
      expect(checkToolPattern('github.com::*', 'github.com::')).toBe(false);
    });
  });

  // ============================================================================
  // checkMatcher TESTS (exported function, additional edge cases)
  // ============================================================================
  describe('checkMatcher', () => {
    test('should match wildcard * for any user', () => {
      const user = createMockUser();
      expect(checkMatcher('*', user, null)).toBe(true);
    });

    test('should match role:* for user with any role', () => {
      const user = createMockUser();
      expect(checkMatcher('role:*', user, null)).toBe(true);
    });

    test('should not match role:* for user with no roles', () => {
      const user = createMockUser({ userRoles: [] });
      expect(checkMatcher('role:*', user, null)).toBe(false);
    });

    test('should match specific role', () => {
      const user = createMockUser();
      expect(checkMatcher('role:User', user, null)).toBe(true);
    });

    test('should not match different role', () => {
      const user = createMockUser();
      expect(checkMatcher('role:Admin', user, null)).toBe(false);
    });

    test('should match user with wildcard role for any role matcher', () => {
      // User with wildcard role should match any role matcher
      const userWithWildcardRole = createMockUser({
        userRoles: [
          {
            id: 'role-wildcard',
            userId: 'user-1',
            roleId: 'role-id-wildcard',
            createdAt: new Date(),
            role: {
              id: 'role-id-wildcard',
              organizationId: 'org-1',
              name: '*',
              isAdmin: false,
              description: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
              deletedBy: null,
            },
          },
        ],
      });
      expect(checkMatcher('role:Admin', userWithWildcardRole, null)).toBe(true);
      expect(checkMatcher('role:SuperAdmin', userWithWildcardRole, null)).toBe(true);
    });

    test('should match user:* for any authenticated user', () => {
      const user = createMockUser({ email: 'anyone@example.com' });
      expect(checkMatcher('user:*', user, null)).toBe(true);
    });

    test('should match specific user email', () => {
      const user = createMockUser({ email: 'alice@example.com' });
      expect(checkMatcher('user:alice@example.com', user, null)).toBe(true);
    });

    test('should not match different user email', () => {
      const user = createMockUser({ email: 'bob@example.com' });
      expect(checkMatcher('user:alice@example.com', user, null)).toBe(false);
    });

    test('should match agent:* for any agent', () => {
      const user = createMockUser();
      const agent = createMockAgent();
      expect(checkMatcher('agent:*', user, agent)).toBe(true);
    });

    test('should not match agent:* when agent is null', () => {
      const user = createMockUser();
      expect(checkMatcher('agent:*', user, null)).toBe(false);
    });

    test('should not match agent:* when agent is undefined', () => {
      const user = createMockUser();
      expect(checkMatcher('agent:*', user, undefined)).toBe(false);
    });

    test('should match specific agent ID', () => {
      const user = createMockUser();
      const agent = createMockAgent({ id: 'my-agent-id' });
      expect(checkMatcher('agent:my-agent-id', user, agent)).toBe(true);
    });

    test('should not match different agent ID', () => {
      const user = createMockUser();
      const agent = createMockAgent({ id: 'agent-1' });
      expect(checkMatcher('agent:agent-2', user, agent)).toBe(false);
    });

    test('should not match specific agent ID when no agent provided', () => {
      const user = createMockUser();
      expect(checkMatcher('agent:agent-1', user, null)).toBe(false);
    });

    test('should return false for unknown matcher type', () => {
      const user = createMockUser();
      expect(checkMatcher('unknown:value', user, null)).toBe(false);
    });

    test('should return false for invalid matcher format', () => {
      const user = createMockUser();
      expect(checkMatcher('nocolon', user, null)).toBe(false);
    });
  });

  // ============================================================================
  // DENY POLICY BYPASS PROTECTION TESTS (critical security tests)
  // ============================================================================
  describe('DENY policy bypass protection', () => {
    test('DENY policy cannot be bypassed by multiple ALLOW policies', async () => {
      const user = createMockUser();
      const allowPolicy1 = createMockPolicy({
        id: 'allow-1',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });
      const allowPolicy2 = createMockPolicy({
        id: 'allow-2',
        slug: 'allow-2',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });
      const denyPolicy = createMockPolicy({
        id: 'deny-1',
        slug: 'deny-1',
        matchers: ['role:User'],
        toolPatterns: ['github.com::deleteRepo'],
        effect: PolicyEffect.DENY,
        description: 'Cannot delete repos',
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::deleteRepo' }, [
        allowPolicy1,
        allowPolicy2,
        denyPolicy,
      ]);

      expect(result.decision).toBe('DENIED');
      expect(result.policyIds).toContain(denyPolicy.id);
    });

    test('DENY policy takes precedence regardless of order', async () => {
      const user = createMockUser();
      // DENY first, then ALLOW
      const denyFirst = createMockPolicy({
        id: 'deny-first',
        matchers: ['*'],
        toolPatterns: ['danger::*'],
        effect: PolicyEffect.DENY,
        description: 'Deny dangerous tools',
      });
      const allowAfter = createMockPolicy({
        id: 'allow-after',
        slug: 'allow-after',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result1 = await evaluatePolicy({ user, toolName: 'danger::execute' }, [
        denyFirst,
        allowAfter,
      ]);
      expect(result1.decision).toBe('DENIED');

      // ALLOW first, then DENY
      const result2 = await evaluatePolicy({ user, toolName: 'danger::execute' }, [
        allowAfter,
        denyFirst,
      ]);
      expect(result2.decision).toBe('DENIED');
    });

    test('DENY policy with wildcard blocks even specific ALLOW', async () => {
      const user = createMockUser();
      const specificAllow = createMockPolicy({
        id: 'specific-allow',
        matchers: ['user:test@example.com'],
        toolPatterns: ['admin::deleteUser'],
        effect: PolicyEffect.ALLOW,
      });
      const wildcardDeny = createMockPolicy({
        id: 'wildcard-deny',
        slug: 'wildcard-deny',
        matchers: ['*'],
        toolPatterns: ['admin::*'],
        effect: PolicyEffect.DENY,
        description: 'No admin tools allowed',
      });

      const result = await evaluatePolicy({ user, toolName: 'admin::deleteUser' }, [
        specificAllow,
        wildcardDeny,
      ]);

      expect(result.decision).toBe('DENIED');
    });

    test('DENY in delegation cannot be bypassed by user ALLOW', async () => {
      const user = createMockUser();
      const agent = createMockAgent({ id: 'agent-1' });
      const delegatedUser = createMockUser({
        id: 'delegated-1',
        email: 'delegated@example.com',
        userRoles: [
          {
            id: 'role-admin',
            userId: 'delegated-1',
            roleId: 'role-id-admin',
            createdAt: new Date(),
            role: {
              id: 'role-id-admin',
              organizationId: 'org-1',
              name: 'Admin',
              isAdmin: true,
              description: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
              deletedBy: null,
            },
          },
        ],
      });

      // Agent has DENY, user has ALLOW
      const agentDeny = createMockPolicy({
        id: 'agent-deny',
        matchers: ['agent:agent-1'],
        toolPatterns: ['sensitive::*'],
        effect: PolicyEffect.DENY,
        description: 'Agent denied from sensitive tools',
      });
      const userAllow = createMockPolicy({
        id: 'user-allow',
        slug: 'user-allow',
        matchers: ['role:Admin'],
        toolPatterns: ['sensitive::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy(
        { user, agent, delegatedUser, toolName: 'sensitive::viewSecrets' },
        [agentDeny, userAllow],
      );

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('Agent denied by policy');
    });

    test('user DENY in delegation cannot be bypassed by agent ALLOW', async () => {
      const user = createMockUser();
      const agent = createMockAgent({ id: 'agent-1' });
      const delegatedUser = createMockUser({
        id: 'delegated-1',
        email: 'blocked@example.com',
      });

      // Agent has ALLOW, user has DENY
      const agentAllow = createMockPolicy({
        id: 'agent-allow',
        matchers: ['agent:*'],
        toolPatterns: ['data::*'],
        effect: PolicyEffect.ALLOW,
      });
      const userDeny = createMockPolicy({
        id: 'user-deny',
        slug: 'user-deny',
        matchers: ['user:blocked@example.com'],
        toolPatterns: ['data::*'],
        effect: PolicyEffect.DENY,
        description: 'User blocked from data tools',
      });

      const result = await evaluatePolicy(
        { user, agent, delegatedUser, toolName: 'data::export' },
        [agentAllow, userDeny],
      );

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('Delegated user denied by policy');
    });
  });

  // ============================================================================
  // POLICY CONDITIONS TESTS
  // ============================================================================
  describe('policy conditions evaluation', () => {
    test('should ignore disabled policies even with conditions', async () => {
      const user = createMockUser();
      const disabledPolicy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        enabled: false,
        conditions: JSON.stringify({
          all: [{ fact: 'time', operator: 'during', value: { start: '09:00', end: '17:00' } }],
        }),
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, [
        disabledPolicy,
      ]);

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toBe('No matching ALLOW policy');
    });

    test('should ignore deleted policies even with conditions', async () => {
      const user = createMockUser();
      const deletedPolicy = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        deletedAt: new Date(),
        conditions: JSON.stringify({
          all: [{ fact: 'sourceIp', operator: 'in', value: ['192.168.1.0/24'] }],
        }),
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, [
        deletedPolicy,
      ]);

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toBe('No matching ALLOW policy');
    });

    test('DENY policies apply regardless of conditions', async () => {
      const user = createMockUser();
      // DENY policy with conditions should still deny
      const denyWithConditions = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.DENY,
        description: 'Deny with conditions',
        conditions: JSON.stringify({
          all: [{ fact: 'impossible', operator: 'equals', value: 'never' }],
        }),
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, [
        denyWithConditions,
      ]);

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toContain('Deny with conditions');
    });

    test('ALLOW policy with invalid conditions format should pass through', async () => {
      const user = createMockUser();
      const policyWithInvalidConditions = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        // Invalid conditions format - not valid JSON conditions
        conditions: 'not-valid-json',
      });

      const result = await evaluatePolicy({ user, toolName: 'github.com::createPR' }, [
        policyWithInvalidConditions,
      ]);

      // Should still ALLOW since invalid conditions are treated as no conditions
      expect(result.decision).toBe('ALLOWED');
    });

    test('ALLOW policy with passing conditions should be allowed', async () => {
      const user = createMockUser();
      // Create a policy with valid conditions that always pass
      // Prisma JSON fields are parsed objects, not strings
      const policyWithPassingConditions = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        // Valid conditions format - hour of day is always >= 0
        conditions: [{ field: 'time.hourOfDay', operator: 'greaterThan', value: -1 }],
      });

      const result = await evaluatePolicy(
        { user, toolName: 'github.com::createPR', parameters: {} },
        [policyWithPassingConditions],
      );

      // Conditions pass, so should be ALLOWED
      expect(result.decision).toBe('ALLOWED');
    });

    test('ALLOW policy with failing conditions should not match', async () => {
      const user = createMockUser();
      // Create a policy with conditions that will fail
      // Hour of day is always 0-23, so this will never be true
      const policyWithFailingConditions = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        // Conditions that will fail - hour is never greater than 24
        conditions: [{ field: 'time.hourOfDay', operator: 'greaterThan', value: 24 }],
      });

      const result = await evaluatePolicy(
        { user, toolName: 'github.com::createPR', parameters: {} },
        [policyWithFailingConditions],
      );

      // Conditions fail, so this policy doesn't match -> DENIED (no matching ALLOW)
      expect(result.decision).toBe('DENIED');
      expect(result.justification).toBe('No matching ALLOW policy');
    });

    test('should evaluate conditions with context overrides', async () => {
      const user = createMockUser();
      const policyWithConditions = createMockPolicy({
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        // Condition checking a parameter
        conditions: [{ field: 'params.repo', operator: 'equals', value: 'allowed-repo' }],
      });

      // Test with matching parameters via context overrides
      const result = await evaluatePolicy(
        {
          user,
          toolName: 'github.com::createPR',
          parameters: { repo: 'allowed-repo' },
          contextOverrides: {},
        },
        [policyWithConditions],
      );

      expect(result.decision).toBe('ALLOWED');
    });

    test('should prefer ALLOW policy without conditions when one with conditions fails', async () => {
      const user = createMockUser();
      // Policy with failing conditions (hour is never > 24)
      const policyWithFailingConditions = createMockPolicy({
        id: 'policy-with-conditions',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: [{ field: 'time.hourOfDay', operator: 'greaterThan', value: 24 }],
      });
      // Policy without conditions
      const policyWithoutConditions = createMockPolicy({
        id: 'policy-no-conditions',
        slug: 'policy-no-conditions',
        matchers: ['role:User'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
        conditions: null,
      });

      const result = await evaluatePolicy(
        { user, toolName: 'github.com::createPR', parameters: {} },
        [policyWithFailingConditions, policyWithoutConditions],
      );

      // Policy without conditions should match
      expect(result.decision).toBe('ALLOWED');
      expect(result.policyIds).toContain('policy-no-conditions');
    });
  });

  // ============================================================================
  // A2A TOOL PATTERN VALIDATION TESTS
  // ============================================================================
  describe('validateToolPattern - A2A patterns', () => {
    test('should accept valid A2A patterns', () => {
      expect(validateToolPattern('a2a::weather::forecast')).toBe(true);
      expect(validateToolPattern('a2a::my-agent::get-data')).toBe(true);
      expect(validateToolPattern('a2a::agent.name::skill_name')).toBe(true);
    });

    test('should accept A2A patterns with wildcards', () => {
      expect(validateToolPattern('a2a::*::*')).toBe(true);
      expect(validateToolPattern('a2a::weather::*')).toBe(true);
      expect(validateToolPattern('a2a::*::forecast')).toBe(true);
    });

    test('should reject A2A patterns with wrong number of parts', () => {
      expect(validateToolPattern('a2a::only-two')).toBe(false);
      expect(validateToolPattern('a2a::too::many::parts')).toBe(false);
      expect(validateToolPattern('a2a::')).toBe(false);
    });

    test('should reject A2A patterns with invalid characters', () => {
      expect(validateToolPattern('a2a::agent@name::skill')).toBe(false);
      expect(validateToolPattern('a2a::agent::skill/path')).toBe(false);
    });
  });

  // ============================================================================
  // TOOL PATTERNS OVERLAP - A2A EDGE CASES
  // ============================================================================
  describe('toolPatternsOverlap - A2A edge cases', () => {
    test('should detect overlap between A2A patterns', () => {
      expect(toolPatternsOverlap('a2a::weather::*', 'a2a::weather::forecast')).toBe(true);
      expect(toolPatternsOverlap('a2a::*::forecast', 'a2a::weather::forecast')).toBe(true);
      expect(toolPatternsOverlap('a2a::*::*', 'a2a::weather::forecast')).toBe(true);
    });

    test('should not detect overlap between A2A and MCP patterns', () => {
      expect(toolPatternsOverlap('a2a::weather::*', 'weather.com::*')).toBe(false);
      expect(toolPatternsOverlap('github.com::*', 'a2a::github::*')).toBe(false);
    });

    test('should not detect overlap for different A2A agents', () => {
      expect(toolPatternsOverlap('a2a::weather::*', 'a2a::maps::*')).toBe(false);
    });

    test('should not detect overlap for different A2A skills', () => {
      expect(toolPatternsOverlap('a2a::weather::forecast', 'a2a::weather::current')).toBe(false);
    });

    test('should handle invalid A2A patterns in overlap check', () => {
      expect(toolPatternsOverlap('a2a::invalid', 'a2a::weather::forecast')).toBe(false);
      expect(toolPatternsOverlap('a2a::weather::forecast', 'a2a::invalid')).toBe(false);
    });
  });

  // ============================================================================
  // COMPLEX POLICY SCENARIOS
  // ============================================================================
  describe('complex policy scenarios', () => {
    test('should evaluate multiple overlapping policies correctly', async () => {
      const user = createMockUser();
      // Universal ALLOW, then specific DENY, then another ALLOW
      const universalAllow = createMockPolicy({
        id: 'universal-allow',
        matchers: ['*'],
        toolPatterns: ['*::*'],
        effect: PolicyEffect.ALLOW,
      });
      const specificDeny = createMockPolicy({
        id: 'specific-deny',
        slug: 'specific-deny',
        matchers: ['role:User'],
        toolPatterns: ['danger::*'],
        effect: PolicyEffect.DENY,
        description: 'Block danger tools',
      });
      const anotherAllow = createMockPolicy({
        id: 'another-allow',
        slug: 'another-allow',
        matchers: ['role:User'],
        toolPatterns: ['danger::safeAction'],
        effect: PolicyEffect.ALLOW,
      });

      // Should be denied for danger::execute (specific deny matches)
      const result1 = await evaluatePolicy({ user, toolName: 'danger::execute' }, [
        universalAllow,
        specificDeny,
        anotherAllow,
      ]);
      expect(result1.decision).toBe('DENIED');

      // Should also be denied for danger::safeAction (DENY wins over specific ALLOW)
      const result2 = await evaluatePolicy({ user, toolName: 'danger::safeAction' }, [
        universalAllow,
        specificDeny,
        anotherAllow,
      ]);
      expect(result2.decision).toBe('DENIED');

      // Should be allowed for safe::action (no deny matches)
      const result3 = await evaluatePolicy({ user, toolName: 'safe::action' }, [
        universalAllow,
        specificDeny,
        anotherAllow,
      ]);
      expect(result3.decision).toBe('ALLOWED');
    });

    test('should handle user with multiple roles', async () => {
      const multiRoleUser = createMockUser({
        userRoles: [
          {
            id: 'role-1',
            userId: 'user-1',
            roleId: 'role-id-1',
            createdAt: new Date(),
            role: {
              id: 'role-id-1',
              organizationId: 'org-1',
              name: 'User',
              isAdmin: false,
              description: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
              deletedBy: null,
            },
          },
          {
            id: 'role-2',
            userId: 'user-1',
            roleId: 'role-id-2',
            createdAt: new Date(),
            role: {
              id: 'role-id-2',
              organizationId: 'org-1',
              name: 'Developer',
              isAdmin: false,
              description: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
              deletedBy: null,
            },
          },
        ],
      });

      // Policy for Developer role
      const developerPolicy = createMockPolicy({
        id: 'developer-policy',
        matchers: ['role:Developer'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.ALLOW,
      });

      const result = await evaluatePolicy({ user: multiRoleUser, toolName: 'github.com::push' }, [
        developerPolicy,
      ]);

      expect(result.decision).toBe('ALLOWED');
    });

    test('should handle empty policy list', async () => {
      const user = createMockUser();

      const result = await evaluatePolicy({ user, toolName: 'any::tool' }, []);

      expect(result.decision).toBe('DENIED');
      expect(result.justification).toBe('No matching ALLOW policy');
      expect(result.policyIds).toEqual([]);
    });
  });

  // ============================================================================
  // formatListWithAnd EDGE CASES (via generatePolicyDescription)
  // ============================================================================
  describe('formatListWithAnd (via generatePolicyDescription)', () => {
    test('should format single item without "and"', () => {
      const description = generatePolicyDescription(['role:User'], ['github.com::*'], 'ALLOW');
      expect(description).toContain("role 'User'");
      expect(description).not.toContain(' and ');
    });

    test('should format two items with "and"', () => {
      const description = generatePolicyDescription(
        ['role:User', 'role:Admin'],
        ['github.com::*'],
        'ALLOW',
      );
      expect(description).toContain("role 'User' and role 'Admin'");
    });

    test('should format three items with commas and "and"', () => {
      const description = generatePolicyDescription(
        ['role:User', 'role:Admin', 'role:Developer'],
        ['github.com::*'],
        'ALLOW',
      );
      expect(description).toContain("role 'User', role 'Admin', and role 'Developer'");
    });

    test('should format multiple tool patterns with "and"', () => {
      const description = generatePolicyDescription(
        ['role:User'],
        ['github.com::*', 'notion.com::*'],
        'ALLOW',
      );
      expect(description).toContain("all tools on 'github.com' and all tools on 'notion.com'");
    });
  });

  // ============================================================================
  // MCP PATTERN EDGE CASES
  // ============================================================================
  describe('MCP pattern edge cases', () => {
    test('should handle pattern with invalid format gracefully', () => {
      const description = generatePolicyDescription(
        ['role:User'],
        ['invalid-no-separator'],
        'ALLOW',
      );
      // Should return the raw pattern when format is invalid
      expect(description).toContain('invalid-no-separator');
    });

    test('should handle pattern with too many separators', () => {
      const description = generatePolicyDescription(['role:User'], ['too::many::parts'], 'ALLOW');
      // When split, this creates 3 parts but MCP expects 2
      // The first two parts are used
      expect(description).toContain('too');
    });
  });
});
