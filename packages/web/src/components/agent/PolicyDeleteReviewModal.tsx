/**
 * Policy Delete Review Modal
 * Displays a confirmation dialog with policy details before deletion.
 */

import { useMemo } from 'react';

import { useMcpServers } from '../../hooks/useMcpServers';
import {
  formatMatcherDisplay,
  hasValidMatchers,
  hasValidToolPatterns,
  safeToolPatternToUI,
} from '../../lib/policyUtils';
import { trpc } from '../../lib/trpc';
import { AllowDenyBadge } from '../ui/allow-deny-toggle';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { PendingConfirmation } from './ConfirmationCard';

interface PolicyDeleteReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmation: PendingConfirmation;
  onSubmit: (confirmationId: string, modifiedInput: unknown) => void;
  isSubmitting: boolean;
}

// Type for delete policy input
interface DeletePolicyInput {
  id: string;
}

// Simplified policy data type for display
interface PolicyDisplayData {
  description: string;
  effect: 'ALLOW' | 'DENY';
  matchers: string[];
  toolPatterns: string[];
  enabled: boolean;
}

export function PolicyDeleteReviewModal({
  open,
  onOpenChange,
  confirmation,
  onSubmit,
  isSubmitting,
}: PolicyDeleteReviewModalProps) {
  const input = confirmation.toolInput as DeletePolicyInput | undefined;
  const policyId = input?.id;

  // Fetch policy details - extract to simpler type to avoid deep instantiation
  const policyQuery = trpc.admin.policies.get.useQuery(
    { id: policyId ?? '' },
    { enabled: open && Boolean(policyId) },
  );

  const { getServerNameForDisplay } = useMcpServers();

  // Extract policy data to simpler type
  const policy: PolicyDisplayData | null = useMemo(() => {
    const data = policyQuery.data;
    if (!data) return null;
    return {
      description: data.description,
      effect: data.effect,
      matchers: data.matchers,
      toolPatterns: data.toolPatterns,
      enabled: data.enabled,
    };
  }, [policyQuery.data]);

  // Format matchers for display
  const formattedMatchers = useMemo(() => {
    if (!policy || !hasValidMatchers(policy.matchers)) {
      return [];
    }
    return policy.matchers.map((m) => formatMatcherDisplay(m));
  }, [policy]);

  // Format tool patterns for display
  const formattedToolPatterns = useMemo(() => {
    if (!policy || !hasValidToolPatterns(policy.toolPatterns)) {
      return [];
    }
    return policy.toolPatterns.map((tp) => {
      const result = safeToolPatternToUI(tp);
      if (!result.success) {
        return tp;
      }
      const { server, tool } = result.data;
      const serverName = getServerNameForDisplay(server);
      return `${serverName}::${tool}`;
    });
  }, [policy, getServerNameForDisplay]);

  const handleConfirm = () => {
    // Pass the original input unchanged for delete
    onSubmit(confirmation.confirmationId, confirmation.toolInput);
  };

  const isLoading = policyQuery.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete Policy</DialogTitle>
          <DialogDescription>
            Review the policy details before confirming deletion. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-muted-foreground">Loading policy details...</div>
            </div>
          ) : policy ? (
            <>
              {/* Description */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Description</div>
                <div className="text-sm">{policy.description || 'No description'}</div>
              </div>

              {/* Effect */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Effect</div>
                <AllowDenyBadge value={policy.effect} size="sm" />
              </div>

              {/* Applies To */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Applies to</div>
                <div className="flex flex-wrap gap-1">
                  {formattedMatchers.map((matcher, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {matcher}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Tool Access */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Tool access</div>
                <div className="flex flex-wrap gap-1">
                  {formattedToolPatterns.map((tp, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs font-mono">
                      {tp}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Status</div>
                <Badge variant={policy.enabled ? 'default' : 'secondary'} className="text-xs">
                  {policy.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              Policy not found or unable to load details.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting || isLoading || !policy}
          >
            {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
