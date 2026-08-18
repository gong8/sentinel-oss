/**
 * Agent Configuration
 * Central export for all agent configuration modules
 */

export {
  MODELS_REQUIRING_MAX_COMPLETION_TOKENS,
  requiresMaxCompletionTokens,
} from './model-config.js';

export {
  generateActionDescription,
  getActionDescriptionGenerator,
  registerActionDescription,
  type ActionDescriptionGenerator,
} from './action-descriptions.js';
