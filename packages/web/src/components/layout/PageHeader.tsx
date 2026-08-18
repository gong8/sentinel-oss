import * as React from 'react';

import { useSetPageTitle } from './PageTitleContext';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  useSetPageTitle(title, description);

  // Only render if there are actions
  if (!actions) {
    return null;
  }

  return (
    <div className="flex items-start justify-end mb-6">
      <div className="flex items-start gap-2">{actions}</div>
    </div>
  );
}
