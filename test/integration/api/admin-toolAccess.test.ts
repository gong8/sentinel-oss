/**
 * Integration tests for admin tool access preview
 */

import type { inferProcedureInput } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AppRouter } from '../../../packages/api/src/trpc/router.js';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestAdmin, createTestRole, createTestUser } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Admin Tool Access Preview', () => {
  let tenant: TestTenant;
  let adminUserId: string;
  let testUserId: string;
  let testRoleId: string;
  let testAgentId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    // Create admin user
    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminUserId = admin.id;

    // Create test role
    const testRole = await createTestRole({
      organizationId: tenant.orgId,
      name: 'TestRole',
      isAdmin: false,
    });
    testRoleId = testRole.id;

    // Create test user with test role (factory creates with User role by default, we'll update)
    const testUser = await createTestUser({
      organizationId: tenant.orgId,
      email: 'testuser@test.local',
    });
    testUserId = testUser.id;

    // Update user to have TestRole instead
    await prisma.userRole.deleteMany({ where: { userId: testUserId } });
    await prisma.userRole.create({ data: { userId: testUserId, roleId: testRoleId } });

    // Create test agent
    const agent = await prisma.agent.create({
      data: {
        name: 'Test Agent',
        organizationId: tenant.orgId,
      },
    });
    testAgentId = agent.id;

    // Create MCP server with tools
    await prisma.mcpServer.create({
      data: {
        organizationId: tenant.orgId,
        name: 'Test Server',
        url: 'http://test.local',
        authType: 'NONE',
        trusted: true,
        tools: {
          create: [
            {
              name: 'test.local::allowed_tool',
              description: 'This tool should be allowed',
            },
            {
              name: 'test.local::denied_tool',
              description: 'This tool should be denied',
            },
          ],
        },
      },
    });

    // Create policies
    // Allow TestRole to use allowed_tool
    await prisma.policy.create({
      data: {
        organizationId: tenant.orgId,
        slug: 'allow-test-role',
        description: 'Allow TestRole to use allowed_tool',
        matchers: ['role:TestRole'],
        toolPatterns: ['test.local::allowed_tool'],
        effect: 'ALLOW',
        enabled: true,
      },
    });

    // Deny TestRole from denied_tool
    await prisma.policy.create({
      data: {
        organizationId: tenant.orgId,
        slug: 'deny-test-role',
        description: 'Deny TestRole from using denied_tool',
        matchers: ['role:TestRole'],
        toolPatterns: ['test.local::denied_tool'],
        effect: 'DENY',
        enabled: true,
      },
    });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  test('should get tool access for a user', async () => {
    // Get admin user with roles
    const admin = await prisma.user.findUnique({
      where: { id: adminUserId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!admin) throw new Error('Admin not found');

    const caller = createCallerWithUser(admin);

    type Input = inferProcedureInput<AppRouter['admin']['mcpServers']['getToolAccessForUser']>;
    const input: Input = {
      userId: testUserId,
    };

    const result = await caller.admin.mcpServers.getToolAccessForUser(input);

    expect(result.user).toBeDefined();
    expect(result.user?.email).toBe('testuser@test.local');
    expect(result.user?.roles).toHaveLength(1);
    expect(result.user?.roles[0]?.name).toBe('TestRole');

    expect(result.toolAccess).toBeDefined();
    expect(result.toolAccess.length).toBeGreaterThan(0);

    // Check that allowed_tool is ALLOWED
    const allowedTool = result.toolAccess.find((ta) => ta.toolName === 'test.local::allowed_tool');
    expect(allowedTool).toBeDefined();
    expect(allowedTool?.decision).toBe('ALLOWED');

    // Check that denied_tool is DENIED
    const deniedTool = result.toolAccess.find((ta) => ta.toolName === 'test.local::denied_tool');
    expect(deniedTool).toBeDefined();
    expect(deniedTool?.decision).toBe('DENIED');
    expect(deniedTool?.justification).toContain('Denied by policy');
  });

  test('should get tool access for a role', async () => {
    const admin = await prisma.user.findUnique({
      where: { id: adminUserId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!admin) throw new Error('Admin not found');

    const caller = createCallerWithUser(admin);

    type Input = inferProcedureInput<AppRouter['admin']['mcpServers']['getToolAccessForUser']>;
    const input: Input = {
      roleId: testRoleId,
    };

    const result = await caller.admin.mcpServers.getToolAccessForUser(input);

    expect(result.role).toBeDefined();
    expect(result.role?.name).toBe('TestRole');

    // Should have synthetic user with the role
    expect(result.user).toBeDefined();
    expect(result.user?.roles).toHaveLength(1);
    expect(result.user?.roles[0]?.name).toBe('TestRole');

    // Check tool access matches expected
    const allowedTool = result.toolAccess.find((ta) => ta.toolName === 'test.local::allowed_tool');
    expect(allowedTool?.decision).toBe('ALLOWED');

    const deniedTool = result.toolAccess.find((ta) => ta.toolName === 'test.local::denied_tool');
    expect(deniedTool?.decision).toBe('DENIED');
  });

  test('should get tool access for an agent', async () => {
    const admin = await prisma.user.findUnique({
      where: { id: adminUserId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!admin) throw new Error('Admin not found');

    const caller = createCallerWithUser(admin);

    type Input = inferProcedureInput<AppRouter['admin']['mcpServers']['getToolAccessForUser']>;
    const input: Input = {
      agentId: testAgentId,
    };

    const result = await caller.admin.mcpServers.getToolAccessForUser(input);

    expect(result.agent).toBeDefined();
    expect(result.agent?.name).toBe('Test Agent');

    // Without user context, tools should be denied
    expect(result.toolAccess).toBeDefined();
    const allDenied = result.toolAccess.every((ta) => ta.decision === 'DENIED');
    expect(allDenied).toBe(true);
  });

  test('should require at least one parameter', async () => {
    const admin = await prisma.user.findUnique({
      where: { id: adminUserId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!admin) throw new Error('Admin not found');

    const caller = createCallerWithUser(admin);

    type Input = inferProcedureInput<AppRouter['admin']['mcpServers']['getToolAccessForUser']>;
    const input: Input = {};

    await expect(caller.admin.mcpServers.getToolAccessForUser(input)).rejects.toThrow(
      'Must specify either userId, agentId, or roleId',
    );
  });

  test('should reject non-existent user', async () => {
    const admin = await prisma.user.findUnique({
      where: { id: adminUserId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!admin) throw new Error('Admin not found');

    const caller = createCallerWithUser(admin);

    type Input = inferProcedureInput<AppRouter['admin']['mcpServers']['getToolAccessForUser']>;
    const input: Input = {
      userId: 'non-existent-user-id',
    };

    await expect(caller.admin.mcpServers.getToolAccessForUser(input)).rejects.toThrow(
      'User not found',
    );
  });
});
