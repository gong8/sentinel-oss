import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { navigation, type NavSection } from '../lib/navigation';
import { cn } from '../lib/utils';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <nav className="h-full overflow-y-auto py-6 px-4">
      <div className="sidebar-nav">
        {navigation.map((section) => (
          <SidebarSection key={section.title} section={section} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

interface SidebarSectionProps {
  section: NavSection;
  onNavigate?: () => void;
}

function SidebarSection({ section, onNavigate }: SidebarSectionProps) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand if current page is in this section
    return section.items.some((item) => location.pathname === item.href);
  });

  const hasActiveItem = section.items.some((item) => location.pathname === item.href);

  return (
    <div className="sidebar-section">
      <button
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-sm font-semibold',
          'text-foreground hover:text-foreground/80 transition-colors rounded-md',
          hasActiveItem && 'text-brand-600 dark:text-brand-300',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          {section.icon && (
            <section.icon
              className={cn(
                'h-4 w-4 transition-colors',
                hasActiveItem
                  ? 'text-brand-600 dark:text-brand-300'
                  : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
          )}
          {section.title}
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {section.items.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn('sidebar-link', isActive && 'active')}
                onClick={onNavigate}
              >
                {item.title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
