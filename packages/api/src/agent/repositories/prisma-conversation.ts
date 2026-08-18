/**
 * Prisma Implementation of Conversation Repository
 * Handles persistence and retrieval of agent conversations
 */

import { Prisma, prisma } from '@sentinel/db';
import { conversationNotFoundError, databaseError } from '../errors.js';
import type {
  AddMessageParams,
  ConversationEntity,
  ConversationListItem,
  CreateConversationParams,
  DeleteMessagesResult,
  IConversationRepository,
  ListConversationsParams,
  MessageEntity,
} from './types.js';

/**
 * Type guard to check if a value is a valid Prisma InputJsonValue
 */
function isInputJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isInputJsonValue);
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isInputJsonValue);
  }
  return false;
}

/**
 * Type-safe conversion of unknown values to Prisma-compatible JSON
 * Prisma's InputJsonValue type is strict and won't accept arbitrary unknown types
 * Returns Prisma.DbNull for null/undefined values (sets database field to NULL)
 */
function toPrismaJson(value: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.DbNull;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'object') {
    // Serialize and deserialize to get a clean JSON value
    const jsonValue: unknown = JSON.parse(JSON.stringify(value));
    if (isInputJsonValue(jsonValue)) {
      return jsonValue;
    }
  }
  return Prisma.DbNull;
}

/**
 * Prisma implementation of conversation repository
 */
export class PrismaConversationRepository implements IConversationRepository {
  async create(params: CreateConversationParams): Promise<string> {
    try {
      const conversation = await prisma.agentConversation.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          mcpAgentId: params.mcpAgentId,
          title: params.title,
        },
      });

      return conversation.id;
    } catch (error) {
      throw databaseError('createConversation', error instanceof Error ? error : undefined);
    }
  }

  async findById(
    conversationId: string,
    organizationId: string,
  ): Promise<ConversationEntity | null> {
    return prisma.agentConversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
      select: {
        id: true,
        title: true,
        userId: true,
        mcpAgentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async list(params: ListConversationsParams): Promise<ConversationListItem[]> {
    const conversations = await prisma.agentConversation.findMany({
      where: {
        organizationId: params.organizationId,
        ...(params.userId && { userId: params.userId }),
        ...(params.mcpAgentId && { mcpAgentId: params.mcpAgentId }),
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            messages: {
              where: {
                role: { in: ['USER', 'ASSISTANT'] },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: params.limit ?? 50,
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    }));
  }

  async delete(conversationId: string, organizationId: string): Promise<boolean> {
    try {
      const conversation = await prisma.agentConversation.findFirst({
        where: {
          id: conversationId,
          organizationId,
        },
      });

      if (!conversation) {
        return false;
      }

      await prisma.agentConversation.delete({
        where: { id: conversationId },
      });

      return true;
    } catch (error) {
      throw databaseError('deleteConversation', error instanceof Error ? error : undefined);
    }
  }

  async updateTitle(
    conversationId: string,
    organizationId: string,
    title: string,
  ): Promise<boolean> {
    try {
      const result = await prisma.agentConversation.updateMany({
        where: {
          id: conversationId,
          organizationId,
        },
        data: { title },
      });

      return result.count > 0;
    } catch (error) {
      throw databaseError('updateConversationTitle', error instanceof Error ? error : undefined);
    }
  }

  async addMessage(params: AddMessageParams): Promise<string> {
    try {
      // SECURITY: Verify conversation belongs to organization before adding message
      const conversation = await prisma.agentConversation.findFirst({
        where: {
          id: params.conversationId,
          organizationId: params.organizationId,
        },
        select: { id: true },
      });

      if (!conversation) {
        throw conversationNotFoundError(params.conversationId);
      }

      const message = await prisma.agentMessage.create({
        data: {
          conversationId: params.conversationId,
          role: params.role,
          content: params.content,
          toolName: params.toolName,
          toolInput: toPrismaJson(params.toolInput),
          toolResult: toPrismaJson(params.toolResult),
        },
      });

      // Update conversation timestamp
      await prisma.agentConversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: new Date() },
      });

      return message.id;
    } catch (error) {
      // Re-throw AgentErrors as-is
      if (error instanceof Error && error.name === 'AgentError') {
        throw error;
      }
      throw databaseError('addMessage', error instanceof Error ? error : undefined);
    }
  }

  async getMessages(
    conversationId: string,
    organizationId: string,
    limit?: number,
  ): Promise<MessageEntity[]> {
    try {
      const messages = await prisma.agentMessage.findMany({
        where: {
          conversationId,
          // SECURITY: Filter through conversation to ensure org ownership
          conversation: { organizationId },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      return messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        toolInput: m.toolInput,
        toolResult: m.toolResult,
        createdAt: m.createdAt,
      }));
    } catch (error) {
      throw databaseError('getMessages', error instanceof Error ? error : undefined);
    }
  }

  async deleteMessagesFromId(
    conversationId: string,
    organizationId: string,
    messageId: string,
  ): Promise<DeleteMessagesResult> {
    try {
      // Use transaction to prevent race condition between find and delete
      return prisma.$transaction(async (tx) => {
        // Get the message to find its timestamp
        // SECURITY: Filter through conversation to ensure org ownership
        const message = await tx.agentMessage.findFirst({
          where: {
            id: messageId,
            conversationId,
            conversation: { organizationId },
          },
        });

        if (!message) {
          return { deletedCount: 0, messageContent: null };
        }

        // Delete all messages with createdAt >= this message's createdAt
        // SECURITY: Filter through conversation to ensure org ownership
        const result = await tx.agentMessage.deleteMany({
          where: {
            conversationId,
            conversation: { organizationId },
            createdAt: {
              gte: message.createdAt,
            },
          },
        });

        return {
          deletedCount: result.count,
          messageContent: message.content,
        };
      });
    } catch (error) {
      throw databaseError('deleteMessagesFromId', error instanceof Error ? error : undefined);
    }
  }

  async updateToolResultByConfirmationId(
    conversationId: string,
    organizationId: string,
    confirmationId: string,
    newToolResult: unknown,
  ): Promise<boolean> {
    try {
      // Find the TOOL_RESULT message that contains this confirmationId
      // SECURITY: Filter through conversation to ensure org ownership
      const messages = await prisma.agentMessage.findMany({
        where: {
          conversationId,
          role: 'TOOL_RESULT',
          conversation: { organizationId },
        },
      });

      // Find the message with matching confirmationId in its toolResult
      const targetMessage = messages.find((m) => {
        const result = m.toolResult;
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          return false;
        }
        return 'confirmationId' in result && result.confirmationId === confirmationId;
      });

      if (!targetMessage) {
        return false;
      }

      // Update the toolResult
      await prisma.agentMessage.update({
        where: { id: targetMessage.id },
        data: { toolResult: toPrismaJson(newToolResult) },
      });

      return true;
    } catch (error) {
      throw databaseError(
        'updateToolResultByConfirmationId',
        error instanceof Error ? error : undefined,
      );
    }
  }
}

/**
 * Default singleton instance
 */
export const prismaConversationRepository = new PrismaConversationRepository();
