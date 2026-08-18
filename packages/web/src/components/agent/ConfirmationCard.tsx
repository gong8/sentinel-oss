/**
 * Confirmation Card Component
 * Displays pending confirmations for write operations requiring admin approval
 */

import * as React from 'react';

import { formatToolNameForChat } from '../../lib/mcpUtils';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

export interface PendingConfirmation {
  confirmationId: string;
  toolName: string;
  toolInput?: unknown;
  description: string;
  expiresAt?: string;
}

interface ConfirmationCardProps {
  confirmation: PendingConfirmation;
  onConfirm: (confirmationId: string) => void;
  onCancel: (confirmationId: string) => void;
  onReview?: (confirmation: PendingConfirmation) => void;
  isConfirming?: boolean;
  isCancelling?: boolean;
}

function getTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor((diffMs % 60000) / 1000);

  if (diffMins > 0) {
    return `${diffMins}m ${diffSecs}s remaining`;
  }
  return `${diffSecs}s remaining`;
}

interface ActionButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
  label: string;
  variant: 'approve' | 'reject' | 'review';
}

function ActionButton({ onClick, disabled, isLoading, label, variant }: ActionButtonProps) {
  return (
    <Button
      size="lg"
      variant={variant === 'reject' ? 'outline' : 'default'}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 font-semibold h-11',
        variant === 'approve' && 'bg-green-600 hover:bg-green-700 text-white',
        variant === 'review' && 'bg-blue-600 hover:bg-blue-700 text-white',
        variant === 'reject' && 'border-destructive/50 text-destructive hover:bg-destructive/10',
        isLoading && 'opacity-50',
      )}
    >
      {label}
    </Button>
  );
}

/**
 * Check if a tool name is a policy action that requires review
 */
function isPolicyAction(toolName: string): boolean {
  return (
    toolName === 'create_policy' || toolName === 'update_policy' || toolName === 'delete_policy'
  );
}

export function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
  onReview,
  isConfirming = false,
  isCancelling = false,
}: ConfirmationCardProps) {
  const [timeRemaining, setTimeRemaining] = React.useState<string>('');
  const isLoading = isConfirming || isCancelling;
  const showReviewButton = isPolicyAction(confirmation.toolName) && onReview;

  // Update time remaining every second
  React.useEffect(() => {
    if (!confirmation.expiresAt) return;

    const updateTime = () => {
      setTimeRemaining(getTimeRemaining(confirmation.expiresAt!));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [confirmation.expiresAt]);

  return (
    <div className="mx-4 my-4 overflow-hidden rounded-lg border-2 border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/20 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-amber-500/50 bg-amber-500/20 px-4 py-3">
        <span className="text-amber-600 dark:text-amber-400 font-bold">⚠</span>
        <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
          Action Requires Your Approval
        </span>
        {timeRemaining && (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <span>⏱</span>
            {timeRemaining}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Action</div>
          <div className="text-base font-semibold">
            {formatToolNameForChat(confirmation.toolName)}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Description</div>
          <div className="text-sm leading-relaxed">{confirmation.description}</div>
        </div>

        {/* Collapsible details */}
        <details className="text-xs group">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform">▶</span>
            View technical details
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-background/50 p-3 text-[11px] border border-border/50">
            {JSON.stringify(confirmation.toolInput, null, 2)}
          </pre>
        </details>

        <div className="flex gap-3 pt-2">
          {showReviewButton ? (
            <ActionButton
              onClick={() => onReview(confirmation)}
              disabled={isLoading}
              isLoading={false}
              label="Review"
              variant="review"
            />
          ) : (
            <ActionButton
              onClick={() => onConfirm(confirmation.confirmationId)}
              disabled={isLoading}
              isLoading={isConfirming}
              label="Approve"
              variant="approve"
            />
          )}
          <ActionButton
            onClick={() => onCancel(confirmation.confirmationId)}
            disabled={isLoading}
            isLoading={isCancelling}
            label="Reject"
            variant="reject"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Container for multiple confirmation cards
 */
interface ConfirmationListProps {
  confirmations: PendingConfirmation[];
  onConfirm: (confirmationId: string) => void;
  onCancel: (confirmationId: string) => void;
  onReview?: (confirmation: PendingConfirmation) => void;
  confirmingId?: string;
  cancellingId?: string;
}

export function ConfirmationList({
  confirmations,
  onConfirm,
  onCancel,
  onReview,
  confirmingId,
  cancellingId,
}: ConfirmationListProps) {
  if (confirmations.length === 0) return null;

  return (
    <div className="space-y-3 py-2 bg-amber-500/5 border-y border-amber-500/30">
      <div className="px-4 py-2 text-center">
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          ⚠ {confirmations.length} pending {confirmations.length === 1 ? 'action' : 'actions'}{' '}
          awaiting approval
        </span>
      </div>
      {confirmations.map((confirmation) => (
        <ConfirmationCard
          key={confirmation.confirmationId}
          confirmation={confirmation}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onReview={onReview}
          isConfirming={confirmingId === confirmation.confirmationId}
          isCancelling={cancellingId === confirmation.confirmationId}
        />
      ))}
    </div>
  );
}
