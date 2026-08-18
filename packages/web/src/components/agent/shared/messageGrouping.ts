/**
 * Message grouping utilities for Agent chat
 * Groups consecutive tool messages into batches for unified display
 */

import type { DisplayItem, Message, ToolCallGroup } from './types';

/**
 * Check if a tool result is an error
 */
export function isToolResultError(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'error' in result;
}

/**
 * Check if a tool result is a pending confirmation (not yet executed)
 * These shouldn't show as "success" since the actual action hasn't happened
 */
export function isToolResultPendingConfirmation(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'requiresConfirmation' in result &&
    (result as { requiresConfirmation: unknown }).requiresConfirmation === true
  );
}

/**
 * Check if a tool result was accepted by the user (confirmation approved)
 */
export function isToolResultAccepted(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'userDecision' in result &&
    (result as { userDecision: unknown }).userDecision === 'accepted'
  );
}

/**
 * Check if a tool result was rejected by the user (confirmation cancelled)
 */
export function isToolResultRejected(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'userDecision' in result &&
    (result as { userDecision: unknown }).userDecision === 'rejected'
  );
}

/**
 * Check if a tool result has any user decision (was a confirmed action)
 */
export function hasUserDecision(result: unknown): boolean {
  return isToolResultAccepted(result) || isToolResultRejected(result);
}

/**
 * Groups consecutive tool messages into batches for unified display.
 * Shows each distinct tool operation, but collapses failed retries
 * (if a tool fails then succeeds, only shows the success).
 *
 * When a write tool has a pending confirmation or user decision, earlier failed
 * attempts of the same tool are hidden to show only the final outcome.
 */
export function groupMessagesForDisplay(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let currentToolBatch: ToolCallGroup[] = [];
  let lastNonToolMessageId = '';

  // First pass: identify tools with pending confirmations or user decisions
  // These should hide earlier failed attempts of the same tool
  const toolsWithFinalState = new Set<string>();
  for (const msg of messages) {
    if (msg.role === 'TOOL_RESULT' && msg.toolName) {
      if (hasUserDecision(msg.toolResult) || isToolResultPendingConfirmation(msg.toolResult)) {
        toolsWithFinalState.add(msg.toolName);
      }
    }
  }

  for (const msg of messages) {
    if (msg.role === 'TOOL_USE' && msg.toolName) {
      // Add each tool use as a separate entry
      currentToolBatch.push({
        toolName: msg.toolName,
        hasResult: false,
        isError: false,
        isPendingConfirmation: false,
        isAccepted: false,
        isRejected: false,
      });
    } else if (msg.role === 'TOOL_RESULT' && msg.toolName) {
      // Find the most recent TOOL_USE of this name that doesn't have a result yet
      const existingIdx = currentToolBatch.findIndex(
        (t) => t.toolName === msg.toolName && !t.hasResult,
      );
      if (existingIdx !== -1) {
        const isError = isToolResultError(msg.toolResult);
        const isPending = isToolResultPendingConfirmation(msg.toolResult);
        const isAccepted = isToolResultAccepted(msg.toolResult);
        const isRejected = isToolResultRejected(msg.toolResult);
        const hasDecision = isAccepted || isRejected;

        // If this has a user decision, pending confirmation, or is not an error,
        // and there's a previous FAILED attempt of the same tool, remove the failed one
        if (hasDecision || isPending || !isError) {
          const prevFailedIdx = currentToolBatch.findIndex(
            (t) => t.toolName === msg.toolName && t.hasResult && t.isError && !t.isAccepted,
          );
          if (prevFailedIdx !== -1 && prevFailedIdx < existingIdx) {
            currentToolBatch.splice(prevFailedIdx, 1);
            // Adjust existingIdx since we removed an element before it
            const adjustedIdx = existingIdx - 1;
            currentToolBatch[adjustedIdx] = {
              ...currentToolBatch[adjustedIdx],
              hasResult: true,
              isError: hasDecision ? isAccepted && isError : isError,
              isPendingConfirmation: isPending,
              isAccepted,
              isRejected,
            };
            continue;
          }
        }

        currentToolBatch[existingIdx] = {
          ...currentToolBatch[existingIdx],
          hasResult: true,
          isError,
          isPendingConfirmation: isPending,
          isAccepted,
          isRejected,
        };
      } else {
        // No matching TOOL_USE found, add as standalone result
        currentToolBatch.push({
          toolName: msg.toolName,
          hasResult: true,
          isError: isToolResultError(msg.toolResult),
          isPendingConfirmation: isToolResultPendingConfirmation(msg.toolResult),
          isAccepted: isToolResultAccepted(msg.toolResult),
          isRejected: isToolResultRejected(msg.toolResult),
        });
      }
    } else {
      // Regular message - flush any pending tool batch
      if (currentToolBatch.length > 0) {
        items.push({
          type: 'tools',
          tools: [...currentToolBatch],
          afterMessageId: lastNonToolMessageId,
        });
        currentToolBatch = [];
      }
      items.push({ type: 'message', message: msg });
      lastNonToolMessageId = msg.id;
    }
  }

  // Flush remaining tool batch at end
  if (currentToolBatch.length > 0) {
    items.push({ type: 'tools', tools: currentToolBatch, afterMessageId: lastNonToolMessageId });
  }

  // Second pass: for tools with a final state (pending, accepted, rejected),
  // count how many we need to show and filter out excess failed attempts
  if (toolsWithFinalState.size > 0) {
    // Count final state tools per tool name
    const finalStateCounts = new Map<string, number>();
    for (const item of items) {
      if (item.type === 'tools') {
        for (const tool of item.tools) {
          if (tool.isPendingConfirmation || tool.isAccepted || tool.isRejected) {
            finalStateCounts.set(tool.toolName, (finalStateCounts.get(tool.toolName) ?? 0) + 1);
          }
        }
      }
    }

    // Filter: keep final state tools, hide failed attempts for tools that have final states
    for (const item of items) {
      if (item.type === 'tools') {
        item.tools = item.tools.filter((tool) => {
          // Always keep tools with a final state
          if (tool.isPendingConfirmation || tool.isAccepted || tool.isRejected) {
            return true;
          }
          // Always keep successful (non-error) tools without decisions
          if (!tool.isError) {
            return true;
          }
          // If this tool has final states elsewhere, hide this failed attempt
          if (finalStateCounts.has(tool.toolName)) {
            return false;
          }
          // Keep failed attempts for tools without final states (real errors to show)
          return true;
        });
      }
    }
  }

  // Remove empty tool batches
  return items.filter((item) => item.type !== 'tools' || item.tools.length > 0);
}
