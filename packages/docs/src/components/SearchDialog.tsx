import { FileText, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchDocs, type SearchResult } from '../lib/search';
import { cn } from '../lib/utils';

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (query.length > 1) {
      const searchResults = searchDocs(query);
      setResults(searchResults);
      setSelectedIndex(0);
    } else {
      setResults([]);
    }
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.slug);
    onOpenChange(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-[15%] -translate-x-1/2 w-full max-w-lg">
        <div className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation..."
              className="flex-1 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Results */}
          {query.length > 1 && (
            <div className="max-h-80 overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground">
                  No results found for "{query}"
                </div>
              ) : (
                <ul className="py-2">
                  {results.map((result, index) => (
                    <li key={result.slug}>
                      <button
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                          index === selectedIndex && 'bg-accent',
                        )}
                      >
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{result.title}</p>
                          <p className="text-sm text-muted-foreground truncate">{result.section}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Footer hints */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted">↵</kbd>
              to select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted">↑↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted">esc</kbd>
              to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
