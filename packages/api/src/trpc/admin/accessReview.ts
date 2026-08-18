/**
 * Admin Access Review Router
 * Provides access review reporting for SOC2 compliance
 */

import {
  exportAccessReviewToCsv,
  exportAccessReviewToJson,
  getAccessReviewData,
} from '../../services/accessReview.js';
import { adminProcedure, router } from '../init.js';

export const adminAccessReviewRouter = router({
  /**
   * Get access review report data
   */
  get: adminProcedure.query(async ({ ctx }) => {
    return getAccessReviewData(ctx.auth.organizationId);
  }),

  /**
   * Export access review as CSV
   * Returns base64-encoded CSV data
   */
  exportCsv: adminProcedure.mutation(async ({ ctx }) => {
    const report = await getAccessReviewData(ctx.auth.organizationId);
    const result = exportAccessReviewToCsv(report);

    return {
      data: Buffer.from(result.data, 'utf-8').toString('base64'),
      filename: result.filename,
      contentType: result.contentType,
    };
  }),

  /**
   * Export access review as JSON
   * Returns base64-encoded JSON data
   */
  exportJson: adminProcedure.mutation(async ({ ctx }) => {
    const report = await getAccessReviewData(ctx.auth.organizationId);
    const result = exportAccessReviewToJson(report);

    return {
      data: Buffer.from(result.data, 'utf-8').toString('base64'),
      filename: result.filename,
      contentType: result.contentType,
    };
  }),
});
