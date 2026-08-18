/**
 * Integration tests for Admin Policies Router
 * Tests policy CRUD operations with real database
 */

import { PolicyEffect } from '@sentinel/db';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../../packages/db/src/index.js';
import { hasDatabaseUrl } from '../../helpers/db.js';
import { createTestMcpServer, createTestOrgOwner } from '../../helpers/factory.js';
import { createTestTenant, TestTenant } from '../../helpers/tenant-isolation.js';
import { createCallerWithUser } from '../../helpers/trpc.js';

describe.skipIf(!hasDatabaseUrl())('Admin Policies Router', () => {
  let tenant: TestTenant;
  let adminId: string;
  let mcpServerId: string;

  beforeEach(async () => {
    tenant = await createTestTenant();

    // Use org owner for creating org-wide policies (no workspaceId)
    const orgOwner = await createTestOrgOwner({ organizationId: tenant.orgId });
    if (!orgOwner) throw new Error('Failed to create org owner');
    adminId = orgOwner.id;

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
    test('should list all policies for organization', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            slug: 'policy-1',
            matchers: ['role:User'],
            toolPatterns: ['github.com::*'],
            effect: PolicyEffect.ALLOW,
            description: 'Policy 1',
            enabled: true,
          },
          {
            organizationId: tenant.orgId,
            slug: 'policy-2',
            matchers: ['role:Admin'],
            toolPatterns: ['github.com::createPR'],
            effect: PolicyEffect.DENY,
            description: 'Policy 2',
            enabled: true,
          },
        ],
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const policies = await caller.admin.policies.list();

      expect(policies.length).toBe(2);
      expect(policies.some((p) => p.slug === 'policy-1')).toBe(true);
      expect(policies.some((p) => p.slug === 'policy-2')).toBe(true);
    });

    test('should not list policies from other organizations', async () => {
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
      await prisma.policy.create({
        data: {
          organizationId: otherOrg.id,
          slug: 'other-policy',
          matchers: ['role:User'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Other org policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const policies = await caller.admin.policies.list();

      expect(policies.every((p) => p.organizationId === tenant.orgId)).toBe(true);
      expect(policies.some((p) => p.slug === 'other-policy')).toBe(false);

      await prisma.policy.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });

  describe('get', () => {
    test('should get specific policy by id', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const result = await caller.admin.policies.get({ id: policy.id });

      expect(result.id).toBe(policy.id);
      expect(result.slug).toBe('test-policy');
      expect(result.matchers[0]).toBe('role:User');
    });

    test('should throw NOT_FOUND for non-existent policy', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(caller.admin.policies.get({ id: 'cm00000000000nonexistent' })).rejects.toThrow(
        'Policy not found',
      );
    });

    test('should not return policies from other organizations', async () => {
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
      const otherPolicy = await prisma.policy.create({
        data: {
          organizationId: otherOrg.id,
          slug: 'other-policy',
          matchers: ['role:User'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Other org policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(caller.admin.policies.get({ id: otherPolicy.id })).rejects.toThrow(
        'Policy not found',
      );

      await prisma.policy.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });

  describe('create', () => {
    test('should create policy with valid inputs', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const { policy } = await caller.admin.policies.create({
        matchers: ['role:User'],
        toolPatterns: ['github.com::createPR'],
        effect: PolicyEffect.ALLOW,
        description: 'Allow users to create PRs',
      });

      expect(policy.matchers[0]).toBe('role:User');
      expect(policy.toolPatterns[0]).toBe('github.com::createPR');
      expect(policy.effect).toBe(PolicyEffect.ALLOW);
      expect(policy.description).toBe('Allow users to create PRs');
      expect(policy.enabled).toBe(true);
      expect(policy.slug).toBeTruthy();
      expect(policy.organizationId).toBe(tenant.orgId);
    });

    test('should create policy with enabled=false', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const { policy } = await caller.admin.policies.create({
        matchers: ['role:Admin'],
        toolPatterns: ['github.com::*'],
        effect: PolicyEffect.DENY,
        description: 'Deny all GitHub tools',
        enabled: false,
      });

      expect(policy.enabled).toBe(false);
    });

    test('should auto-generate unique slug', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });

      const { policy: policy1 } = await caller.admin.policies.create({
        matchers: ['role:User'],
        toolPatterns: ['github.com::createPR'],
        effect: PolicyEffect.ALLOW,
        description: 'First policy',
      });

      const { policy: policy2 } = await caller.admin.policies.create({
        matchers: ['role:User'],
        toolPatterns: ['github.com::createPR'],
        effect: PolicyEffect.ALLOW,
        description: 'Second policy',
      });

      expect(policy1.slug).not.toBe(policy2.slug);
      expect(policy1.slug).toBeTruthy();
      expect(policy2.slug).toBeTruthy();
    });

    test('should reject invalid matcher format', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.create({
          matchers: ['invalid-matcher-format'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Invalid policy',
        }),
      ).rejects.toThrow('Invalid matcher format');
    });

    test('should reject invalid tool pattern format', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.create({
          matchers: ['role:User'],
          toolPatterns: ['invalid-pattern'],
          effect: PolicyEffect.ALLOW,
          description: 'Invalid policy',
        }),
      ).rejects.toThrow('Invalid tool pattern format');
    });

    test('should reject tool pattern for non-existent MCP server', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.create({
          matchers: ['role:User'],
          toolPatterns: ['Nonexistent Server::tool'],
          effect: PolicyEffect.ALLOW,
          description: 'Invalid policy',
        }),
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    test('should update policy matcher', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        matchers: ['role:Admin'],
      });

      expect(updated.matchers[0]).toBe('role:Admin');
      expect(updated.toolPatterns[0]).toBe('github.com::createPR'); // Unchanged
    });

    test('should update policy tool pattern', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        toolPatterns: ['github.com::getFile'],
      });

      expect(updated.toolPatterns[0]).toBe('github.com::getFile');
    });

    test('should update policy effect', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        effect: PolicyEffect.DENY,
      });

      expect(updated.effect).toBe(PolicyEffect.DENY);
    });

    test('should update policy description', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Old description',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
    });

    test('should enable/disable policy', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        enabled: false,
      });

      expect(updated.enabled).toBe(false);
    });

    test('should update slug when matcher changes', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const originalSlug = policy.slug;
      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        matchers: ['role:Admin'],
      });

      expect(updated.matchers[0]).toBe('role:Admin');
      expect(updated.slug).not.toBe(originalSlug);
      expect(updated.slug).toBeTruthy();
    });

    test('should update slug when toolPattern changes', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const originalSlug = policy.slug;
      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        toolPatterns: ['github.com::getFile'],
      });

      expect(updated.toolPatterns[0]).toBe('github.com::getFile');
      expect(updated.slug).not.toBe(originalSlug);
      expect(updated.slug).toBeTruthy();
    });

    test('should update slug when effect changes', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const originalSlug = policy.slug;
      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        effect: PolicyEffect.DENY,
      });

      expect(updated.effect).toBe(PolicyEffect.DENY);
      expect(updated.slug).not.toBe(originalSlug);
      expect(updated.slug).toBeTruthy();
    });

    test('should not update slug when only description changes', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Old description',
          enabled: true,
        },
      });

      const originalSlug = policy.slug;
      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
      expect(updated.slug).toBe(originalSlug); // Slug should not change
    });

    test('should not update slug when only enabled changes', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const originalSlug = policy.slug;
      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const updated = await caller.admin.policies.update({
        id: policy.id,
        enabled: false,
      });

      expect(updated.enabled).toBe(false);
      expect(updated.slug).toBe(originalSlug); // Slug should not change
    });

    test('should handle slug collision when updating to existing slug', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      // Create first policy
      const policy1 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'allow-role-user-github-com-createpr',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'First policy',
          enabled: true,
        },
      });

      // Create second policy with different slug
      const policy2 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'allow-role-admin-github-com-createpr',
          matchers: ['role:Admin'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Second policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      // Update policy2 to have same matcher/toolPattern/effect as policy1
      // This should generate a slug that would conflict, so it should append a number
      const updated = await caller.admin.policies.update({
        id: policy2.id,
        matchers: ['role:User'],
      });

      // Slug should be updated and not conflict with policy1
      expect(updated.slug).not.toBe(policy1.slug);
      expect(updated.slug).not.toBe(policy2.slug);
      expect(updated.slug).toBeTruthy();
      expect(updated.matchers[0]).toBe('role:User');
    });

    test('should throw NOT_FOUND for non-existent policy', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.update({
          id: 'cm00000000000nonexistent',
          description: 'New description',
        }),
      ).rejects.toThrow('Policy not found');
    });

    test('should not update policies from other organizations', async () => {
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
      const otherPolicy = await prisma.policy.create({
        data: {
          organizationId: otherOrg.id,
          slug: 'other-policy',
          matchers: ['role:User'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Other org policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.update({
          id: otherPolicy.id,
          description: 'Hacked description',
        }),
      ).rejects.toThrow('Policy not found');

      await prisma.policy.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });

    test('should reject invalid matcher format on update', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.update({
          id: policy.id,
          matchers: ['invalid-format'],
        }),
      ).rejects.toThrow('Invalid matcher format');
    });

    test('should reject invalid tool pattern format on update', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.update({
          id: policy.id,
          toolPatterns: ['invalid-pattern'],
        }),
      ).rejects.toThrow('Invalid tool pattern format');
    });
  });

  describe('delete', () => {
    test('should delete policy', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'test-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Test policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const result = await caller.admin.policies.delete({ id: policy.id });

      expect(result.success).toBe(true);

      const deleted = await prisma.policy.findUnique({ where: { id: policy.id } });
      expect(deleted).not.toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();
      expect(deleted?.deletedBy).toBe(admin.id);
    });

    test('should throw NOT_FOUND for non-existent policy', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(
        caller.admin.policies.delete({ id: 'cm00000000000nonexistent' }),
      ).rejects.toThrow('Policy not found');
    });

    test('should not delete policies from other organizations', async () => {
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
      const otherPolicy = await prisma.policy.create({
        data: {
          organizationId: otherOrg.id,
          slug: 'other-policy',
          matchers: ['role:User'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Other org policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      await expect(caller.admin.policies.delete({ id: otherPolicy.id })).rejects.toThrow(
        'Policy not found',
      );

      // Verify policy still exists
      const stillExists = await prisma.policy.findUnique({ where: { id: otherPolicy.id } });
      expect(stillExists).not.toBeNull();

      await prisma.policy.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });

  describe('detectConflicts', () => {
    test('should detect no conflicts when policies do not overlap', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            slug: 'policy-1',
            matchers: ['role:User'],
            toolPatterns: ['github.com::*'],
            effect: PolicyEffect.ALLOW,
            description: 'Policy 1',
            enabled: true,
          },
          {
            organizationId: tenant.orgId,
            slug: 'policy-2',
            matchers: ['role:Admin'],
            toolPatterns: ['Notion::*'],
            effect: PolicyEffect.ALLOW,
            description: 'Policy 2',
            enabled: true,
          },
        ],
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts).toEqual([]);
    });

    test('should detect contradiction when DENY and ALLOW policies overlap (Case 1)', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const allowPolicy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'allow-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Allow policy',
          enabled: true,
        },
      });

      const denyPolicy = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'deny-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.DENY,
          description: 'Deny policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('contradiction');
      expect(conflicts[0].severity).toBe('high');
      expect(conflicts[0].policies.length).toBe(2);
      expect(conflicts[0].policies.some((p) => p.id === allowPolicy.id)).toBe(true);
      expect(conflicts[0].policies.some((p) => p.id === denyPolicy.id)).toBe(true);
      expect(conflicts[0].message).toContain('DENY policy');
      expect(conflicts[0].message).toContain('ALLOW policy');
    });

    test('should detect overlap when two ALLOW policies overlap (Case 2)', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy1 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'allow-policy-1',
          matchers: ['role:User'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Allow policy 1',
          enabled: true,
        },
      });

      const policy2 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'allow-policy-2',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Allow policy 2',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('overlap');
      expect(conflicts[0].severity).toBe('low');
      expect(conflicts[0].policies.length).toBe(2);
      expect(conflicts[0].policies.some((p) => p.id === policy1.id)).toBe(true);
      expect(conflicts[0].policies.some((p) => p.id === policy2.id)).toBe(true);
      expect(conflicts[0].message).toContain('overlapping permissions');
      expect(conflicts[0].message).toContain('redundant');
    });

    test('should detect overlap when two DENY policies overlap (Case 3)', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      const policy1 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'deny-policy-1',
          matchers: ['role:User'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.DENY,
          description: 'Deny policy 1',
          enabled: true,
        },
      });

      const policy2 = await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'deny-policy-2',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.DENY,
          description: 'Deny policy 2',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('overlap');
      expect(conflicts[0].severity).toBe('low');
      expect(conflicts[0].policies.length).toBe(2);
      expect(conflicts[0].policies.some((p) => p.id === policy1.id)).toBe(true);
      expect(conflicts[0].policies.some((p) => p.id === policy2.id)).toBe(true);
      expect(conflicts[0].message).toContain('overlapping deny rules');
      expect(conflicts[0].message).toContain('redundant');
    });

    test('should detect identical ALLOW policies as overlap', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'policy-1',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Policy 1',
          enabled: true,
        },
      });

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'policy-2',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Policy 2',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('overlap');
      expect(conflicts[0].severity).toBe('low');
    });

    test('should detect identical DENY policies as overlap', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'policy-1',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.DENY,
          description: 'Policy 1',
          enabled: true,
        },
      });

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'policy-2',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.DENY,
          description: 'Policy 2',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('overlap');
      expect(conflicts[0].severity).toBe('low');
    });

    test('should detect overlap with wildcard matcher', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'wildcard-policy',
          matchers: ['*'],
          toolPatterns: ['github.com::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Wildcard policy',
          enabled: true,
        },
      });

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'specific-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Specific policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('overlap');
    });

    test('should detect overlap with wildcard tool pattern', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'wildcard-tool-policy',
          matchers: ['role:User'],
          toolPatterns: ['*::*'],
          effect: PolicyEffect.ALLOW,
          description: 'Wildcard tool policy',
          enabled: true,
        },
      });

      await prisma.policy.create({
        data: {
          organizationId: tenant.orgId,
          slug: 'specific-tool-policy',
          matchers: ['role:User'],
          toolPatterns: ['github.com::createPR'],
          effect: PolicyEffect.ALLOW,
          description: 'Specific tool policy',
          enabled: true,
        },
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].type).toBe('overlap');
    });

    test('should detect multiple conflicts', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            slug: 'allow-1',
            matchers: ['role:User'],
            toolPatterns: ['github.com::*'],
            effect: PolicyEffect.ALLOW,
            description: 'Allow 1',
            enabled: true,
          },
          {
            organizationId: tenant.orgId,
            slug: 'deny-1',
            matchers: ['role:User'],
            toolPatterns: ['github.com::createPR'],
            effect: PolicyEffect.DENY,
            description: 'Deny 1',
            enabled: true,
          },
          {
            organizationId: tenant.orgId,
            slug: 'allow-2',
            matchers: ['role:Admin'],
            toolPatterns: ['Notion::*'],
            effect: PolicyEffect.ALLOW,
            description: 'Allow 2',
            enabled: true,
          },
          {
            organizationId: tenant.orgId,
            slug: 'allow-3',
            matchers: ['role:Admin'],
            toolPatterns: ['Notion::createPage'],
            effect: PolicyEffect.ALLOW,
            description: 'Allow 3',
            enabled: true,
          },
        ],
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      // Should detect:
      // 1. Contradiction: allow-1 vs deny-1
      // 2. Overlap: allow-2 vs allow-3
      expect(conflicts.length).toBe(2);

      const contradiction = conflicts.find((c) => c.type === 'contradiction');
      const overlap = conflicts.find((c) => c.type === 'overlap');

      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe('high');
      expect(overlap).toBeDefined();
      expect(overlap?.severity).toBe('low');
    });

    test('should not detect conflicts for disabled policies', async () => {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });
      if (!admin) throw new Error('Admin not found');

      await prisma.policy.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            slug: 'enabled-policy',
            matchers: ['role:User'],
            toolPatterns: ['github.com::*'],
            effect: PolicyEffect.ALLOW,
            description: 'Enabled policy',
            enabled: true,
          },
          {
            organizationId: tenant.orgId,
            slug: 'disabled-policy',
            matchers: ['role:User'],
            toolPatterns: ['github.com::createPR'],
            effect: PolicyEffect.DENY,
            description: 'Disabled policy',
            enabled: false, // Disabled
          },
        ],
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      // Should not detect conflict because disabled policy is excluded
      expect(conflicts.length).toBe(0);
    });

    test('should not detect conflicts across organizations', async () => {
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

      await prisma.policy.createMany({
        data: [
          {
            organizationId: tenant.orgId,
            slug: 'policy-1',
            matchers: ['role:User'],
            toolPatterns: ['github.com::*'],
            effect: PolicyEffect.ALLOW,
            description: 'Policy 1',
            enabled: true,
          },
          {
            organizationId: otherOrg.id, // Different org
            slug: 'policy-2',
            matchers: ['role:User'],
            toolPatterns: ['github.com::createPR'],
            effect: PolicyEffect.DENY,
            description: 'Policy 2',
            enabled: true,
          },
        ],
      });

      const caller = createCallerWithUser(admin, { isOrgOwner: true });
      const conflicts = await caller.admin.policies.detectConflicts();

      // Should not detect conflict across organizations
      expect(conflicts.length).toBe(0);

      await prisma.policy.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    });
  });
});
