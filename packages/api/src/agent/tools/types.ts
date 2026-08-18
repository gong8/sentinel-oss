/**
 * Agent Tool Types
 * Defines the interfaces and types for agent tools
 */

import { z } from 'zod';

import type { ToolDefinition as LLMToolDefinition, ToolInputSchema } from '../llm/index.js';

/**
 * Base tool interface (non-generic, for arrays and registries)
 */
export interface AgentToolBase {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown, context: AdminToolContext) => Promise<ToolResult>;
  /** Whether this tool requires confirmation before execution */
  requiresConfirmation?: boolean;
}

/**
 * Typed tool definition for Claude API
 */
export interface AgentTool<T = unknown> extends Omit<AgentToolBase, 'execute' | 'inputSchema'> {
  inputSchema: z.ZodType<T>;
  execute: (input: T, context: AdminToolContext) => Promise<ToolResult>;
}

/**
 * Context passed to admin tool execution
 * Note: For workspace tools, see ToolContext in workspace-tool-router.ts
 */
export interface AdminToolContext {
  organizationId: string;
  /** Workspace scope for operations (null = global/org-wide mode) */
  workspaceId?: string;
  userId?: string;
  agentId?: string;
  /** Conversation ID for linking confirmations */
  conversationId?: string;
}

/**
 * Alias for AdminToolContext used by read/write tool executors
 */
export type ToolContext = AdminToolContext;

/**
 * Redirect action for post-execution navigation
 */
export interface RedirectAction {
  /** Path to navigate to */
  path: string;
  /** Query parameters */
  query?: Record<string, string>;
  /** Message to display before redirecting */
  message?: string;
}

/**
 * Result from tool execution
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** For tools requiring confirmation, this is the confirmation ID */
  confirmationId?: string;
  /** Redirect action for post-execution navigation */
  redirectAction?: RedirectAction;
}

/**
 * Create a typed tool definition
 * Returns AgentToolBase for compatibility with arrays
 */
export function createTool<T>(
  name: string,
  description: string,
  inputSchema: z.ZodType<T>,
  execute: (input: T, context: AdminToolContext) => Promise<ToolResult>,
  options?: { requiresConfirmation?: boolean },
): AgentToolBase {
  return {
    name,
    description,
    inputSchema,
    execute: async (input: unknown, context: AdminToolContext) => {
      const parsed = inputSchema.parse(input);
      return execute(parsed, context);
    },
    requiresConfirmation: options?.requiresConfirmation,
  };
}

/**
 * Zod schema for validating JSON Schema property definitions
 */
const jsonSchemaPropertySchema: z.ZodType<LLMToolDefinition['input_schema']['properties'][string]> =
  z.lazy(() =>
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
 * Zod schema for validating tool input schemas (JSON Schema object type)
 */
const toolInputSchemaValidator = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), jsonSchemaPropertySchema).default({}),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
});

/**
 * Convert a Zod schema to Claude tool input_schema format
 * Uses Zod v4's native JSON Schema conversion with runtime validation
 */
export function zodToToolSchema(schema: z.ZodType): ToolInputSchema {
  const jsonSchema = z.toJSONSchema(schema, { target: 'openapi-3.0' });

  // Ensure we return an object type for Claude
  if (typeof jsonSchema === 'object' && 'type' in jsonSchema && jsonSchema.type === 'object') {
    // Remove $schema and other metadata that Claude doesn't need
    const { $schema: _schema, ...rest } = jsonSchema;
    // Validate and parse to ensure type safety
    const parsed = toolInputSchemaValidator.safeParse(rest);
    if (parsed.success) {
      return parsed.data;
    }
    // Fallback: return minimal valid schema if validation fails
    return {
      type: 'object',
      properties: {},
    };
  }

  // Wrap non-object schemas in an object
  return {
    type: 'object',
    properties: {},
  };
}

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private tools: Map<string, AgentToolBase> = new Map();

  register(tool: AgentToolBase): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentToolBase | undefined {
    return this.tools.get(name);
  }

  getAll(): AgentToolBase[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools in generic LLM format (provider-agnostic)
   * Works for both Claude and other providers
   */
  getTools(): LLMToolDefinition[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToToolSchema(tool.inputSchema),
    }));
  }
}
