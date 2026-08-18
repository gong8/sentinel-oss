/**
 * Agent Router
 * Combines all agent-related tRPC routes
 */

import { router } from '../init.js';
import { agentChatRouter } from './chat.js';
import { agentConfirmationRouter } from './confirmation.js';
import { agentPlanRouter } from './plan.js';

/**
 * Agent router combining all agent functionality
 */
export const agentRouter = router({
  chat: agentChatRouter,
  confirmation: agentConfirmationRouter,
  plan: agentPlanRouter,
});
