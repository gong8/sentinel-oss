/**
 * @sentinel/a2a - A2A Protocol Support
 * Agent Card management, credential injection, and HTTP proxy for A2A requests
 */

// Types
export type {
  A2AProxyRequest,
  A2AProxyResponse,
  AgentCapabilities,
  AgentCard,
  AgentProvider,
  ApiKeyCredentials,
  AuthType,
  Credentials,
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  OAuthCredentials,
  OAuthFlow,
  OAuthFlows,
  OidcCredentials,
  SecurityScheme,
  Skill,
} from './types.js';

// Zod schemas
export {
  AgentCapabilitiesSchema,
  AgentCardSchema,
  AgentProviderSchema,
  OAuthFlowSchema,
  OAuthFlowsSchema,
  SecuritySchemeSchema,
  SkillSchema,
} from './types.js';

// Agent Card service
export {
  computeCardHash,
  fetchAgentCard,
  findSkill,
  getCachedCard,
  getPrimarySecurityScheme,
  getSkillIds,
  getSupportedAuthTypes,
  isCacheValid,
  parseAgentCard,
  schemeTypeToAuthType,
  validateAgentCardUrl,
  validateAuthTypeForCard,
} from './agent-card.js';

// Credential service
export {
  areCredentialsExpired,
  buildAuthHeaders,
  mergeCredentials,
  validateCredentials,
} from './credential.js';

// Crypto
export { decryptCredentials, decryptString } from './crypto.js';

// API Client
export {
  getA2AAgent,
  getA2ACredentials,
  isCardCacheStale,
  logA2AAuditEntry,
  refreshA2AAgentCard,
  validateAccessToken,
} from './api-client.js';

export type { A2AAgent, A2ACredentials, AuditLogEntry, UserContext } from './api-client.js';

// Server
export { A2AProxyServer, main } from './server.js';

// Logger
export { logger } from './logger.js';

// Validation helpers
export {
  AuthTypeSchema,
  CredentialsSchema,
  JsonRpcResponseSchema,
  agentCardFromPrismaJson,
  agentCardToPrismaJson,
  extractParams,
  isPlainObject,
  parseAuthType,
  parseCredentials,
  parseJsonRpcResponse,
  parseSecuritySchemesForHeaders,
  tryParseAgentCard,
} from './validation.js';

export type { JsonRpcResponseParsed } from './validation.js';
