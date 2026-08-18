/**
 * New Chat Modal Component
 * Admin-only modal to select chat type (Sentinel Admin or Workspace Agent)
 */

import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

import type { ConversationType } from '../agent/shared/types';

interface NewChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: ConversationType) => void;
}

export function NewChatModal({ open, onOpenChange, onSelect }: NewChatModalProps) {
  const handleSelect = (type: ConversationType) => {
    onSelect(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>Choose the type of agent conversation to start.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <button
            onClick={() => handleSelect('SENTINEL_ADMIN')}
            className="group flex items-start gap-4 rounded-xl border border-border/50 p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/30"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-900 shadow-sm">
              <img src="/logo.png" alt="Sentinel" className="h-7 w-auto" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">Sentinel Admin</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Organization-wide admin operations: manage policies, users, roles, and settings
              </div>
            </div>
          </button>

          <button
            onClick={() => handleSelect('WORKSPACE_AGENT')}
            className="group flex items-start gap-4 rounded-xl border border-border/50 p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/30"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-sm">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">Workspace Agent</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Workspace-scoped tool execution with MCP servers registered in this workspace
              </div>
            </div>
          </button>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
