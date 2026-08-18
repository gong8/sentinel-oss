/**
 * Read Tool Executors
 *
 * Wrappers that execute read operations from mcp-admin tool definitions.
 * These call Prisma directly for efficient in-process execution.
 */

import { prisma } from '@sentinel/db';
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types.js';

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/** Schema for pagination inputs */
const PaginationInputSchema = z.object({
  limit: z.number().optional().default(50),
  offset: z.number().optional().default(0),
});

/** Schema for getting a single resource by ID */
const IdInputSchema = z.object({
  id: z.string(),
});

/** Schema for limit-only inputs */
const LimitInputSchema = z.object({
  limit: z.number().optional().default(50),
});

/** Schema for list_mcp_server_tools input */
const ListMcpServerToolsInputSchema = z.object({
  mcpServerId: z.string(),
});

/** Schema for list_permission_requests input */
const ListPermissionRequestsInputSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'DENIED']).optional(),
});

/** Schema for get_analytics_summary input */
const AnalyticsSummaryInputSchema = z.object({
  days: z.number().optional().default(7),
});

/** Schema for search_param_values_by_label input */
const SearchParamValuesInputSchema = z.object({
  labelQuery: z.string(),
  serverId: z.string().optional(),
  serverDomain: z.string().optional(),
  limit: z.number().optional().default(10),
});

/** Schema for get_param_suggestions input */
const ParamSuggestionsInputSchema = z.object({
  toolName: z.string(),
  parameterKey: z.string(),
  prefix: z.string().optional(),
  limit: z.number().optional().default(10),
});

/** Schema for get_tool_param_fields input */
const ToolParamFieldsInputSchema = z.object({
  toolName: z.string(),
});

/**
 * Type for read executor functions
 */
type ReadExecutor = (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;

/**
 * Registry of read tool executors
 * Maps base tool names (without admin_ prefix) to executor functions
 */
const READ_EXECUTORS: Record<string, ReadExecutor> = {
  // ============================================================================
  // POLICIES
  // ============================================================================

  list_policies: async (input, context) => {
    const { limit, offset } = PaginationInputSchema.parse(input);

    // Workspace mode: show workspace-specific + org-wide resources
    // Global mode: show ALL resources (no filter)
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const policies = await prisma.policy.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
        ...workspaceFilter,
      },
      select: {
        id: true,
        slug: true,
        effect: true,
        matchers: true,
        toolPatterns: true,
        description: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return {
      success: true,
      data: {
        count: policies.length,
        policies: policies.map((p) => ({
          id: p.id,
          slug: p.slug,
          effect: p.effect,
          matchers: p.matchers,
          toolPatterns: p.toolPatterns,
          description: p.description,
          enabled: p.enabled,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
      },
    };
  },

  get_policy: async (input, context) => {
    const { id } = IdInputSchema.parse(input);

    // Workspace mode: can only access workspace-specific + org-wide resources
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const policy = await prisma.policy.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        ...workspaceFilter,
      },
    });

    if (!policy) {
      return { success: false, error: 'Policy not found' };
    }

    return {
      success: true,
      data: {
        id: policy.id,
        slug: policy.slug,
        effect: policy.effect,
        matchers: policy.matchers,
        toolPatterns: policy.toolPatterns,
        description: policy.description,
        enabled: policy.enabled,
        conditions: policy.conditions,
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString(),
      },
    };
  },

  // ============================================================================
  // USERS
  // ============================================================================

  list_users: async (input, context) => {
    const { limit } = LimitInputSchema.parse(input);

    const users = await prisma.user.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        userRoles: {
          include: { role: true },
        },
        createdAt: true,
      },
      take: limit,
    });

    return {
      success: true,
      data: {
        count: users.length,
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          roles: u.userRoles.map((ur) => ({
            id: ur.role.id,
            name: ur.role.name,
            isAdmin: ur.role.isAdmin,
          })),
          createdAt: u.createdAt.toISOString(),
        })),
      },
    };
  },

  get_user: async (input, context) => {
    const { id } = IdInputSchema.parse(input);

    const user = await prisma.user.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          isAdmin: ur.role.isAdmin,
        })),
        createdAt: user.createdAt.toISOString(),
      },
    };
  },

  // ============================================================================
  // ROLES
  // ============================================================================

  list_roles: async (_input, context) => {
    const roles = await prisma.role.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isAdmin: true,
        _count: {
          select: { userRoles: true },
        },
      },
    });

    return {
      success: true,
      data: {
        count: roles.length,
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          isAdmin: r.isAdmin,
          userCount: r._count.userRoles,
        })),
      },
    };
  },

  get_role: async (input, context) => {
    const { id } = IdInputSchema.parse(input);

    const role = await prisma.role.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
      },
      include: {
        userRoles: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });

    if (!role) {
      return { success: false, error: 'Role not found' };
    }

    return {
      success: true,
      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        isAdmin: role.isAdmin,
        users: role.userRoles.map((ur) => ({
          id: ur.user.id,
          email: ur.user.email,
        })),
      },
    };
  },

  // ============================================================================
  // MCP SERVERS
  // ============================================================================

  list_mcp_servers: async (_input, context) => {
    // Workspace mode: show workspace-specific + org-wide resources
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const servers = await prisma.mcpServer.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
        ...workspaceFilter,
      },
      select: {
        id: true,
        name: true,
        url: true,
        authType: true,
        trusted: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: {
        count: servers.length,
        servers: servers.map((s) => ({
          id: s.id,
          name: s.name,
          url: s.url,
          authType: s.authType,
          trusted: s.trusted,
          createdAt: s.createdAt.toISOString(),
        })),
      },
    };
  },

  get_mcp_server: async (input, context) => {
    const { id } = IdInputSchema.parse(input);

    // Workspace mode: can only access workspace-specific + org-wide resources
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const server = await prisma.mcpServer.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        deletedAt: null,
        ...workspaceFilter,
      },
    });

    if (!server) {
      return { success: false, error: 'MCP server not found' };
    }

    return {
      success: true,
      data: {
        id: server.id,
        name: server.name,
        url: server.url,
        authType: server.authType,
        trusted: server.trusted,
        createdAt: server.createdAt.toISOString(),
      },
    };
  },

  list_mcp_server_tools: async (input, context) => {
    const { mcpServerId } = ListMcpServerToolsInputSchema.parse(input);

    // First verify the MCP server belongs to this organization
    const server = await prisma.mcpServer.findFirst({
      where: {
        id: mcpServerId,
        organizationId: context.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!server) {
      return { success: false, error: 'MCP server not found' };
    }

    const tools = await prisma.mcpTool.findMany({
      where: {
        mcpServerId: server.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        inputSchema: true,
        discoveredAt: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      success: true,
      data: {
        serverName: server.name,
        count: tools.length,
        tools: tools.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          discoveredAt: t.discoveredAt.toISOString(),
        })),
      },
    };
  },

  // ============================================================================
  // AGENTS
  // ============================================================================

  list_agents: async (_input, context) => {
    // Workspace mode: show workspace-specific + org-wide resources
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const agents = await prisma.agent.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
        ...workspaceFilter,
      },
      select: {
        id: true,
        name: true,
        protocolType: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: {
        count: agents.length,
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          protocolType: a.protocolType,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    };
  },

  get_agent: async (input, context) => {
    const { id } = IdInputSchema.parse(input);

    // Workspace mode: can only access workspace-specific + org-wide resources
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const agent = await prisma.agent.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        deletedAt: null,
        ...workspaceFilter,
      },
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    return {
      success: true,
      data: {
        id: agent.id,
        name: agent.name,
        protocolType: agent.protocolType,
        createdAt: agent.createdAt.toISOString(),
      },
    };
  },

  // ============================================================================
  // SENSITIVE FLAGS
  // ============================================================================

  list_sensitive_flags: async (_input, context) => {
    // Workspace mode: show workspace-specific + org-wide resources
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const flags = await prisma.sensitiveToolFlag.findMany({
      where: {
        organizationId: context.organizationId,
        ...workspaceFilter,
      },
      select: {
        id: true,
        toolPattern: true,
        behaviors: true,
        description: true,
        enabled: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: {
        count: flags.length,
        flags: flags.map((f) => ({
          id: f.id,
          toolPattern: f.toolPattern,
          behaviors: f.behaviors,
          description: f.description,
          enabled: f.enabled,
          createdAt: f.createdAt.toISOString(),
        })),
      },
    };
  },

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  list_webhooks: async (_input, context) => {
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: {
        organizationId: context.organizationId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        url: true,
        events: true,
        enabled: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: {
        count: webhooks.length,
        webhooks: webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          type: w.type,
          url: w.url,
          events: w.events,
          enabled: w.enabled,
          createdAt: w.createdAt.toISOString(),
        })),
      },
    };
  },

  get_webhook: async (input, context) => {
    const { id } = IdInputSchema.parse(input);

    const webhook = await prisma.webhookEndpoint.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
      },
    });

    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    return {
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        type: webhook.type,
        url: webhook.url,
        events: webhook.events,
        enabled: webhook.enabled,
        verbose: webhook.verbose,
        maxRetries: webhook.maxRetries,
        retryDelayMs: webhook.retryDelayMs,
        createdAt: webhook.createdAt.toISOString(),
        updatedAt: webhook.updatedAt.toISOString(),
      },
    };
  },

  // ============================================================================
  // PERMISSION REQUESTS
  // ============================================================================

  list_permission_requests: async (input, context) => {
    const { status } = ListPermissionRequestsInputSchema.parse(input);

    // PermissionRequest is scoped through User, so we need to filter by user's org
    const requests = await prisma.permissionRequest.findMany({
      where: {
        user: { organizationId: context.organizationId },
        ...(status && { status }),
      },
      include: {
        user: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      success: true,
      data: {
        count: requests.length,
        requests: requests.map((r) => ({
          id: r.id,
          status: r.status,
          type: r.type,
          toolNames: r.toolNames,
          reason: r.reason,
          user: r.user ? { id: r.user.id, email: r.user.email } : null,
          createdAt: r.createdAt.toISOString(),
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
        })),
      },
    };
  },

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  get_analytics_summary: async (input, context) => {
    const { days } = AnalyticsSummaryInputSchema.parse(input);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get audit log stats
    const auditStats = await prisma.auditLogEntry.groupBy({
      by: ['decision'],
      where: {
        organizationId: context.organizationId,
        timestamp: { gte: startDate },
      },
      _count: { id: true },
    });

    const totalCalls = auditStats.reduce((sum, s) => sum + s._count.id, 0);
    const deniedCalls = auditStats.find((s) => s.decision === 'DENIED')?._count.id ?? 0;

    // Get user count
    const userCount = await prisma.user.count({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
      },
    });

    // Get policy count
    const policyCount = await prisma.policy.count({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
      },
    });

    return {
      success: true,
      data: {
        period: { days, startDate: startDate.toISOString() },
        toolCalls: {
          total: totalCalls,
          allowed: totalCalls - deniedCalls,
          denied: deniedCalls,
          denialRate: totalCalls > 0 ? ((deniedCalls / totalCalls) * 100).toFixed(1) + '%' : '0%',
        },
        users: userCount,
        policies: policyCount,
      },
    };
  },

  // ============================================================================
  // AUDIT
  // ============================================================================

  query_audit_log: async (input, context) => {
    const { limit } = LimitInputSchema.parse(input);

    // Workspace mode: show only audit logs for this workspace
    const workspaceFilter = context.workspaceId
      ? { OR: [{ workspaceId: context.workspaceId }, { workspaceId: null }] }
      : {};

    const entries = await prisma.auditLogEntry.findMany({
      where: {
        organizationId: context.organizationId,
        ...workspaceFilter,
      },
      include: {
        user: { select: { id: true, email: true } },
        agent: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: {
        count: entries.length,
        entries: entries.map((e) => ({
          id: e.id,
          toolName: e.toolName,
          decision: e.decision,
          matchedPolicyIds: e.matchedPolicyIds,
          user: e.user ? { id: e.user.id, email: e.user.email } : null,
          agent: e.agent ? { id: e.agent.id, name: e.agent.name } : null,
          timestamp: e.timestamp.toISOString(),
        })),
      },
    };
  },

  query_admin_actions: async (input, context) => {
    const { limit } = LimitInputSchema.parse(input);

    const logs = await prisma.adminActionLog.findMany({
      where: {
        organizationId: context.organizationId,
      },
      include: {
        adminUser: { select: { id: true, email: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: {
        count: logs.length,
        entries: logs.map((l) => ({
          id: l.id,
          actionType: l.actionType,
          resourceType: l.resourceType,
          resourceId: l.resourceId,
          resourceName: l.resourceName,
          admin: l.adminUser ? { id: l.adminUser.id, email: l.adminUser.email } : null,
          timestamp: l.timestamp.toISOString(),
        })),
      },
    };
  },

  // ============================================================================
  // PARAMETER LOOKUP
  // ============================================================================

  search_param_values_by_label: async (input, context) => {
    const { labelQuery, serverId, serverDomain, limit } = SearchParamValuesInputSchema.parse(input);

    // Look up server by URL if serverDomain is provided (not by name!)
    let resolvedServerId = serverId;
    if (!resolvedServerId && serverDomain) {
      const server = await prisma.mcpServer.findFirst({
        where: {
          organizationId: context.organizationId,
          deletedAt: null,
          url: { contains: serverDomain, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (server) {
        resolvedServerId = server.id;
      }
    }

    // Search for parameter values with matching labels
    const paramValues = await prisma.toolParamValue.findMany({
      where: {
        organizationId: context.organizationId,
        displayLabel: { contains: labelQuery, mode: 'insensitive' },
        ...(resolvedServerId && { serverId: resolvedServerId }),
      },
      include: {
        mcpServer: { select: { id: true, name: true } },
      },
      take: limit,
      orderBy: { occurrenceCount: 'desc' },
    });

    return {
      success: true,
      data: {
        results: paramValues.map((pv) => ({
          value: pv.parameterValue,
          displayLabel: pv.displayLabel,
          parameterKey: pv.parameterKey,
          server: { id: pv.mcpServer.id, name: pv.mcpServer.name },
          useCount: pv.occurrenceCount,
        })),
      },
    };
  },

  get_param_suggestions: async (input, context) => {
    const { toolName, parameterKey, prefix, limit } = ParamSuggestionsInputSchema.parse(input);

    // Parse tool name to get server domain
    const [serverDomain] = toolName.split('::');

    // Look up server by URL (not by name!)
    let serverId: string | undefined;
    if (serverDomain) {
      const server = await prisma.mcpServer.findFirst({
        where: {
          organizationId: context.organizationId,
          deletedAt: null,
          url: { contains: serverDomain, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (server) {
        serverId = server.id;
      }
    }

    const paramValues = await prisma.toolParamValue.findMany({
      where: {
        organizationId: context.organizationId,
        parameterKey,
        ...(prefix && { parameterValue: { startsWith: prefix } }),
        ...(serverId && { serverId }),
      },
      take: limit,
      orderBy: { occurrenceCount: 'desc' },
    });

    return {
      success: true,
      data: {
        suggestions: paramValues.map((pv) => ({
          value: pv.parameterValue,
          displayLabel: pv.displayLabel,
          useCount: pv.occurrenceCount,
        })),
      },
    };
  },

  get_tool_param_fields: async (input, context) => {
    const { toolName } = ToolParamFieldsInputSchema.parse(input);

    // Parse tool name: "server::toolName"
    const parts = toolName.split('::');
    if (parts.length !== 2) {
      return {
        success: false,
        error:
          'Invalid tool name format. Use "serverKey::toolName" (e.g., "api.notion.so::createPage")',
      };
    }

    const [serverKey, tool] = parts;
    if (!serverKey || !tool) {
      return { success: false, error: 'Both server key and tool name are required' };
    }

    // Find the MCP server by URL containing the server key
    const mcpServer = await prisma.mcpServer.findFirst({
      where: {
        organizationId: context.organizationId,
        url: { contains: serverKey },
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    if (!mcpServer) {
      return { success: false, error: `MCP server with key "${serverKey}" not found` };
    }

    // Find the tool and get its input schema
    const mcpTool = await prisma.mcpTool.findFirst({
      where: {
        mcpServerId: mcpServer.id,
        name: tool,
      },
      select: { inputSchema: true, name: true, description: true },
    });

    if (!mcpTool) {
      return { success: false, error: `Tool "${tool}" not found on server "${mcpServer.name}"` };
    }

    if (!mcpTool.inputSchema) {
      return {
        success: true,
        data: {
          tool: mcpTool.name,
          description: mcpTool.description,
          fields: [],
          note: 'No input schema available for this tool',
        },
      };
    }

    // Validate and extract fields from the JSON Schema
    const schemaResult = JsonSchemaSchema.safeParse(mcpTool.inputSchema);
    if (!schemaResult.success) {
      return {
        success: true,
        data: {
          tool: mcpTool.name,
          description: mcpTool.description,
          fields: [],
          note: 'Invalid input schema format',
        },
      };
    }

    // Convert the raw properties to typed properties
    const rawProperties = schemaResult.data.properties;
    const typedProperties: Record<string, JsonSchemaProperty> = {};
    if (rawProperties) {
      for (const [key, value] of Object.entries(rawProperties)) {
        const prop = toJsonSchemaProperty(value);
        if (prop) {
          typedProperties[key] = prop;
        }
      }
    }

    const fields = extractFieldsFromSchema({ properties: typedProperties }, 'params');

    return {
      success: true,
      data: {
        tool: mcpTool.name,
        description: mcpTool.description,
        fields,
        usage: `Use these field paths in policy conditions. For example: { "field": "${fields[0]?.path ?? 'params.fieldName'}", "operator": "equals", "value": "..." }`,
        conditionsReference: {
          availableFields: {
            time: ['context.hourOfDay (0-23)', 'context.dayOfWeek (0-6, Sunday=0)'],
            network: ['context.sourceIp'],
            parameters: ['params.<name> (any tool parameter from fields above)'],
            sql: [
              'extracted.sql.sqlOperation (SELECT, INSERT, UPDATE, DELETE)',
              'extracted.sql.sqlTables',
            ],
            github: [
              'extracted.github.gitRepository',
              'extracted.github.gitBranch',
              'extracted.github.isProtectedBranch',
            ],
            file: [
              'extracted.file.filePath',
              'extracted.file.fileExtension',
              'extracted.file.isSensitivePath',
            ],
          },
          operatorsByType: {
            string: [
              'equals',
              'notEquals',
              'contains',
              'startsWith',
              'endsWith',
              'matches',
              'in',
              'notIn',
            ],
            number: ['equals', 'notEquals', 'lessThan', 'greaterThan', 'between', 'in', 'notIn'],
            boolean: ['equals'],
            array: ['containsAny', 'containsNone'],
            any: ['exists', 'notExists'],
            network: ['inCidr', 'notInCidr'],
          },
          typeValidation:
            'CRITICAL: Operators MUST match field types. Using greaterThan on a string field will fail. Check the type in the fields list above.',
          examples: [
            '{ field: "context.hourOfDay", operator: "between", value: [9, 17] }',
            '{ field: "params.page_id", operator: "equals", value: "page_abc123" }',
            '{ field: "extracted.sql.sqlOperation", operator: "in", value: ["SELECT"] }',
          ],
        },
      },
    };
  },
};

// ============================================================================
// JSON SCHEMA PARSING
// ============================================================================

/** Type for JSON Schema property definitions */
interface JsonSchemaProperty {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  anyOf?: Array<{ type?: string }>;
}

/** Type for JSON Schema objects */
interface JsonSchema {
  properties?: Record<string, JsonSchemaProperty>;
}

/** Schema for validating the top-level JSON Schema structure */
const JsonSchemaSchema = z.object({
  properties: z.record(z.string(), z.unknown()).optional(),
});

/** Schema for validating JSON Schema property definitions */
const JsonSchemaPropertySchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  items: z.unknown().optional(),
  anyOf: z.array(z.object({ type: z.string().optional() })).optional(),
});

/**
 * Type guard to check if a value is a valid JsonSchemaProperty
 */
function isJsonSchemaProperty(value: unknown): value is JsonSchemaProperty {
  return JsonSchemaPropertySchema.safeParse(value).success;
}

/**
 * Safely convert unknown properties to JsonSchemaProperty
 */
function toJsonSchemaProperty(value: unknown): JsonSchemaProperty | null {
  if (!isJsonSchemaProperty(value)) return null;
  return value;
}

/**
 * Recursively extract fields from a validated JSON Schema with their types
 */
function extractFieldsFromSchema(
  schema: JsonSchema,
  prefix: string,
  maxDepth = 5,
  currentDepth = 0,
): Array<{ path: string; type: string; description?: string }> {
  const fields: Array<{ path: string; type: string; description?: string }> = [];

  if (currentDepth > maxDepth) return fields;

  const properties = schema.properties;
  if (!properties) return fields;

  for (const [propName, rawPropDef] of Object.entries(properties)) {
    const propDef = toJsonSchemaProperty(rawPropDef);
    if (!propDef) continue;

    const fieldPath = `${prefix}.${propName}`;
    const fieldType = inferFieldType(propDef);
    const description = propDef.description;

    fields.push({
      path: fieldPath,
      type: fieldType,
      ...(description && { description }),
    });

    // Recurse into nested objects
    if (fieldType === 'object' && propDef.properties) {
      const nestedFields = extractFieldsFromSchema(
        { properties: propDef.properties },
        fieldPath,
        maxDepth,
        currentDepth + 1,
      );
      fields.push(...nestedFields);
    }

    // Handle array items
    if (fieldType === 'array' && propDef.items) {
      const items = propDef.items;
      if (items.properties) {
        const arrayFields = extractFieldsFromSchema(
          { properties: items.properties },
          `${fieldPath}[*]`,
          maxDepth,
          currentDepth + 1,
        );
        fields.push(...arrayFields);
      }
    }
  }

  return fields;
}

/**
 * Infer field type from JSON Schema property definition
 */
function inferFieldType(propDef: JsonSchemaProperty): string {
  const type = propDef.type;

  if (type === 'string') return 'string';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'array') return 'array';
  if (type === 'object') return 'object';

  // Check for anyOf/oneOf with type inference
  const anyOf = propDef.anyOf;
  if (anyOf) {
    const types = anyOf.map((s) => s.type).filter((t): t is string => typeof t === 'string');
    if (types.includes('string')) return 'string';
    if (types.includes('number') || types.includes('integer')) return 'number';
  }

  return 'unknown';
}

/**
 * Execute a read tool by its base name (without 'admin_' prefix)
 */
export async function executeReadTool(
  baseName: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const executor = READ_EXECUTORS[baseName];

  if (!executor) {
    return { success: false, error: `Unknown read tool: ${baseName}` };
  }

  try {
    return await executor(input, context);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error executing read tool',
    };
  }
}

/**
 * Check if a read executor exists for the given base name
 */
export function hasReadExecutor(baseName: string): boolean {
  return baseName in READ_EXECUTORS;
}
