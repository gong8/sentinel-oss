import { Link, useLocation } from 'react-router';
import { Button } from '../components/ui/button';

export default function NotFound() {
  const location = useLocation();
  const pathname = location.pathname;

  // Determine the appropriate home link based on the current route pattern
  // Workspace routes: /admin/:workspaceSlug/*, /user/:workspaceSlug/*
  // Global routes: /global/admin/*

  let homeLink = '/login';
  let homeLabel = 'Login';

  if (pathname.startsWith('/global/admin')) {
    homeLink = '/global/admin';
    homeLabel = 'Dashboard';
  } else {
    // Check for workspace-prefixed routes: /admin/:slug/* or /user/:slug/*
    const workspaceMatch = pathname.match(/^\/(admin|user)\/([a-z0-9][a-z0-9-]*)/);
    if (workspaceMatch) {
      const [, view, slug] = workspaceMatch;
      homeLink = `/${view}/${slug}`;
      homeLabel = 'Dashboard';
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
          <h2 className="text-2xl font-semibold">Page not found</h2>
          <p className="text-muted-foreground max-w-md">
            The page{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{location.pathname}</code>{' '}
            doesn&apos;t exist.
          </p>
        </div>
        <Link to={homeLink}>
          <Button size="lg">Back to {homeLabel}</Button>
        </Link>
      </div>
    </div>
  );
}
