/**
 * SENTINEL Production Database Seed Script
 * Creates the minimum required data for a production deployment.
 *
 * Required environment variables:
 *   ORG_NAME       - Organization name
 *   OWNER_EMAIL    - Owner's email address
 *   WORKSPACE_NAME - Initial workspace name
 */

import { runSeed } from './seed-utils.js';

const ORG_NAME = process.env.ORG_NAME;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const WORKSPACE_NAME = process.env.WORKSPACE_NAME;

if (!ORG_NAME) {
  console.error('Error: ORG_NAME environment variable is required');
  process.exit(1);
}

if (!OWNER_EMAIL) {
  console.error('Error: OWNER_EMAIL environment variable is required');
  process.exit(1);
}

if (!WORKSPACE_NAME) {
  console.error('Error: WORKSPACE_NAME environment variable is required');
  process.exit(1);
}

// Basic email validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(OWNER_EMAIL)) {
  console.error('Error: OWNER_EMAIL is not a valid email address');
  process.exit(1);
}

runSeed(async (prisma) => {
  console.log('Initializing production database...');
  console.log(`  Organization: ${ORG_NAME}`);
  console.log(`  Owner: ${OWNER_EMAIL}`);
  console.log(`  Workspace: ${WORKSPACE_NAME}`);
  console.log();

  // Create organization
  let org = await prisma.organization.findFirst({
    where: { name: ORG_NAME },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: { name: ORG_NAME },
    });
    console.log(`Created organization: ${org.name}`);
  } else {
    console.log(`Organization already exists: ${org.name}`);
  }

  // Create standard roles
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

  await prisma.role.upsert({
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
  console.log('Created roles: Admin, User');

  // Create organization owner
  let ownerUser = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
  });

  if (!ownerUser) {
    ownerUser = await prisma.user.create({
      data: {
        email: OWNER_EMAIL,
        organizationId: org.id,
        orgRole: 'OWNER',
        userRoles: { create: [{ roleId: adminRole.id }] },
      },
    });
    console.log(`Created owner: ${ownerUser.email}`);
  } else {
    if (ownerUser.orgRole !== 'OWNER') {
      ownerUser = await prisma.user.update({
        where: { id: ownerUser.id },
        data: { orgRole: 'OWNER' },
      });
    }
    console.log(`Owner already exists: ${ownerUser.email}`);
  }

  // Link owner to organization
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

  // Create workspace
  const workspaceSlug = WORKSPACE_NAME.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let workspace = await prisma.workspace.findFirst({
    where: { organizationId: org.id, slug: workspaceSlug },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        organizationId: org.id,
        name: WORKSPACE_NAME,
        slug: workspaceSlug,
        description: `${WORKSPACE_NAME} workspace`,
      },
    });
    console.log(`Created workspace: ${workspace.name}`);
  } else {
    console.log(`Workspace already exists: ${workspace.name}`);
  }

  // Add owner to workspace as admin
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: ownerUser.id,
      },
    },
    update: { role: 'ADMIN' },
    create: {
      workspaceId: workspace.id,
      userId: ownerUser.id,
      role: 'ADMIN',
    },
  });

  console.log();
  console.log('='.repeat(60));
  console.log('SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log();
  console.log(`Organization: ${org.name}`);
  console.log(`Owner: ${ownerUser.email}`);
  console.log(`Workspace: ${workspace.name} (/${workspace.slug})`);
  console.log();
  console.log('Sign-in token:');
  console.log(`  ${ownerUser.accessToken}`);
  console.log();
});
