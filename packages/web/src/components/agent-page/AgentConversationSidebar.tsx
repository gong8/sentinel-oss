/**
 * Agent Conversation Sidebar Component
 * Shows unified conversation list with type badges and actions
 */

import * as React from 'react';
import { NavLink } from 'react-router';

import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { DeleteConfirmDialog } from '../ui/delete-confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

import type { ConversationType, UnifiedConversation } from '../agent/shared/types';

interface AgentConversationSidebarProps {
  workspaceId: string;
  workspaceSlug: string;
  isAdmin: boolean;
  activeConversationId: string | null;
  onSelectConversation: (id: string, type: ConversationType) => void;
  onDeleteConversation: (id: string, type: ConversationType) => void;
}

function ConversationIcon({ type }: { type: ConversationType }) {
  if (type === 'SENTINEL_ADMIN') {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900">
        <img src="/logo.png" alt="Admin" className="h-5 w-auto" />
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
      <svg
        className="h-4 w-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  conversation: UnifiedConversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
        isActive ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
    >
      <ConversationIcon type={conversation.type} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {conversation.title ?? 'New conversation'}
          </span>
          {conversation.type === 'SENTINEL_ADMIN' && (
            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
              Admin
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{conversation.messageCount} messages</span>
          <span>·</span>
          <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
          {conversation.workspaceName && (
            <>
              <span>·</span>
              <span className="truncate">{conversation.workspaceName}</span>
            </>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AgentConversationSidebar({
  workspaceId,
  workspaceSlug,
  isAdmin,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
}: AgentConversationSidebarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [conversationToDelete, setConversationToDelete] = React.useState<{
    id: string;
    type: ConversationType;
  } | null>(null);

  // Fetch unified conversations for admins, workspace-only for users
  const { data: conversations = [], isLoading } = trpc.agent.chat.listAllConversations.useQuery(
    { limit: 50 },
    { enabled: isAdmin },
  );

  // For non-admins, fetch workspace conversations only
  const { data: workspaceConversationsData, isLoading: workspaceLoading } =
    trpc.workspace.chat.listConversations.useQuery(
      { workspaceId, limit: 50 },
      { enabled: !isAdmin },
    );

  const displayConversations: UnifiedConversation[] = isAdmin
    ? conversations
    : (workspaceConversationsData?.items ?? []).map((conv) => ({
        ...conv,
        createdAt: String(conv.createdAt),
        updatedAt: String(conv.updatedAt),
        type: 'WORKSPACE_AGENT' as const,
      }));

  const loading = isAdmin ? isLoading : workspaceLoading;

  const handleDeleteClick = (id: string, type: ConversationType) => {
    setConversationToDelete({ id, type });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      onDeleteConversation(conversationToDelete.id, conversationToDelete.type);
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  return (
    <aside className="flex w-72 flex-col border-r border-border/70 bg-card/80 backdrop-blur">
      {/* Header */}
      <div className="border-b border-border/70 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
            <img src="/logo.png" alt="Sentinel" className="h-6 w-auto" />
          </div>
          <div className="text-lg font-semibold tracking-tight text-foreground">
            {isAdmin ? 'Agent' : 'Workspace Agent'}
          </div>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Loading...
            </div>
          </div>
        ) : displayConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <svg
              className="h-8 w-8 text-muted-foreground/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <div className="text-sm text-muted-foreground">No conversations yet</div>
          </div>
        ) : (
          <div className="space-y-1">
            {displayConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversationId === conv.id}
                onSelect={() => onSelectConversation(conv.id, conv.type)}
                onDelete={() => handleDeleteClick(conv.id, conv.type)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with Settings and Back Links */}
      <div className="border-t border-border/70 p-3 space-y-1">
        <NavLink
          to={`/${isAdmin ? 'admin' : 'user'}/${workspaceSlug}/agent/settings`}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Agent Settings
        </NavLink>
        <NavLink
          to={`/${isAdmin ? 'admin' : 'user'}/${workspaceSlug}`}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to {isAdmin ? 'Control Panel' : 'Dashboard'}
        </NavLink>
      </div>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Conversation"
        description="This action cannot be undone."
        onConfirm={handleConfirmDelete}
      />
    </aside>
  );
}
