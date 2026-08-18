import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';

import { usePreferences } from '../../hooks/PreferencesContext';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { clearAccessToken } from '../../lib/auth';
import { cn } from '../../lib/utils';
import { CommandPalette } from '../CommandPalette';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { PageTitleProvider, usePageTitle } from './PageTitleContext';
import { WorkspaceModeTabs } from './WorkspaceModeTabs';

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  /** Additional paths that should mark this nav item as active */
  relatedPaths?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
  /** Renders as direct link(s) without collapsible section */
  standalone?: boolean;
}

export interface Tab {
  to: string;
  label: string;
  end?: boolean;
}

interface AppShellProps {
  title: string;
  navItems?: NavItem[];
  navGroups?: NavGroup[];
  children: React.ReactNode;
}

const STORAGE_KEY = 'admin-nav-collapsed';

// Schema for validating stored collapsed state from localStorage
const collapsedStateSchema = z.record(z.string(), z.boolean());

function getStoredCollapsedState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      const result = collapsedStateSchema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return {};
}

function setStoredCollapsedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function NavItemLink({ item }: { item: NavItem }) {
  const location = useLocation();

  // Check if this item is active, including related paths
  const isActive = React.useMemo(() => {
    const pathname = location.pathname;
    // Exact match for end routes, prefix match otherwise
    if (item.end) {
      if (pathname === item.to) return true;
    } else {
      if (pathname === item.to || pathname.startsWith(item.to + '/')) return true;
    }
    // Check related paths
    if (item.relatedPaths?.some((rp) => pathname === rp || pathname.startsWith(rp + '/'))) {
      return true;
    }
    return false;
  }, [location.pathname, item.to, item.end, item.relatedPaths]);

  return (
    <NavLink
      to={item.to}
      className={cn(
        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
        isActive
          ? 'bg-primary/10 text-foreground before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-primary'
          : 'hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {item.label}
    </NavLink>
  );
}

function NavSection({
  group,
  isOpen,
  onToggle,
  hiddenItems,
}: {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  hiddenItems: string[];
}) {
  const visibleItems = group.items.filter((item) => !hiddenItems.includes(item.to));

  if (visibleItems.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
        {group.label}
        <span
          className={cn(
            'text-[10px] transition-transform duration-200',
            isOpen ? 'rotate-180' : '',
          )}
        >
          ▼
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5 pl-1">
        {visibleItems.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function useCommandPaletteShortcut() {
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K on Mac, Ctrl+K on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isOpen, setIsOpen };
}

function getShortcutLabel(): string {
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  return isMac ? '⌘K' : 'Ctrl+K';
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AppShellHeader({
  shortcutLabel,
  onOpenPalette,
}: {
  shortcutLabel: string;
  onOpenPalette: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const { title, description } = usePageTitle();
  const { workspaces, isOrgOwner } = useWorkspace();

  // Hide workspace switcher if user has only one workspace and is not an org owner
  // Org owners can still switch to global view even with one workspace
  const showWorkspaceSwitcher = isOrgOwner || (workspaces && workspaces.length > 1);

  const handleSignOut = () => {
    clearAccessToken();
    queryClient.clear(); // Clear all cached data to prevent stale user data on next login
    navigate('/login');
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/70 px-6 py-4 backdrop-blur transition-colors duration-300 ease-in-out">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <InfoIcon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p>{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenPalette}
          className="rounded border border-border/60 bg-secondary/50 px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {shortcutLabel}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="text-xs font-semibold uppercase tracking-[0.2em]"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
        {showWorkspaceSwitcher && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/select-workspace', { state: { forceShow: true } })}
          >
            Change Workspace
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}

function initializeCollapsedState(
  navGroups: NavGroup[] | undefined,
  pathname: string,
): Record<string, boolean> {
  const stored = getStoredCollapsedState();

  if (!navGroups) {
    return stored;
  }

  const initial: Record<string, boolean> = {};
  for (const group of navGroups) {
    const containsActiveRoute = group.items.some((item) => {
      // Check direct path match
      if (pathname === item.to || (!item.end && pathname.startsWith(item.to + '/'))) {
        return true;
      }
      // Check related paths
      if (item.relatedPaths?.some((rp) => pathname === rp || pathname.startsWith(rp + '/'))) {
        return true;
      }
      return false;
    });

    if (containsActiveRoute) {
      initial[group.label] = false;
    } else if (stored[group.label] !== undefined) {
      initial[group.label] = stored[group.label];
    } else {
      initial[group.label] = !group.defaultOpen;
    }
  }
  return initial;
}

export function AppShell({ title, navItems, navGroups, children }: AppShellProps) {
  const location = useLocation();
  const { preferences } = usePreferences();
  const { selectedWorkspaceSlug } = useWorkspace();
  const { isOpen: isPaletteOpen, setIsOpen: setIsPaletteOpen } = useCommandPaletteShortcut();

  const [sidebarHovered, setSidebarHovered] = React.useState(false);
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>(() =>
    initializeCollapsedState(navGroups, location.pathname),
  );

  const handleToggleSection = React.useCallback((label: string) => {
    setCollapsedSections((prev) => {
      const updated = { ...prev, [label]: !prev[label] };
      setStoredCollapsedState(updated);
      return updated;
    });
  }, []);

  const shortcutLabel = getShortcutLabel();

  const isCompactMode = preferences.sidebarCompact;
  const sidebarVisible = !isCompactMode || sidebarHovered;
  const hiddenItems = preferences.hiddenNavItems;
  const visibleNavItems = navItems?.filter((item) => !hiddenItems.includes(item.to));

  function getSidebarClasses(): string {
    if (!isCompactMode) {
      return 'md:w-72';
    }
    if (sidebarVisible) {
      return 'md:w-72 md:fixed md:left-0 md:top-0 md:bottom-0 md:z-50 md:shadow-xl';
    }
    return 'md:w-0 md:overflow-hidden md:border-r-0';
  }

  return (
    <PageTitleProvider>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300 ease-in-out">
        <div className="flex min-h-screen flex-col md:flex-row">
          {/* Sidebar hover trigger zone for compact mode */}
          {isCompactMode && !sidebarHovered && (
            <div
              className="fixed left-0 top-0 z-40 h-full w-4 md:block hidden"
              onMouseEnter={() => setSidebarHovered(true)}
            />
          )}

          <aside
            onMouseEnter={() => isCompactMode && setSidebarHovered(true)}
            onMouseLeave={() => isCompactMode && setSidebarHovered(false)}
            className={cn(
              'relative flex flex-col border-b border-border/70 bg-card/80 backdrop-blur md:border-b-0 md:border-r transition-all duration-300 ease-in-out',
              getSidebarClasses(),
            )}
          >
            <div
              className={cn(
                'border-b border-border/70 px-5 py-5 transition-[opacity,border-color] duration-300 ease-in-out',
                !sidebarVisible && 'opacity-0',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
                  <img src="/logo.png" alt="Sentinel" className="h-6 w-auto" />
                </div>
                <div className="text-lg font-semibold tracking-tight text-foreground">{title}</div>
              </div>
            </div>
            {selectedWorkspaceSlug && (
              <div
                className={cn(
                  'flex justify-center border-b border-border/70 px-4 py-3 transition-opacity duration-300 ease-in-out',
                  !sidebarVisible && 'opacity-0',
                )}
              >
                <WorkspaceModeTabs workspaceSlug={selectedWorkspaceSlug} />
              </div>
            )}
            <nav
              className={cn(
                'flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 transition-opacity duration-200',
                !sidebarVisible && 'opacity-0',
              )}
            >
              {navGroups ? (
                // Grouped navigation
                navGroups.map((group) => {
                  const visibleGroupItems = group.items.filter(
                    (item) => !hiddenItems.includes(item.to),
                  );

                  if (visibleGroupItems.length === 0) return null;

                  return group.standalone ? (
                    // Standalone items render directly without collapsible wrapper
                    <div key={group.label} className="space-y-0.5">
                      {visibleGroupItems.map((item) => (
                        <NavItemLink key={item.to} item={item} />
                      ))}
                    </div>
                  ) : (
                    <NavSection
                      key={group.label}
                      group={group}
                      isOpen={!collapsedSections[group.label]}
                      onToggle={() => handleToggleSection(group.label)}
                      hiddenItems={hiddenItems}
                    />
                  );
                })
              ) : visibleNavItems ? (
                // Flat navigation
                <div className="flex flex-1 items-center gap-2 overflow-x-auto md:flex-col md:items-stretch md:gap-1 md:overflow-visible">
                  {visibleNavItems.map((item) => (
                    <NavItemLink key={item.to} item={item} />
                  ))}
                </div>
              ) : null}
            </nav>
          </aside>

          <div className="flex flex-1 flex-col transition-all duration-300 ease-in-out">
            <AppShellHeader
              shortcutLabel={shortcutLabel}
              onOpenPalette={() => setIsPaletteOpen(true)}
            />
            <main className="flex-1 px-6 py-8 lg:px-10 animate-page-in">{children}</main>
          </div>
        </div>

        <CommandPalette open={isPaletteOpen} onOpenChange={setIsPaletteOpen} />
      </div>
    </PageTitleProvider>
  );
}
