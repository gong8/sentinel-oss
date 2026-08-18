/**
 * SENTINEL User Credentials Script
 * Fetches and displays sign-in tokens for all users in the database.
 *
 * Usage:
 *   pnpm db:creds
 *   pnpm db:reset:seed:creds
 *   pnpm db:seed:creds
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
      organization: true,
    },
    orderBy: [{ organization: { name: 'asc' } }, { email: 'asc' }],
  });

  if (users.length === 0) {
    console.log('No users found in the database.');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('USER CREDENTIALS');
  console.log('='.repeat(80) + '\n');

  let currentOrg = '';
  for (const user of users) {
    if (user.organization.name !== currentOrg) {
      currentOrg = user.organization.name;
      console.log(`Organization: ${currentOrg}`);
      console.log('-'.repeat(40));
    }

    const roles = user.userRoles.map((ur) => ur.role.name).join(', ') || 'No roles';
    const isAdmin = user.userRoles.some((ur) => ur.role.isAdmin);

    console.log(`  Email:  ${user.email}`);
    console.log(`  Token:  ${user.accessToken}`);
    console.log(`  Roles:  ${roles}${isAdmin ? ' (Admin)' : ''}`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`Total: ${users.length} user(s)`);
  console.log('='.repeat(80) + '\n');
}

main()
  .catch((e) => {
    console.error('Error fetching credentials:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
