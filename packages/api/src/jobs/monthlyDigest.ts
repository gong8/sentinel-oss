/**
 * Monthly Digest Cron Job
 * Sends monthly usage digest emails to org admins
 * Schedule: 0 9 1 * * (1st of each month at 9 AM UTC)
 */

import { logger } from '../lib/logger.js';
import { sendMonthlyDigests } from '../services/emailDigest.js';

export async function runMonthlyDigestJob(): Promise<void> {
  logger.info('Starting monthly digest job...');
  try {
    const result = await sendMonthlyDigests();
    logger.info('Monthly digest job complete', result);
  } catch (error) {
    logger.error('Monthly digest job failed:', error);
    throw error;
  }
}
