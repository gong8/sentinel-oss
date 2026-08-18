import { createContext, useContext, useState } from 'react';
import { cn } from '../lib/utils';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  defaultValue: string;
  children: React.ReactNode;
}

export function Tabs({ defaultValue, children }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="my-6">{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: React.ReactNode;
}

export function TabList({ children }: TabListProps) {
  return (
    <div className="flex gap-1 border-b border-border mb-4" role="tablist">
      {children}
    </div>
  );
}

interface TabTriggerProps {
  value: string;
  children: React.ReactNode;
}

export function TabTrigger({ value, children }: TabTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabTrigger must be used within Tabs');

  const isActive = context.activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => context.setActiveTab(value)}
      className={cn(
        'px-4 py-2 text-sm font-medium transition-colors',
        'border-b-2 -mb-[1px]',
        isActive
          ? 'border-brand-600 dark:border-brand-300 text-brand-600 dark:text-brand-300'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
      )}
    >
      {children}
    </button>
  );
}

interface TabContentProps {
  value: string;
  children: React.ReactNode;
}

export function TabContent({ value, children }: TabContentProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabContent must be used within Tabs');

  if (context.activeTab !== value) return null;

  return <div role="tabpanel">{children}</div>;
}
