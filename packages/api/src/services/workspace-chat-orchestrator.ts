/**
 * Workspace Chat Orchestrator Service
 * Orchestrates the chat loop with tool classification and execution
 */

import { ChatMessageRole, prisma } from '@sentinel/db';

import { LLMClient } from '../agent/llm/index.js';
import type {
  ContentBlock,
  LLMMessage,
  ToolDefinition as LLMToolDefinition,
  ToolResultContent,
  ToolUseContent,
} from '../agent/llm/types.js';
import { logger } from '../lib/logger.js';
import { searchSentinelDocs, searchSentinelDocsTool } from './docs-search-tool.js';
import { getMatchingFlags } from './sensitiveFlag.js';
import * as WorkspaceLLMClient from './workspace-llm-client.js';
import {
  WorkspaceToolRouter,
  type ToolDefinition as RouterToolDefinition,
  type ToolContext,
} from './workspace-tool-router.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolClassification {
  name: string;
  type: 'read' | 'write';
  isSensitive: boolean;
  requiresConfirmation: boolean;
}

export interface ChatContext {
  workspaceId: string;
  conversationId: string;
  userId: string;
  userEmail: string;
  userRoles: string[];
  organizationId: string;
  alwaysAllowTools?: string[];
  skipToolConfirmation?: boolean;
}

export interface PendingToolCall {
  toolUseId: string;
  toolName: string;
  parameters: unknown;
  classification: ToolClassification;
}

export interface ToolExecutionResult {
  toolUseId: string;
  result: string;
  success: boolean;
}

export interface ChatResponse {
  text: string;
  pendingToolCall?: PendingToolCall;
  toolResults?: ToolExecutionResult[];
  permissionDenied?: {
    toolName: string;
    reason: string;
    serverDomain?: string;
    /** ID of the DENY policy that blocked this tool call (only set when explicitly blocked by a DENY policy) */
    blockingPolicyId?: string;
  };
  messageId: string;
  model?: string;
}

// ============================================================================
// TOOL DEFINITION MAPPING
// ============================================================================

/**
 * Convert router tool definition to LLM tool definition format
 */
function mapRouterToolToLLMTool(tool: RouterToolDefinition): LLMToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? '',
    input_schema: (tool.inputSchema as LLMToolDefinition['input_schema']) ?? {
      type: 'object',
      properties: {},
    },
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const READ_TOOL_PREFIXES = ['get_', 'list_', 'search_', 'read_', 'fetch_', 'query_', 'find_'];

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to tools in this workspace.
When a user asks you to perform an action, use the available tools to help them.
If you need information about how to use Sentinel, use the search_sentinel_docs tool.
Always be clear about what actions you're taking and ask for confirmation when making changes.`;

// ============================================================================
// TOOL CLASSIFICATION
// ============================================================================

function isReadTool(toolName: string): boolean {
  // Extract the tool name after the domain prefix (e.g., "test.com::get_users" -> "get_users")
  const toolPart = toolName.includes('::') ? (toolName.split('::').pop() ?? toolName) : toolName;
  const lowerName = toolPart.toLowerCase();
  return READ_TOOL_PREFIXES.some((prefix) => lowerName.startsWith(prefix));
}

/**
 * Classify a tool to determine if it requires confirmation
 */
export async function classifyTool(
  organizationId: string,
  toolName: string,
  alwaysAllowTools: string[] = [],
  skipToolConfirmation: boolean = false,
  workspaceId?: string | null,
): Promise<ToolClassification> {
  const isRead = isReadTool(toolName);

  // Check if tool is marked as sensitive in the database
  // Filters by workspace: org-wide flags + workspace-specific flags
  const matchingFlags = await getMatchingFlags(organizationId, toolName, null, workspaceId);
  const isSensitive = matchingFlags.length > 0;

  // Skip confirmation if:
  // - It's a read tool, OR
  // - skipToolConfirmation is enabled (user wants to skip all confirmations), OR
  // - The tool is in the always-allow list
  const requiresConfirmation =
    !isRead && !skipToolConfirmation && !alwaysAllowTools.includes(toolName);

  return {
    name: toolName,
    type: isRead ? 'read' : 'write',
    isSensitive,
    requiresConfirmation,
  };
}

// ============================================================================
// MESSAGE PERSISTENCE
// ============================================================================

function mapRoleToLLM(role: ChatMessageRole): 'user' | 'assistant' {
  switch (role) {
    case ChatMessageRole.USER:
    case ChatMessageRole.TOOL_RESULT:
    case ChatMessageRole.PERMISSION_REQUEST:
      return 'user';
    case ChatMessageRole.ASSISTANT:
    case ChatMessageRole.TOOL_USE:
      return 'assistant';
  }
}

function mapRoleFromLLM(role: 'user' | 'assistant'): ChatMessageRole {
  return role === 'user' ? ChatMessageRole.USER : ChatMessageRole.ASSISTANT;
}

export async function loadConversationHistory(conversationId: string): Promise<LLMMessage[]> {
  const messages = await prisma.workspaceChatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });

  return messages.map((msg) => ({
    role: mapRoleToLLM(msg.role),
    content: msg.content,
  }));
}

export async function saveMessage(params: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
}): Promise<string> {
  const message = await prisma.workspaceChatMessage.create({
    data: {
      conversationId: params.conversationId,
      role: mapRoleFromLLM(params.role),
      content: params.content,
    },
  });

  return message.id;
}

// ============================================================================
// BUILT-IN TOOL EXECUTION
// ============================================================================

function executeBuiltInTool(toolName: string, input: unknown): string | null {
  if (toolName === 'search_sentinel_docs') {
    const params = input as { query?: string };
    if (!params.query) {
      return JSON.stringify({ error: 'Missing query parameter' });
    }

    const results = searchSentinelDocs(params.query);
    return JSON.stringify({ results });
  }

  return null;
}

// ============================================================================
// CHAT ORCHESTRATOR CLASS
// ============================================================================

export class WorkspaceChatOrchestrator {
  private toolRouter: WorkspaceToolRouter;

  constructor(toolRouter: WorkspaceToolRouter) {
    this.toolRouter = toolRouter;
  }

  /**
   * Build a ToolContext from ChatContext for the tool router
   */
  private buildToolContext(ctx: ChatContext): ToolContext {
    return {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      userRoles: ctx.userRoles,
    };
  }

  /**
   * Process a user message and return the assistant's response
   */
  async processMessage(ctx: ChatContext, userMessage: string): Promise<ChatResponse> {
    const {
      workspaceId,
      conversationId,
      userId,
      organizationId,
      alwaysAllowTools = [],
      skipToolConfirmation = false,
    } = ctx;

    // Save the user message
    await saveMessage({
      conversationId,
      role: 'user',
      content: userMessage,
    });

    // Load conversation history
    const history = await loadConversationHistory(conversationId);

    // Get available tools from the tool router
    const routerTools = await this.toolRouter.getAvailableTools(organizationId, workspaceId);

    // Convert router tools to LLM format and add built-in docs search tool
    const allTools: LLMToolDefinition[] = [
      ...routerTools.map(mapRouterToolToLLMTool),
      searchSentinelDocsTool,
    ];

    // Create LLM client with workspace configuration
    const llmClient = await WorkspaceLLMClient.createClient(workspaceId, userId);
    const model = llmClient.getModel();

    // Send to LLM
    const response = await llmClient.sendMessage({
      system: SYSTEM_PROMPT,
      messages: history,
      tools: allTools,
    });

    // Extract text and tool uses from response
    const textContent = LLMClient.extractText(response.content);
    const toolUses = LLMClient.extractToolUses(response.content);

    // If no tool use, just save and return the text response
    if (toolUses.length === 0) {
      const messageId = await saveMessage({
        conversationId,
        role: 'assistant',
        content: textContent,
      });

      return {
        text: textContent,
        messageId,
        model,
      };
    }

    // Build tool context for execution
    const toolContext = this.buildToolContext(ctx);

    // Process tool uses
    const toolResults: ToolExecutionResult[] = [];
    let pendingToolCall: PendingToolCall | undefined;
    let permissionDenied:
      | { toolName: string; reason: string; serverDomain?: string; blockingPolicyId?: string }
      | undefined;

    for (const toolUse of toolUses) {
      // Classify the tool
      const classification = await classifyTool(
        organizationId,
        toolUse.name,
        alwaysAllowTools,
        skipToolConfirmation,
        workspaceId,
      );

      // Check if it's a built-in tool first
      const builtInResult = executeBuiltInTool(toolUse.name, toolUse.input);
      if (builtInResult !== null) {
        toolResults.push({
          toolUseId: toolUse.id,
          result: builtInResult,
          success: true,
        });
        continue;
      }

      // For read tools or always-allowed tools, execute immediately
      if (!classification.requiresConfirmation) {
        const execResult = await this.toolRouter.executeTool(
          toolUse.name,
          toolUse.input,
          toolContext,
        );

        if (execResult.decision === 'DENIED') {
          permissionDenied = {
            toolName: toolUse.name,
            reason: execResult.deniedReason ?? 'Access denied by policy',
            serverDomain: execResult.serverDomain,
            blockingPolicyId: execResult.blockingPolicyId,
          };
          break;
        }

        toolResults.push({
          toolUseId: toolUse.id,
          // Ensure result is always a string - JSON.stringify(undefined) returns undefined
          result:
            typeof execResult.result === 'string'
              ? execResult.result
              : execResult.result !== undefined
                ? JSON.stringify(execResult.result)
                : JSON.stringify({ result: null }),
          success: execResult.success,
        });
      } else {
        // Write tools that need confirmation
        pendingToolCall = {
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          parameters: toolUse.input,
          classification,
        };
        break;
      }
    }

    // If we have permission denied, return that
    if (permissionDenied) {
      const messageId = await saveMessage({
        conversationId,
        role: 'assistant',
        content:
          textContent ||
          `Unable to execute ${permissionDenied.toolName}: ${permissionDenied.reason}`,
      });

      return {
        text:
          textContent ||
          `Unable to execute ${permissionDenied.toolName}: ${permissionDenied.reason}`,
        permissionDenied,
        messageId,
        model,
      };
    }

    // If we have a pending tool call, return it for confirmation
    if (pendingToolCall) {
      const confirmationMessage =
        textContent || `I need to execute ${pendingToolCall.toolName}. Please confirm to proceed.`;

      const messageId = await saveMessage({
        conversationId,
        role: 'assistant',
        content: confirmationMessage,
      });

      return {
        text: confirmationMessage,
        pendingToolCall,
        messageId,
        model,
      };
    }

    // If we executed tools, continue the conversation with results
    if (toolResults.length > 0) {
      return this.continueWithToolResults(ctx, response.content, toolResults, 0, model);
    }

    // Fallback: just return text
    const messageId = await saveMessage({
      conversationId,
      role: 'assistant',
      content: textContent,
    });

    return {
      text: textContent,
      messageId,
      model,
    };
  }

  /**
   * Continue the conversation after tool results are available
   */
  private async continueWithToolResults(
    ctx: ChatContext,
    assistantContent: ContentBlock[],
    toolResults: ToolExecutionResult[],
    depth: number = 0,
    model?: string,
  ): Promise<ChatResponse> {
    const MAX_CONTINUATION_DEPTH = 5;
    const {
      workspaceId,
      conversationId,
      userId,
      organizationId,
      alwaysAllowTools = [],
      skipToolConfirmation = false,
    } = ctx;

    // Load conversation history
    const history = await loadConversationHistory(conversationId);

    // Build the tool result message
    const toolResultContent: ToolResultContent[] = toolResults.map((result) => ({
      type: 'tool_result',
      tool_use_id: result.toolUseId,
      content: result.result,
    }));

    // Add assistant message with tool use and user message with tool results
    const continuationMessages: LLMMessage[] = [
      ...history,
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: toolResultContent },
    ];

    // Get tools again for the continuation
    const routerTools = await this.toolRouter.getAvailableTools(organizationId, workspaceId);
    const allTools: LLMToolDefinition[] = [
      ...routerTools.map(mapRouterToolToLLMTool),
      searchSentinelDocsTool,
    ];

    // Create LLM client
    const llmClient = await WorkspaceLLMClient.createClient(workspaceId, userId);

    // Send continuation to LLM
    const response = await llmClient.sendMessage({
      system: SYSTEM_PROMPT,
      messages: continuationMessages,
      tools: allTools,
    });

    // Extract text
    const textContent = LLMClient.extractText(response.content);
    const newToolUses = LLMClient.extractToolUses(response.content);

    // If more tool uses and we haven't hit depth limit, process them
    if (newToolUses.length > 0 && depth < MAX_CONTINUATION_DEPTH) {
      logger.info('LLM requested additional tool use in continuation', {
        toolCount: newToolUses.length,
        depth,
      });

      const toolContext = this.buildToolContext(ctx);
      const additionalResults: ToolExecutionResult[] = [];
      let pendingToolCall: PendingToolCall | undefined;
      let permissionDenied:
        | { toolName: string; reason: string; serverDomain?: string; blockingPolicyId?: string }
        | undefined;

      for (const toolUse of newToolUses) {
        const classification = await classifyTool(
          organizationId,
          toolUse.name,
          alwaysAllowTools,
          skipToolConfirmation,
          workspaceId,
        );

        // Check built-in tools first
        const builtInResult = executeBuiltInTool(toolUse.name, toolUse.input);
        if (builtInResult !== null) {
          additionalResults.push({
            toolUseId: toolUse.id,
            result: builtInResult,
            success: true,
          });
          continue;
        }

        // Auto-execute read tools
        if (!classification.requiresConfirmation) {
          const execResult = await this.toolRouter.executeTool(
            toolUse.name,
            toolUse.input,
            toolContext,
          );

          if (execResult.decision === 'DENIED') {
            permissionDenied = {
              toolName: toolUse.name,
              reason: execResult.deniedReason ?? 'Access denied by policy',
              serverDomain: execResult.serverDomain,
            };
            break;
          }

          additionalResults.push({
            toolUseId: toolUse.id,
            // Ensure result is always a string - JSON.stringify(undefined) returns undefined
            result:
              typeof execResult.result === 'string'
                ? execResult.result
                : execResult.result !== undefined
                  ? JSON.stringify(execResult.result)
                  : JSON.stringify({ result: null }),
            success: execResult.success,
          });
        } else {
          pendingToolCall = {
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            parameters: toolUse.input,
            classification,
          };
          break;
        }
      }

      // Handle permission denied
      if (permissionDenied) {
        const messageId = await saveMessage({
          conversationId,
          role: 'assistant',
          content:
            textContent ||
            `Unable to execute ${permissionDenied.toolName}: ${permissionDenied.reason}`,
        });

        return {
          text:
            textContent ||
            `Unable to execute ${permissionDenied.toolName}: ${permissionDenied.reason}`,
          permissionDenied,
          toolResults: [...toolResults, ...additionalResults],
          messageId,
          model,
        };
      }

      // Handle pending confirmation
      if (pendingToolCall) {
        const confirmationMessage =
          textContent ||
          `I need to execute ${pendingToolCall.toolName}. Please confirm to proceed.`;

        const messageId = await saveMessage({
          conversationId,
          role: 'assistant',
          content: confirmationMessage,
        });

        return {
          text: confirmationMessage,
          pendingToolCall,
          toolResults: [...toolResults, ...additionalResults],
          messageId,
          model,
        };
      }

      // Continue recursively with additional results
      if (additionalResults.length > 0) {
        return this.continueWithToolResults(
          ctx,
          response.content,
          [...toolResults, ...additionalResults],
          depth + 1,
          model,
        );
      }
    }

    // Save and return the final response
    const messageId = await saveMessage({
      conversationId,
      role: 'assistant',
      content: textContent,
    });

    return {
      text: textContent,
      toolResults,
      messageId,
      model,
    };
  }

  /**
   * Execute a confirmed tool call
   */
  async executeConfirmedTool(
    ctx: ChatContext,
    pendingToolCall: PendingToolCall,
  ): Promise<ChatResponse> {
    const { workspaceId, conversationId, userId } = ctx;
    const toolContext = this.buildToolContext(ctx);

    // Get the LLM client to retrieve the model
    const llmClient = await WorkspaceLLMClient.createClient(workspaceId, userId);
    const model = llmClient.getModel();

    // Execute the tool
    const execResult = await this.toolRouter.executeTool(
      pendingToolCall.toolName,
      pendingToolCall.parameters,
      toolContext,
    );

    if (execResult.decision === 'DENIED') {
      const deniedMessage = `Unable to execute ${pendingToolCall.toolName}: ${execResult.deniedReason ?? 'Access denied by policy.'}`;
      const messageId = await saveMessage({
        conversationId,
        role: 'assistant',
        content: deniedMessage,
      });

      return {
        text: deniedMessage,
        permissionDenied: {
          toolName: pendingToolCall.toolName,
          reason: execResult.deniedReason ?? 'Access denied by policy',
          serverDomain: execResult.serverDomain,
          blockingPolicyId: execResult.blockingPolicyId,
        },
        messageId,
        model,
      };
    }

    const toolResult: ToolExecutionResult = {
      toolUseId: pendingToolCall.toolUseId,
      // Ensure result is always a string - JSON.stringify(undefined) returns undefined
      result:
        typeof execResult.result === 'string'
          ? execResult.result
          : execResult.result !== undefined
            ? JSON.stringify(execResult.result)
            : JSON.stringify({ result: null }),
      success: execResult.success,
    };

    // Build the tool use content for the continuation
    const toolUseContent: ToolUseContent = {
      type: 'tool_use',
      id: pendingToolCall.toolUseId,
      name: pendingToolCall.toolName,
      input: pendingToolCall.parameters,
    };

    // Continue the conversation with the tool result
    return this.continueWithToolResults(ctx, [toolUseContent], [toolResult], 0, model);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a WorkspaceChatOrchestrator instance with the default tool router
 */
export function createOrchestrator(
  toolRouter: WorkspaceToolRouter = new WorkspaceToolRouter(),
): WorkspaceChatOrchestrator {
  return new WorkspaceChatOrchestrator(toolRouter);
}
