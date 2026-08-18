/**
 * SettingsLLM - LLM Provider Configuration Page
 * Allows admins to configure which LLM provider the organization uses
 */

import * as React from 'react';

import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import {
  SettingsCard,
  SettingsDivider,
  SettingsItem,
} from '../../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { Slider } from '../../../components/ui/slider';
import { trpc } from '../../../lib/trpc';

export default function SettingsLLM() {
  const utils = trpc.useUtils();

  // Queries
  const providersQuery = trpc.admin.llmSettings.getProviders.useQuery();
  const configQuery = trpc.admin.llmSettings.getLlmConfig.useQuery();

  // State for form
  const [selectedProvider, setSelectedProvider] = React.useState<string>('auto');
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [apiKey, setApiKey] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [maxTokens, setMaxTokens] = React.useState(4096);
  const [temperature, setTemperature] = React.useState(0.7);
  const [isEditing, setIsEditing] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Models query - fetch when provider changes
  const modelsQuery = trpc.admin.llmSettings.listModels.useQuery(
    {
      provider: selectedProvider,
      baseUrl: baseUrl || undefined,
      apiKey: apiKey || undefined,
    },
    {
      enabled: isEditing && selectedProvider !== 'auto',
      staleTime: 30000,
    },
  );

  // Mutations
  const updateMutation = trpc.admin.llmSettings.updateLlmConfig.useMutation({
    onSuccess: () => {
      utils.admin.llmSettings.getLlmConfig.invalidate();
      setIsEditing(false);
      setSuccessMessage('LLM settings updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const testMutation = trpc.admin.llmSettings.testConnection.useMutation();

  // Usage summary (last 30 days) - stable date range to avoid re-renders
  const usageDateRange = React.useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      startDate: thirtyDaysAgo.toISOString(),
      endDate: now.toISOString(),
    };
  }, []);

  const usageSummaryQuery = trpc.admin.llmSettings.getUsageSummary.useQuery(usageDateRange);

  // Sync form with loaded config
  React.useEffect(() => {
    if (configQuery.data) {
      setSelectedProvider(configQuery.data.llmProvider);
      setSelectedModel(configQuery.data.llmModel);
      setBaseUrl(configQuery.data.llmBaseUrl ?? '');
      setMaxTokens(configQuery.data.llmMaxTokens);
      setTemperature(configQuery.data.llmTemperature);
      // Don't set apiKey from masked value
      if (configQuery.data.llmApiKeyMasked) {
        setApiKey(configQuery.data.llmApiKeyMasked);
      }
    }
  }, [configQuery.data]);

  const selectedProviderInfo = providersQuery.data?.find((p) => p.id === selectedProvider);

  function handleEdit() {
    setIsEditing(true);
    setSuccessMessage(null);
    // Reset API key to empty when editing (user must re-enter)
    if (configQuery.data?.llmApiKeyMasked) {
      setApiKey(configQuery.data.llmApiKeyMasked);
    }
  }

  function handleCancel() {
    if (configQuery.data) {
      setSelectedProvider(configQuery.data.llmProvider);
      setSelectedModel(configQuery.data.llmModel);
      setBaseUrl(configQuery.data.llmBaseUrl ?? '');
      setMaxTokens(configQuery.data.llmMaxTokens);
      setTemperature(configQuery.data.llmTemperature);
      if (configQuery.data.llmApiKeyMasked) {
        setApiKey(configQuery.data.llmApiKeyMasked);
      }
    }
    setIsEditing(false);
  }

  function handleSave() {
    updateMutation.mutate({
      llmProvider: selectedProvider,
      llmModel: selectedModel,
      llmApiKey: apiKey && !apiKey.includes('•••') ? apiKey : null,
      llmBaseUrl: baseUrl || null,
      llmMaxTokens: maxTokens,
      llmTemperature: temperature,
    });
  }

  function handleTestConnection() {
    testMutation.mutate({
      provider: selectedProvider,
      apiKey: apiKey && !apiKey.includes('•••') ? apiKey : undefined,
      baseUrl: baseUrl || undefined,
      model: selectedModel || undefined,
    });
  }

  function handleProviderChange(value: string) {
    setSelectedProvider(value);
    setSelectedModel(null);
    // Set default base URL for local providers
    const provider = providersQuery.data?.find((p) => p.id === value);
    if (provider?.defaultBaseUrl) {
      setBaseUrl(provider.defaultBaseUrl);
    } else {
      setBaseUrl('');
    }
  }

  // Loading state
  if (providersQuery.isPending || configQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="space-y-6">
          <SettingsCard title="AI / LLM Provider" description="Configure your AI model provider.">
            <div className="space-y-4">
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          </SettingsCard>
        </div>
      </SettingsPageLayout>
    );
  }

  // Error state
  if (providersQuery.error || configQuery.error) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>Failed to load LLM settings</AlertTitle>
          <AlertDescription>
            {providersQuery.error?.message || configQuery.error?.message}
          </AlertDescription>
        </Alert>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        {successMessage && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <AlertDescription className="text-green-800 dark:text-green-200">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Provider Configuration Card */}
        <SettingsCard
          title="AI / LLM Provider"
          description="Configure which AI model provider to use for the Sentinel agent."
          actions={
            isEditing ? (
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={handleEdit}>
                Edit
              </Button>
            )
          }
        >
          {/* Provider Selection */}
          <SettingsItem label="Provider" description="Select your preferred LLM provider" vertical>
            {isEditing ? (
              <Select value={selectedProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Use environment API keys)</SelectItem>
                  {providersQuery.data?.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        {provider.name}
                        {provider.isLocal && (
                          <Badge variant="secondary" className="text-xs">
                            Local
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm font-medium">
                {selectedProvider === 'auto'
                  ? 'Auto (Environment Keys)'
                  : (providersQuery.data?.find((p) => p.id === selectedProvider)?.name ??
                    selectedProvider)}
              </p>
            )}
          </SettingsItem>

          {selectedProvider !== 'auto' && (
            <>
              <SettingsDivider />

              {/* Model Selection */}
              <SettingsItem label="Model" description="Select the specific model to use" vertical>
                {isEditing ? (
                  <Select
                    value={selectedModel ?? ''}
                    onValueChange={(v) => setSelectedModel(v || null)}
                  >
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelsQuery.data?.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                      {modelsQuery.isPending && (
                        <SelectItem value="_loading" disabled>
                          Loading models...
                        </SelectItem>
                      )}
                      {modelsQuery.data?.length === 0 && !modelsQuery.isPending && (
                        <SelectItem value="_empty" disabled>
                          No models available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">
                    {selectedModel ?? <span className="text-muted-foreground">Not configured</span>}
                  </p>
                )}
              </SettingsItem>

              {/* API Key (for cloud providers) */}
              {selectedProviderInfo?.requiresApiKey && (
                <>
                  <SettingsDivider />
                  <SettingsItem
                    label="API Key"
                    description="Your provider API key (stored encrypted)"
                    vertical
                  >
                    {isEditing ? (
                      <Input
                        type="password"
                        placeholder="Enter API key"
                        className="max-w-md"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                    ) : (
                      <p className="text-sm font-medium font-mono">
                        {configQuery.data?.llmApiKeyMasked ?? (
                          <span className="text-muted-foreground">Not configured</span>
                        )}
                      </p>
                    )}
                  </SettingsItem>
                </>
              )}

              {/* Base URL (for local providers or custom) */}
              {(selectedProviderInfo?.requiresBaseUrl || selectedProvider === 'custom') && (
                <>
                  <SettingsDivider />
                  <SettingsItem label="Base URL" description="The API endpoint URL" vertical>
                    {isEditing ? (
                      <Input
                        type="url"
                        placeholder={
                          selectedProviderInfo?.defaultBaseUrl ?? 'http://localhost:1234/v1'
                        }
                        className="max-w-md"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                      />
                    ) : (
                      <p className="text-sm font-medium font-mono">
                        {baseUrl || <span className="text-muted-foreground">Not configured</span>}
                      </p>
                    )}
                  </SettingsItem>
                </>
              )}

              {/* Advanced Settings */}
              <SettingsDivider />
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start p-0 h-auto py-4"
                  >
                    <span className="text-sm font-medium">Advanced Settings</span>
                    <span className="ml-2 text-muted-foreground">{advancedOpen ? '▼' : '▶'}</span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  {/* Max Tokens */}
                  <SettingsItem
                    label="Max Tokens"
                    description="Maximum tokens for responses"
                    vertical
                  >
                    {isEditing ? (
                      <div className="max-w-md space-y-2">
                        <div className="flex items-center gap-4">
                          <Input
                            type="number"
                            min={1}
                            max={128000}
                            value={maxTokens}
                            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                            className="w-24"
                          />
                          <Slider
                            value={[maxTokens]}
                            onValueChange={(v) => setMaxTokens(v[0])}
                            min={256}
                            max={32000}
                            step={256}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">{maxTokens.toLocaleString()}</p>
                    )}
                  </SettingsItem>

                  {/* Temperature */}
                  <SettingsItem
                    label="Temperature"
                    description="Controls randomness (0 = focused, 2 = creative)"
                    vertical
                  >
                    {isEditing ? (
                      <div className="max-w-md space-y-2">
                        <div className="flex items-center gap-4">
                          <Input
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            value={temperature}
                            onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.7)}
                            className="w-24"
                          />
                          <Slider
                            value={[temperature]}
                            onValueChange={(v) => setTemperature(v[0])}
                            min={0}
                            max={2}
                            step={0.1}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">{temperature}</p>
                    )}
                  </SettingsItem>
                </CollapsibleContent>
              </Collapsible>

              {/* Test Connection */}
              {isEditing && (
                <>
                  <SettingsDivider />
                  <div className="py-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testMutation.isPending}
                    >
                      {testMutation.isPending ? 'Testing...' : 'Test Connection'}
                    </Button>
                    {testMutation.data && (
                      <p
                        className={`mt-2 text-sm ${testMutation.data.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
                      >
                        {testMutation.data.success
                          ? 'Connection successful!'
                          : 'error' in testMutation.data
                            ? testMutation.data.error
                            : 'Unknown error'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {updateMutation.error && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Update Failed</AlertTitle>
              <AlertDescription>{updateMutation.error.message}</AlertDescription>
            </Alert>
          )}
        </SettingsCard>

        {/* Usage Summary Card */}
        <SettingsCard title="Usage Summary" description="LLM usage statistics for the last 30 days">
          {usageSummaryQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-32" />
            </div>
          ) : usageSummaryQuery.error ? (
            <p className="text-sm text-muted-foreground">Unable to load usage data</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                  <p className="text-2xl font-semibold">
                    {usageSummaryQuery.data?.totalRequests.toLocaleString() ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Input Tokens</p>
                  <p className="text-2xl font-semibold">
                    {usageSummaryQuery.data?.totalInputTokens.toLocaleString() ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Output Tokens</p>
                  <p className="text-2xl font-semibold">
                    {usageSummaryQuery.data?.totalOutputTokens.toLocaleString() ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Cost</p>
                  <p className="text-2xl font-semibold">
                    ${((usageSummaryQuery.data?.totalCostCents ?? 0) / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Breakdown by provider */}
              {Object.keys(usageSummaryQuery.data?.byProvider ?? {}).length > 0 && (
                <>
                  <SettingsDivider />
                  <div>
                    <p className="text-sm font-medium mb-2">By Provider</p>
                    <div className="space-y-1">
                      {Object.entries(usageSummaryQuery.data?.byProvider ?? {}).map(
                        ([provider, data]) => (
                          <div key={provider} className="flex justify-between text-sm">
                            <span className="capitalize">{provider}</span>
                            <span className="text-muted-foreground">
                              {data.requests} requests, ${(data.costCents / 100).toFixed(2)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </SettingsCard>
      </div>
    </SettingsPageLayout>
  );
}
