/**
 * User Audit Log Entries Router
 * Handles user's personal audit log viewing
 */

import { AuditDecision } from '@sentinel/db';
import { z } from 'zod';
import { getAuditLogs } from '../../services/audit.js';
import { protectedProcedure, router } from '../init.js';

export const userAuditLogEntriesRouter = router({
  /**
   * List user's own audit log entries
   */
  list: protectedProcedure
    .input(
      z.object({
        toolName: z.string().optional(),
        decision: z.nativeEnum(AuditDecision).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getAuditLogs({
        organizationId: ctx.auth.organizationId,
        userId: ctx.auth.user.id,
        ...input,
      }),
    ),
});
