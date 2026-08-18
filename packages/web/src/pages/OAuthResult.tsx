import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export default function OAuthResult() {
  const [searchParams] = useSearchParams();

  const serverName = searchParams.get('server')
    ? decodeURIComponent(searchParams.get('server')!)
    : '';
  const statusParam = searchParams.get('status');
  const errorParam = searchParams.get('error');
  const toolsDiscoveredParam = searchParams.get('toolsDiscovered');
  const discoveryErrorParam = searchParams.get('discoveryError');

  const toolsDiscovered = toolsDiscoveredParam ? parseInt(toolsDiscoveredParam, 10) : undefined;
  const discoveryError = discoveryErrorParam ? decodeURIComponent(discoveryErrorParam) : undefined;

  const status =
    statusParam === 'success'
      ? 'success'
      : statusParam === 'error' || errorParam
        ? 'error'
        : 'loading';

  const message =
    status === 'error' ? decodeURIComponent(errorParam || 'Unknown error occurred') : '';

  useEffect(() => {
    if (status === 'success' && window.opener) {
      // Communicate success to opener window to refresh data and show discovery modal
      // Use current origin instead of '*' for security
      window.opener.postMessage(
        {
          type: 'OAUTH_SUCCESS',
          serverName,
          toolsDiscovered,
          discoveryError,
        },
        window.location.origin,
      );
    }
  }, [status, serverName, toolsDiscovered, discoveryError]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background styling matching LoginPage */}
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden flex-col justify-between px-10 py-12 lg:flex">
          <div className="space-y-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              Sentinel
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                Secure MCP Gateway
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Control plane for policy, audit, and credential governance.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Maintain centralized control across MCP servers and agent access.
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12 animate-page-in">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-2 border-b-0 bg-transparent text-left items-center text-center">
              {status === 'loading' && (
                <div className="mb-2">
                  <div className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              )}
              <CardTitle className="text-2xl">
                {status === 'success'
                  ? 'Authentication Successful'
                  : status === 'error'
                    ? 'Authentication Failed'
                    : 'Processing...'}
              </CardTitle>
              <CardDescription>
                {status === 'success'
                  ? `Successfully authenticated with ${serverName || 'the service'}.`
                  : 'There was a problem connecting to the OAuth provider.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-center">
              {status === 'success' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Your credentials have been securely stored. It is now safe to close this tab and
                    return to the application.
                  </p>
                </div>
              )}

              {status === 'error' && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-destructive">{message}</p>
                  <p className="text-sm text-muted-foreground">
                    Please close this tab and try again from the application.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
