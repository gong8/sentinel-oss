import * as React from 'react';

import { useNav } from '../../hooks/useNav';
import { ErrorBoundary } from '../ErrorBoundary';
import { AppShell } from './AppShell';

interface UserLayoutProps {
  children: React.ReactNode;
}

export function UserLayout({ children }: UserLayoutProps) {
  const { userNav } = useNav();

  return (
    <AppShell title="User" navItems={userNav}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </AppShell>
  );
}
