/**
 * Session Types
 * Type definitions for session context management
 */

import type { SessionContextEntryType, SessionStatus } from '@sentinel/db';

/**
 * Session context entry as returned for policy evaluation
 */
export interface SessionContextEntryForPolicy {
  key: string;
  value: unknown;
  summary: string | null;
  entryType: SessionContextEntryType;
  importance: number;
  sourceToolName: string | null;
  createdAt: Date;
}

/**
 * Complete session context used during policy evaluation
 */
export interface SessionContextForPolicy {
  sessionId: string;
  externalSessionId: string;
  sessionAge: number; // Minutes since session started
  toolCallCount: number;
  contextSummary: string | null;
  recentContext: SessionContextEntryForPolicy[];
  status: SessionStatus;
}

/**
 * LLM extraction result from context extraction service
 */
export interface ContextExtractionResult {
  primaryIntent?: string;
  dataSensitivity?: 'public' | 'internal' | 'confidential' | 'restricted';
  riskSignals?: string[];
  updatedSummary?: string;
}

/**
 * Parameters for adding session context
 */
export interface AddSessionContextParams {
  sessionId: string;
  entryType: SessionContextEntryType;
  key: string;
  value: unknown;
  summary?: string | null;
  importance?: number;
  sourceToolName?: string | null;
  expiresAt?: Date | null;
}

/**
 * Parameters for getting or creating a session
 */
export interface GetOrCreateSessionParams {
  organizationId: string;
  externalSessionId: string;
  userId?: string | null;
  agentId?: string | null;
}

/**
 * Session configuration constants
 */
export const SESSION_CONFIG = {
  DEFAULT_TTL_HOURS: 24,
  MAX_CONTEXT_ENTRIES_PER_SESSION: 100,
  MAX_RECENT_CONTEXT_FOR_POLICY: 10,
  CONTEXT_EXTRACTION_TIMEOUT_MS: 3000,
  CLEANUP_EXPIRED_AFTER_DAYS: 7,
} as const;
