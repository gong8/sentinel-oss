/**
 * Agent Tools Registry
 *
 * Imports tool definitions from mcp-admin (source of truth) and wires them up
 * to the appropriate executors for the Sentinel Agent.
 *
 * - Read tools execute immediately via executeReadTool
 * - Write tools create confirmation records via executeWriteTool
 */

import {
  getAllToolDefinitionsForAgent,
  getReadToolDefinitionsForAgent,
  getWriteToolDefinitionsForAgent,
  type AgentToolDefinition,
} from '@sentinel/shared';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { createPlan, type PlanStep } from '../../services/agentPlan.js';
import { normalizeToolName } from '../utils/index.js';
import { executeReadTool, executeWriteTool } from './executors/index.js';
import {
  createTool,
  ToolRegistry,
  type AdminToolContext,
  type AgentToolBase,
  type ToolResult,
} from './types.js';

// Re-export types
export { ToolRegistry, zodToToolSchema } from './types.js';
export type {
  AdminToolContext,
  AgentTool,
  AgentToolBase,
  RedirectAction,
  ToolContext,
  ToolResult,
} from './types.js';

/**
 * Format validation errors in a way that helps the LLM understand what to fix
 */
function formatValidationError(toolName: string, input: unknown, error: unknown): string {
  // Get the raw input keys for comparison
  const inputKeys = input && typeof input === 'object' ? Object.keys(input) : [];

  // Build a helpful error message
  const lines: string[] = [`Input validation failed for ${toolName}.`];

  // Parse Zod error if available - validate structure before accessing
  const zodErrorSchema = z.object({
    issues: z.array(z.object({ path: z.array(z.string()), message: z.string() })),
  });
  const zodErrorResult = zodErrorSchema.safeParse(error);
  if (zodErrorResult.success) {
    const issues = zodErrorResult.data.issues;
    for (const issue of issues) {
      const fieldName = issue.path.join('.');
      if (fieldName) {
        // Check if a similar field name was provided (common LLM mistake)
        const similarKey = inputKeys.find(
          (k) =>
            k.toLowerCase() === fieldName.toLowerCase() ||
            k.toLowerCase() === fieldName.slice(0, -1).toLowerCase() || // singular vs plural
            k.toLowerCase() + 's' === fieldName.toLowerCase(), // singular vs plural
        );
        if (similarKey && similarKey !== fieldName) {
          lines.push(
            `- Field "${fieldName}" is required but you provided "${similarKey}". Use "${fieldName}" instead.`,
          );
        } else {
          lines.push(`- Field "${fieldName}": ${issue.message}`);
        }
      } else {
        lines.push(`- ${issue.message}`);
      }
    }
  } else if (error instanceof Error) {
    lines.push(error.message);
  }

  // If there are unknown keys, mention them
  if (inputKeys.length > 0) {
    lines.push(`\nYou provided these fields: ${inputKeys.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Convert an mcp-admin tool definition to an AgentTool
 */
function convertToAgentTool(def: AgentToolDefinition): AgentToolBase {
  return {
    name: def.baseName,
    description: def.description,
    inputSchema: def.inputSchema,
    requiresConfirmation: def.isWriteTool,
    execute: async (input: unknown, context: AdminToolContext): Promise<ToolResult> => {
      // Validate input against schema (catches LLM errors like wrong field names, null arrays)
      const parseResult = def.inputSchema.safeParse(input);
      if (!parseResult.success) {
        return {
          success: false,
          error: formatValidationError(def.baseName, input, parseResult.error),
        };
      }

      // Tool inputs are always objects with string keys - validate and narrow the type
      const recordSchema = z.record(z.string(), z.unknown());
      const recordResult = recordSchema.safeParse(parseResult.data);
      if (!recordResult.success) {
        return {
          success: false,
          error: `Invalid input type: expected object with string keys`,
        };
      }
      const validatedInput = recordResult.data;

      if (def.isWriteTool) {
        // Write tools create confirmation records
        return executeWriteTool(def, validatedInput, context);
      } else {
        // Read tools execute immediately
        return executeReadTool(def.baseName, validatedInput, context);
      }
    },
  };
}

/**
 * All read-only tools (from mcp-admin)
 */
export const readTools: AgentToolBase[] = getReadToolDefinitionsForAgent().map(convertToAgentTool);

/**
 * All write tools (require confirmation before execution, from mcp-admin)
 */
export const writeTools: AgentToolBase[] =
  getWriteToolDefinitionsForAgent().map(convertToAgentTool);

/**
 * All available tools
 */
export const allTools: AgentToolBase[] = getAllToolDefinitionsForAgent().map(convertToAgentTool);

// ============================================================================
// BUILT-IN TOOLS (not from mcp-admin)
// ============================================================================

/**
 * Plan step schema for creating multi-step plans
 */
const planStepSchema = z.object({
  toolName: z.string().describe('The name of the tool to execute in this step'),
  toolInput: z.record(z.string(), z.unknown()).describe('The input parameters for the tool'),
  description: z.string().describe('Human-readable description of what this step does'),
  dependsOn: z
    .array(z.number())
    .optional()
    .describe('Step indices (0-based) that must complete before this step'),
  canRollback: z
    .boolean()
    .optional()
    .describe('Whether this step can be rolled back if a later step fails'),
  rollbackToolName: z.string().optional().describe('Tool to call to rollback this step'),
  rollbackToolInput: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Input for the rollback tool'),
});

/**
 * Create plan tool input schema
 */
const createPlanInputSchema = z.object({
  name: z.string().describe('Short name for the plan (e.g., "Create and test policy")'),
  description: z.string().describe('Full description of what this plan accomplishes'),
  steps: z.array(planStepSchema).min(2).describe('The steps to execute in order (minimum 2 steps)'),
});

type CreatePlanInput = z.infer<typeof createPlanInputSchema>;

/**
 * Built-in tool for creating multi-step operation plans
 * The agent can use this to propose a series of operations for user approval
 */
const createPlanTool = createTool<CreatePlanInput>(
  'create_plan',
  `Create a multi-step operation plan for complex tasks that require multiple tool calls.
Use this when the user's request involves multiple sequential operations that should be reviewed together before execution.

Examples of when to use this:
- "Create a policy and test it" (2 steps: create_policy, then test the policy)
- "Set up a new server and configure its permissions" (multiple steps)
- "Delete all policies for a specific server" (list + multiple deletes)

The plan will be presented to the user for approval before any steps are executed.
Each step can optionally define rollback logic for error recovery.`,
  createPlanInputSchema,
  async (input: CreatePlanInput, context: AdminToolContext): Promise<ToolResult> => {
    if (!context.conversationId) {
      return {
        success: false,
        error: 'Cannot create plan without a conversation context',
      };
    }
    if (!context.userId) {
      return {
        success: false,
        error: 'Cannot create plan without user context',
      };
    }

    try {
      // Convert input steps to PlanStep format
      const steps: PlanStep[] = input.steps.map((step) => ({
        toolName: step.toolName,
        toolInput: step.toolInput,
        description: step.description,
        dependsOn: step.dependsOn,
        canRollback: step.canRollback,
        rollbackToolName: step.rollbackToolName,
        rollbackToolInput: step.rollbackToolInput,
      }));

      const planId = await createPlan({
        organizationId: context.organizationId,
        conversationId: context.conversationId,
        userId: context.userId,
        name: input.name,
        description: input.description,
        steps,
      });

      logger.info('Agent created plan', {
        planId,
        name: input.name,
        stepCount: steps.length,
      });

      return {
        success: true,
        data: {
          planId,
          message: `Created plan "${input.name}" with ${steps.length} steps. The user will be prompted to approve or reject this plan before execution.`,
          description: input.description,
          steps: steps.map((s, i) => ({
            step: i + 1,
            tool: s.toolName,
            description: s.description,
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to create plan', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create plan',
      };
    }
  },
);

/**
 * Built-in tools that are always available
 */
const builtInTools: AgentToolBase[] = [createPlanTool];

/**
 * Create a configured tool registry
 */
export function createToolRegistry(options?: { includeWriteTools?: boolean }): ToolRegistry {
  const registry = new ToolRegistry();

  // Register read tools
  for (const tool of readTools) {
    registry.register(tool);
  }

  // Optionally register write tools
  if (options?.includeWriteTools) {
    for (const tool of writeTools) {
      registry.register(tool);
    }
  }

  // Register built-in tools (always available)
  for (const tool of builtInTools) {
    registry.register(tool);
  }

  return registry;
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  toolName: string,
  input: unknown,
  context: AdminToolContext,
  registry?: ToolRegistry,
): Promise<ToolResult> {
  // Normalize tool name - LLMs sometimes add "functions." or "admin_" prefixes
  const normalizedToolName = normalizeToolName(toolName);

  const toolRegistry = registry ?? createToolRegistry({ includeWriteTools: true });
  const tool = toolRegistry.get(normalizedToolName);

  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${normalizedToolName}`,
    };
  }

  try {
    return await tool.execute(input, context);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error executing tool',
    };
  }
}
