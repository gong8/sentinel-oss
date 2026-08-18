/**
 * Chat Messages Component
 * Displays the conversation messages with auto-scroll
 */

import { Bot, User } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/scroll-area';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div className="p-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 pt-1">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                <span
                  className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                />
                <span
                  className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-muted' : 'bg-primary/10',
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>
      <div
        className={cn(
          'flex-1 rounded-lg px-4 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground ml-12' : 'bg-muted mr-12',
        )}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}
