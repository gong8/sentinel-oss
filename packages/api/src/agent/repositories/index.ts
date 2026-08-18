/**
 * Repository Exports
 * Provides database abstraction layer for agent operations
 */

// Export types
export type {
  AddMessageParams,
  ConfirmationEntity,
  ConfirmationRequest,
  ConversationEntity,
  ConversationListItem,
  CreateConfirmationParams,
  CreateConversationParams,
  DeleteMessagesResult,
  IConfirmationRepository,
  IConversationRepository,
  ListConversationsParams,
  MessageEntity,
} from './types.js';

// Export Prisma implementations
export {
  PrismaConfirmationRepository,
  prismaConfirmationRepository,
} from './prisma-confirmation.js';
export {
  PrismaConversationRepository,
  prismaConversationRepository,
} from './prisma-conversation.js';
