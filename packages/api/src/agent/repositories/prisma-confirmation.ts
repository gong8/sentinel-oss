/**
 * Prisma Implementation of Confirmation Repository
 * Handles persistence and retrieval of agent confirmations
 */

import { AgentConfirmationStatus, Prisma, prisma } from '@sentinel/db';
import { toJsonValue } from '../../lib/jsonValue.js';
import { databaseError } from '../errors.js';
import type {
  ConfirmationEntity,
  CreateConfirmationParams,
  FindOrCreateConfirmationResult,
  IConfirmationRepository,
} from './types.js';

/**
 * Recursively sort object keys for consistent JSON stringification.
 * Used for comparing tool inputs regardless of key ordering.
 */
function sortKeysRecursively(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysRecursively);
  }
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysRecursively((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Prisma implementation of confirmation repository
 */
export class PrismaConfirmationRepository implements IConfirmationRepository {
  async findExistingPending(params: {
    organizationId: string;
    conversationId?: string;
    workspaceId?: string;
    toolName: string;
  }): Promise<ConfirmationEntity | null> {
    try {
      return prisma.agentConfirmation.findFirst({
        where: {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          workspaceId: params.workspaceId ?? null,
          toolName: params.toolName,
          status: AgentConfirmationStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw databaseError('findExistingPending', error instanceof Error ? error : undefined);
    }
  }

  async create(params: CreateConfirmationParams): Promise<ConfirmationEntity> {
    try {
      return prisma.agentConfirmation.create({
        data: {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          workspaceId: params.workspaceId,
          toolName: params.toolName,
          toolInput: toJsonValue(params.toolInput),
          description: params.description,
          expiresAt: params.expiresAt,
        },
      });
    } catch (error) {
      throw databaseError('createConfirmation', error instanceof Error ? error : undefined);
    }
  }

  async findOrCreate(
    params: CreateConfirmationParams,
    normalizedInputStr: string,
  ): Promise<FindOrCreateConfirmationResult> {
    try {
      return prisma.$transaction(async (tx) => {
        // Check for existing pending confirmation within the transaction
        const existing = await tx.agentConfirmation.findFirst({
          where: {
            organizationId: params.organizationId,
            conversationId: params.conversationId,
            workspaceId: params.workspaceId ?? null,
            toolName: params.toolName,
            status: AgentConfirmationStatus.PENDING,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });

        // If we found an existing confirmation, check if the input matches
        if (existing) {
          // Normalize both inputs by sorting keys recursively for consistent comparison
          // This handles cases where the stored input has different key ordering
          const existingInputStr = JSON.stringify(sortKeysRecursively(existing.toolInput));
          if (existingInputStr === normalizedInputStr) {
            return { confirmation: existing, created: false };
          }
        }

        // Create new confirmation within the same transaction
        const created = await tx.agentConfirmation.create({
          data: {
            organizationId: params.organizationId,
            conversationId: params.conversationId,
            workspaceId: params.workspaceId,
            toolName: params.toolName,
            toolInput: toJsonValue(params.toolInput),
            description: params.description,
            expiresAt: params.expiresAt,
          },
        });

        return { confirmation: created, created: true };
      });
    } catch (error) {
      throw databaseError('findOrCreateConfirmation', error instanceof Error ? error : undefined);
    }
  }

  async findById(
    confirmationId: string,
    organizationId: string,
  ): Promise<ConfirmationEntity | null> {
    try {
      return prisma.agentConfirmation.findFirst({
        where: {
          id: confirmationId,
          organizationId,
        },
      });
    } catch (error) {
      throw databaseError('findConfirmationById', error instanceof Error ? error : undefined);
    }
  }

  async findPendingByConversation(
    conversationId: string,
    organizationId: string,
  ): Promise<ConfirmationEntity[]> {
    try {
      return prisma.agentConfirmation.findMany({
        where: {
          conversationId,
          organizationId,
          status: AgentConfirmationStatus.PENDING,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw databaseError('findPendingByConversation', error instanceof Error ? error : undefined);
    }
  }

  async findPendingById(
    confirmationId: string,
    organizationId: string,
  ): Promise<ConfirmationEntity | null> {
    try {
      return prisma.agentConfirmation.findFirst({
        where: {
          id: confirmationId,
          organizationId,
          status: AgentConfirmationStatus.PENDING,
        },
      });
    } catch (error) {
      throw databaseError('findPendingById', error instanceof Error ? error : undefined);
    }
  }

  async confirm(confirmationId: string, userId: string): Promise<ConfirmationEntity> {
    try {
      return prisma.agentConfirmation.update({
        where: { id: confirmationId },
        data: {
          status: AgentConfirmationStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedBy: userId,
        },
      });
    } catch (error) {
      throw databaseError('confirmConfirmation', error instanceof Error ? error : undefined);
    }
  }

  async cancel(confirmationId: string): Promise<void> {
    try {
      await prisma.agentConfirmation.update({
        where: { id: confirmationId },
        data: { status: AgentConfirmationStatus.CANCELLED },
      });
    } catch (error) {
      throw databaseError('cancelConfirmation', error instanceof Error ? error : undefined);
    }
  }

  async expire(confirmationId: string): Promise<void> {
    try {
      await prisma.agentConfirmation.update({
        where: { id: confirmationId },
        data: { status: AgentConfirmationStatus.EXPIRED },
      });
    } catch (error) {
      throw databaseError('expireConfirmation', error instanceof Error ? error : undefined);
    }
  }

  async markExecuted(confirmationId: string, result: unknown, error?: string): Promise<void> {
    try {
      await prisma.agentConfirmation.update({
        where: { id: confirmationId },
        data: {
          executedAt: new Date(),
          result: result !== null && result !== undefined ? toJsonValue(result) : Prisma.JsonNull,
          error,
        },
      });
    } catch (dbError) {
      throw databaseError('markExecuted', dbError instanceof Error ? dbError : undefined);
    }
  }

  async expireOldConfirmations(organizationId: string): Promise<void> {
    try {
      await prisma.agentConfirmation.updateMany({
        where: {
          organizationId,
          status: AgentConfirmationStatus.PENDING,
          expiresAt: { lt: new Date() },
        },
        data: { status: AgentConfirmationStatus.EXPIRED },
      });
    } catch (error) {
      throw databaseError('expireOldConfirmations', error instanceof Error ? error : undefined);
    }
  }
}

/**
 * Default singleton instance
 */
export const prismaConfirmationRepository = new PrismaConfirmationRepository();
