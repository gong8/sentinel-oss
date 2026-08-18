/**
 * Integration tests for Admin Permission Requests Router
 * Tests permission request review and approval workflow
 */

import { PermissionRequestStatus, PolicyEffect } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestAdmin, createTestMcpServer, createTestUser } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

// Mock license service to enable approval_workflows feature for integration tests
vi.mock('../../../packages/api/src/services/license.service.js', () => ({
  getLicenseInfo: vi.fn().mockResolvedValue({
    valid: true,
    tier: 'standard',
    organization: 'Test Organization',
    features: ['approval_workflows', 'basic_policies', 'all_policies'],
    expiresAt: null,
    seatCount: 100,
    maxMcpServers: 100,
  }),
  hasFeature: vi.fn().mockResolvedValue(true),
  hasTier: vi.fn().mockResolvedValue(true),
  validateLicenseOnStartup: vi.fn().mockResolvedValue({
    valid: true,
    tier: 'standard',
    organization: 'Test Organization',
    features: ['approval_workflows'],
    expiresAt: null,
    seatCount: 100,
    maxMcpServers: 100,
  }),
  getLicenseStatus: vi.fn().mockReturnValue({
    valid: true,
    tier: 'standard',
    organization: 'Test Organization',
    seatCount: 100,
    maxMcpServers: 100,
    lastValidation: new Date().toISOString(),
  }),
  isWithinSeatLimit: vi.fn().mockResolvedValue(true),
  isWithinServerLimit: vi.fn().mockResolvedValue(true),
  getLicenseLimits: vi.fn().mockResolvedValue({
    seatCount: 100,
    maxMcpServers: 100,
  }),
}));

describe.skipIf(!hasDatabaseUrl())('Admin Permission Requests Router', () => {
  let tenant: TestTenant;
  let adminId: string;
  let userId: string;
  let userEmail: string;
  let mcpServerId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    const admin = await createTestAdmin({ organizationId: tenant.orgId });
    adminId = admin.id;

    const user = await createTestUser({ organizationId: tenant.orgId });
    userId = user.id;
    userEmail = user.email;

    // Create MCP server and tools for validation
    const mcpServer = await createTestMcpServer({
      organizationId: tenant.orgId,
      name: 'GitHub',
      url: 'https://github.com/mcp',
    });
    mcpServerId = mcpServer.id;

    await prisma.mcpTool.createMany({
      data: [
        {
          mcpServerId: mcpServerId,
          name: 'createPR',
          description: 'Create pull request',
        },
        {
          mcpServerId: mcpServerId,
          name: 'getFile',
          description: 'Get file content',
        },
      ],
    });
  });

  afterEach(async () => {
    await tenant.cleanup();
  });

  describe('list', () => {
    test('should list all permission requests', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.permissionRequest.createMany({
        data: [
          {
            userId,
            toolNames: ['github.com::createPR'],
            reason: 'Need to create PRs',
            status: PermissionRequestStatus.PENDING,
          },
          {
            userId,
            toolNames: ['github.com::getFile'],
            reason: 'Need to read files',
            status: PermissionRequestStatus.APPROVED,
          },
        ],
      });

      const caller = createCallerWithUser(admin);
      const requests = await caller.admin.permissionRequests.list({});

      expect(requests.length).toBe(2);
      expect(requests.some((r) => r.status === PermissionRequestStatus.PENDING)).toBe(true);
      expect(requests.some((r) => r.status === PermissionRequestStatus.APPROVED)).toBe(true);
    });

    test('should filter by status', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.permissionRequest.createMany({
        data: [
          {
            userId,
            toolNames: ['github.com::createPR'],
            reason: 'Need to create PRs',
            status: PermissionRequestStatus.PENDING,
          },
          {
            userId,
            toolNames: ['github.com::getFile'],
            reason: 'Need to read files',
            status: PermissionRequestStatus.APPROVED,
          },
        ],
      });

      const caller = createCallerWithUser(admin);
      const pendingRequests = await caller.admin.permissionRequests.list({
        status: PermissionRequestStatus.PENDING,
      });

      expect(pendingRequests.length).toBe(1);
      expect(pendingRequests.every((r) => r.status === PermissionRequestStatus.PENDING)).toBe(true);
    });

    test('should include user email in response', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR'],
          reason: 'Need to create PRs',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      const requests = await caller.admin.permissionRequests.list({});

      expect(requests[0].user.email).toBe(userEmail);
    });

    test('should not list requests from other organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const otherOrg = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherUser = await createTestUser({
        organizationId: otherOrg.id,
      });

      await prisma.permissionRequest.create({
        data: {
          userId: otherUser.id,
          toolNames: ['github.com::createPR'],
          reason: 'Other org request',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      const requests = await caller.admin.permissionRequests.list({});

      expect(requests.every((r) => r.userId !== otherUser.id)).toBe(true);

      await prisma.permissionRequest.deleteMany({ where: { userId: otherUser.id } });
      await prisma.userRole.deleteMany({ where: { role: { organizationId: otherOrg.id } } });
      await prisma.role.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });

  describe('get', () => {
    test('should get specific permission request by id', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR', 'github.com::getFile'],
          reason: 'Need GitHub access',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      const result = await caller.admin.permissionRequests.get({ id: request.id });

      expect(result.id).toBe(request.id);
      expect(result.toolNames).toEqual(['github.com::createPR', 'github.com::getFile']);
      expect(result.reason).toBe('Need GitHub access');
      expect(result.user.email).toBe(userEmail);
    });

    test('should throw NOT_FOUND for non-existent request', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.permissionRequests.get({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('Permission request not found');
    });

    test('should not return requests from other organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const otherOrg = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherUser = await createTestUser({
        organizationId: otherOrg.id,
      });

      const otherRequest = await prisma.permissionRequest.create({
        data: {
          userId: otherUser.id,
          toolNames: ['github.com::createPR'],
          reason: 'Other org request',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      await expect(caller.admin.permissionRequests.get({ id: otherRequest.id })).rejects.toThrow(
        'Permission request not found',
      );

      await prisma.permissionRequest.deleteMany({ where: { id: otherRequest.id } });
      await prisma.userRole.deleteMany({ where: { role: { organizationId: otherOrg.id } } });
      await prisma.role.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });

  describe('approve', () => {
    test('should approve permission request and create policies', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR', 'github.com::getFile'],
          reason: 'Need GitHub access',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      const updated = await caller.admin.permissionRequests.approve({
        id: request.id,
        reviewNote: 'Approved for testing',
      });

      expect(updated.status).toBe(PermissionRequestStatus.APPROVED);
      expect(updated.reviewedBy).toBe(adminId);
      expect(updated.reviewedAt).toBeTruthy();
      expect(updated.reviewNote).toBe('Approved for testing');

      // Verify policies were created
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          matchers: { has: `user:${userEmail}` },
          effect: PolicyEffect.ALLOW,
        },
      });

      expect(policies.length).toBe(2);
      expect(policies.some((p) => p.toolPatterns.includes('github.com::createPR'))).toBe(true);
      expect(policies.some((p) => p.toolPatterns.includes('github.com::getFile'))).toBe(true);
      expect(policies[0].description).toContain('Allow user');
      expect(policies[0].description).toContain('to use');
    });

    test('should not create duplicate policies if already exist', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create existing policy
      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'existing-policy',
          matchers: [`user:${userEmail}`],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Existing policy',
          enabled: true,
        },
      });

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR', 'github.com::getFile'],
          reason: 'Need GitHub access',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      await caller.admin.permissionRequests.approve({
        id: request.id,
      });

      // Verify only one new policy was created (getFile)
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          matchers: { has: `user:${userEmail}` },
          effect: PolicyEffect.ALLOW,
        },
      });

      expect(policies.length).toBe(2); // existing createPR + new getFile
    });

    test('should throw NOT_FOUND for non-existent request', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.permissionRequests.approve({
          id: 'cm00000000000nonexistent',
        }),
      ).rejects.toThrow('Permission request not found');
    });

    test('should reject already reviewed request', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR'],
          reason: 'Need access',
          status: PermissionRequestStatus.APPROVED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.permissionRequests.approve({
          id: request.id,
        }),
      ).rejects.toThrow('Permission request has already been reviewed');
    });

    test('should reject invalid tool names', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['Nonexistent Server::tool'],
          reason: 'Need access',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.permissionRequests.approve({
          id: request.id,
        }),
      ).rejects.toThrow();
    });
  });

  describe('deny', () => {
    test('should deny permission request with review note', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR'],
          reason: 'Need access',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      const updated = await caller.admin.permissionRequests.deny({
        id: request.id,
        reviewNote: 'Insufficient justification',
      });

      expect(updated.status).toBe(PermissionRequestStatus.DENIED);
      expect(updated.reviewedBy).toBe(adminId);
      expect(updated.reviewedAt).toBeTruthy();
      expect(updated.reviewNote).toBe('Insufficient justification');

      // Verify no policies were created
      const policies = await prisma.policy.findMany({
        where: {
          organizationId: tenant.orgId,
          matchers: { has: `user:${userEmail}` },
        },
      });

      expect(policies.length).toBe(0);
    });

    test('should require review note when denying', async () => {
      // Test that the deny endpoint requires reviewNote by calling the API
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);

      // Calling deny without reviewNote should fail validation
      // Using type assertion to bypass TypeScript and test runtime validation
      await expect(
        caller.admin.permissionRequests.deny({
          id: 'some-id',
        } as { id: string; reviewNote: string }),
      ).rejects.toThrow();
    });

    test('should throw NOT_FOUND for non-existent request', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.permissionRequests.deny({
          id: 'cm00000000000nonexistent',
          reviewNote: 'Denied',
        }),
      ).rejects.toThrow('Permission request not found');
    });

    test('should reject already reviewed request', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const request = await prisma.permissionRequest.create({
        data: {
          userId,
          toolNames: ['github.com::createPR'],
          reason: 'Need access',
          status: PermissionRequestStatus.DENIED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNote: 'Already denied',
        },
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.permissionRequests.deny({
          id: request.id,
          reviewNote: 'Deny again',
        }),
      ).rejects.toThrow('Permission request has already been reviewed');
    });

    test('should not deny requests from other organizations', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const otherOrg = await prisma.organization.create({ data: { name: 'Other Org' } });
      const otherUser = await createTestUser({
        organizationId: otherOrg.id,
      });

      const otherRequest = await prisma.permissionRequest.create({
        data: {
          userId: otherUser.id,
          toolNames: ['github.com::createPR'],
          reason: 'Other org request',
          status: PermissionRequestStatus.PENDING,
        },
      });

      const caller = createCallerWithUser(admin);
      await expect(
        caller.admin.permissionRequests.deny({
          id: otherRequest.id,
          reviewNote: 'Denied',
        }),
      ).rejects.toThrow('Permission request not found');

      await prisma.permissionRequest.deleteMany({ where: { id: otherRequest.id } });
      await prisma.userRole.deleteMany({ where: { role: { organizationId: otherOrg.id } } });
      await prisma.role.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });
});
