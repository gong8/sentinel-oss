/**
 * Action Description Registry
 * Extensible registry for generating human-readable descriptions of tool actions
 */

/**
 * Safely extract a string array from an unknown value
 */
function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.every((item): item is string => typeof item === 'string')) {
    return value;
  }
  return undefined;
}

/** Type for action description generator functions */
export type ActionDescriptionGenerator = (input: Record<string, unknown>) => string;

/** Registry of action description generators by tool name */
const actionDescriptionRegistry = new Map<string, ActionDescriptionGenerator>();

/**
 * Register a description generator for a tool
 */
export function registerActionDescription(
  toolName: string,
  generator: ActionDescriptionGenerator,
): void {
  actionDescriptionRegistry.set(toolName, generator);
}

/**
 * Get description generator for a tool
 */
export function getActionDescriptionGenerator(
  toolName: string,
): ActionDescriptionGenerator | undefined {
  return actionDescriptionRegistry.get(toolName);
}

/**
 * Generate a human-readable description for a tool action
 */
export function generateActionDescription(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const generator = actionDescriptionRegistry.get(toolName);
  return generator ? generator(input) : `Execute ${toolName}`;
}

// ============================================================================
// Default Action Descriptions
// ============================================================================

// Policy tools
registerActionDescription('create_policy', (input) => {
  const matchers = getStringArray(input.matchers)?.join(', ') ?? 'unknown';
  const toolPatterns = getStringArray(input.toolPatterns)?.join(', ') ?? 'unknown';
  return `Create ${input.effect} policy for ${matchers} on ${toolPatterns}`;
});

registerActionDescription(
  'update_policy',
  (input) => `Update policy ${input.policyId ?? input.slug}`,
);

registerActionDescription(
  'delete_policy',
  (input) => `Delete policy ${input.policyId ?? input.slug}`,
);

registerActionDescription(
  'enable_policy',
  (input) => `Enable policy ${input.policyId ?? input.slug}`,
);

registerActionDescription(
  'disable_policy',
  (input) => `Disable policy ${input.policyId ?? input.slug}`,
);

// MCP server tools
registerActionDescription(
  'create_mcp_server',
  (input) => `Create MCP server "${input.name}" (${input.url})`,
);

registerActionDescription(
  'update_mcp_server',
  (input) => `Update MCP server ${input.currentName ?? input.serverId ?? input.name}`,
);

// Webhook tools
registerActionDescription('create_webhook', (input) => {
  const events = getStringArray(input.events)?.join(', ') ?? 'unknown';
  return `Create ${input.type ?? 'CUSTOM'} webhook "${input.name}" for events: ${events}`;
});

// Role tools
registerActionDescription('create_role', (input) => `Create role "${input.name}"`);

registerActionDescription(
  'update_role',
  (input) => `Update role ${input.currentName ?? input.roleId ?? input.name}`,
);

registerActionDescription('delete_role', (input) => `Delete role "${input.name}"`);

registerActionDescription('assign_role', (input) => {
  const roles = getStringArray(input.roleNames)?.join(', ') ?? 'specified';
  return `Assign roles ${roles} to user ${input.email}`;
});

registerActionDescription(
  'revoke_role',
  (input) => `Revoke role "${input.roleName}" from user ${input.email}`,
);
