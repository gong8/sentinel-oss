/**
 * Chat Input Component
 * Input field with send button for the agent chat
 * Uses persistent store to preserve input across page navigation
 */

import { ChatInput as BaseChatInput, type ChatInputStore } from '../ui/chat-input';
import { chatPanelStore } from './chatPanelStore';

interface ChatInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

// Adapter to make chatPanelStore conform to ChatInputStore interface
const chatInputStoreAdapter: ChatInputStore = {
  subscribe: chatPanelStore.subscribe,
  getState: chatPanelStore.getState,
  setInputValue: chatPanelStore.setInputValue,
  clearInputValue: chatPanelStore.clearInputValue,
};

export function ChatInput({
  onSend,
  onCancel,
  disabled = false,
  isLoading = false,
  placeholder = 'Ask about policies, users, audit logs...',
}: ChatInputProps) {
  return (
    <BaseChatInput
      onSend={onSend}
      onCancel={onCancel}
      disabled={disabled}
      isLoading={isLoading}
      placeholder={placeholder}
      persistentStore={chatInputStoreAdapter}
    />
  );
}
