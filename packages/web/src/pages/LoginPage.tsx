import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { clearAccessToken, setAccessToken, setIsAdmin } from '../lib/auth';
import { trpc } from '../lib/trpc';

const loginSchema = z.object({
  token: z.string().trim().min(6, 'Enter your access token.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      token: '',
    },
  });

  const validateToken = trpc.auth.validateToken.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        // Clear any existing cached data from previous session before setting new token
        // This prevents stale data from a different user appearing
        clearAccessToken();
        queryClient.clear();

        // Set new token and redirect
        setAccessToken(form.getValues('token').trim());
        setIsAdmin(data.isAdmin);
        // Always redirect to workspace selection - workspace-aware routing will handle the rest
        navigate('/select-workspace');
      } else {
        setError('Invalid access token');
      }
    },
    onError: () => {
      setError('Failed to validate token');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    setError('');
    validateToken.mutate({ accessToken: values.token });
  });

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden flex-col justify-between px-10 py-12 lg:flex">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-4 rounded-2xl bg-zinc-900 px-6 py-4">
              <img src="/logo.png" alt="Sentinel" className="h-10 w-auto" />
              <span className="font-display text-3xl font-semibold tracking-wide text-white">
                sentinel
              </span>
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
            <CardHeader className="space-y-2 border-b-0 bg-transparent text-left">
              <CardTitle className="text-2xl">Access Console</CardTitle>
              <CardDescription>Authenticate with a valid access token to continue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Sign-in failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="token">Access token</Label>
                  <Input
                    id="token"
                    type="text"
                    placeholder="Paste your access token"
                    autoComplete="off"
                    {...form.register('token')}
                  />
                  {form.formState.errors.token ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.token.message}
                    </p>
                  ) : null}
                </div>
                <Button type="submit" className="w-full" disabled={validateToken.isPending}>
                  {validateToken.isPending ? 'Validating...' : 'Enter console'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
