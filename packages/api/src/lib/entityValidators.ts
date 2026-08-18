/**
 * Entity Validator Factories
 *
 * Creates reusable validators for checking entity existence with organization scoping.
 * Reduces duplication across admin MCP validation code.
 */

import { prisma, Prisma } from '@sentinel/db';
import type { ValidationResult } from '../services/adminMcpValidation.js';

type PrismaModelName = Prisma.ModelName;

interface EntityExistsValidatorOptions {
  /** Display name for error messages (e.g., "Policy", "User") */
  entityName: string;
  /** Prisma model name (e.g., "Policy", "User") */
  modelName: PrismaModelName;
  /** ID field names to check in input (default: ['id', `${entityName.toLowerCase()}Id`]) */
  idFields?: readonly string[];
  /** Whether to filter by deletedAt: null (default: true) */
  softDeleteFilter?: boolean;
}

/**
 * Extracts the entity ID from input by checking multiple possible field names.
 */
function extractEntityId(
  input: Record<string, unknown>,
  idFields: readonly string[],
): string | null {
  for (const field of idFields) {
    const value = input[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * Creates a validator function that checks if an entity exists within an organization.
 *
 * @example
 * const validateUserExists = createEntityExistsValidator({
 *   entityName: 'User',
 *   modelName: 'User',
 *   idFields: ['id', 'userId'],
 * });
 *
 * // Later in validation code:
 * return validateUserExists(organizationId, input);
 */
export function createEntityExistsValidator(
  options: EntityExistsValidatorOptions,
): (organizationId: string, input: Record<string, unknown>) => Promise<ValidationResult> {
  const {
    entityName,
    modelName,
    idFields = ['id', `${entityName.toLowerCase()}Id`],
    softDeleteFilter = true,
  } = options;

  return async function validateEntityExists(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<ValidationResult> {
    const entityId = extractEntityId(input, idFields);

    if (!entityId) {
      return { valid: false, error: `${entityName} ID is required` };
    }

    const where: Record<string, unknown> = {
      id: entityId,
      organizationId,
    };

    if (softDeleteFilter) {
      where.deletedAt = null;
    }

    // Use dynamic model access - Prisma client provides type-safe access
    const delegate = prisma[
      (modelName.charAt(0).toLowerCase() + modelName.slice(1)) as Uncapitalize<PrismaModelName>
    ] as unknown as {
      findFirst: (args: {
        where: Record<string, unknown>;
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };

    const entity = await delegate.findFirst({
      where,
      select: { id: true },
    });

    if (!entity) {
      return { valid: false, error: `${entityName} "${entityId}" not found` };
    }

    return { valid: true };
  };
}

interface UniqueFieldValidatorOptions {
  /** Display name for error messages (e.g., "Policy", "User") */
  entityName: string;
  /** Prisma model name (e.g., "Policy", "User") */
  modelName: PrismaModelName;
  /** Field name to check for uniqueness (e.g., "slug", "email", "name") */
  uniqueField: string;
  /** Whether to filter by deletedAt: null (default: true) */
  softDeleteFilter?: boolean;
}

/**
 * Creates a validator function that checks if a field value is unique within an organization.
 *
 * @example
 * const validatePolicySlugUnique = createUniqueFieldValidator({
 *   entityName: 'Policy',
 *   modelName: 'Policy',
 *   uniqueField: 'slug',
 * });
 */
export function createUniqueFieldValidator(
  options: UniqueFieldValidatorOptions,
): (organizationId: string, fieldValue: string, excludeId?: string) => Promise<ValidationResult> {
  const { entityName, modelName, uniqueField, softDeleteFilter = true } = options;

  return async function validateFieldUnique(
    organizationId: string,
    fieldValue: string,
    excludeId?: string,
  ): Promise<ValidationResult> {
    const where: Record<string, unknown> = {
      organizationId,
      [uniqueField]: fieldValue,
    };

    if (softDeleteFilter) {
      where.deletedAt = null;
    }

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const delegate = prisma[
      (modelName.charAt(0).toLowerCase() + modelName.slice(1)) as Uncapitalize<PrismaModelName>
    ] as unknown as {
      findFirst: (args: {
        where: Record<string, unknown>;
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };

    const existing = await delegate.findFirst({
      where,
      select: { id: true },
    });

    if (existing) {
      return {
        valid: false,
        error: `${entityName} with ${uniqueField} "${fieldValue}" already exists`,
      };
    }

    return { valid: true };
  };
}
