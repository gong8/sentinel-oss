/**
 * Auth Router
 * Handles authentication operations
 */

import { z } from 'zod';
import { validateAccessToken } from '../services/auth.js';
import { publicProcedure, router } from './init.js';

export const authRouter = router({
  /**
   * Validate an access token
   */
  validateToken: publicProcedure
    .input(
      z.object({
        accessToken: z.string(),
      }),
    )
    .output(
      z.discriminatedUnion('valid', [
        z.object({ valid: z.literal(false) }),
        z.object({
          valid: z.literal(true),
          userId: z.string(),
          organizationId: z.string(),
          email: z.string(),
          roles: z.array(z.string()),
          isAdmin: z.boolean(),
          isOrgOwner: z.boolean(),
          workspaceIds: z.array(z.string()),
          adminWorkspaceIds: z.array(z.string()),
        }),
      ]),
    )
    .mutation(async ({ input }) => {
      console.log(`[auth.validateToken] Validating token: [REDACTED]`);
      const context = await validateAccessToken(input.accessToken);

      if (!context) {
        console.log(`[auth.validateToken] Token validation FAILED - no context returned`);
        return {
          valid: false as const,
        };
      }
      console.log(
        `[auth.validateToken] Token validation SUCCESS - userId: ${context.user.id}, email: ${context.user.email}`,
      );

      return {
        valid: true as const,
        userId: context.user.id,
        organizationId: context.organizationId,
        email: context.user.email,
        roles: context.roles,
        isAdmin: context.isAdmin,
        isOrgOwner: context.isOrgOwner,
        workspaceIds: context.workspaceIds,
        adminWorkspaceIds: context.adminWorkspaceIds,
      };
    }),
});
