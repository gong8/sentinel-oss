/**
 * Tool Schema Mapper
 *
 * Provides schema validation and mapping utilities for converting between
 * different tool definition formats (MCP, LLM, router).
 *
 * Responsibilities:
 * - Validate MCP tool input schemas using Zod
 * - Convert router tool definitions to LLM format
 * - Map workspace execution results to unified format
 *
 * @module tool-schema-mapper
 */

import { z } from 'zod';

import type { ToolDefinition as RouterToolDefinition } from '../services/workspace-tool-router.js';
import type { JsonSchemaProperty, ToolDefinition as LLMToolDefinition } from './llm/index.js';
import type { ToolResultFull } from './result-types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Workspace tool execution result (from WorkspaceToolRouter)
 */
export interface WorkspaceToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  decision?: 'ALLOWED' | 'DENIED';
  deniedReason?: string;
  serverDomain?: string;
  blockingPolicyId?: string;
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Default empty input schema for tools without one
 */
export const DEFAULT_INPUT_SCHEMA: LLMToolDefinition['input_schema'] = {
  type: 'object',
  properties: {},
};

/**
 * Zod schema for validating JSON Schema property definitions (recursive)
 */
export const jsonSchemaPropertySchema: z.ZodType<JsonSchemaProperty> = z.lazy(() =>
  z.object({
    type: z.union([z.string(), z.array(z.string())]).optional(),
    description: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
    items: z.union([jsonSchemaPropertySchema, z.array(jsonSchemaPropertySchema)]).optional(),
    properties: z.record(z.string(), jsonSchemaPropertySchema).optional(),
    required: z.array(z.string()).optional(),
    format: z.string().optional(),
    default: z.unknown().optional(),
    nullable: z.boolean().optional(),
    oneOf: z.array(jsonSchemaPropertySchema).optional(),
    anyOf: z.array(jsonSchemaPropertySchema).optional(),
    allOf: z.array(jsonSchemaPropertySchema).optional(),
    additionalProperties: z.union([z.boolean(), jsonSchemaPropertySchema]).optional(),
    $ref: z.string().optional(),
    $defs: z.record(z.string(), jsonSchemaPropertySchema).optional(),
  }),
);

/**
 * Zod schema for validating MCP tool input schemas
 */
export const mcpInputSchemaValidator = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), jsonSchemaPropertySchema).default({}),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
});

/**
 * Schema for docs search tool input
 */
export const docsSearchInputSchema = z.object({
  query: z.string().optional(),
});

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Convert router tool definition to LLM tool definition format.
 * Uses Zod validation to ensure type safety for MCP tool schemas.
 */
export function mapRouterToolToLLMTool(tool: RouterToolDefinition): LLMToolDefinition {
  const parseResult = mcpInputSchemaValidator.safeParse(tool.inputSchema);
  const schema = parseResult.success ? parseResult.data : DEFAULT_INPUT_SCHEMA;

  return {
    name: tool.name,
    description: tool.description ?? '',
    input_schema: schema,
  };
}

/**
 * Map workspace tool result to unified tool execution result.
 */
export function mapWorkspaceResultToToolResult(
  result: WorkspaceToolResult,
  toolId: string,
  toolName: string,
  input: unknown,
): ToolResultFull {
  return {
    id: toolId,
    name: toolName,
    input,
    result: result.success ? result.result : undefined,
    error: result.success ? undefined : result.error,
    decision: result.decision,
    deniedReason: result.deniedReason,
    serverDomain: result.serverDomain,
    blockingPolicyId: result.blockingPolicyId,
  };
}
