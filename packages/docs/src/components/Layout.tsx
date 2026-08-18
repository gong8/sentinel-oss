import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TableOfContents } from './TableOfContents';

interface LayoutProps {
  children?: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      {/* Spacer for fixed header */}
      <div className="h-[var(--header-height)]" />

      <div className="flex">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed left-0 top-[var(--header-height)] z-40 h-[calc(100vh-var(--header-height))]',
            'w-[var(--sidebar-width)] border-r border-border bg-background overflow-y-auto',
            'transition-transform duration-200 ease-in-out',
            'lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Mobile close button */}
          <button
            className="absolute right-4 top-4 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>

          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </aside>

        {/* Main content */}
        <main
          className={cn(
            'flex-1 min-h-[calc(100vh-var(--header-height))]',
            'lg:ml-[var(--sidebar-width)]',
          )}
        >
          <div className="flex">
            {/* Content area */}
            <div className="flex-1 px-6 py-8 lg:px-12">
              <div className="mx-auto max-w-[var(--content-max-width)]">
                <article className="docs-content">{children ?? <Outlet />}</article>
              </div>
            </div>

            {/* Table of contents (desktop only) */}
            <div className="hidden xl:block w-[var(--toc-width)] flex-shrink-0 px-4 py-8">
              <div className="sticky top-[calc(var(--header-height)+2rem)]">
                <TableOfContents />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile menu button (fixed) */}
      <button
        className={cn(
          'fixed bottom-6 right-6 z-50 p-4 rounded-full',
          'bg-brand-500 text-white shadow-lg',
          'lg:hidden',
          sidebarOpen && 'hidden',
        )}
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>
    </div>
  );
}
