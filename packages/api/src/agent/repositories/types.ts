/**
 * Repository Interfaces
 * Abstracts database access for improved testability
 */

import type { AgentMessageRole } from '@sentinel/db';

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

/**
 * Conversation entity returned by repository
 */
export interface ConversationEntity {
  id: string;
  title: string | null;
  userId: string | null;
  mcpAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation list item with message count
 */
export interface ConversationListItem {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

/**
 * Message entity returned by repository
 */
export interface MessageEntity {
  id: string;
  role: AgentMessageRole;
  content: string;
  toolName: string | null;
  toolInput: unknown;
  toolResult: unknown;
  createdAt: Date;
}

/**
 * Parameters for creating a conversation
 */
export interface CreateConversationParams {
  organizationId: string;
  userId?: string;
  mcpAgentId?: string;
  title?: string;
}

/**
 * Parameters for listing conversations
 */
export interface ListConversationsParams {
  organizationId: string;
  userId?: string;
  mcpAgentId?: string;
  limit?: number;
}

/**
 * Parameters for adding a message
 */
export interface AddMessageParams {
  conversationId: string;
  organizationId: string;
  role: AgentMessageRole;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
}

/**
 * Result from deleting messages
 */
export interface DeleteMessagesResult {
  deletedCount: number;
  messageContent: string | null;
}

// ============================================================================
// CONVERSATION REPOSITORY INTERFACE
// ============================================================================

/**
 * Repository interface for conversation operations
 */
export interface IConversationRepository {
  /**
   * Create a new conversation
   */
  create(params: CreateConversationParams): Promise<string>;

  /**
   * Get a conversation by ID
   */
  findById(conversationId: string, organizationId: string): Promise<ConversationEntity | null>;

  /**
   * List conversations for a user or agent
   */
  list(params: ListConversationsParams): Promise<ConversationListItem[]>;

  /**
   * Delete a conversation and all its messages
   */
  delete(conversationId: string, organizationId: string): Promise<boolean>;

  /**
   * Update conversation title
   */
  updateTitle(conversationId: string, organizationId: string, title: string): Promise<boolean>;

  /**
   * Add a message to a conversation
   */
  addMessage(params: AddMessageParams): Promise<string>;

  /**
   * Get messages for a conversation
   */
  getMessages(
    conversationId: string,
    organizationId: string,
    limit?: number,
  ): Promise<MessageEntity[]>;

  /**
   * Delete a message and all messages after it
   */
  deleteMessagesFromId(
    conversationId: string,
    organizationId: string,
    messageId: string,
  ): Promise<DeleteMessagesResult>;

  /**
   * Update tool result by confirmation ID
   */
  updateToolResultByConfirmationId(
    conversationId: string,
    organizationId: string,
    confirmationId: string,
    newToolResult: unknown,
  ): Promise<boolean>;
}

// ============================================================================
// CONFIRMATION TYPES
// ============================================================================

/**
 * Confirmation entity returned by repository
 */
export interface ConfirmationEntity {
  id: string;
  organizationId: string;
  conversationId: string | null;
  workspaceId: string | null;
  toolName: string;
  toolInput: unknown;
  description: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: Date;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  executedAt: Date | null;
  result: unknown;
  error: string | null;
  createdAt: Date;
}

/**
 * Parameters for creating a confirmation
 */
export interface CreateConfirmationParams {
  organizationId: string;
  conversationId?: string;
  workspaceId?: string;
  toolName: string;
  toolInput: unknown;
  description: string;
  expiresAt: Date;
}

/**
 * Result from creating a confirmation (may return existing)
 */
export interface ConfirmationRequest {
  confirmationId: string;
  toolName: string;
  toolInput: unknown;
  description: string;
  expiresAt: string;
}

// ============================================================================
// CONFIRMATION REPOSITORY INTERFACE
// ============================================================================

/**
 * Repository interface for confirmation operations
 */
/**
 * Result from findOrCreate operation
 */
export interface FindOrCreateConfirmationResult {
  confirmation: ConfirmationEntity;
  created: boolean;
}

export interface IConfirmationRepository {
  /**
   * Find an existing pending confirmation with matching criteria
   */
  findExistingPending(params: {
    organizationId: string;
    conversationId?: string;
    workspaceId?: string;
    toolName: string;
  }): Promise<ConfirmationEntity | null>;

  /**
   * Create a new confirmation
   */
  create(params: CreateConfirmationParams): Promise<ConfirmationEntity>;

  /**
   * Atomically find an existing pending confirmation or create a new one.
   * Uses a transaction to prevent race conditions (TOCTOU).
   * @param params Creation parameters
   * @param normalizedInputStr Stringified normalized input for comparison
   * @returns The existing or newly created confirmation, with flag indicating if created
   */
  findOrCreate(
    params: CreateConfirmationParams,
    normalizedInputStr: string,
  ): Promise<FindOrCreateConfirmationResult>;

  /**
   * Get a confirmation by ID
   */
  findById(confirmationId: string, organizationId: string): Promise<ConfirmationEntity | null>;

  /**
   * Get pending confirmations for a conversation
   */
  findPendingByConversation(
    conversationId: string,
    organizationId: string,
  ): Promise<ConfirmationEntity[]>;

  /**
   * Find a pending confirmation by ID
   */
  findPendingById(
    confirmationId: string,
    organizationId: string,
  ): Promise<ConfirmationEntity | null>;

  /**
   * Update confirmation status to confirmed
   */
  confirm(confirmationId: string, userId: string): Promise<ConfirmationEntity>;

  /**
   * Update confirmation status to cancelled
   */
  cancel(confirmationId: string): Promise<void>;

  /**
   * Update confirmation status to expired
   */
  expire(confirmationId: string): Promise<void>;

  /**
   * Mark confirmation as executed with result
   */
  markExecuted(confirmationId: string, result: unknown, error?: string): Promise<void>;

  /**
   * Expire all old pending confirmations for an organization
   */
  expireOldConfirmations(organizationId: string): Promise<void>;
}
