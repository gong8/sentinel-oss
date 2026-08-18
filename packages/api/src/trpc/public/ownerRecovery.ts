/**
 * Public Owner Recovery Router
 * Handles public verification endpoints for owner recovery
 */

import { z } from 'zod';
import {
  getOwnerRecoveryRequestByToken,
  verifyOwnerRecovery,
} from '../../services/ownerRecovery.js';
import { publicProcedure, router } from '../init.js';

export const publicOwnerRecoveryRouter = router({
  /**
   * Get recovery request status by token
   * Public endpoint - allows checking request status before verification
   */
  getByToken: publicProcedure
    .input(
      z.object({
        token: z.string().min(32),
      }),
    )
    .query(async ({ input }) => {
      const request = await getOwnerRecoveryRequestByToken(input.token);

      if (!request) {
        return null;
      }

      // Return limited info for public endpoint
      return {
        id: request.id,
        status: request.status,
        targetUserEmail: request.targetUserEmail,
        expiresAt: request.expiresAt,
        organization: {
          name: request.organization.name,
        },
      };
    }),

  /**
   * Verify and complete an owner recovery request
   * Public endpoint - uses verification token
   */
  verify: publicProcedure
    .input(
      z.object({
        token: z.string().min(32),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await verifyOwnerRecovery(input.token);

      return {
        success: true,
        organization: result.request.organization,
        user: result.user,
      };
    }),
});
