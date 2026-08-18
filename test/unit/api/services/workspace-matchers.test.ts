/**
 * Tests for Workspace Matchers in Policy Service
 * Tests workspace and workspace-admin matcher patterns
 */

import type { Agent, Role, User, UserRole } from '@sentinel/db';
import { OrgRole } from '@sentinel/db';
import { describe, expect, test } from 'vitest';
import { checkMatcher } from '../../../../packages/api/src/services/policy.js';

// Extended user type with workspace memberships for testing
type UserWithWorkspaces = User & {
  userRoles: (UserRole & { role: Role })[];
  workspaceMemberships?: Array<{ workspaceId: string; role: string }>;
};

// Helper to create a test user with all required fields
function createUser(overrides: Partial<UserWithWorkspaces> = {}): UserWithWorkspaces {
  return {
    id: 'user-1',
    email: 'user@example.com',
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
        id: 'user-role-1',
        userId: 'user-1',
        roleId: 'role-1',
        createdAt: new Date(),
        role: {
          id: 'role-1',
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

// Helper to create a test agent with all required fields
function createAgent(overrides: Partial<Agent> = {}): Agent {
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

describe('checkMatcher - workspace matchers', () => {
  describe('workspace:* matcher', () => {
    test('should match user with any workspace membership', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-1', role: 'MEMBER' }],
      });

      expect(checkMatcher('workspace:*', user)).toBe(true);
    });

    test('should match user with multiple workspace memberships', () => {
      const user = createUser({
        workspaceMemberships: [
          { workspaceId: 'ws-1', role: 'MEMBER' },
          { workspaceId: 'ws-2', role: 'ADMIN' },
        ],
      });

      expect(checkMatcher('workspace:*', user)).toBe(true);
    });

    test('should not match user without workspaceMemberships', () => {
      const user = createUser({ workspaceMemberships: undefined });

      expect(checkMatcher('workspace:*', user)).toBe(false);
    });

    test('should not match user with empty workspaceMemberships', () => {
      const user = createUser({ workspaceMemberships: [] });

      expect(checkMatcher('workspace:*', user)).toBe(false);
    });
  });

  describe('workspace:{id} matcher', () => {
    test('should match user who is member of specific workspace', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-123', role: 'MEMBER' }],
      });

      expect(checkMatcher('workspace:ws-123', user)).toBe(true);
    });

    test('should match user who is admin of specific workspace', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-123', role: 'ADMIN' }],
      });

      expect(checkMatcher('workspace:ws-123', user)).toBe(true);
    });

    test('should not match user who is member of different workspace', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-456', role: 'MEMBER' }],
      });

      expect(checkMatcher('workspace:ws-123', user)).toBe(false);
    });

    test('should not match user without workspaceMemberships', () => {
      const user = createUser({ workspaceMemberships: undefined });

      expect(checkMatcher('workspace:ws-123', user)).toBe(false);
    });

    test('should not match user with empty workspaceMemberships', () => {
      const user = createUser({ workspaceMemberships: [] });

      expect(checkMatcher('workspace:ws-123', user)).toBe(false);
    });

    test('should match when user is in multiple workspaces including target', () => {
      const user = createUser({
        workspaceMemberships: [
          { workspaceId: 'ws-111', role: 'MEMBER' },
          { workspaceId: 'ws-123', role: 'MEMBER' },
          { workspaceId: 'ws-222', role: 'ADMIN' },
        ],
      });

      expect(checkMatcher('workspace:ws-123', user)).toBe(true);
    });
  });

  describe('workspace-admin:* matcher', () => {
    test('should match user who is admin of any workspace', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-1', role: 'ADMIN' }],
      });

      expect(checkMatcher('workspace-admin:*', user)).toBe(true);
    });

    test('should match user who is admin of at least one workspace', () => {
      const user = createUser({
        workspaceMemberships: [
          { workspaceId: 'ws-1', role: 'MEMBER' },
          { workspaceId: 'ws-2', role: 'ADMIN' },
        ],
      });

      expect(checkMatcher('workspace-admin:*', user)).toBe(true);
    });

    test('should not match user who is only a member (not admin)', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-1', role: 'MEMBER' }],
      });

      expect(checkMatcher('workspace-admin:*', user)).toBe(false);
    });

    test('should not match user without workspaceMemberships', () => {
      const user = createUser({ workspaceMemberships: undefined });

      expect(checkMatcher('workspace-admin:*', user)).toBe(false);
    });

    test('should not match user with empty workspaceMemberships', () => {
      const user = createUser({ workspaceMemberships: [] });

      expect(checkMatcher('workspace-admin:*', user)).toBe(false);
    });
  });

  describe('workspace-admin:{id} matcher', () => {
    test('should match user who is admin of specific workspace', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-123', role: 'ADMIN' }],
      });

      expect(checkMatcher('workspace-admin:ws-123', user)).toBe(true);
    });

    test('should not match user who is only member of specific workspace', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-123', role: 'MEMBER' }],
      });

      expect(checkMatcher('workspace-admin:ws-123', user)).toBe(false);
    });

    test('should not match user who is admin of different workspace', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-456', role: 'ADMIN' }],
      });

      expect(checkMatcher('workspace-admin:ws-123', user)).toBe(false);
    });

    test('should not match user without workspaceMemberships', () => {
      const user = createUser({ workspaceMemberships: undefined });

      expect(checkMatcher('workspace-admin:ws-123', user)).toBe(false);
    });

    test('should match when user is admin of target workspace among multiple', () => {
      const user = createUser({
        workspaceMemberships: [
          { workspaceId: 'ws-111', role: 'MEMBER' },
          { workspaceId: 'ws-123', role: 'ADMIN' },
          { workspaceId: 'ws-222', role: 'MEMBER' },
        ],
      });

      expect(checkMatcher('workspace-admin:ws-123', user)).toBe(true);
    });

    test('should not match when user is member of target but admin elsewhere', () => {
      const user = createUser({
        workspaceMemberships: [
          { workspaceId: 'ws-123', role: 'MEMBER' },
          { workspaceId: 'ws-456', role: 'ADMIN' },
        ],
      });

      expect(checkMatcher('workspace-admin:ws-123', user)).toBe(false);
    });
  });

  describe('interaction with agents', () => {
    test('workspace matcher ignores agent parameter', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-123', role: 'MEMBER' }],
      });
      const agent = createAgent();

      expect(checkMatcher('workspace:ws-123', user, agent)).toBe(true);
    });

    test('workspace-admin matcher ignores agent parameter', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-123', role: 'ADMIN' }],
      });
      const agent = createAgent();

      expect(checkMatcher('workspace-admin:ws-123', user, agent)).toBe(true);
    });
  });

  describe('wildcard matcher with workspaces', () => {
    test('* matcher should match user with workspace memberships', () => {
      const user = createUser({
        workspaceMemberships: [{ workspaceId: 'ws-1', role: 'MEMBER' }],
      });

      expect(checkMatcher('*', user)).toBe(true);
    });

    test('* matcher should match user without workspace memberships', () => {
      const user = createUser({ workspaceMemberships: undefined });

      expect(checkMatcher('*', user)).toBe(true);
    });
  });
});
