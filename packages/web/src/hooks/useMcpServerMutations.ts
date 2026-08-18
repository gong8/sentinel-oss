import { useState } from 'react';

import { trpc } from '../lib/trpc';

interface RefreshFeedback {
  serverName: string;
  success: boolean;
  toolsDiscovered: number;
  error?: string;
}

interface UseMcpServerMutationsOptions {
  workspaceId?: string;
}

export function useMcpServerMutations(options: UseMcpServerMutationsOptions = {}) {
  const { workspaceId } = options;
  const utils = trpc.useUtils();

  const [refreshFeedback, setRefreshFeedback] = useState<RefreshFeedback | null>(null);
  const [refreshingServerId, setRefreshingServerId] = useState<string | null>(null);

  const invalidateServers = (): void => {
    void utils.admin.mcpServers.list.invalidate();
  };

  const createMutation = trpc.admin.mcpServers.create.useMutation({
    onSuccess: invalidateServers,
  });

  const updateMutation = trpc.admin.mcpServers.update.useMutation({
    onSuccess: invalidateServers,
  });

  const deleteMutation = trpc.admin.mcpServers.delete.useMutation({
    onSuccess: invalidateServers,
  });

  const discoverMutation = trpc.admin.mcpServers.discoverTools.useMutation({
    onSuccess: invalidateServers,
  });

  const refreshServer = (serverId: string, serverName: string): void => {
    setRefreshingServerId(serverId);
    discoverMutation.mutate(
      { id: serverId, workspaceId },
      {
        onSuccess: (data) => {
          setRefreshingServerId(null);
          setRefreshFeedback({
            serverName,
            success: data.success,
            toolsDiscovered: data.toolsDiscovered,
            error: data.error,
          });
        },
        onError: () => {
          setRefreshingServerId(null);
        },
      },
    );
  };

  const clearRefreshFeedback = (): void => {
    setRefreshFeedback(null);
  };

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    discoverMutation,
    refreshServer,
    refreshFeedback,
    clearRefreshFeedback,
    refreshingServerId,
    isRefreshing: refreshingServerId !== null,
    workspaceId,
  };
}
