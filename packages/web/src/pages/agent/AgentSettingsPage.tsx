/**
 * Agent Settings Page
 * User's LLM configuration for the workspace agent
 */

import { ArrowLeft, Check, Key, Plus, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { AdminLayout } from '../../components/layout/AdminLayout';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { trpc } from '../../lib/trpc';

export default function AgentSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    selectedWorkspaceId: workspaceId,
    selectedWorkspaceSlug,
    isLoading: isWorkspaceLoading,
  } = useWorkspace();

  // Determine if we're in admin or user mode based on URL
  const routeType = location.pathname.startsWith('/admin/') ? 'admin' : 'user';
  const [provider, setProvider] = React.useState<string>('CLAUDE');
  const [apiKey, setApiKey] = React.useState('');
  const [model, setModel] = React.useState<string>('_default');
  const [newToolName, setNewToolName] = React.useState('');
  const utils = trpc.useUtils();

  // Fetch available providers and models
  const { data: providers } = trpc.user.llmConfig.getProviders.useQuery();

  // Fetch existing config - only when workspaceId is available
  const { data: config, isLoading } = trpc.user.llmConfig.get.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: Boolean(workspaceId) },
  );

  // Fetch always-allow tools and skip confirmation setting
  const { data: alwaysAllowData } = trpc.user.llmConfig.getAlwaysAllowTools.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: Boolean(workspaceId) },
  );

  const alwaysAllowTools = alwaysAllowData?.tools ?? [];
  const skipToolConfirmation = alwaysAllowData?.skipToolConfirmation ?? false;

  // Set config mutation
  const setConfigMutation = trpc.user.llmConfig.set.useMutation({
    onSuccess: () => {
      toast.success('LLM configuration saved');
      setApiKey('');
      if (workspaceId) {
        utils.user.llmConfig.get.invalidate({ workspaceId });
      }
    },
  });

  // Remove config mutation
  const removeConfigMutation = trpc.user.llmConfig.remove.useMutation({
    onSuccess: () => {
      toast.success('LLM configuration removed');
      if (workspaceId) {
        utils.user.llmConfig.get.invalidate({ workspaceId });
      }
    },
  });

  // Remove tool from always-allow mutation
  const removeToolMutation = trpc.user.llmConfig.removeToolFromAlwaysAllow.useMutation({
    onSuccess: () => {
      toast.success('Tool removed from always-allow list');
      if (workspaceId) {
        void utils.user.llmConfig.getAlwaysAllowTools.invalidate({ workspaceId });
      }
    },
  });

  // Add tool to always-allow mutation
  const addToolMutation = trpc.user.llmConfig.addToolToAlwaysAllow.useMutation({
    onSuccess: () => {
      toast.success('Tool added to always-allow list');
      setNewToolName('');
      if (workspaceId) {
        void utils.user.llmConfig.getAlwaysAllowTools.invalidate({ workspaceId });
      }
    },
  });

  // Toggle skip tool confirmation mutation
  const setSkipToolConfirmationMutation = trpc.user.llmConfig.setSkipToolConfirmation.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.skipToolConfirmation
          ? 'All tools will now execute without confirmation'
          : 'Tool confirmations re-enabled',
      );
      if (workspaceId) {
        void utils.user.llmConfig.getAlwaysAllowTools.invalidate({ workspaceId });
      }
    },
  });

  // Set initial values from config
  React.useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setModel(config.model ?? '_default');
    }
  }, [config]);

  const handleSave = () => {
    if (!workspaceId || !apiKey) return;

    setConfigMutation.mutate({
      workspaceId,
      provider: provider as 'CLAUDE' | 'OPENAI' | 'GEMINI',
      apiKey,
      model: model === '_default' ? undefined : model,
    });
  };

  const handleRemove = () => {
    if (!workspaceId) return;
    removeConfigMutation.mutate({ workspaceId });
  };

  const handleRemoveTool = (toolName: string) => {
    if (!workspaceId) return;
    removeToolMutation.mutate({ workspaceId, toolName });
  };

  const handleAddTool = () => {
    if (!workspaceId || !newToolName.trim()) return;
    addToolMutation.mutate({ workspaceId, toolName: newToolName.trim() });
  };

  const handleToggleSkipConfirmation = (checked: boolean) => {
    if (!workspaceId) return;
    setSkipToolConfirmationMutation.mutate({ workspaceId, skipToolConfirmation: checked });
  };

  // Find the selected provider from fetched data (provider state is uppercase, API returns lowercase)
  const selectedProvider = providers?.find((p) => p.id.toUpperCase() === provider);

  // Show loading state while workspace context is loading
  if (isWorkspaceLoading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  // Don't render if no workspace is selected
  if (!workspaceId) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Please select a workspace to configure Agent settings.
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container max-w-2xl py-6 space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2"
            onClick={() => navigate(`/${routeType}/${selectedWorkspaceSlug}/agent`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Agent
          </Button>
          <h1 className="text-2xl font-bold">Agent Settings</h1>
          <p className="text-muted-foreground">
            Configure your LLM provider and API key for the workspace agent.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              LLM Configuration
            </CardTitle>
            <CardDescription>
              Your API key is encrypted and stored securely. It&apos;s used to make requests to the
              LLM on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                {config?.hasApiKey && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-700 dark:text-green-400">
                      API key configured for {config.provider}
                      {config.model && ` (${config.model})`}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers?.map((p) => (
                        <SelectItem key={p.id} value={p.id.toUpperCase()}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={config?.hasApiKey ? '••••••••••••••••' : 'Enter your API key'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {provider === 'CLAUDE' && 'Get your API key from console.anthropic.com'}
                    {provider === 'OPENAI' && 'Get your API key from platform.openai.com'}
                    {provider === 'GEMINI' && 'Get your API key from aistudio.google.com'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Model (optional)</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Use default model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_default">Use default</SelectItem>
                      {selectedProvider?.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={!apiKey || setConfigMutation.isPending}>
                    {setConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
                  </Button>
                  {config?.hasApiKey && (
                    <Button
                      variant="outline"
                      onClick={handleRemove}
                      disabled={removeConfigMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool Confirmations</CardTitle>
            <CardDescription>
              Control which tools require confirmation before execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Skip all confirmations toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="skip-confirmation" className="text-base">
                  Skip all tool confirmations
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, all tools will execute immediately without asking for confirmation.
                </p>
              </div>
              <Switch
                id="skip-confirmation"
                checked={skipToolConfirmation}
                onCheckedChange={handleToggleSkipConfirmation}
                disabled={setSkipToolConfirmationMutation.isPending}
              />
            </div>

            {/* Always-allow tools section */}
            <div className={skipToolConfirmation ? 'opacity-50 pointer-events-none' : ''}>
              <div className="mb-3">
                <Label className="text-base">Always-Allow Tools</Label>
                <p className="text-sm text-muted-foreground">
                  Specific tools that will execute without confirmation. Add tools by their full
                  name (e.g., &quot;server::tool_name&quot;).
                </p>
              </div>

              {/* Add tool input */}
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="server::tool_name"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTool();
                    }
                  }}
                  disabled={skipToolConfirmation}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddTool}
                  disabled={
                    !newToolName.trim() || addToolMutation.isPending || skipToolConfirmation
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Tool list */}
              {alwaysAllowTools.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {alwaysAllowTools.map((tool) => {
                    const parts = tool.split('::');
                    const displayName = parts.length > 1 ? parts[1] : tool;
                    return (
                      <Badge key={tool} variant="secondary" className="pr-1" title={tool}>
                        {displayName}
                        <button
                          onClick={() => handleRemoveTool(tool)}
                          className="ml-1 p-0.5 rounded hover:bg-muted"
                          disabled={removeToolMutation.isPending || skipToolConfirmation}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tools in always-allow list. Add tools above or choose to always allow when
                  confirming a tool execution.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
