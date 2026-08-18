import { ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-8xl font-display font-bold text-muted-foreground/20 mb-4">404</div>
      <h1 className="text-2xl font-display font-bold mb-4">Page Not Found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved. Try searching for what you need
        or go back to the documentation home.
      </p>
      <div className="flex items-center gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to docs
        </Link>
        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
          onClick={() => {
            // Trigger search dialog via keyboard shortcut simulation
            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
            document.dispatchEvent(event);
          }}
        >
          <Search className="h-4 w-4" />
          Search docs
        </button>
      </div>
    </div>
  );
}
