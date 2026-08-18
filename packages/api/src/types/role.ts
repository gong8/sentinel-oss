/**
 * Role Type Definitions
 * Properly typed Role model from Prisma
 */

import type { Prisma, Role as PrismaRole } from '@sentinel/db';

// Extract the Role type from Prisma
export type Role = PrismaRole;

// User with roles included
export type UserWithRoles = Prisma.UserGetPayload<{
  include: {
    userRoles: {
      include: {
        role: true;
      };
    };
  };
}>;
