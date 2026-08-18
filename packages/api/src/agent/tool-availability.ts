/**
 * Tool Availability
 *
 * Provides functions for discovering available tools based on context mode.
 * Handles the differences between admin and workspace tool discovery.
 *
 * Responsibilities:
 * - Get admin tools (from registry + MCP servers)
 * - Get workspace tools (from MCP servers with policy filtering)
 * - Include built-in tools (docs search)
 *
 * @module tool-availability
 */

import { searchSentinelDocsTool } from '../services/docs-search-tool.js';
import { WorkspaceToolRouter } from '../services/workspace-tool-router.js';
import type { ToolDefinition as LLMToolDefinition } from './llm/index.js';
import { mapRouterToolToLLMTool } from './tool-schema-mapper.js';
import type { ToolRegistry } from './tools/index.js';

// ============================================================================
// TOOL AVAILABILITY FUNCTIONS
// ============================================================================

/**
 * Get admin tools, plus MCP tools if workspaceId is provided.
 *
 * Admin mode provides access to:
 * - All admin tools from the registry
 * - MCP tools from linked servers
 * - Built-in docs search tool
 */
export async function getAdminTools(
  adminRegistry: ToolRegistry,
  workspaceRouter: WorkspaceToolRouter,
  organizationId: string,
  workspaceId?: string,
): Promise<LLMToolDefinition[]> {
  const allTools = adminRegistry.getTools();

  // If workspaceId is provided, also include MCP tools from linked servers
  if (workspaceId) {
    const mcpTools = await workspaceRouter.getAvailableTools(organizationId, workspaceId);
    return [...allTools, ...mcpTools.map(mapRouterToolToLLMTool), searchSentinelDocsTool];
  }

  // No workspaceId - include org-wide MCP servers only
  const mcpTools = await workspaceRouter.getAvailableTools(organizationId, '');
  return [...allTools, ...mcpTools.map(mapRouterToolToLLMTool), searchSentinelDocsTool];
}

/**
 * Get workspace tools from MCP servers plus built-in docs search.
 *
 * Workspace mode provides access to:
 * - MCP tools from workspace and organization servers
 * - Built-in docs search tool
 */
export async function getWorkspaceTools(
  workspaceRouter: WorkspaceToolRouter,
  organizationId: string,
  workspaceId: string,
): Promise<LLMToolDefinition[]> {
  const routerTools = await workspaceRouter.getAvailableTools(organizationId, workspaceId);

  return [...routerTools.map(mapRouterToolToLLMTool), searchSentinelDocsTool];
}
