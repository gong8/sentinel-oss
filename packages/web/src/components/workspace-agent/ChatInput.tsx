/**
 * Chat Input Component
 * Text input for sending messages to the workspace agent
 * Uses local state (no persistence across navigation)
 */

import { ChatInput as BaseChatInput } from '../ui/chat-input';

interface ChatInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onCancel,
  disabled = false,
  isLoading = false,
  placeholder = 'Type a message...',
}: ChatInputProps) {
  return (
    <BaseChatInput
      onSend={onSend}
      onCancel={onCancel}
      disabled={disabled}
      isLoading={isLoading}
      placeholder={placeholder}
    />
  );
}
