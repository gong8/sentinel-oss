import * as React from 'react';
import { Button } from './ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    // Log error to monitoring service in production
    if (import.meta.env.PROD) {
      // Could integrate with error tracking service here
    }
    // In development, errors are already shown by React's error overlay
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
          <p className="mb-4 max-w-md text-muted-foreground">
            An unexpected error occurred. Please try refreshing the page or contact support if the
            problem persists.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mb-4 max-w-lg overflow-auto rounded bg-muted p-4 text-left text-xs">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <Button onClick={this.handleReset} variant="outline">
              Try Again
            </Button>
            <Button onClick={() => window.location.reload()}>Refresh Page</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
