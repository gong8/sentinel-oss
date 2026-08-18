/**
 * Shared types for Agent chat components
 * Used by both full-screen view and pop-out panel
 */

export type MessageRole = 'USER' | 'ASSISTANT' | 'TOOL_USE' | 'TOOL_RESULT' | 'PERMISSION_REQUEST';

export type ConversationType = 'SENTINEL_ADMIN' | 'WORKSPACE_AGENT';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolName?: string | null;
  toolInput?: unknown;
  toolResult?: unknown;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedConversation {
  id: string;
  type: ConversationType;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
  workspaceName?: string;
}

// Note: PendingConfirmation is defined in ../ConfirmationCard.tsx

/** Grouped tool call with both invocation and result */
export interface ToolCallGroup {
  toolName: string;
  hasResult: boolean;
  isError: boolean;
  /** True if the tool returned a confirmation request (action not yet executed) */
  isPendingConfirmation: boolean;
  /** True if the user accepted the confirmation */
  isAccepted: boolean;
  /** True if the user rejected the confirmation */
  isRejected: boolean;
}

/** Represents a grouped display item - either a regular message or a batch of tool calls */
export type DisplayItem =
  | { type: 'message'; message: Message }
  | { type: 'tools'; tools: ToolCallGroup[]; afterMessageId: string };
