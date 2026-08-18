/**
 * User Profile Router
 * Handles user profile operations
 */

import { prisma } from '@sentinel/db';
import { protectedProcedure, router } from '../init.js';

export const userProfileRouter = router({
  /**
   * Get current user's profile
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.auth.user.id },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        organization: true,
      },
    });

    return user
      ? {
          ...user,
          isOrgOwner: ctx.auth.isOrgOwner,
        }
      : null;
  }),
});
