/**
 * Policy Validation
 *
 * Strong validation for policy inputs BEFORE they are stored.
 * Validates BOTH serverKey AND toolName against actual registered data.
 * Also validates condition field paths against tool inputSchemas.
 *
 * This catches LLM mistakes like:
 * - Using friendly names instead of serverKeys (e.g., "Notion" vs "api.notion.so")
 * - Using hallucinated tool names (e.g., "updatePage" vs "notion_update_page")
 * - Using wrong condition field paths (e.g., "params.page_id" instead of "params.data.page_id")
 */

import { prisma } from '@sentinel/db';
import { getServerKeyFromUrl, parseQualifiedToolName } from '../lib/serverUtils.js';
import { validateMatcher } from './policy.js';
import type { PolicyCondition } from './policyCondition.js';

/**
 * Server info with its tools for validation
 */
interface ServerWithTools {
  id: string;
  name: string;
  url: string;
  serverKey: string;
  tools: Set<string>; // tool names
}

/**
 * Load all servers with their tools for an organization
 */
async function loadServersWithTools(organizationId: string): Promise<{
  serversByKey: Map<string, ServerWithTools>;
  serversByName: Map<string, ServerWithTools>;
}> {
  // Get all servers with their tools
  const servers = await prisma.mcpServer.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      url: true,
      tools: {
        select: { name: true },
      },
    },
  });

  const serversByKey = new Map<string, ServerWithTools>();
  const serversByName = new Map<string, ServerWithTools>();

  for (const server of servers) {
    const serverKey = getServerKeyFromUrl(server.url);
    const tools = new Set(server.tools.map((t) => t.name));

    const serverInfo: ServerWithTools = {
      id: server.id,
      name: server.name,
      url: server.url,
      serverKey,
      tools,
    };

    serversByKey.set(serverKey.toLowerCase(), serverInfo);
    serversByName.set(server.name.toLowerCase(), serverInfo);
  }

  return { serversByKey, serversByName };
}

/**
 * Find similar tool names using simple string similarity
 */
function findSimilarTools(toolName: string, availableTools: Set<string>, maxResults = 5): string[] {
  const toolNameLower = toolName.toLowerCase();
  const results: Array<{ name: string; score: number }> = [];

  for (const available of availableTools) {
    const availableLower = available.toLowerCase();

    // Calculate simple similarity score
    let score = 0;

    // Exact match (case-insensitive)
    if (availableLower === toolNameLower) {
      score = 100;
    }
    // Contains the search term
    else if (availableLower.includes(toolNameLower)) {
      score = 80;
    }
    // Search term contains the available tool
    else if (toolNameLower.includes(availableLower)) {
      score = 70;
    }
    // Check for common words (split by underscore, camelCase, etc.)
    else {
      const searchWords = toolNameLower.split(/[_\s]+|(?=[A-Z])/);
      const availableWords = availableLower.split(/[_\s]+|(?=[A-Z])/);

      const matchingWords = searchWords.filter((w) =>
        availableWords.some((aw) => aw.includes(w) || w.includes(aw)),
      );

      if (matchingWords.length > 0) {
        score = (matchingWords.length / Math.max(searchWords.length, availableWords.length)) * 60;
      }
    }

    if (score > 0) {
      results.push({ name: available, score });
    }
  }

  // Sort by score descending and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((r) => r.name);
}

/**
 * Represents a JSON Schema (simplified for our needs)
 */
interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  required?: string[];
  $ref?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
}

/**
 * Extract all valid field paths from a JSON Schema
 * Returns paths like ["data", "data.page_id", "data.properties", etc.]
 */
function extractSchemaPathsRecursive(
  schema: JsonSchema,
  currentPath: string,
  paths: Set<string>,
  maxDepth: number,
  currentDepth: number,
): void {
  if (currentDepth > maxDepth) return;

  // Handle object type with properties
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const newPath = currentPath ? `${currentPath}.${propName}` : propName;
      paths.add(newPath);
      extractSchemaPathsRecursive(propSchema, newPath, paths, maxDepth, currentDepth + 1);
    }
  }

  // Handle array items
  if (schema.items && typeof schema.items === 'object') {
    // For arrays, we allow indexing into items with [*]
    const arrayPath = currentPath ? `${currentPath}[*]` : '[*]';
    paths.add(arrayPath);
    extractSchemaPathsRecursive(schema.items, arrayPath, paths, maxDepth, currentDepth + 1);
  }

  // Handle anyOf/oneOf/allOf (merge all possible paths)
  const combinedSchemas = [
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
    ...(schema.allOf ?? []),
  ];
  for (const subSchema of combinedSchemas) {
    extractSchemaPathsRecursive(subSchema, currentPath, paths, maxDepth, currentDepth);
  }
}

/**
 * Extract all valid field paths from a tool's inputSchema
 * Returns a Set of valid paths like {"data", "data.page_id", "data.properties.title"}
 */
function extractSchemaPaths(schema: unknown, maxDepth = 10): Set<string> {
  const paths = new Set<string>();
  if (!schema || typeof schema !== 'object') return paths;

  extractSchemaPathsRecursive(schema as JsonSchema, '', paths, maxDepth, 0);
  return paths;
}

/**
 * Check if a field path could match the schema paths
 * Handles wildcards and array notation
 */
function isPathValidInSchema(fieldPath: string, schemaPaths: Set<string>): boolean {
  // Direct match
  if (schemaPaths.has(fieldPath)) return true;

  // Check for prefix match (field could be a nested property we haven't enumerated)
  // e.g., "data.properties.title.content" might be valid even if we only have "data.properties"
  for (const schemaPath of schemaPaths) {
    if (fieldPath.startsWith(schemaPath + '.')) {
      return true;
    }
  }

  // Handle array indexing: "items.0.value" should match "items[*].value"
  const normalizedFieldPath = fieldPath.replace(/\.\d+\./g, '[*].');
  if (schemaPaths.has(normalizedFieldPath)) return true;

  return false;
}

/**
 * Find similar paths to suggest when a path doesn't exist
 */
function findSimilarPaths(fieldPath: string, schemaPaths: Set<string>, maxResults = 5): string[] {
  const fieldParts = fieldPath.toLowerCase().split('.');
  const lastPart = fieldParts[fieldParts.length - 1];
  const results: Array<{ path: string; score: number }> = [];

  for (const schemaPath of schemaPaths) {
    const schemaParts = schemaPath.toLowerCase().split('.');
    let score = 0;

    // Check if final part matches
    const schemaLastPart = schemaParts[schemaParts.length - 1];
    if (schemaLastPart === lastPart) {
      score += 50;
    } else if (schemaLastPart.includes(lastPart) || lastPart.includes(schemaLastPart)) {
      score += 30;
    }

    // Check overlapping parts
    const overlapping = fieldParts.filter((p) =>
      schemaParts.some((sp) => sp === p || sp.includes(p) || p.includes(sp)),
    );
    score += overlapping.length * 10;

    if (score > 0) {
      results.push({ path: schemaPath, score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((r) => r.path);
}

/**
 * Load tool schemas for given tool patterns
 * Returns a map of toolName -> inputSchema
 */
async function loadToolSchemas(
  organizationId: string,
  toolPatterns: string[],
): Promise<Map<string, { name: string; inputSchema: unknown; serverName: string }>> {
  const toolSchemas = new Map<string, { name: string; inputSchema: unknown; serverName: string }>();

  // Parse patterns to get specific tools
  const toolsToLoad: Array<{ serverKey: string; toolName: string }> = [];
  for (const pattern of toolPatterns) {
    if (pattern === '*::*') continue; // Skip wildcard
    const parsed = parseQualifiedToolName(pattern);
    if (parsed && parsed.toolName !== '*') {
      toolsToLoad.push(parsed);
    }
  }

  if (toolsToLoad.length === 0) return toolSchemas;

  // Load tools with their schemas
  const servers = await prisma.mcpServer.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      name: true,
      url: true,
      tools: {
        select: {
          name: true,
          inputSchema: true,
        },
      },
    },
  });

  for (const server of servers) {
    const serverKey = getServerKeyFromUrl(server.url);
    for (const tool of server.tools) {
      const pattern = `${serverKey}::${tool.name}`;
      // Check if this tool was requested
      const isRequested = toolsToLoad.some(
        (t) => t.serverKey.toLowerCase() === serverKey.toLowerCase() && t.toolName === tool.name,
      );
      if (isRequested && tool.inputSchema) {
        toolSchemas.set(pattern.toLowerCase(), {
          name: tool.name,
          inputSchema: tool.inputSchema,
          serverName: server.name,
        });
      }
    }
  }

  return toolSchemas;
}

/**
 * Validate condition field paths against tool schemas.
 * Ensures that params.* fields actually exist in the tool's inputSchema.
 */
export async function validateConditionFields(
  organizationId: string,
  conditions: PolicyCondition[],
  toolPatterns: string[],
): Promise<{ valid: true } | { valid: false; error: string }> {
  const errors: string[] = [];

  // Get only params.* conditions
  const paramConditions = conditions.filter((c) => c.field.startsWith('params.'));
  if (paramConditions.length === 0) {
    return { valid: true }; // No params to validate
  }

  // Load tool schemas
  const toolSchemas = await loadToolSchemas(organizationId, toolPatterns);

  if (toolSchemas.size === 0) {
    // If we have wildcard patterns or no schemas, we can't validate params
    // This is OK - we just skip validation
    return { valid: true };
  }

  // For each param condition, validate against all relevant tool schemas
  for (const condition of paramConditions) {
    const fieldPath = condition.field.replace(/^params\./, ''); // Remove "params." prefix
    let foundInAnySchema = false;
    const allSuggestions: string[] = [];

    for (const [_pattern, toolInfo] of toolSchemas) {
      const schemaPaths = extractSchemaPaths(toolInfo.inputSchema);

      if (isPathValidInSchema(fieldPath, schemaPaths)) {
        foundInAnySchema = true;
        break;
      }

      // Collect suggestions from this schema
      const suggestions = findSimilarPaths(fieldPath, schemaPaths);
      for (const suggestion of suggestions) {
        if (!allSuggestions.includes(suggestion)) {
          allSuggestions.push(suggestion);
        }
      }
    }

    if (!foundInAnySchema) {
      const toolList = Array.from(toolSchemas.values())
        .map((t) => `"${t.name}"`)
        .join(', ');

      if (allSuggestions.length > 0) {
        const suggestionList = allSuggestions
          .slice(0, 5)
          .map((s) => `"params.${s}"`)
          .join(', ');
        errors.push(
          `Invalid condition field "params.${fieldPath}". ` +
            `This field does not exist in the inputSchema for tools: ${toolList}. ` +
            `Did you mean one of these? ${suggestionList}. ` +
            `Use list_server_tools to see the full schema for each tool.`,
        );
      } else {
        // Get all available paths for context
        const allPaths: string[] = [];
        for (const toolInfo of toolSchemas.values()) {
          const paths = extractSchemaPaths(toolInfo.inputSchema);
          for (const p of paths) {
            if (!allPaths.includes(p) && allPaths.length < 20) {
              allPaths.push(p);
            }
          }
        }

        if (allPaths.length > 0) {
          const pathList = allPaths
            .slice(0, 10)
            .map((p) => `"params.${p}"`)
            .join(', ');
          const moreText = allPaths.length > 10 ? ` (and ${allPaths.length - 10} more)` : '';
          errors.push(
            `Invalid condition field "params.${fieldPath}". ` +
              `This field does not exist in the inputSchema for tools: ${toolList}. ` +
              `Available fields: ${pathList}${moreText}. ` +
              `Use list_server_tools to see the full schema for each tool.`,
          );
        } else {
          errors.push(
            `Invalid condition field "params.${fieldPath}". ` +
              `Could not find any fields in the inputSchema for tools: ${toolList}. ` +
              `The tools may not have input schemas defined, or they may have empty schemas.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('\n\n') };
  }

  return { valid: true };
}

/**
 * Validates tool patterns against actual registered servers and tools.
 * This catches common LLM mistakes:
 * - Using friendly names instead of serverKeys
 * - Using hallucinated/incorrect tool names
 */
export async function validateToolPatterns(
  organizationId: string,
  toolPatterns: string[],
): Promise<{ valid: true; patterns: string[] } | { valid: false; error: string }> {
  // Load all servers with their tools
  const { serversByKey, serversByName } = await loadServersWithTools(organizationId);

  const validatedPatterns: string[] = [];
  const errors: string[] = [];

  for (const pattern of toolPatterns) {
    // Special case: "*::*" is always valid (all tools on all servers)
    if (pattern === '*::*') {
      validatedPatterns.push(pattern);
      continue;
    }

    // Parse the pattern
    const parsed = parseQualifiedToolName(pattern);
    if (!parsed) {
      errors.push(
        `Invalid tool pattern format: "${pattern}". ` +
          `Must be "serverKey::toolName" or "*::*". The "::" separator is required.`,
      );
      continue;
    }

    const { serverKey, toolName } = parsed;
    const serverKeyLower = serverKey.toLowerCase();

    // STEP 1: Validate the serverKey
    let matchedServer = serversByKey.get(serverKeyLower);

    if (!matchedServer) {
      // Check if LLM used friendly name instead of serverKey
      const serverByName = serversByName.get(serverKeyLower);
      if (serverByName) {
        errors.push(
          `Invalid serverKey "${serverKey}" in pattern "${pattern}". ` +
            `"${serverKey}" is the friendly display name, not the serverKey. ` +
            `The serverKey is derived from the server URL. ` +
            `Use the serverKey "${serverByName.serverKey}" instead. ` +
            `Correct pattern: "${serverByName.serverKey}::${toolName}"`,
        );
        continue;
      }

      // Unknown server entirely
      const availableServers = Array.from(serversByKey.values())
        .map((s) => `"${s.serverKey}" (${s.name})`)
        .join(', ');

      if (availableServers) {
        errors.push(
          `Unknown server "${serverKey}" in pattern "${pattern}". ` +
            `Available servers: ${availableServers}. ` +
            `Use list_mcp_servers tool to see all registered servers.`,
        );
      } else {
        errors.push(
          `Unknown server "${serverKey}" in pattern "${pattern}". ` +
            `No MCP servers are registered for this organization.`,
        );
      }
      continue;
    }

    // STEP 2: Validate the toolName
    // Wildcard tool is always valid
    if (toolName === '*') {
      validatedPatterns.push(`${matchedServer.serverKey}::*`);
      continue;
    }

    // Check if the exact tool exists (case-sensitive)
    if (matchedServer.tools.has(toolName)) {
      validatedPatterns.push(`${matchedServer.serverKey}::${toolName}`);
      continue;
    }

    // Check case-insensitive match
    const toolLower = toolName.toLowerCase();
    let foundExactCaseInsensitive: string | null = null;
    for (const actualTool of matchedServer.tools) {
      if (actualTool.toLowerCase() === toolLower) {
        foundExactCaseInsensitive = actualTool;
        break;
      }
    }

    if (foundExactCaseInsensitive) {
      // Found case-insensitive match - use the correct casing
      validatedPatterns.push(`${matchedServer.serverKey}::${foundExactCaseInsensitive}`);
      continue;
    }

    // Tool not found - find similar tools and provide helpful error
    const similarTools = findSimilarTools(toolName, matchedServer.tools);

    if (similarTools.length > 0) {
      const suggestions = similarTools.map((t) => `"${t}"`).join(', ');
      errors.push(
        `Unknown tool "${toolName}" on server "${matchedServer.name}" (${matchedServer.serverKey}). ` +
          `Did you mean one of these? ${suggestions}. ` +
          `Use list_server_tools tool with serverId="${matchedServer.id}" to see all available tools.`,
      );
    } else if (matchedServer.tools.size > 0) {
      // List some available tools
      const sampleTools = Array.from(matchedServer.tools).slice(0, 10);
      const toolList = sampleTools.map((t) => `"${t}"`).join(', ');
      const moreText =
        matchedServer.tools.size > 10 ? ` (and ${matchedServer.tools.size - 10} more)` : '';
      errors.push(
        `Unknown tool "${toolName}" on server "${matchedServer.name}" (${matchedServer.serverKey}). ` +
          `Available tools: ${toolList}${moreText}. ` +
          `Use list_server_tools tool with serverId="${matchedServer.id}" to see all available tools.`,
      );
    } else {
      errors.push(
        `Unknown tool "${toolName}" on server "${matchedServer.name}" (${matchedServer.serverKey}). ` +
          `No tools have been discovered for this server yet. ` +
          `The server may need to be connected first to discover its tools.`,
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('\n\n') };
  }

  return { valid: true, patterns: validatedPatterns };
}

/**
 * Validates matchers format.
 * Valid formats: "*", "user:email@example.com", "role:roleName", "agent:agentId",
 * "workspace:workspaceId", "workspace-admin:workspaceId"
 */
export function validateMatchersFormat(
  matchers: string[],
): { valid: true } | { valid: false; error: string } {
  const errors: string[] = [];

  for (const matcher of matchers) {
    // Use the comprehensive validateMatcher from policy.ts which validates:
    // - "*" (wildcard for everyone)
    // - "user:email@example.com" (requires non-empty email)
    // - "role:roleName" (requires non-empty role name)
    // - "agent:agentId" (requires non-empty agent ID)
    // - "workspace:workspaceId" (requires non-empty workspace ID)
    // - "workspace-admin:workspaceId" (requires non-empty workspace ID)
    if (!validateMatcher(matcher)) {
      errors.push(
        `Invalid matcher format: "${matcher}". ` +
          `Valid formats: "*" (everyone), "user:email@example.com", "role:roleName", ` +
          `"agent:agentId", "workspace:workspaceId", "workspace-admin:workspaceId". ` +
          `The value after the colon cannot be empty.`,
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('\n') };
  }

  return { valid: true };
}

/**
 * Extract role names from matchers.
 * Returns an array of role names referenced in role:* matchers.
 */
function extractRoleNamesFromMatchers(matchers: string[]): string[] {
  const roleNames: string[] = [];
  for (const matcher of matchers) {
    if (matcher.startsWith('role:')) {
      const roleName = matcher.slice(5); // Remove "role:" prefix
      if (roleName && roleName !== '*') {
        roleNames.push(roleName);
      }
    }
  }
  return roleNames;
}

/**
 * Extract user emails from matchers.
 * Returns an array of emails referenced in user:* matchers.
 */
function extractUserEmailsFromMatchers(matchers: string[]): string[] {
  const emails: string[] = [];
  for (const matcher of matchers) {
    if (matcher.startsWith('user:')) {
      const email = matcher.slice(5); // Remove "user:" prefix
      if (email && email !== '*') {
        emails.push(email);
      }
    }
  }
  return emails;
}

/**
 * Extract agent IDs from matchers.
 * Returns an array of agent IDs referenced in agent:* matchers.
 */
function extractAgentIdsFromMatchers(matchers: string[]): string[] {
  const agentIds: string[] = [];
  for (const matcher of matchers) {
    if (matcher.startsWith('agent:')) {
      const agentId = matcher.slice(6); // Remove "agent:" prefix
      if (agentId && agentId !== '*') {
        agentIds.push(agentId);
      }
    }
  }
  return agentIds;
}

/**
 * Validates that role names in matchers actually exist in the organization.
 * This prevents the agent from hallucinating role names.
 */
async function validateRoleExistence(
  organizationId: string,
  matchers: string[],
): Promise<{ valid: true } | { valid: false; error: string }> {
  const roleNames = extractRoleNamesFromMatchers(matchers);

  if (roleNames.length === 0) {
    return { valid: true }; // No roles to validate
  }

  // Get all existing roles for the organization
  const existingRoles = await prisma.role.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: { name: true },
  });

  const existingRoleNames = new Set(existingRoles.map((r) => r.name));
  const existingRoleNamesLower = new Map(existingRoles.map((r) => [r.name.toLowerCase(), r.name]));
  const errors: string[] = [];

  for (const roleName of roleNames) {
    // Check exact match first
    if (existingRoleNames.has(roleName)) {
      continue;
    }

    // Check case-insensitive match
    const correctCase = existingRoleNamesLower.get(roleName.toLowerCase());
    if (correctCase) {
      errors.push(
        `Role "${roleName}" not found (case mismatch). ` +
          `Did you mean "${correctCase}"? ` +
          `Use "role:${correctCase}" instead.`,
      );
      continue;
    }

    // Role doesn't exist - provide helpful suggestions
    const availableRoles = existingRoles.map((r) => `"${r.name}"`).join(', ');
    if (availableRoles) {
      errors.push(
        `Role "${roleName}" does not exist. ` +
          `Available roles: ${availableRoles}. ` +
          `Use list_roles to see all available roles before creating policies.`,
      );
    } else {
      errors.push(
        `Role "${roleName}" does not exist. ` +
          `No roles have been created in this organization yet. ` +
          `Create roles first before referencing them in policies.`,
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('\n\n') };
  }

  return { valid: true };
}

/**
 * Validates that user emails in matchers actually exist in the organization.
 * This prevents the agent from hallucinating user emails.
 */
async function validateUserExistence(
  organizationId: string,
  matchers: string[],
): Promise<{ valid: true } | { valid: false; error: string }> {
  const emails = extractUserEmailsFromMatchers(matchers);

  if (emails.length === 0) {
    return { valid: true }; // No users to validate
  }

  // Get all existing users for the organization
  const existingUsers = await prisma.user.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: { email: true },
  });

  const existingEmails = new Set(existingUsers.map((u) => u.email));
  const existingEmailsLower = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.email]));
  const errors: string[] = [];

  for (const email of emails) {
    // Check exact match first
    if (existingEmails.has(email)) {
      continue;
    }

    // Check case-insensitive match
    const correctCase = existingEmailsLower.get(email.toLowerCase());
    if (correctCase) {
      errors.push(
        `User "${email}" not found (case mismatch). ` +
          `Did you mean "${correctCase}"? ` +
          `Use "user:${correctCase}" instead.`,
      );
      continue;
    }

    // User doesn't exist - provide helpful suggestions
    const availableUsers = existingUsers.map((u) => `"${u.email}"`).join(', ');
    if (availableUsers) {
      errors.push(
        `User "${email}" does not exist. ` +
          `Available users: ${availableUsers}. ` +
          `Use list_users to see all available users before creating policies.`,
      );
    } else {
      errors.push(
        `User "${email}" does not exist. ` +
          `No users have been created in this organization yet. ` +
          `Create users first before referencing them in policies.`,
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('\n\n') };
  }

  return { valid: true };
}

/**
 * Validates that agent IDs in matchers actually exist in the organization.
 * This prevents the agent from hallucinating agent IDs.
 */
async function validateAgentExistence(
  organizationId: string,
  matchers: string[],
): Promise<{ valid: true } | { valid: false; error: string }> {
  const agentIds = extractAgentIdsFromMatchers(matchers);

  if (agentIds.length === 0) {
    return { valid: true }; // No agents to validate
  }

  // Get all existing agents for the organization
  const existingAgents = await prisma.agent.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

  const existingAgentIds = new Set(existingAgents.map((a) => a.id));
  const errors: string[] = [];

  for (const agentId of agentIds) {
    // Check if the agent ID exists
    if (existingAgentIds.has(agentId)) {
      continue;
    }

    // Agent doesn't exist - provide helpful suggestions
    const availableAgents = existingAgents.map((a) => `"${a.id}" (${a.name})`).join(', ');
    if (availableAgents) {
      errors.push(
        `Agent "${agentId}" does not exist. ` +
          `Available agents: ${availableAgents}. ` +
          `Use list_agents to see all available agents before creating policies.`,
      );
    } else {
      errors.push(
        `Agent "${agentId}" does not exist. ` +
          `No agents have been registered in this organization yet. ` +
          `Agents are automatically registered when they connect.`,
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('\n\n') };
  }

  return { valid: true };
}

/**
 * Extract workspace IDs from matchers.
 * Returns an array of workspace IDs referenced in workspace:* and workspace-admin:* matchers.
 */
function extractWorkspaceIdsFromMatchers(matchers: string[]): string[] {
  const workspaceIds: string[] = [];
  for (const matcher of matchers) {
    if (matcher.startsWith('workspace:') || matcher.startsWith('workspace-admin:')) {
      const parts = matcher.split(':');
      const workspaceId = parts[1];
      if (workspaceId && workspaceId !== '*') {
        workspaceIds.push(workspaceId);
      }
    }
  }
  return workspaceIds;
}

/**
 * Validates that workspace IDs in matchers actually exist in the organization.
 * This prevents the agent from hallucinating workspace IDs.
 */
async function validateWorkspaceExistence(
  organizationId: string,
  matchers: string[],
): Promise<{ valid: true } | { valid: false; error: string }> {
  const workspaceIds = extractWorkspaceIdsFromMatchers(matchers);

  if (workspaceIds.length === 0) {
    return { valid: true }; // No workspaces to validate
  }

  // Get all existing workspaces for the organization
  const existingWorkspaces = await prisma.workspace.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

  const existingWorkspaceIds = new Set(existingWorkspaces.map((w) => w.id));
  const errors: string[] = [];

  for (const workspaceId of workspaceIds) {
    // Check if the workspace ID exists
    if (!existingWorkspaceIds.has(workspaceId)) {
      // Workspace doesn't exist - provide helpful suggestions
      const availableWorkspaces = existingWorkspaces.map((w) => `"${w.id}" (${w.name})`).join(', ');
      if (availableWorkspaces) {
        errors.push(
          `Workspace "${workspaceId}" does not exist. ` +
            `Available workspaces: ${availableWorkspaces}. ` +
            `Use list_workspaces to see all available workspaces before creating policies.`,
        );
      } else {
        errors.push(
          `Workspace "${workspaceId}" does not exist. ` +
            `No workspaces have been created in this organization yet. ` +
            `Create workspaces first before referencing them in policies.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('\n\n') };
  }

  return { valid: true };
}

/**
 * Validates matchers format AND entity existence (roles, users, agents, workspaces).
 * Valid formats: "*", "user:email@example.com", "role:roleName", "agent:agentId",
 * "workspace:workspaceId", "workspace-admin:workspaceId"
 */
export async function validateMatchers(
  organizationId: string,
  matchers: string[],
): Promise<{ valid: true } | { valid: false; error: string }> {
  // First validate format
  const formatResult = validateMatchersFormat(matchers);
  if (!formatResult.valid) {
    return formatResult;
  }

  // Then validate role existence
  const roleResult = await validateRoleExistence(organizationId, matchers);
  if (!roleResult.valid) {
    return roleResult;
  }

  // Validate user existence
  const userResult = await validateUserExistence(organizationId, matchers);
  if (!userResult.valid) {
    return userResult;
  }

  // Validate agent existence
  const agentResult = await validateAgentExistence(organizationId, matchers);
  if (!agentResult.valid) {
    return agentResult;
  }

  // Validate workspace existence
  const workspaceResult = await validateWorkspaceExistence(organizationId, matchers);
  if (!workspaceResult.valid) {
    return workspaceResult;
  }

  return { valid: true };
}

/**
 * Validate policy input for create or update operations.
 * Returns validated input or throws an error with helpful message.
 */
export async function validatePolicyInput(
  organizationId: string,
  input: {
    matchers?: string[];
    toolPatterns?: string[];
    effect?: string;
    description?: string;
    conditions?: PolicyCondition[];
  },
  isCreate: boolean,
): Promise<{
  validatedMatchers?: string[];
  validatedToolPatterns?: string[];
}> {
  const result: {
    validatedMatchers?: string[];
    validatedToolPatterns?: string[];
  } = {};

  // For create, validate required fields
  if (isCreate) {
    if (!input.effect) {
      throw new Error('Policy effect is required (ALLOW or DENY)');
    }
    if (!Array.isArray(input.matchers) || input.matchers.length === 0) {
      throw new Error(
        'Policy matchers is required and must be a non-empty array (e.g., ["*"] for everyone, ["user:email@example.com"])',
      );
    }
    if (!Array.isArray(input.toolPatterns) || input.toolPatterns.length === 0) {
      throw new Error(
        'Policy toolPatterns is required and must be a non-empty array (e.g., ["*::*"] for all tools, ["serverKey::toolName"])',
      );
    }
    if (!input.description || input.description.trim().length === 0) {
      throw new Error('Policy description is required');
    }
  }

  // Validate matchers format AND role existence if provided
  if (input.matchers && input.matchers.length > 0) {
    const matchersResult = await validateMatchers(organizationId, input.matchers);
    if (!matchersResult.valid) {
      throw new Error(matchersResult.error);
    }
    result.validatedMatchers = input.matchers;
  }

  // Validate tool patterns against registered servers AND tools if provided
  if (input.toolPatterns && input.toolPatterns.length > 0) {
    const patternsResult = await validateToolPatterns(organizationId, input.toolPatterns);
    if (!patternsResult.valid) {
      throw new Error(patternsResult.error);
    }
    result.validatedToolPatterns = patternsResult.patterns;
  }

  // Validate condition field paths against tool schemas
  // Use validated patterns if available, otherwise use input patterns
  const patternsForConditionValidation = result.validatedToolPatterns ?? input.toolPatterns ?? [];
  if (
    input.conditions &&
    input.conditions.length > 0 &&
    patternsForConditionValidation.length > 0
  ) {
    const conditionsResult = await validateConditionFields(
      organizationId,
      input.conditions,
      patternsForConditionValidation,
    );
    if (!conditionsResult.valid) {
      throw new Error(conditionsResult.error);
    }
  }

  return result;
}
