/**
 * Write Tool Executors
 *
 * Wrappers that handle write operations from mcp-admin tool definitions.
 * Write tools create confirmation records and return confirmation IDs.
 * Actual execution happens when the user confirms via the confirmation router.
 *
 * IMPORTANT: Validation happens BEFORE creating confirmations so LLMs get
 * immediate feedback on mistakes (like using friendly names instead of serverKeys).
 */

import type { AgentToolDefinition } from '@sentinel/shared';
import { z } from 'zod';
import { validatePolicyInput } from '../../../services/policyValidation.js';
import { createConfirmation, generateActionDescription } from '../../confirmation.js';
import type { ToolContext, ToolResult } from '../types.js';

// ============================================================================
// INPUT SCHEMAS FOR POLICY TOOLS
// ============================================================================

/** Supported condition operators - matches ConditionOperator type */
const ConditionOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'matches',
  'lessThan',
  'greaterThan',
  'between',
  'in',
  'notIn',
  'containsAny',
  'containsNone',
  'exists',
  'notExists',
  'inCidr',
  'notInCidr',
]);

/** Schema for a single policy condition - matches PolicyCondition interface */
const PolicyConditionInputSchema = z.object({
  field: z.string(),
  operator: ConditionOperatorSchema,
  value: z.unknown().optional(),
  valueRef: z.string().optional(),
});

/** Schema for create_policy input */
const CreatePolicyInputSchema = z.object({
  matchers: z.array(z.string()).optional(),
  toolPatterns: z.array(z.string()).optional(),
  effect: z.string().optional(),
  description: z.string().optional(),
  conditions: z.array(PolicyConditionInputSchema).optional(),
});

/** Schema for update_policy input */
const UpdatePolicyInputSchema = z.object({
  id: z.string().optional(),
  matchers: z.array(z.string()).optional(),
  toolPatterns: z.array(z.string()).optional(),
  conditions: z.array(PolicyConditionInputSchema).optional(),
});

/** Remove undefined values from an object */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Type-safe helper to extract a string from input
 */
function getString(input: Record<string, unknown>, key: string, fallback = ''): string {
  const value = input[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * Type-safe helper to extract a string array from input
 */
function getStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Generate a human-readable description for a write operation
 * Maps tool names to description generators
 */
const DESCRIPTION_GENERATORS: Record<string, (input: Record<string, unknown>) => string> = {
  // Policy tools
  create_policy: (input) => {
    const effect = getString(input, 'effect', 'unknown');
    const matchers = getStringArray(input, 'matchers');
    const toolPatterns = getStringArray(input, 'toolPatterns');
    return `Create ${effect} policy for ${matchers.join(', ') || 'all'} on ${toolPatterns.join(', ') || '*'}`;
  },
  update_policy: (input) => `Update policy ${getString(input, 'id') || getString(input, 'slug')}`,
  delete_policy: (input) => `Delete policy ${getString(input, 'id')}`,
  enable_policy: (input) => `Enable policy ${getString(input, 'id')}`,
  disable_policy: (input) => `Disable policy ${getString(input, 'id')}`,

  // User tools
  create_user: (input) => `Create user with email ${getString(input, 'email')}`,
  update_user: (input) => `Update user ${getString(input, 'id')}`,
  delete_user: (input) => `Delete user ${getString(input, 'id')}`,

  // Role tools
  create_role: (input) => `Create role "${getString(input, 'name')}"`,
  update_role: (input) => `Update role ${getString(input, 'id')}`,
  delete_role: (input) => `Delete role ${getString(input, 'id')}`,

  // MCP server tools
  create_mcp_server: (input) =>
    `Create MCP server "${getString(input, 'name')}" (${getString(input, 'url')})`,
  update_mcp_server: (input) => `Update MCP server ${getString(input, 'id')}`,
  delete_mcp_server: (input) => `Delete MCP server ${getString(input, 'id')}`,

  // Agent tools
  create_agent: (input) => `Create agent "${getString(input, 'name')}"`,
  delete_agent: (input) => `Delete agent ${getString(input, 'id')}`,

  // Webhook tools
  create_webhook: (input) => {
    const name = getString(input, 'name');
    const events = getStringArray(input, 'events');
    return `Create webhook "${name}" for events: ${events.join(', ')}`;
  },
  update_webhook: (input) => `Update webhook ${getString(input, 'id')}`,
  delete_webhook: (input) => `Delete webhook ${getString(input, 'id')}`,

  // Permission request tools
  approve_request: (input) => `Approve permission request ${getString(input, 'id')}`,
  deny_request: (input) => `Deny permission request ${getString(input, 'id')}`,
};

/**
 * Generate a description for a write tool operation
 */
function generateDescription(baseName: string, input: Record<string, unknown>): string {
  // Try local generators first
  const generator = DESCRIPTION_GENERATORS[baseName];
  if (generator) {
    return generator(input);
  }

  // Fall back to the existing generateActionDescription
  return generateActionDescription(baseName, input);
}

/**
 * Validate tool input BEFORE creating confirmation.
 * Returns validated input that should be used for the confirmation.
 * Throws an error if validation fails (LLM gets immediate feedback).
 */
async function validateWriteToolInput(
  baseName: string,
  input: Record<string, unknown>,
  organizationId: string,
): Promise<Record<string, unknown>> {
  // Policy tools need special validation
  if (baseName === 'create_policy') {
    // Parse and validate the input structure
    const parseResult = CreatePolicyInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new Error(`Invalid create_policy input: ${parseResult.error.message}`);
    }
    const parsedInput = parseResult.data;

    // Validate policy-specific rules (server keys, tool names, matchers, etc.)
    // Strip undefined values to match expected interface
    const validated = await validatePolicyInput(
      organizationId,
      stripUndefined({
        matchers: parsedInput.matchers,
        toolPatterns: parsedInput.toolPatterns,
        effect: parsedInput.effect,
        description: parsedInput.description,
        conditions: parsedInput.conditions,
      }),
      true, // isCreate
    );

    // Return input with validated patterns (may have been normalized)
    return {
      ...input,
      ...(validated.validatedToolPatterns && { toolPatterns: validated.validatedToolPatterns }),
    };
  }

  if (baseName === 'update_policy') {
    // Parse and validate the input structure
    const parseResult = UpdatePolicyInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new Error(`Invalid update_policy input: ${parseResult.error.message}`);
    }
    const parsedInput = parseResult.data;

    // Validate policy-specific rules (server keys, tool names, matchers, etc.)
    // Strip undefined values to match expected interface
    const validated = await validatePolicyInput(
      organizationId,
      stripUndefined({
        id: parsedInput.id,
        matchers: parsedInput.matchers,
        toolPatterns: parsedInput.toolPatterns,
        conditions: parsedInput.conditions,
      }),
      false, // isCreate
    );

    // Return input with validated patterns (may have been normalized)
    return {
      ...input,
      ...(validated.validatedToolPatterns && { toolPatterns: validated.validatedToolPatterns }),
    };
  }

  // No special validation for other tools
  return input;
}

/**
 * Execute a write tool by creating a confirmation record
 * Returns the confirmation ID for user approval
 *
 * IMPORTANT: Validation happens BEFORE creating the confirmation.
 * This gives LLMs immediate feedback on mistakes instead of waiting
 * until the admin clicks approve.
 */
export async function executeWriteTool(
  toolDef: AgentToolDefinition,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const { baseName } = toolDef;

  // VALIDATE FIRST - LLM gets immediate feedback on mistakes
  let validatedInput: Record<string, unknown>;
  try {
    validatedInput = await validateWriteToolInput(baseName, input, context.organizationId);
  } catch (error) {
    // Return validation error immediately so LLM can correct itself
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }

  // Generate human-readable description with validated input
  const description = generateDescription(baseName, validatedInput);

  // Create confirmation record with validated input
  const confirmation = await createConfirmation({
    organizationId: context.organizationId,
    conversationId: context.conversationId,
    workspaceId: context.workspaceId,
    toolName: baseName,
    toolInput: validatedInput, // Use validated input!
    description,
  });

  // Return the confirmation request (not executed yet)
  return {
    success: true,
    confirmationId: confirmation.confirmationId,
    data: {
      requiresConfirmation: true,
      message: `Action requires confirmation: ${description}`,
      description, // Include for extraction by orchestrator
      confirmationId: confirmation.confirmationId,
      expiresAt: confirmation.expiresAt,
    },
  };
}

/**
 * Check if a tool is a write tool that requires confirmation
 */
export function isWriteTool(toolDef: AgentToolDefinition): boolean {
  return toolDef.isWriteTool;
}

/**
 * Get all write tool base names
 */
export function getWriteToolBaseNames(toolDefs: AgentToolDefinition[]): string[] {
  return toolDefs.filter((t) => t.isWriteTool).map((t) => t.baseName);
}
