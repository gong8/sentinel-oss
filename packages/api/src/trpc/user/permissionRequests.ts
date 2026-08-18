/**
 * User Permission Requests Router
 * Handles user permission request operations
 */

import {
  McpAuthType,
  PermissionRequestStatus,
  PermissionRequestType,
  PolicyEffect,
  prisma,
} from '@sentinel/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { jsonValueNullableSchema } from '../../lib/jsonValue.js';
import {
  SENTINEL_SELF_MCP_SERVER_ERROR,
  isSentinelMcpServerUrl,
  probeAuthType,
  validateMcpServerUrl,
} from '../../services/mcp.js';
import { checkMatcher, checkToolPattern, evaluatePolicy } from '../../services/policy.js';
import {
  getToolValidationErrorMessage,
  validateToolNamesForOrganization,
} from '../../services/toolValidation.js';
import { protectedProcedure, router } from '../init.js';

// Schema for optional JSON data
const optionalJsonObjectSchema = z.record(z.string(), jsonValueNullableSchema).optional();

export const userPermissionRequestsRouter = router({
  /**
   * Analyze tool access for the current user
   * Returns detailed analysis for frontend decision-making about which request type to create.
   */
  analyzeToolAccess: protectedProcedure
    .input(z.object({ toolNames: z.array(z.string().min(1)).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const userWithRoles = await prisma.user.findUnique({
        where: { id: ctx.auth.user.id },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!userWithRoles) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const policies = await prisma.policy.findMany({
        where: {
          organizationId: ctx.auth.organizationId,
          enabled: true,
          deletedAt: null,
          // Users can only see org-wide policies or policies in their workspaces
          OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
        },
      });

      const toolAnalysis = [];
      for (const toolName of input.toolNames) {
        const result = await evaluatePolicy(
          { user: userWithRoles, agent: null, toolName },
          policies,
        );

        toolAnalysis.push({
          toolName,
          hasAccess: result.decision === 'ALLOWED',
          blockedByDeny: result.decision === 'DENIED' && result.policyIds.length > 0,
          blockingPolicyId: result.policyIds[0] ?? null,
          // Do NOT expose policy details to user - only policyId for request
        });
      }

      return { tools: toolAnalysis };
    }),

  /**
   * Create a new permission request
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z
          .nativeEnum(PermissionRequestType)
          .optional()
          .default(PermissionRequestType.TOOL_ACCESS),
        toolNames: z.array(z.string().min(1)).max(100).optional(),
        reason: z.string().min(1),
        data: optionalJsonObjectSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let toolNames: string[] = [];
      let requestData = input.data;

      if (input.type === PermissionRequestType.TOOL_ACCESS) {
        if (!input.toolNames || input.toolNames.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Tool names are required for tool access requests',
          });
        }

        const validation = await validateToolNamesForOrganization(
          ctx.auth.organizationId,
          input.toolNames,
        );
        const errorMessage = getToolValidationErrorMessage(validation);
        if (errorMessage) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: errorMessage,
          });
        }
        toolNames = validation.toolNames;

        // Check if user already has access to any of the requested tools
        const userWithRoles = await prisma.user.findUnique({
          where: { id: ctx.auth.user.id },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        });

        if (!userWithRoles) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Get all enabled policies for the organization that apply to this user
        const policies = await prisma.policy.findMany({
          where: {
            organizationId: ctx.auth.organizationId,
            enabled: true,
            deletedAt: null,
            // Users can only see org-wide policies or policies in their workspaces
            OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
          },
        });

        // Categorize tools by access state
        const toolsAlreadyAccessible: string[] = [];
        const toolsBlockedByDeny: { tool: string; policyId: string }[] = [];
        const toolsNeedingAllow: string[] = [];

        for (const toolName of toolNames) {
          const policyResult = await evaluatePolicy(
            { user: userWithRoles, agent: null, toolName },
            policies,
          );
          if (policyResult.decision === 'ALLOWED') {
            toolsAlreadyAccessible.push(toolName);
          } else if (policyResult.policyIds.length > 0) {
            // Blocked by explicit DENY policy
            toolsBlockedByDeny.push({
              tool: toolName,
              policyId: policyResult.policyIds[0],
            });
          } else {
            // No ALLOW policy
            toolsNeedingAllow.push(toolName);
          }
        }

        // Only reject if user already has access to ALL requested tools
        if (toolsAlreadyAccessible.length === toolNames.length) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You already have access to all requested tools',
          });
        }

        // Reject TOOL_ACCESS if any tools blocked by DENY - user must use DENY_REMOVAL
        if (toolsBlockedByDeny.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Some tools are blocked by admin policies. Use a restriction removal request instead.',
          });
        }

        // Filter to only tools needing ALLOW
        toolNames = toolsNeedingAllow;
      } else if (input.type === PermissionRequestType.DENY_REMOVAL) {
        // --- DENY REMOVAL REQUEST ---
        if (!input.data) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Policy information required for restriction removal request',
          });
        }

        const denyRemovalSchema = z.object({
          policyId: z.string().min(1),
        });

        const parseResult = denyRemovalSchema.safeParse(input.data);
        if (!parseResult.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid restriction removal request data',
          });
        }

        if (!input.toolNames || input.toolNames.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Tool names required for restriction removal request',
          });
        }

        const { policyId } = parseResult.data;

        // Verify policy exists, is DENY, belongs to org, not deleted, and user has access
        const policy = await prisma.policy.findFirst({
          where: {
            id: policyId,
            organizationId: ctx.auth.organizationId,
            effect: PolicyEffect.DENY,
            deletedAt: null,
            enabled: true,
            // Users can only request removal for org-wide policies or policies in their workspaces
            OR: [{ workspaceId: null }, { workspaceId: { in: ctx.auth.workspaceIds } }],
          },
        });

        if (!policy) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'The restriction policy no longer exists or was already removed',
          });
        }

        // Verify at least one tool is actually blocked by this policy
        const userWithRoles = await prisma.user.findUnique({
          where: { id: ctx.auth.user.id },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        });

        if (!userWithRoles) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        let hasValidTool = false;
        for (const toolName of input.toolNames) {
          const matchesMatcher = policy.matchers.some((m) => checkMatcher(m, userWithRoles, null));
          const matchesTool = policy.toolPatterns.some((tp) => checkToolPattern(tp, toolName));
          if (matchesMatcher && matchesTool) {
            hasValidTool = true;
            break;
          }
        }

        if (!hasValidTool) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'None of the specified tools are blocked by this policy',
          });
        }

        // Check for duplicate pending request for same policy
        const existingRequest = await prisma.permissionRequest.findFirst({
          where: {
            userId: ctx.auth.user.id,
            type: PermissionRequestType.DENY_REMOVAL,
            status: PermissionRequestStatus.PENDING,
          },
        });

        // Check if existing request targets same policy
        if (existingRequest?.data) {
          const existingData = existingRequest.data as { policyId?: string };
          if (existingData.policyId === policyId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'You already have a pending request to remove this restriction',
            });
          }
        }

        toolNames = input.toolNames;
        requestData = { policyId };
      } else if (input.type === PermissionRequestType.MCP_SERVER) {
        if (!input.data) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Configuration data is required for MCP server requests',
          });
        }
        // Basic validation of MCP server data structure
        const mcpConfigSchema = z.object({
          name: z.string().min(1),
          url: z.string().url(),
          authType: z.nativeEnum(McpAuthType),
          apiKey: z.string().optional(),
          alsoRequestTools: z.boolean().optional(),
          workspaceId: z.string().optional(), // Workspace to add the MCP server to
        });

        const parseResult = mcpConfigSchema.safeParse(input.data);
        if (!parseResult.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid MCP server configuration',
          });
        }

        // Validate workspaceId if provided - user must belong to the workspace
        if (parseResult.data.workspaceId) {
          if (!ctx.auth.workspaceIds.includes(parseResult.data.workspaceId)) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have access to the specified workspace',
            });
          }
        }

        // Normalize optional API key to avoid storing empty strings
        const trimmedApiKey = parseResult.data.apiKey?.trim();
        requestData = {
          ...parseResult.data,
          ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
          ...(parseResult.data.alsoRequestTools ? { alsoRequestTools: true } : {}),
          ...(parseResult.data.workspaceId ? { workspaceId: parseResult.data.workspaceId } : {}),
        };

        if (isSentinelMcpServerUrl(parseResult.data.url)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: SENTINEL_SELF_MCP_SERVER_ERROR,
          });
        }

        // Live connection validation:
        // - NONE: always validate (no auth needed)
        // - API_KEY: only validate if API key is provided
        // - OAUTH: never validate (requires OAuth token which isn't available at request time)
        const authType = parseResult.data.authType;
        const shouldValidate =
          authType === McpAuthType.NONE ||
          (authType === McpAuthType.API_KEY && Boolean(trimmedApiKey));

        if (shouldValidate) {
          const credentials = trimmedApiKey ? { apiKey: trimmedApiKey } : undefined;
          const validation = await validateMcpServerUrl(
            parseResult.data.url,
            authType,
            credentials,
          );

          if (!validation.success) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Could not connect to MCP server: ${validation.error || 'Unknown error'}`,
            });
          }
        }
      }

      const request = await prisma.permissionRequest.create({
        data: {
          userId: ctx.auth.user.id,
          type: input.type,
          toolNames: toolNames,
          reason: input.reason.trim(),
          // requestData is validated by Zod schemas to be JSON-compatible
          data: requestData,
        },
      });

      return request;
    }),

  /**
   * List user's own permission requests
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const requests = await prisma.permissionRequest.findMany({
      where: {
        userId: ctx.auth.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return requests;
  }),

  /**
   * Get a specific permission request
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const request = await prisma.permissionRequest.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });

      if (!request) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Permission request not found',
        });
      }

      return request;
    }),

  /**
   * Withdraw a pending permission request
   */
  withdraw: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const request = await prisma.permissionRequest.findFirst({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
          status: PermissionRequestStatus.PENDING,
        },
      });

      if (!request) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Request not found or cannot be withdrawn',
        });
      }

      return prisma.permissionRequest.update({
        where: { id: input.id },
        data: { status: PermissionRequestStatus.WITHDRAWN },
      });
    }),

  /**
   * Probe an MCP server URL to detect its authentication requirements
   * This helps users select the correct auth type when requesting a new server.
   */
  probeAuthType: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      if (isSentinelMcpServerUrl(input.url)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: SENTINEL_SELF_MCP_SERVER_ERROR,
        });
      }

      const result = await probeAuthType(input.url);

      // Check if detection failed (unknown = not a valid MCP server)
      if (result.detectedAuthType === 'unknown') {
        return {
          ...result,
          suggestedAuthType: null,
          detectionFailed: true,
        };
      }

      // Convert detected type to McpAuthType enum value
      let suggestedAuthType: McpAuthType;
      switch (result.detectedAuthType) {
        case 'oauth':
          suggestedAuthType = McpAuthType.OAUTH;
          break;
        case 'api_key':
          suggestedAuthType = McpAuthType.API_KEY;
          break;
        case 'none':
          suggestedAuthType = McpAuthType.NONE;
          break;
        default:
          suggestedAuthType = McpAuthType.NONE;
      }

      return {
        ...result,
        suggestedAuthType,
        detectionFailed: false,
      };
    }),
});
