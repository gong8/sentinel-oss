/**
 * Workspace Tool Router
 * Routes tool calls to MCP servers with credential resolution and policy evaluation
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AuditDecision, McpAuthType, prisma } from '@sentinel/db';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { getServerKeyFromUrl } from '../lib/serverUtils.js';
import type { UserWithRoles } from '../types/role.js';
import { logToolInvocation } from './audit.js';
import {
  buildMcpRequestHeaders,
  classifyConnectionError,
  findMcpServerByToolName,
  getCredentialsForMcpServer,
} from './mcp.js';
import { evaluatePolicy, type PolicyContext, type PolicyEvaluationResult } from './policy.js';

// ============================================================================
// Types
// ============================================================================

export interface ToolContext {
  organizationId: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  userRoles: string[];
  sessionId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  decision?: 'ALLOWED' | 'DENIED';
  deniedReason?: string;
  serverDomain?: string;
  /** ID of the DENY policy that blocked this tool call (only set when explicitly blocked by a DENY policy) */
  blockingPolicyId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string | null;
  inputSchema: unknown;
  serverName: string;
  serverDomain: string;
  classification?: ToolClassification;
}

/**
 * Tool classification for policy and UI purposes
 * - READ: Tools that only retrieve data (get, list, fetch, read)
 * - WRITE: Tools that modify data (create, update, delete, send, execute)
 * - UNKNOWN: Cannot determine classification
 */
export type ToolClassification = 'READ' | 'WRITE' | 'UNKNOWN';

// Input validation schemas
const toolContextSchema = z.object({
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  userEmail: z.string().email(),
  userRoles: z.array(z.string()),
  sessionId: z.string().optional(),
});

// ============================================================================
// Constants
// ============================================================================

const MCP_CONNECTION_TIMEOUT_MS = 10000;
const MCP_TOOL_CALL_TIMEOUT_MS = 30000;
const MCP_STARTUP_DELAY_MS = 1000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parses a tool name into domain and tool components
 * Format: "domain::toolname" (e.g., "github.com::createPR")
 */
function parseToolName(toolName: string): { domain: string; tool: string } | null {
  const parts = toolName.split('::');
  if (parts.length !== 2) {
    return null;
  }
  const [domain, tool] = parts;
  if (!domain || !tool) {
    return null;
  }
  return { domain, tool };
}

/**
 * Creates an MCP client with standard configuration
 */
function createMcpClient(name: string): Client {
  return new Client({ name, version: '0.1.0' }, { capabilities: {} });
}

/**
 * Safely closes an MCP client
 */
async function safeCloseClient(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore close errors
  }
}

/**
 * Read operation prefixes for tool classification
 */
const READ_PREFIXES = ['get', 'list', 'fetch', 'read', 'search', 'find', 'query', 'show', 'view'];

/**
 * Write operation prefixes for tool classification
 */
const WRITE_PREFIXES = [
  'create',
  'update',
  'delete',
  'remove',
  'send',
  'execute',
  'run',
  'post',
  'put',
  'patch',
  'add',
  'set',
  'modify',
  'edit',
  'write',
  'submit',
  'publish',
  'deploy',
];

/**
 * Classifies a tool as READ, WRITE, or UNKNOWN based on its name
 */
function classifyTool(toolName: string): ToolClassification {
  const lowerName = toolName.toLowerCase();

  // Check for read operation prefixes
  for (const prefix of READ_PREFIXES) {
    if (lowerName.startsWith(prefix)) {
      return 'READ';
    }
  }

  // Check for write operation prefixes
  for (const prefix of WRITE_PREFIXES) {
    if (lowerName.startsWith(prefix)) {
      return 'WRITE';
    }
  }

  return 'UNKNOWN';
}

/**
 * Builds a UserWithRoles object from ToolContext for policy evaluation
 */
async function buildUserWithRoles(
  organizationId: string,
  userId: string,
  workspaceId: string,
): Promise<UserWithRoles | null> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
      deletedAt: null,
    },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  // Add workspace membership info for workspace-scoped policy matchers
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
  });

  // Extend user with workspace memberships for policy evaluation
  const userWithWorkspaces = user as UserWithRoles & {
    workspaceMemberships?: Array<{ workspaceId: string; role: string }>;
  };

  if (membership) {
    userWithWorkspaces.workspaceMemberships = [
      { workspaceId: membership.workspaceId, role: membership.role },
    ];
  }

  return userWithWorkspaces;
}

// ============================================================================
// WorkspaceToolRouter Class
// ============================================================================

export class WorkspaceToolRouter {
  /**
   * Get available tools from workspace + org MCP servers
   */
  async getAvailableTools(organizationId: string, workspaceId: string): Promise<ToolDefinition[]> {
    // Query MCP servers where:
    // - organizationId matches AND
    // - (workspaceId matches OR workspaceId is null for org-wide servers)
    const mcpServers = await prisma.mcpServer.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ workspaceId }, { workspaceId: null }],
      },
      include: {
        tools: true,
      },
    });

    const tools: ToolDefinition[] = [];

    for (const server of mcpServers) {
      const serverDomain = getServerKeyFromUrl(server.url);

      for (const tool of server.tools) {
        tools.push({
          name: `${serverDomain}::${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
          serverName: server.name,
          serverDomain,
          classification: classifyTool(tool.name),
        });
      }
    }

    return tools;
  }

  /**
   * Resolve credentials for an MCP server with priority: User > Workspace > Org
   *
   * @param organizationId - The organization ID
   * @param userId - The user ID for user-level credentials
   * @param mcpServerId - The MCP server ID
   * @param workspaceId - Optional workspace ID for workspace-level credentials
   * @returns Credentials object or null if none found
   */
  async resolveCredentials(
    organizationId: string,
    userId: string,
    mcpServerId: string,
    workspaceId?: string,
  ): Promise<Record<string, unknown> | null> {
    return getCredentialsForMcpServer(organizationId, userId, mcpServerId, workspaceId);
  }

  /**
   * Execute tool through MCP with policy check
   */
  async executeTool(
    toolName: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolExecutionResult> {
    // Validate context
    const contextValidation = toolContextSchema.safeParse(context);
    if (!contextValidation.success) {
      return {
        success: false,
        error: `Invalid context: ${contextValidation.error.message}`,
      };
    }

    // Parse tool name to extract domain and tool
    const parsed = parseToolName(toolName);
    if (!parsed) {
      logger.warn(`Invalid tool name format: ${toolName}`);
      return {
        success: false,
        error: `Invalid tool name format. Expected "domain::toolname", got "${toolName}"`,
      };
    }

    const { domain, tool } = parsed;
    logger.mcp(`Routing tool call: ${domain}::${tool}`);

    // Find MCP server by domain
    const server = await findMcpServerByToolName(context.organizationId, toolName);
    if (!server) {
      return {
        success: false,
        error: `No MCP server found for domain "${domain}"`,
        serverDomain: domain,
      };
    }

    // Verify server is accessible to this workspace
    const fullServer = await prisma.mcpServer.findFirst({
      where: {
        id: server.id,
        organizationId: context.organizationId,
        deletedAt: null,
        OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }],
      },
    });

    if (!fullServer) {
      return {
        success: false,
        error: `MCP server "${server.name}" is not available in this workspace`,
        serverDomain: domain,
      };
    }

    // Build user for policy evaluation
    const user = await buildUserWithRoles(
      context.organizationId,
      context.userId,
      context.workspaceId,
    );

    if (!user) {
      return {
        success: false,
        error: 'User not found or not authorized',
      };
    }

    // Get policies for evaluation (workspace + org-wide policies)
    const policies = await prisma.policy.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
        enabled: true,
        OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }],
      },
    });

    // Build policy context
    const policyContext: PolicyContext = {
      user,
      toolName,
      parameters: input as Record<string, unknown>,
    };

    // Evaluate policies
    const policyResult: PolicyEvaluationResult = await evaluatePolicy(policyContext, policies);

    // If denied, return with reason and server domain for permission request UI
    if (policyResult.decision === 'DENIED') {
      // Log the denied attempt
      await this.logToolCall({
        context,
        toolName,
        input,
        decision: 'DENIED',
        justification: policyResult.justification,
        policyIds: policyResult.policyIds,
        serverName: server.name,
      });

      // If policyIds has a value, it means a DENY policy explicitly blocked
      // If policyIds is empty, it means no matching ALLOW policy was found
      const blockingPolicyId =
        policyResult.policyIds.length > 0 ? policyResult.policyIds[0] : undefined;

      return {
        success: false,
        decision: 'DENIED',
        deniedReason: policyResult.justification ?? 'Access denied by policy',
        serverDomain: domain,
        blockingPolicyId,
      };
    }

    // Check server trust level - untrusted servers require explicit policy
    if (!fullServer.trusted && policyResult.policyIds.length === 0) {
      await this.logToolCall({
        context,
        toolName,
        input,
        decision: 'DENIED',
        justification: 'Untrusted server requires explicit ALLOW policy',
        policyIds: [],
        serverName: server.name,
      });

      return {
        success: false,
        decision: 'DENIED',
        deniedReason: `Server "${server.name}" is not trusted. An explicit ALLOW policy is required.`,
        serverDomain: domain,
      };
    }

    // Resolve credentials and execute via MCP
    logger.mcp(`Executing tool ${tool} on server ${server.name}`);
    try {
      const result = await this.executeViaMcp(
        fullServer,
        tool,
        input,
        context.userId,
        context.organizationId,
        context.workspaceId,
      );

      logger.mcp(`Tool ${tool} executed successfully`);

      // Log successful execution
      await this.logToolCall({
        context,
        toolName,
        input,
        decision: 'ALLOWED',
        justification: null,
        policyIds: policyResult.policyIds,
        serverName: server.name,
      });

      return {
        success: true,
        result,
        decision: 'ALLOWED',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during execution';
      logger.error(`Tool ${tool} execution failed: ${errorMessage}`);

      // Log failed execution
      await this.logToolCall({
        context,
        toolName,
        input,
        decision: 'ALLOWED',
        justification: `Execution failed: ${errorMessage}`,
        policyIds: policyResult.policyIds,
        serverName: server.name,
      });

      return {
        success: false,
        error: errorMessage,
        decision: 'ALLOWED',
        serverDomain: domain,
      };
    }
  }

  /**
   * Execute tool call via MCP protocol
   */
  private async executeViaMcp(
    server: {
      id: string;
      url: string;
      authType: McpAuthType;
    },
    toolName: string,
    input: unknown,
    userId: string,
    organizationId: string,
    workspaceId?: string,
  ): Promise<unknown> {
    // First check if we have credentials for servers that require authentication
    const credentials = await getCredentialsForMcpServer(
      organizationId,
      userId,
      server.id,
      workspaceId,
    );

    const hasCredentials = credentials !== null && Object.keys(credentials).length > 0;

    // Fail early with a clear message if OAuth is required but no token is available
    if (server.authType === McpAuthType.OAUTH && !hasCredentials) {
      throw new Error(
        'OAuth authentication required - please connect your account for this MCP server in the admin settings.',
      );
    }

    // Get headers for the MCP server using the shared infrastructure
    const headers = await buildMcpRequestHeaders(organizationId, userId, server, workspaceId);

    // Create MCP client
    const client = createMcpClient('sentinel-workspace-tool-router');
    let connected = false;

    try {
      // Create transport with timeout
      const transport = new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers },
      });

      // Connect with timeout
      const connectPromise = client.connect(transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), MCP_CONNECTION_TIMEOUT_MS);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      connected = true;

      // Wait for server initialization
      await new Promise((resolve) => setTimeout(resolve, MCP_STARTUP_DELAY_MS));

      // Call the tool with timeout
      const callPromise = client.callTool({
        name: toolName,
        arguments: input as Record<string, unknown>,
      });
      const callTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tool call timeout')), MCP_TOOL_CALL_TIMEOUT_MS);
      });

      const result = await Promise.race([callPromise, callTimeoutPromise]);

      await client.close();
      return result;
    } catch (error) {
      if (connected) {
        await safeCloseClient(client);
      }

      // Classify the error to provide a more helpful message
      if (error instanceof Error) {
        const classified = classifyConnectionError(error, server.authType, hasCredentials);
        throw new Error(classified.message);
      }

      throw error;
    }
  }

  /**
   * Log tool call to audit log
   */
  private async logToolCall(params: {
    context: ToolContext;
    toolName: string;
    input: unknown;
    decision: 'ALLOWED' | 'DENIED';
    justification: string | null;
    policyIds: string[];
    serverName: string;
  }): Promise<void> {
    const { context, toolName, input, decision, justification, policyIds, serverName } = params;

    await logToolInvocation({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      userEmail: context.userEmail,
      userRoles: context.userRoles,
      toolName,
      parameters: input,
      decision: decision === 'ALLOWED' ? AuditDecision.ALLOWED : AuditDecision.DENIED,
      justification,
      policyIds,
      mcpServerName: serverName,
      toolNameDisplay: toolName,
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const workspaceToolRouter = new WorkspaceToolRouter();

// ============================================================================
// Exported Utilities
// ============================================================================

/**
 * Classifies a tool name as READ, WRITE, or UNKNOWN
 * Useful for policy decisions and UI display
 */
export function classifyToolByName(toolName: string): ToolClassification {
  // Extract just the tool name if in domain::tool format
  const parsed = parseToolName(toolName);
  const nameToClassify = parsed ? parsed.tool : toolName;
  return classifyTool(nameToClassify);
}
