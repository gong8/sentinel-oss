/**
 * Feature Discovery Hooks
 * React Query hooks for feature discovery system
 */

import { trpc } from '../lib/trpc';

// Get feature tips for current page
export function useFeatureTips(currentPath: string, workspaceId?: string | null) {
  return trpc.featureDiscovery.getTips.useQuery({
    currentPath,
    workspaceId: workspaceId ?? null,
    limit: 3,
  });
}

// Dismiss a tip
export function useDismissTip() {
  const utils = trpc.useUtils();
  return trpc.featureDiscovery.dismissTip.useMutation({
    onSuccess: () => {
      utils.featureDiscovery.getTips.invalidate();
    },
  });
}

// User settings
export function useUserTipsSettings(workspaceId: string) {
  return trpc.featureDiscovery.getUserSettings.useQuery({ workspaceId });
}

export function useUpdateUserTipsSettings() {
  const utils = trpc.useUtils();
  return trpc.featureDiscovery.updateUserSettings.useMutation({
    onSuccess: () => {
      utils.featureDiscovery.getUserSettings.invalidate();
    },
  });
}

// Milestone preferences
export function useMilestonePreferences() {
  return trpc.featureDiscovery.getMilestonePreferences.useQuery();
}

export function useUpdateMilestonePreferences() {
  const utils = trpc.useUtils();
  return trpc.featureDiscovery.updateMilestonePreferences.useMutation({
    onSuccess: () => {
      utils.featureDiscovery.getMilestonePreferences.invalidate();
    },
  });
}

// Achieved milestones
export function useAchievedMilestones() {
  return trpc.featureDiscovery.getAchievedMilestones.useQuery();
}

// Digest preference
export function useDigestPreference() {
  return trpc.featureDiscovery.getDigestPreference.useQuery();
}

export function useUpdateDigestPreference() {
  const utils = trpc.useUtils();
  return trpc.featureDiscovery.updateDigestPreference.useMutation({
    onSuccess: () => {
      utils.featureDiscovery.getDigestPreference.invalidate();
    },
  });
}

// Admin hooks
export function useAdminOrgTipsSettings() {
  return trpc.featureDiscovery.admin.getOrgSettings.useQuery();
}

export function useUpdateAdminOrgTipsSettings() {
  const utils = trpc.useUtils();
  return trpc.featureDiscovery.admin.updateOrgSettings.useMutation({
    onSuccess: () => {
      utils.featureDiscovery.admin.getOrgSettings.invalidate();
    },
  });
}
