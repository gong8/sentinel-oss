/**
 * Unified Tool Router - Mode-Aware Tool Access
 *
 * Provides a unified interface for tool discovery and execution across both
 * admin and workspace modes, abstracting over the underlying implementations:
 *
 * - **Admin mode**: Uses ToolRegistry for admin tools + MCP tools from servers
 * - **Workspace mode**: Uses WorkspaceToolRouter with policy-based access control
 *
 * Security Model:
 * - Mode isolation is enforced via TypeScript type guards
 * - Workspace contexts cannot access admin-only tools
 * - Policy evaluation happens at the workspace router level
 * - Built-in tools (e.g., docs search) are available in both modes
 *
 * Tool Resolution:
 * 1. Check built-in tools (docs search)
 * 2. For admin: check ToolRegistry, fallback to MCP tools
 * 3. For workspace: execute via WorkspaceToolRouter with policies
 *
 * @example
 * const router = createUnifiedToolRouter({ includeWriteTools: true });
 *
 * // Get tools based on context
 * const tools = await router.getAvailableTools(context);
 *
 * // Execute with mode-appropriate handling
 * const result = await router.executeTool('tool_name', input, context, toolId);
 *
 * @see UnifiedOrchestrator - Consumes this router for tool operations
 * @see ToolRegistry - Admin tool definitions
 * @see WorkspaceToolRouter - Workspace tool execution with policies
 *
 * @module unified-tool-router
 */

import { logger } from '../lib/logger.js';
import { searchSentinelDocs } from '../services/docs-search-tool.js';
import {
  WorkspaceToolRouter,
  type ToolContext as WorkspaceToolContext,
} from '../services/workspace-tool-router.js';
import { invalidWorkspaceContextError } from './errors.js';
import type { ToolDefinition as LLMToolDefinition } from './llm/index.js';
import type { ToolResultFull } from './result-types.js';
import { getAdminTools, getWorkspaceTools } from './tool-availability.js';
import { docsSearchInputSchema, mapWorkspaceResultToToolResult } from './tool-schema-mapper.js';
import {
  createToolRegistry,
  executeTool as executeAdminToolFn,
  type AdminToolContext,
  type ToolRegistry,
} from './tools/index.js';
import {
  isWorkspaceContext,
  type AdminAgentContext,
  type UnifiedAgentContext,
  type WorkspaceAgentContext,
} from './unified-types.js';
import { extractDescription, handleByModeAsync, normalizeToolName } from './utils/index.js';

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

export {
  DEFAULT_INPUT_SCHEMA,
  jsonSchemaPropertySchema,
  mapRouterToolToLLMTool,
  mapWorkspaceResultToToolResult,
  mcpInputSchemaValidator,
} from './tool-schema-mapper.js';

export { getAdminTools, getWorkspaceTools } from './tool-availability.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the unified tool router
 */
export interface UnifiedToolRouterConfig {
  includeWriteTools?: boolean;
  adminRegistry?: ToolRegistry;
  workspaceRouter?: WorkspaceToolRouter;
}

// ============================================================================
// BUILT-IN TOOL EXECUTION
// ============================================================================

/**
 * Execute a built-in tool (docs search).
 * Returns null if the tool name doesn't match any built-in tool.
 */
function executeBuiltInTool(toolName: string, input: unknown): unknown | null {
  if (toolName !== 'search_sentinel_docs') {
    return null;
  }

  const parseResult = docsSearchInputSchema.safeParse(input);
  if (!parseResult.success || !parseResult.data.query) {
    return { error: 'Missing query parameter' };
  }

  const results = searchSentinelDocs(parseResult.data.query);
  return { results };
}

// ============================================================================
// UNIFIED TOOL ROUTER CLASS
// ============================================================================

/**
 * Unified Tool Router
 * Provides mode-aware tool access and execution
 *
 * Security: Mode isolation is enforced by type guards. Workspace context
 * CANNOT access admin tools and vice versa.
 */
export class UnifiedToolRouter {
  private adminRegistry: ToolRegistry;
  private workspaceRouter: WorkspaceToolRouter;

  constructor(config: UnifiedToolRouterConfig = {}) {
    this.adminRegistry =
      config.adminRegistry ??
      createToolRegistry({
        includeWriteTools: config.includeWriteTools ?? true,
      });
    this.workspaceRouter = config.workspaceRouter ?? new WorkspaceToolRouter();
  }

  /**
   * Get available tools based on context mode
   *
   * Admin mode: Returns admin tools + MCP tools from linked servers (if workspaceId provided)
   * Workspace mode: Returns MCP tools from workspace + org servers + docs search tool
   */
  async getAvailableTools(context: UnifiedAgentContext): Promise<LLMToolDefinition[]> {
    return handleByModeAsync(context, {
      admin: (ctx) =>
        getAdminTools(
          this.adminRegistry,
          this.workspaceRouter,
          ctx.organizationId,
          ctx.workspaceId,
        ),
      workspace: (ctx) =>
        getWorkspaceTools(this.workspaceRouter, ctx.organizationId, ctx.workspaceId),
    });
  }

  /**
   * Execute a tool based on context mode
   *
   * Admin mode: Executes via ToolRegistry, may return confirmationId for write tools
   * Workspace mode: Executes via WorkspaceToolRouter with policy evaluation
   */
  async executeTool(
    toolName: string,
    input: unknown,
    context: UnifiedAgentContext,
    toolId: string,
  ): Promise<ToolResultFull> {
    // Normalize tool name - LLMs sometimes add "functions." or "admin_" prefixes
    const normalizedToolName = normalizeToolName(toolName);

    // Check built-in tools first (both modes)
    const builtInResult = executeBuiltInTool(normalizedToolName, input);
    if (builtInResult !== null) {
      return {
        id: toolId,
        name: toolName,
        input,
        result: builtInResult,
        decision: 'ALLOWED',
      };
    }

    return handleByModeAsync(context, {
      admin: (ctx) => this.executeAdminTool(normalizedToolName, input, ctx, toolId),
      workspace: (ctx) => this.executeWorkspaceTool(normalizedToolName, input, ctx, toolId),
    });
  }

  /**
   * Execute an admin tool via ToolRegistry, falling back to MCP tools if not found
   */
  private async executeAdminTool(
    toolName: string,
    input: unknown,
    context: AdminAgentContext,
    toolId: string,
  ): Promise<ToolResultFull> {
    // First, check if this is a registered admin tool
    const adminTool = this.adminRegistry.get(toolName);

    if (adminTool) {
      logger.info('Executing admin tool', { toolName, toolId });

      const adminContext: AdminToolContext = {
        organizationId: context.organizationId,
        userId: context.userId,
        conversationId: context.conversationId,
        workspaceId: context.workspaceId,
      };

      const result = await executeAdminToolFn(toolName, input, adminContext, this.adminRegistry);

      return {
        id: toolId,
        name: toolName,
        input,
        result: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error,
        confirmationId: result.confirmationId,
        redirectAction: result.redirectAction,
      };
    }

    // Not an admin tool - try executing as an MCP tool via workspace router
    logger.info('Executing MCP tool in admin mode', { toolName, toolId });

    // Create a workspace context for MCP tool execution
    // Admin users get full access (empty roles means no role-based restrictions in this context)
    const toolContext: WorkspaceToolContext = {
      organizationId: context.organizationId,
      workspaceId: context.workspaceId ?? '',
      userId: context.userId,
      userEmail: '', // Admin MCP doesn't track email
      userRoles: [], // Admin has implicit full access
    };

    const result = await this.workspaceRouter.executeTool(toolName, input, toolContext);

    return mapWorkspaceResultToToolResult(result, toolId, toolName, input);
  }

  /**
   * Execute a workspace tool via WorkspaceToolRouter with policy evaluation
   */
  private async executeWorkspaceTool(
    toolName: string,
    input: unknown,
    context: WorkspaceAgentContext,
    toolId: string,
  ): Promise<ToolResultFull> {
    if (!isWorkspaceContext(context)) {
      throw invalidWorkspaceContextError();
    }

    logger.info('Executing workspace tool', {
      toolName,
      toolId,
      workspaceId: context.workspaceId,
    });

    const toolContext: WorkspaceToolContext = {
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      userEmail: context.userEmail,
      userRoles: context.userRoles,
    };

    const result = await this.workspaceRouter.executeTool(toolName, input, toolContext);

    return mapWorkspaceResultToToolResult(result, toolId, toolName, input);
  }

  /**
   * Extract description from tool result for confirmation UI
   */
  getToolResultDescription(result: ToolResultFull): string {
    return extractDescription(result.result, `Execute ${result.name}`);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a UnifiedToolRouter instance with default configuration
 */
export function createUnifiedToolRouter(config: UnifiedToolRouterConfig = {}): UnifiedToolRouter {
  return new UnifiedToolRouter(config);
}
