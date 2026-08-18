import { useMemo, useState } from 'react';

import { trpc } from '../lib/trpc';
import { useWorkspace } from './WorkspaceContext';

type ViewAsType = 'none' | 'user' | 'agent' | 'role';

interface UseViewAsContextResult {
  viewAsType: ViewAsType;
  viewAsId: string;
  setViewAsType: (type: ViewAsType) => void;
  setViewAsId: (id: string) => void;
  reset: () => void;
  displayName: string | null;
  isEnabled: boolean;
  users: Array<{ id: string; email: string }> | undefined;
  agents: Array<{ id: string; name: string }> | undefined;
  roles: Array<{ id: string; name: string }> | undefined;
}

export function useViewAsContext(): UseViewAsContextResult {
  const [viewAsType, setViewAsType] = useState<ViewAsType>('none');
  const [viewAsId, setViewAsId] = useState<string>('');
  const { selectedWorkspaceId } = useWorkspace();

  const usersQuery = trpc.admin.users.list.useQuery();
  // Agents should be workspace-scoped
  const agentsQuery = trpc.admin.agents.list.useQuery({
    workspaceId: selectedWorkspaceId ?? undefined,
  });
  const rolesQuery = trpc.admin.roles.list.useQuery();

  const reset = () => {
    setViewAsType('none');
    setViewAsId('');
  };

  const handleTypeChange = (type: ViewAsType) => {
    setViewAsType(type);
    setViewAsId('');
  };

  const displayName = useMemo(() => {
    if (viewAsType === 'none' || !viewAsId) return null;

    if (viewAsType === 'user' && usersQuery.data) {
      const user = usersQuery.data.find((u) => u.id === viewAsId);
      return user?.email ?? null;
    }

    if (viewAsType === 'agent' && agentsQuery.data) {
      const agent = agentsQuery.data.find((a) => a.id === viewAsId);
      return agent?.name ?? null;
    }

    if (viewAsType === 'role' && rolesQuery.data) {
      const role = rolesQuery.data.find((r) => r.id === viewAsId);
      return role?.name ?? null;
    }

    return null;
  }, [viewAsType, viewAsId, usersQuery.data, agentsQuery.data, rolesQuery.data]);

  return {
    viewAsType,
    viewAsId,
    setViewAsType: handleTypeChange,
    setViewAsId,
    reset,
    displayName,
    isEnabled: viewAsType !== 'none' && viewAsId !== '',
    users: usersQuery.data,
    agents: agentsQuery.data,
    roles: rolesQuery.data,
  };
}
