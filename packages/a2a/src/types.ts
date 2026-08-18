/**
 * A2A (Agent-to-Agent) Protocol Types
 * Based on the A2A specification: https://github.com/google/A2A
 */

import { z } from 'zod';

// ============================================================================
// SECURITY SCHEME TYPES
// ============================================================================

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  in?: 'header' | 'query' | 'cookie';
  name?: string;
  scheme?: string; // 'bearer', 'basic'
  bearerFormat?: string;
  openIdConnectUrl?: string;
  flows?: OAuthFlows;
}

// ============================================================================
// AGENT CARD TYPES
// ============================================================================

export interface Skill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentProvider {
  organization: string;
  url?: string;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

export interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string; // A2A endpoint URL
  preferredTransport?: 'JSONRPC' | 'GRPC' | 'HTTP+JSON';
  provider?: AgentProvider;
  capabilities?: AgentCapabilities;
  securitySchemes?: Record<string, SecurityScheme>;
  security?: Array<Record<string, string[]>>;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills: Skill[];
}

// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

export const OAuthFlowSchema = z
  .object({
    authorizationUrl: z.string().url().optional(),
    tokenUrl: z.string().url().optional(),
    refreshUrl: z.string().url().optional(),
    scopes: z.record(z.string(), z.string()),
  })
  .passthrough();

export const OAuthFlowsSchema = z
  .object({
    implicit: OAuthFlowSchema.optional(),
    password: OAuthFlowSchema.optional(),
    clientCredentials: OAuthFlowSchema.optional(),
    authorizationCode: OAuthFlowSchema.optional(),
  })
  .passthrough();

export const SecuritySchemeSchema = z
  .object({
    type: z.enum(['apiKey', 'http', 'oauth2', 'openIdConnect']),
    in: z.enum(['header', 'query', 'cookie']).optional(),
    name: z.string().optional(),
    scheme: z.string().optional(),
    bearerFormat: z.string().optional(),
    openIdConnectUrl: z.string().url().optional(),
    flows: OAuthFlowsSchema.optional(),
  })
  .passthrough();

export const SkillSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
    examples: z.array(z.string()).optional(),
    inputModes: z.array(z.string()).optional(),
    outputModes: z.array(z.string()).optional(),
  })
  .passthrough();

export const AgentProviderSchema = z
  .object({
    organization: z.string(),
    url: z.string().url().optional(),
  })
  .passthrough();

export const AgentCapabilitiesSchema = z
  .object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    stateTransitionHistory: z.boolean().optional(),
  })
  .passthrough();

export const AgentCardSchema = z
  .object({
    protocolVersion: z.string(),
    name: z.string(),
    description: z.string(),
    url: z.string().url(),
    preferredTransport: z.enum(['JSONRPC', 'GRPC', 'HTTP+JSON']).optional(),
    provider: AgentProviderSchema.optional(),
    capabilities: AgentCapabilitiesSchema.optional(),
    securitySchemes: z.record(z.string(), SecuritySchemeSchema).optional(),
    security: z.array(z.record(z.string(), z.array(z.string()))).optional(),
    defaultInputModes: z.array(z.string()).optional(),
    defaultOutputModes: z.array(z.string()).optional(),
    skills: z.array(SkillSchema).min(1),
  })
  .passthrough();

// ============================================================================
// AUTH TYPES
// ============================================================================

export type AuthType = 'NONE' | 'API_KEY' | 'OAUTH' | 'OIDC';

// ============================================================================
// CREDENTIAL TYPES
// ============================================================================

export interface ApiKeyCredentials {
  apiKey: string;
}

export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}

export interface OidcCredentials {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}

export type Credentials = ApiKeyCredentials | OAuthCredentials | OidcCredentials;

// ============================================================================
// PROXY TYPES
// ============================================================================

export interface A2AProxyRequest {
  agentId: string;
  skillId?: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface A2AProxyResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

// ============================================================================
// JSON-RPC TYPES
// ============================================================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
