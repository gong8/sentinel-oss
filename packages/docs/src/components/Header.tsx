import { ExternalLink, Menu, Moon, Search, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { SearchDialog } from './SearchDialog';
import { VersionSwitcher } from './VersionSwitcher';

interface HeaderProps {
  onMenuClick?: () => void;
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="p-2 text-muted-foreground hover:text-foreground transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function Header({ onMenuClick }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const appUrl = import.meta.env.VITE_APP_URL || 'http://localhost:5173';

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 h-[var(--header-height)]',
          'border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        )}
      >
        <div className="flex h-full items-center justify-between px-4 lg:px-6">
          {/* Left: Logo and mobile menu */}
          <div className="flex items-center gap-4">
            <button className="lg:hidden" onClick={onMenuClick}>
              <Menu className="h-5 w-5" />
            </button>

            <Link to="/" className="flex items-center gap-3 group">
              <img
                src="/logo.png"
                alt="Sentinel Docs"
                className="h-6 w-6 logo-adaptive transition-opacity group-hover:opacity-80"
              />
              <span className="font-display font-bold text-xl tracking-tight">Docs</span>
            </Link>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <button
              className={cn(
                'w-full flex items-center gap-2 px-4 py-2 rounded-lg',
                'border border-border bg-muted/50 text-muted-foreground text-sm',
                'hover:bg-muted transition-colors',
              )}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Search documentation...</span>
              <kbd className="hidden lg:inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Right: Version, theme, links */}
          <div className="flex items-center gap-2 sm:gap-4">
            <VersionSwitcher />

            <ThemeToggle />

            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium',
                'bg-brand-500 text-white hover:bg-brand-600 transition-colors',
              )}
            >
              Launch App
              <ExternalLink className="h-3 w-3" />
            </a>

            {/* Mobile search button */}
            <button className="md:hidden p-2" onClick={() => setSearchOpen(true)}>
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
