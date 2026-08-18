/**
 * Hook for streaming chat messages
 * Provides real-time text streaming with tool call support
 *
 * Uses vanilla tRPC client for proper async iteration over streaming mutations.
 */

import * as React from 'react';
import { trpc, vanillaTrpc } from '../lib/trpc';

/**
 * Streaming response event types (mirrors backend types)
 */
export type StreamingResponseEvent =
  | { type: 'conversation_created'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; toolId: string; toolName: string }
  | { type: 'tool_executing'; toolId: string; toolName: string }
  | { type: 'tool_result'; toolId: string; toolName: string; success: boolean; error?: string }
  | { type: 'confirmation'; confirmationId: string; toolName: string; description: string }
  | {
      type: 'permission_denied';
      toolName: string;
      reason: string;
      serverDomain?: string;
      blockingPolicyId?: string;
    }
  | {
      type: 'plan_created';
      planId: string;
      planName: string;
      planDescription: string;
      stepCount: number;
    }
  | { type: 'done'; model?: string }
  | { type: 'error'; error: string };

/**
 * Tool denial info from permission_denied events
 */
export interface ToolDenialInfo {
  toolName: string;
  reason: string;
  serverDomain?: string;
  blockingPolicyId?: string;
}

interface UseStreamingChatOptions {
  /** Whether this is for workspace (vs admin) context */
  workspaceId?: string;
  onConversationCreated?: (conversationId: string) => void;
  onConfirmation?: (confirmation: {
    confirmationId: string;
    toolName: string;
    description: string;
  }) => void;
  onPermissionDenied?: (denial: ToolDenialInfo) => void;
  onModelReceived?: (model: string) => void;
}

interface StreamingChatState {
  isStreaming: boolean;
  streamingText: string;
  activeTools: Map<string, { name: string; status: 'pending' | 'executing' | 'done' | 'error' }>;
  error: string | null;
  permissionDenied: ToolDenialInfo | null;
}

interface UseStreamingChatReturn {
  state: StreamingChatState;
  sendMessageStream: (params: {
    conversationId?: string;
    message: string;
    workspaceId?: string;
  }) => Promise<void>;
  retryFromMessageStream: (params: {
    conversationId: string;
    messageId: string;
    workspaceId?: string;
  }) => Promise<void>;
  reset: () => void;
  supportsStreaming: boolean;
}

/**
 * Parse NDJSON stream from tRPC response
 * tRPC batches responses as NDJSON with a specific format
 */

/**
 * Hook for managing streaming chat state
 */
export function useStreamingChat(options: UseStreamingChatOptions = {}): UseStreamingChatReturn {
  const [state, setState] = React.useState<StreamingChatState>({
    isStreaming: false,
    streamingText: '',
    activeTools: new Map(),
    error: null,
    permissionDenied: null,
  });

  // Check if streaming is supported - use workspace endpoint if workspaceId provided
  const { data: adminStreamingSupport } = trpc.agent.chat.supportsStreaming.useQuery(undefined, {
    enabled: !options.workspaceId,
  });
  const { data: workspaceStreamingSupport } = trpc.workspace.chat.supportsStreaming.useQuery(
    { workspaceId: options.workspaceId! },
    { enabled: !!options.workspaceId },
  );
  const supportsStreaming = options.workspaceId
    ? (workspaceStreamingSupport?.supportsStreaming ?? false)
    : (adminStreamingSupport?.supportsStreaming ?? false);

  const sendMessageStream = React.useCallback(
    async (params: { conversationId?: string; message: string; workspaceId?: string }) => {
      // Reset state
      setState({
        isStreaming: true,
        streamingText: '',
        activeTools: new Map(),
        error: null,
        permissionDenied: null,
      });

      try {
        // Use vanilla tRPC client for proper async iteration
        // Choose endpoint based on whether workspaceId is provided
        const stream = params.workspaceId
          ? await vanillaTrpc.workspace.chat.sendMessageStream.mutate({
              workspaceId: params.workspaceId,
              message: params.message,
              conversationId: params.conversationId,
            })
          : await vanillaTrpc.agent.chat.sendMessageStream.mutate(params);

        // Check if result is async iterable
        if (stream && typeof stream === 'object' && Symbol.asyncIterator in stream) {
          for await (const event of stream as AsyncIterable<StreamingResponseEvent>) {
            switch (event.type) {
              case 'conversation_created':
                options.onConversationCreated?.(event.conversationId);
                break;

              case 'text':
                setState((prev) => ({
                  ...prev,
                  streamingText: prev.streamingText + event.text,
                }));
                break;

              case 'tool_start':
                setState((prev) => {
                  const newTools = new Map(prev.activeTools);
                  newTools.set(event.toolId, { name: event.toolName, status: 'pending' });
                  return { ...prev, activeTools: newTools };
                });
                break;

              case 'tool_executing':
                setState((prev) => {
                  const newTools = new Map(prev.activeTools);
                  const tool = newTools.get(event.toolId);
                  if (tool) {
                    newTools.set(event.toolId, { ...tool, status: 'executing' });
                  }
                  return { ...prev, activeTools: newTools };
                });
                break;

              case 'tool_result':
                setState((prev) => {
                  const newTools = new Map(prev.activeTools);
                  const tool = newTools.get(event.toolId);
                  if (tool) {
                    newTools.set(event.toolId, {
                      ...tool,
                      status: event.success ? 'done' : 'error',
                    });
                  }
                  return { ...prev, activeTools: newTools };
                });
                break;

              case 'confirmation':
                options.onConfirmation?.({
                  confirmationId: event.confirmationId,
                  toolName: event.toolName,
                  description: event.description,
                });
                break;

              case 'permission_denied':
                {
                  const denialInfo: ToolDenialInfo = {
                    toolName: event.toolName,
                    reason: event.reason,
                    serverDomain: event.serverDomain,
                    blockingPolicyId: event.blockingPolicyId,
                  };
                  setState((prev) => ({ ...prev, permissionDenied: denialInfo }));
                  options.onPermissionDenied?.(denialInfo);
                }
                break;

              case 'done':
                if (event.model) {
                  options.onModelReceived?.(event.model);
                }
                setState((prev) => ({ ...prev, isStreaming: false }));
                break;

              case 'error':
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  error: event.error,
                }));
                break;
            }
          }
        } else if (Array.isArray(stream)) {
          // Fallback: if result is an array (all events collected)
          for (const event of stream as StreamingResponseEvent[]) {
            if (event.type === 'text') {
              setState((prev) => ({
                ...prev,
                streamingText: prev.streamingText + event.text,
              }));
            } else if (event.type === 'done' && event.model) {
              options.onModelReceived?.(event.model);
            } else if (event.type === 'conversation_created') {
              options.onConversationCreated?.(event.conversationId);
            }
          }
        }

        // Ensure streaming state is set to false when done
        setState((prev) => ({ ...prev, isStreaming: false }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    },
    [options],
  );

  const retryFromMessageStream = React.useCallback(
    async (params: { conversationId: string; messageId: string; workspaceId?: string }) => {
      // Reset state
      setState({
        isStreaming: true,
        streamingText: '',
        activeTools: new Map(),
        error: null,
        permissionDenied: null,
      });

      try {
        // Use vanilla tRPC client for proper async iteration
        // Choose endpoint based on whether workspaceId is provided
        const stream = params.workspaceId
          ? await vanillaTrpc.workspace.chat.retryFromMessageStream.mutate({
              workspaceId: params.workspaceId,
              conversationId: params.conversationId,
              messageId: params.messageId,
            })
          : await vanillaTrpc.agent.chat.retryFromMessageStream.mutate({
              conversationId: params.conversationId,
              messageId: params.messageId,
            });

        // Check if result is async iterable
        if (stream && typeof stream === 'object' && Symbol.asyncIterator in stream) {
          for await (const event of stream as AsyncIterable<StreamingResponseEvent>) {
            switch (event.type) {
              case 'text':
                setState((prev) => ({
                  ...prev,
                  streamingText: prev.streamingText + event.text,
                }));
                break;

              case 'tool_start':
                setState((prev) => {
                  const newTools = new Map(prev.activeTools);
                  newTools.set(event.toolId, { name: event.toolName, status: 'pending' });
                  return { ...prev, activeTools: newTools };
                });
                break;

              case 'tool_executing':
                setState((prev) => {
                  const newTools = new Map(prev.activeTools);
                  const tool = newTools.get(event.toolId);
                  if (tool) {
                    newTools.set(event.toolId, { ...tool, status: 'executing' });
                  }
                  return { ...prev, activeTools: newTools };
                });
                break;

              case 'tool_result':
                setState((prev) => {
                  const newTools = new Map(prev.activeTools);
                  const tool = newTools.get(event.toolId);
                  if (tool) {
                    newTools.set(event.toolId, {
                      ...tool,
                      status: event.success ? 'done' : 'error',
                    });
                  }
                  return { ...prev, activeTools: newTools };
                });
                break;

              case 'confirmation':
                options.onConfirmation?.({
                  confirmationId: event.confirmationId,
                  toolName: event.toolName,
                  description: event.description,
                });
                break;

              case 'permission_denied':
                {
                  const denialInfo: ToolDenialInfo = {
                    toolName: event.toolName,
                    reason: event.reason,
                    serverDomain: event.serverDomain,
                    blockingPolicyId: event.blockingPolicyId,
                  };
                  setState((prev) => ({ ...prev, permissionDenied: denialInfo }));
                  options.onPermissionDenied?.(denialInfo);
                }
                break;

              case 'done':
                if (event.model) {
                  options.onModelReceived?.(event.model);
                }
                setState((prev) => ({ ...prev, isStreaming: false }));
                break;

              case 'error':
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  error: event.error,
                }));
                break;
            }
          }
        } else if (Array.isArray(stream)) {
          // Fallback: if result is an array (all events collected)
          for (const event of stream as StreamingResponseEvent[]) {
            if (event.type === 'text') {
              setState((prev) => ({
                ...prev,
                streamingText: prev.streamingText + event.text,
              }));
            } else if (event.type === 'done' && event.model) {
              options.onModelReceived?.(event.model);
            }
          }
        }

        // Ensure streaming state is set to false when done
        setState((prev) => ({ ...prev, isStreaming: false }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    },
    [options],
  );

  const reset = React.useCallback(() => {
    setState({
      isStreaming: false,
      streamingText: '',
      activeTools: new Map(),
      error: null,
      permissionDenied: null,
    });
  }, []);

  return {
    state,
    sendMessageStream,
    retryFromMessageStream,
    reset,
    supportsStreaming,
  };
}
