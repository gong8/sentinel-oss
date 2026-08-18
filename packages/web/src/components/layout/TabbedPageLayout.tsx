import * as React from 'react';
import { NavLink } from 'react-router';

import { cn } from '../../lib/utils';
import { AdminLayout } from './AdminLayout';
import type { Tab } from './AppShell';

interface TabbedPageLayoutProps {
  tabs: Tab[];
  ariaLabel: string;
  children: React.ReactNode;
}

export function TabbedPageLayout({ tabs, ariaLabel, children }: TabbedPageLayoutProps) {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="border-b border-border -mx-6 px-6 lg:-mx-10 lg:px-10">
          <nav className="flex gap-6" aria-label={ariaLabel}>
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </AdminLayout>
  );
}
