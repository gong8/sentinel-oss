import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { getCurrentVersion, versions, type Version } from '../lib/versions';

export function VersionSwitcher() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const currentVersion = getCurrentVersion(location.pathname);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleVersionSelect = (version: Version) => {
    // Replace version in current path
    const pathParts = location.pathname.split('/').filter(Boolean);

    // Check if path has a version segment
    const versionIndex = pathParts.findIndex(
      (part) => part.startsWith('v') && !isNaN(Number(part.slice(1))),
    );

    if (versionIndex !== -1) {
      pathParts[versionIndex] = version.id;
    } else {
      // Insert version after /docs
      const docsIndex = pathParts.findIndex((part) => part === 'docs');
      if (docsIndex !== -1) {
        pathParts.splice(docsIndex + 1, 0, version.id);
      }
    }

    navigate('/' + pathParts.join('/'));
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md text-sm',
          'hover:bg-muted transition-colors',
        )}
      >
        <span className={cn('version-badge', currentVersion.isLatest && 'latest')}>
          {currentVersion.label}
          {currentVersion.isLatest && ' (latest)'}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-card shadow-lg overflow-hidden z-50">
          <div className="py-1">
            {versions.map((version) => (
              <button
                key={version.id}
                onClick={() => handleVersionSelect(version)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-sm',
                  'hover:bg-accent transition-colors',
                  currentVersion.id === version.id && 'bg-accent',
                )}
              >
                <div className="flex items-center gap-2">
                  <span>{version.label}</span>
                  {version.isLatest && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">
                      latest
                    </span>
                  )}
                </div>
                {currentVersion.id === version.id && (
                  <Check className="h-4 w-4 text-brand-600 dark:text-brand-300" />
                )}{' '}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
