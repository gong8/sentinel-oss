/**
 * Conversation Sidebar
 * Lists user's conversations with actions for new chat and deletion
 */

import { Bot, MessageSquarePlus, Settings, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';

export interface ConversationListItem {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ConversationSidebarProps {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isLoading: boolean;
  settingsPath: string;
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  isLoading,
  settingsPath,
}: ConversationSidebarProps) {
  return (
    <div className="w-64 border-r border-border/50 bg-muted/20 flex flex-col">
      <div className="p-3 border-b border-border/30">
        <Button onClick={onNew} className="w-full" size="sm">
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No conversations yet</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-muted/50',
                  selectedId === conversation.id && 'bg-muted',
                )}
                onClick={() => onSelect(conversation.id)}
              >
                <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{conversation.title || 'New conversation'}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(conversation.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border/30">
        <Link to={settingsPath}>
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}
