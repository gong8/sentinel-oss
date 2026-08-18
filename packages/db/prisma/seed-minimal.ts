/**
 * SENTINEL Minimal Database Seed Script
 * Creates the minimum required data for the application to function
 */

import { runSeed } from './seed-utils.js';

runSeed(async (prisma) => {
  console.log('Initializing database with minimal seed...');

  // Find or create organization to make seeding idempotent
  let org = await prisma.organization.findFirst({
    where: { name: 'Acme Corporation' },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Acme Corporation' },
    });
    console.log('Created organization:', org.name);
  } else {
    console.log('Organization already exists:', org.name);
  }

  const adminRole = await prisma.role.upsert({
    where: {
      organizationId_name: { organizationId: org.id, name: 'Admin' },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Admin',
      isAdmin: true,
      description: 'Administrator with full access',
    },
  });

  const userRole = await prisma.role.upsert({
    where: {
      organizationId_name: { organizationId: org.id, name: 'User' },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'User',
      isAdmin: false,
      description: 'Regular user',
    },
  });
  console.log('Roles: Admin, User');

  // Create organization owner
  let ownerUser = await prisma.user.findUnique({
    where: { email: 'owner@acme.com' },
  });

  if (!ownerUser) {
    ownerUser = await prisma.user.create({
      data: {
        email: 'owner@acme.com',
        organizationId: org.id,
        orgRole: 'OWNER',
        userRoles: { create: [{ roleId: adminRole.id }] },
      },
    });
    console.log('Created owner user:', ownerUser.email);
  } else {
    if (ownerUser.orgRole !== 'OWNER') {
      ownerUser = await prisma.user.update({
        where: { id: ownerUser.id },
        data: { orgRole: 'OWNER' },
      });
    }
    console.log('Owner user already exists:', ownerUser.email);
  }

  await prisma.orgOwner.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: ownerUser.id },
    },
    update: {},
    create: {
      organizationId: org.id,
      userId: ownerUser.id,
    },
  });

  // Create default workspace
  let defaultWorkspace = await prisma.workspace.findFirst({
    where: { organizationId: org.id, name: 'Development Team' },
  });

  if (!defaultWorkspace) {
    defaultWorkspace = await prisma.workspace.create({
      data: {
        organizationId: org.id,
        name: 'Development Team',
        slug: 'development-team',
        description: 'Default workspace for development team',
      },
    });
    console.log('Created default workspace:', defaultWorkspace.name);
  } else {
    console.log('Default workspace already exists:', defaultWorkspace.name);
  }

  // Create admin user (has Admin role but is not org owner)
  let adminUser = await prisma.user.findUnique({
    where: { email: 'admin@acme.com' },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'admin@acme.com',
        organizationId: org.id,
        orgRole: 'MEMBER',
        userRoles: { create: [{ roleId: adminRole.id }] },
      },
    });
    console.log('Created admin user:', adminUser.email);
  } else {
    console.log('Admin user already exists:', adminUser.email);
  }
  // Create regular user
  let regularUser = await prisma.user.findUnique({
    where: { email: 'user@acme.com' },
  });

  if (!regularUser) {
    regularUser = await prisma.user.create({
      data: {
        email: 'user@acme.com',
        organizationId: org.id,
        orgRole: 'MEMBER',
        userRoles: { create: [{ roleId: userRole.id }] },
      },
    });
    console.log('Created regular user:', regularUser.email);
  } else {
    console.log('Regular user already exists:', regularUser.email);
  }
  // Add all users to the default workspace with appropriate roles
  // Owner gets ADMIN role in workspace (even though they have org-level access)
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: defaultWorkspace.id,
        userId: ownerUser.id,
      },
    },
    update: { role: 'ADMIN' },
    create: {
      workspaceId: defaultWorkspace.id,
      userId: ownerUser.id,
      role: 'ADMIN',
    },
  });

  // Admin user gets ADMIN role in workspace
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: defaultWorkspace.id,
        userId: adminUser.id,
      },
    },
    update: { role: 'ADMIN' },
    create: {
      workspaceId: defaultWorkspace.id,
      userId: adminUser.id,
      role: 'ADMIN',
    },
  });

  // Regular user gets MEMBER role in workspace
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: defaultWorkspace.id,
        userId: regularUser.id,
      },
    },
    update: { role: 'MEMBER' },
    create: {
      workspaceId: defaultWorkspace.id,
      userId: regularUser.id,
      role: 'MEMBER',
    },
  });

  console.log('\n=== WORKSPACE MEMBERSHIPS ===');
  console.log(`Workspace: ${defaultWorkspace.name} (${defaultWorkspace.slug})`);
  console.log(`  - owner@acme.com: ADMIN (also org owner)`);
  console.log(`  - admin@acme.com: ADMIN`);
  console.log(`  - user@acme.com: MEMBER`);

  console.log('\n=== ACCESS TOKENS ===');
  console.log(`owner@acme.com (org owner, workspace ADMIN): ${ownerUser.accessToken}`);
  console.log(`admin@acme.com (workspace ADMIN): ${adminUser.accessToken}`);
  console.log(`user@acme.com (workspace MEMBER): ${regularUser.accessToken}`);

  console.log('\n=== EXPECTED BEHAVIOR ===');
  console.log(`owner@acme.com → /global/admin OR /${defaultWorkspace.slug}/admin`);
  console.log(`admin@acme.com → /${defaultWorkspace.slug}/admin`);
  console.log(`user@acme.com → /${defaultWorkspace.slug}/user`);
});
