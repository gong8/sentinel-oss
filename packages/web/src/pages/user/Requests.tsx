import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { UserLayout } from '../../components/layout/UserLayout';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { getRequestStatusColor } from '../../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { formatToolNameForDisplay, getDomainPrefix } from '../../lib/mcpUtils';
import { trpc } from '../../lib/trpc';

const toolSelectionSchema = z.object({
  server: z.string().min(1, 'Please select an MCP server'),
  tool: z.string().min(1, 'Please select a tool'),
});

const requestSchema = z.object({
  tools: z.array(toolSelectionSchema).min(1, 'Add at least one tool'),
  reason: z.string().min(8, 'Tell us why you need access.'),
});

// Analysis result types
interface ToolAnalysisResult {
  toolName: string;
  hasAccess: boolean;
  blockedByDeny: boolean;
  blockingPolicyId: string | null;
}

const mcpRequestSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  url: z.string().url('Invalid URL'),
  authType: z.enum(['NONE', 'OAUTH', 'API_KEY']),
  apiKey: z.string().optional(),
  reason: z.string().min(8, 'Tell us why you need this server.'),
  alsoRequestTools: z.boolean(),
});

type RequestValues = z.infer<typeof requestSchema>;
type McpRequestValues = z.infer<typeof mcpRequestSchema>;

// Type guard for MCP auth type values
type McpAuthTypeValue = 'NONE' | 'OAUTH' | 'API_KEY';
const MCP_AUTH_TYPE_SET: ReadonlySet<string> = new Set<McpAuthTypeValue>([
  'NONE',
  'OAUTH',
  'API_KEY',
]);
function isMcpAuthType(value: unknown): value is McpAuthTypeValue {
  return typeof value === 'string' && MCP_AUTH_TYPE_SET.has(value);
}

interface McpServerRequestData {
  name?: string;
  url?: string;
  authType?: string;
}

function isMcpServerRequestData(value: unknown): value is McpServerRequestData {
  if (!value || typeof value !== 'object') return false;
  // Use 'in' operator to check properties safely
  const hasValidName = !('name' in value) || typeof value.name === 'string';
  const hasValidUrl = !('url' in value) || typeof value.url === 'string';
  const hasValidAuthType = !('authType' in value) || typeof value.authType === 'string';
  return hasValidName && hasValidUrl && hasValidAuthType;
}

function getMcpServerData(data: unknown): McpServerRequestData | null {
  return isMcpServerRequestData(data) ? data : null;
}

// Simplified permission request type to avoid deep type instantiation
interface UserPermissionRequest {
  id: string;
  type: string;
  status: string;
  toolNames: string[];
  reason: string | null;
  data: unknown;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

// Helper to break deep type instantiation chain
function getUserRequests<
  T extends Array<{
    id: string;
    type: unknown;
    status: unknown;
    toolNames: string[];
    reason: string | null;
    data: unknown;
    createdAt: unknown;
    reviewedAt: unknown;
    reviewNote: string | null;
  }>,
>(data: T | undefined): UserPermissionRequest[] | undefined {
  if (!data) return undefined;
  return data.map((r) => ({
    id: r.id,
    type: String(r.type),
    status: String(r.status),
    toolNames: r.toolNames,
    reason: r.reason,
    data: r.data,
    createdAt: String(r.createdAt),
    reviewedAt: r.reviewedAt ? String(r.reviewedAt) : null,
    reviewNote: r.reviewNote,
  }));
}

export default function UserRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const utils = trpc.useUtils();
  const { selectedWorkspaceId } = useWorkspace();
  const requestsQuery = trpc.user.permissionRequests.list.useQuery();
  const requests = getUserRequests(requestsQuery.data);
  const toolsQuery = trpc.user.tools.list.useQuery();
  const createMutation = trpc.user.permissionRequests.create.useMutation({
    onSuccess: () => {
      utils.user.permissionRequests.list.invalidate();
      setSearchParams({});
    },
  });

  const [toolRequestOpen, setToolRequestOpen] = useState(false);
  const [mcpRequestOpen, setMcpRequestOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [requestToWithdraw, setRequestToWithdraw] = useState<string | null>(null);

  // Tool analysis state
  const [toolAnalysis, setToolAnalysis] = useState<ToolAnalysisResult[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Auth type detection state
  const [authDetection, setAuthDetection] = useState<{
    status: 'idle' | 'probing' | 'detected' | 'error';
    detectedType: 'NONE' | 'OAUTH' | 'API_KEY' | null;
    reason: string | null;
    overrideEnabled: boolean;
  }>({
    status: 'idle',
    detectedType: null,
    reason: null,
    overrideEnabled: false,
  });

  // Refs for detection
  const probeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overrideEnabledRef = useRef(authDetection.overrideEnabled);
  const lastProbedUrlRef = useRef<string | null>(null);

  // Sync ref
  useEffect(() => {
    overrideEnabledRef.current = authDetection.overrideEnabled;
  }, [authDetection.overrideEnabled]);

  const withdrawMutation = trpc.user.permissionRequests.withdraw.useMutation({
    onSuccess: () => {
      utils.user.permissionRequests.list.invalidate();
      setWithdrawDialogOpen(false);
      setRequestToWithdraw(null);
    },
  });

  const probeAuthTypeMutation = trpc.user.permissionRequests.probeAuthType.useMutation();

  // Reset mutation error when opening modals
  const handleOpenToolRequest = (open: boolean) => {
    setToolRequestOpen(open);
    if (open) {
      createMutation.reset();
      setToolAnalysis(null);
      setIsAnalyzing(false);
    }
  };

  const handleOpenMcpRequest = (open: boolean) => {
    setMcpRequestOpen(open);
    if (open) {
      createMutation.reset();
      setAuthDetection({
        status: 'idle',
        detectedType: null,
        reason: null,
        overrideEnabled: false,
      });
      lastProbedUrlRef.current = null;
    }
  };

  const handleOpenWithdrawDialog = (open: boolean) => {
    setWithdrawDialogOpen(open);
    if (open) {
      withdrawMutation.reset();
    } else {
      setRequestToWithdraw(null);
    }
  };

  // --- Tool Request Form ---
  const toolForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      tools: [{ server: '', tool: '' }],
      reason: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: toolForm.control,
    name: 'tools',
  });
  const watchedTools = useWatch({
    control: toolForm.control,
    name: 'tools',
  });

  // Pre-fill tool name from URL
  const prefilledToolName = searchParams.get('toolNames') || '';
  const prefilledBlockedByDeny = searchParams.get('blockedByDeny') === 'true';
  const prefilledPolicyId = searchParams.get('policyId');
  useEffect(() => {
    if (prefilledToolName && toolsQuery.data && !toolRequestOpen) {
      // Clear URL params immediately to prevent reopening after modal closes
      setSearchParams({});

      // Pre-fill the form with the tool data
      const parts = prefilledToolName.split('::');
      if (parts.length === 2) {
        const [domainPart, toolPart] = parts;
        for (const server of toolsQuery.data) {
          const domainPrefix = getDomainPrefix(server.serverUrl);
          if (domainPart === domainPrefix) {
            toolForm.setValue('tools', [
              {
                server: server.serverName,
                tool: toolPart === '*' ? '*' : toolPart,
              },
            ]);
            break;
          }
        }
      }

      // Schedule state update after render to avoid cascading renders
      const timer = setTimeout(() => {
        // Reset mutation state to clear any previous errors
        createMutation.reset();
        setIsAnalyzing(false);

        // If tool is blocked by DENY policy, show DENY_REMOVAL UI immediately
        if (prefilledBlockedByDeny && prefilledPolicyId) {
          setToolAnalysis([
            {
              toolName: prefilledToolName,
              hasAccess: false,
              blockedByDeny: true,
              blockingPolicyId: prefilledPolicyId,
            },
          ]);
        }
        setToolRequestOpen(true);
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [
    prefilledToolName,
    prefilledBlockedByDeny,
    prefilledPolicyId,
    toolsQuery.data,
    toolForm,
    toolRequestOpen,
    setSearchParams,
    createMutation,
  ]);

  const submitToolRequest = toolForm.handleSubmit(async (values) => {
    if (!toolsQuery.data) return;

    // Build original tool patterns (preserving wildcards for the request)
    const originalToolPatterns: string[] = [];
    // Expand wildcards to individual tools for proper analysis
    const expandedToolNames: string[] = [];

    for (const tool of values.tools) {
      const server = toolsQuery.data.find((s) => s.serverName === tool.server);
      if (!server) {
        originalToolPatterns.push(`${tool.server}::${tool.tool}`);
        expandedToolNames.push(`${tool.server}::${tool.tool}`);
        continue;
      }
      const domainPrefix = getDomainPrefix(server.serverUrl);

      // Always add the original pattern (with * if selected)
      originalToolPatterns.push(`${domainPrefix}::${tool.tool}`);

      if (tool.tool === '*') {
        // Expand wildcard to all individual tools on this server for analysis
        for (const t of server.tools) {
          expandedToolNames.push(`${domainPrefix}::${t.name}`);
        }
      } else {
        expandedToolNames.push(`${domainPrefix}::${tool.tool}`);
      }
    }

    // Step 1: Analyze expanded tools to detect DENY-blocked ones
    setIsAnalyzing(true);
    try {
      const analysis = await utils.user.permissionRequests.analyzeToolAccess.fetch({
        toolNames: expandedToolNames,
      });
      setToolAnalysis(analysis.tools);

      // Check for DENY-blocked tools
      const denyBlockedTools = analysis.tools.filter((t: ToolAnalysisResult) => t.blockedByDeny);

      if (denyBlockedTools.length > 0) {
        // Tools are blocked by DENY - stay in modal to show analysis and allow DENY_REMOVAL request
        setIsAnalyzing(false);
        return;
      }

      // Check if any tools need access
      const toolsNeedingAccess = analysis.tools.filter(
        (t: ToolAnalysisResult) => !t.hasAccess && !t.blockedByDeny,
      );

      if (toolsNeedingAccess.length === 0) {
        // All tools already have access
        setIsAnalyzing(false);
        return;
      }

      // Proceed with TOOL_ACCESS request using ORIGINAL patterns (preserving wildcards)
      createMutation.mutate(
        {
          type: 'TOOL_ACCESS',
          toolNames: originalToolPatterns,
          reason: values.reason,
        },
        {
          onSuccess: () => {
            toolForm.reset({ tools: [{ server: '', tool: '' }], reason: '' });
            setToolAnalysis(null);
            handleOpenToolRequest(false);
          },
          onSettled: () => {
            setIsAnalyzing(false);
          },
        },
      );
    } catch {
      setIsAnalyzing(false);
    }
  });

  // Submit DENY_REMOVAL request
  const submitDenyRemovalRequest = (policyId: string, toolNames: string[], reason: string) => {
    createMutation.mutate(
      {
        type: 'DENY_REMOVAL',
        toolNames,
        reason,
        data: { policyId },
      },
      {
        onSuccess: () => {
          toolForm.reset({ tools: [{ server: '', tool: '' }], reason: '' });
          setToolAnalysis(null);
          handleOpenToolRequest(false);
        },
      },
    );
  };

  // --- MCP Request Form ---
  const mcpForm = useForm<McpRequestValues>({
    resolver: zodResolver(mcpRequestSchema),
    defaultValues: {
      name: '',
      url: '',
      authType: 'NONE',
      apiKey: '',
      reason: '',
      alsoRequestTools: false,
    },
  });
  const watchedAuthType = useWatch({ control: mcpForm.control, name: 'authType' });
  const mcpUrl = useWatch({ control: mcpForm.control, name: 'url' });

  // Probe auth type
  const probeAuth = useCallback(
    (url: string) => {
      if (lastProbedUrlRef.current === url) return;
      lastProbedUrlRef.current = url;

      setAuthDetection((prev) => ({
        ...prev,
        status: 'probing',
        detectedType: null,
        reason: null,
      }));

      probeAuthTypeMutation.mutate(
        { url },
        {
          onSuccess: (result) => {
            if (result.detectionFailed || !result.suggestedAuthType) {
              setAuthDetection((prev) => ({
                ...prev,
                status: 'error',
                detectedType: null,
                reason: result.reason,
                overrideEnabled: false,
              }));
            } else {
              // Validate the auth type before using it
              const authType = isMcpAuthType(result.suggestedAuthType)
                ? result.suggestedAuthType
                : 'NONE';
              if (!overrideEnabledRef.current) {
                mcpForm.setValue('authType', authType, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
              }
              setAuthDetection((prev) => ({
                ...prev,
                status: 'detected',
                detectedType: authType,
                reason: result.reason,
              }));
            }
          },
          onError: (error) => {
            setAuthDetection((prev) => ({
              ...prev,
              status: 'error',
              detectedType: null,
              reason: error.message,
            }));
          },
        },
      );
    },
    [probeAuthTypeMutation, mcpForm],
  );

  useEffect(() => {
    if (probeTimeoutRef.current) {
      clearTimeout(probeTimeoutRef.current);
      probeTimeoutRef.current = null;
    }

    if (!mcpUrl || !mcpUrl.startsWith('http')) {
      lastProbedUrlRef.current = null;
      return;
    }

    // Only probe if the modal is open!
    if (!mcpRequestOpen) return;

    probeTimeoutRef.current = setTimeout(() => {
      probeAuth(mcpUrl);
    }, 500);

    return () => {
      if (probeTimeoutRef.current) {
        clearTimeout(probeTimeoutRef.current);
      }
    };
  }, [mcpUrl, probeAuth, mcpRequestOpen]);

  const submitMcpRequest = mcpForm.handleSubmit((values) => {
    const trimmedApiKey = values.apiKey?.trim();
    createMutation.mutate(
      {
        type: 'MCP_SERVER',
        reason: values.reason,
        data: {
          name: values.name,
          url: values.url,
          authType: values.authType,
          ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
          ...(values.alsoRequestTools ? { alsoRequestTools: true } : {}),
          ...(selectedWorkspaceId ? { workspaceId: selectedWorkspaceId } : {}),
        },
      },
      {
        onSuccess: () => {
          mcpForm.reset();
          setMcpRequestOpen(false);
        },
      },
    );
  });

  // Only show requestsQuery errors outside modals
  // createMutation errors will be shown inside modals
  const pageErrors = useMemo(() => [requestsQuery.error].filter(Boolean), [requestsQuery.error]);

  const servers = useMemo(() => {
    if (!toolsQuery.data) return [];
    return toolsQuery.data.map((s) => ({
      id: s.serverId,
      name: s.serverName,
      url: s.serverUrl,
      tools: s.tools,
    }));
  }, [toolsQuery.data]);

  const getToolsForServer = (serverName: string) => {
    const server = servers.find((s) => s.name === serverName);
    return server?.tools || [];
  };

  return (
    <UserLayout>
      <div className="space-y-8">
        <PageHeader
          title="Requests"
          description="Request access to tools or propose new MCP servers."
        />

        {pageErrors.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load requests</AlertTitle>
            <AlertDescription>{pageErrors[0]?.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex gap-4">
          {/* TOOL REQUEST MODAL */}
          <Dialog open={toolRequestOpen} onOpenChange={handleOpenToolRequest}>
            <DialogTrigger asChild>
              <Button>Request Tool Access</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Request Tool Access</DialogTitle>
                <DialogDescription>Select the tools you need access to.</DialogDescription>
              </DialogHeader>

              {/* Show mutation errors in modal */}
              {createMutation.error && (
                <Alert variant="destructive">
                  <AlertTitle>Request Failed</AlertTitle>
                  <AlertDescription>{createMutation.error.message}</AlertDescription>
                </Alert>
              )}

              {/* Analysis Results - Show when tools blocked by DENY */}
              {toolAnalysis && toolAnalysis.some((t) => t.blockedByDeny) ? (
                <div className="space-y-4">
                  <Alert variant="destructive">
                    <AlertTitle>Access Restricted</AlertTitle>
                    <AlertDescription>
                      Some tools are blocked by admin policies. You can request removal of the
                      restriction.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                    {(() => {
                      const blockedTools = toolAnalysis.filter((t) => t.blockedByDeny);
                      const serversForDisplay = toolsQuery.data
                        ? toolsQuery.data.map((s) => ({
                            name: s.serverName,
                            url: s.serverUrl,
                            toolCount: s.tools.length,
                          }))
                        : [];

                      // Group blocked tools by server (domain prefix)
                      const toolsByServer = new Map<
                        string,
                        {
                          tools: ToolAnalysisResult[];
                          serverName: string;
                          policyId: string | null;
                        }
                      >();

                      for (const tool of blockedTools) {
                        const parts = tool.toolName.split('::');
                        if (parts.length === 2) {
                          const [domainPart] = parts;
                          if (!toolsByServer.has(domainPart)) {
                            // Find server name for this domain
                            let serverName = domainPart;
                            for (const server of serversForDisplay) {
                              const serverDomain = getDomainPrefix(server.url);
                              if (serverDomain === domainPart) {
                                serverName = server.name;
                                break;
                              }
                            }
                            toolsByServer.set(domainPart, {
                              tools: [],
                              serverName,
                              policyId: tool.blockingPolicyId,
                            });
                          }
                          toolsByServer.get(domainPart)!.tools.push(tool);
                        }
                      }

                      // Check if all tools from each server are blocked
                      const displayItems: Array<{
                        key: string;
                        displayName: string;
                        toolNames: string[];
                        policyId: string | null;
                        isWildcard: boolean;
                      }> = [];

                      for (const [domainPart, serverData] of toolsByServer) {
                        // Find how many tools exist on this server
                        const matchingServer = serversForDisplay.find((s) => {
                          const serverDomain = getDomainPrefix(s.url);
                          return serverDomain === domainPart;
                        });
                        const totalToolsOnServer = matchingServer?.toolCount ?? 0;

                        // If all tools from this server are blocked, show wildcard option
                        if (
                          totalToolsOnServer > 0 &&
                          serverData.tools.length >= totalToolsOnServer
                        ) {
                          displayItems.push({
                            key: `${domainPart}::*`,
                            displayName: `${serverData.serverName}::*`,
                            toolNames: [`${domainPart}::*`],
                            policyId: serverData.policyId,
                            isWildcard: true,
                          });
                        } else {
                          // Show individual tools
                          for (const tool of serverData.tools) {
                            displayItems.push({
                              key: tool.toolName,
                              displayName: formatToolNameForDisplay(
                                tool.toolName,
                                serversForDisplay,
                              ),
                              toolNames: [tool.toolName],
                              policyId: tool.blockingPolicyId,
                              isWildcard: false,
                            });
                          }
                        }
                      }

                      return displayItems.map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                            <span className="font-medium text-sm truncate">{item.displayName}</span>
                            <span className="text-xs text-red-600 dark:text-red-400 font-medium shrink-0">
                              BLOCKED
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={createMutation.isPending}
                            className="shrink-0"
                            onClick={async () => {
                              // Validate reason field before submitting
                              const isReasonValid = await toolForm.trigger('reason');
                              if (!isReasonValid) return;

                              if (item.policyId) {
                                submitDenyRemovalRequest(
                                  item.policyId,
                                  item.toolNames,
                                  toolForm.getValues('reason'),
                                );
                              }
                            }}
                          >
                            {createMutation.isPending ? 'Submitting...' : 'Request Removal'}
                          </Button>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Show tools that have access */}
                  {toolAnalysis.filter((t) => t.hasAccess).length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      You already have access to:{' '}
                      {toolAnalysis
                        .filter((t) => t.hasAccess)
                        .map((t) => {
                          const serversForDisplay = toolsQuery.data
                            ? toolsQuery.data.map((s) => ({
                                name: s.serverName,
                                url: s.serverUrl,
                              }))
                            : [];
                          return formatToolNameForDisplay(t.toolName, serversForDisplay);
                        })
                        .join(', ')}
                    </div>
                  )}

                  {/* Reason field for DENY_REMOVAL requests */}
                  <div className="space-y-2">
                    <Label htmlFor="deny-removal-reason">Reason</Label>
                    <Textarea
                      id="deny-removal-reason"
                      placeholder="Why do you need this restriction removed?"
                      {...toolForm.register('reason')}
                    />
                    {toolForm.formState.errors.reason && (
                      <p className="text-xs text-destructive">
                        {toolForm.formState.errors.reason.message}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setToolAnalysis(null);
                        handleOpenToolRequest(false);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <form className="space-y-6" onSubmit={submitToolRequest}>
                  <div className="space-y-4">
                    <Label>Tool names</Label>
                    {fields.map((field, index) => {
                      const selectedServer = watchedTools?.[index]?.server ?? field.server ?? '';
                      const availableTools = getToolsForServer(selectedServer);
                      const serverError = toolForm.formState.errors.tools?.[index]?.server;
                      const toolError = toolForm.formState.errors.tools?.[index]?.tool;

                      return (
                        <div key={field.id} className="space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1">
                                <Controller
                                  control={toolForm.control}
                                  name={`tools.${index}.server`}
                                  render={({ field }) => (
                                    <Select
                                      value={field.value}
                                      onValueChange={(value) => {
                                        field.onChange(value);
                                        toolForm.setValue(`tools.${index}.tool`, '');
                                        toolForm.clearErrors(`tools.${index}.server`);
                                      }}
                                    >
                                      <SelectTrigger
                                        className={serverError ? 'border-destructive' : ''}
                                      >
                                        <SelectValue placeholder="MCP Server" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {servers.map((server) => (
                                          <SelectItem key={server.id} value={server.name}>
                                            {server.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>
                              <span className="text-muted-foreground">::</span>
                              <div className="flex-1">
                                <Controller
                                  control={toolForm.control}
                                  name={`tools.${index}.tool`}
                                  render={({ field }) => (
                                    <Select
                                      value={field.value}
                                      onValueChange={(value) => {
                                        field.onChange(value);
                                        toolForm.clearErrors(`tools.${index}.tool`);
                                      }}
                                      disabled={!selectedServer}
                                    >
                                      <SelectTrigger
                                        className={toolError ? 'border-destructive' : ''}
                                      >
                                        <SelectValue placeholder="Tool" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="*">All tools</SelectItem>
                                        {availableTools.map((tool) => (
                                          <SelectItem key={tool.id} value={tool.name}>
                                            {tool.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>
                            </div>
                            {fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Remove tool request"
                                onClick={() => remove(index)}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                          {(serverError || toolError) && (
                            <div className="space-y-1">
                              {serverError && (
                                <p className="text-xs text-destructive">{serverError.message}</p>
                              )}
                              {toolError && (
                                <p className="text-xs text-destructive">{toolError.message}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => append({ server: '', tool: '' })}
                    >
                      Add more
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      placeholder="Why does this access help your workflow?"
                      {...toolForm.register('reason')}
                    />
                    {toolForm.formState.errors.reason && (
                      <p className="text-xs text-destructive">
                        {toolForm.formState.errors.reason.message}
                      </p>
                    )}
                  </div>

                  {/* Analysis feedback for already accessible tools */}
                  {toolAnalysis && toolAnalysis.every((t) => t.hasAccess) && (
                    <Alert>
                      <AlertTitle>Access Already Granted</AlertTitle>
                      <AlertDescription>
                        You already have access to all selected tools.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleOpenToolRequest(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || isAnalyzing}>
                      {isAnalyzing
                        ? 'Analyzing...'
                        : createMutation.isPending
                          ? 'Submitting...'
                          : 'Submit Request'}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>

          {/* MCP SERVER REQUEST MODAL */}
          <Dialog open={mcpRequestOpen} onOpenChange={handleOpenMcpRequest}>
            <DialogTrigger asChild>
              <Button variant="outline">Request New MCP Server</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Request New MCP Server</DialogTitle>
                <DialogDescription>
                  Propose a new MCP server for the organization.
                </DialogDescription>
              </DialogHeader>

              {/* Show mutation errors in modal */}
              {createMutation.error && (
                <Alert variant="destructive">
                  <AlertTitle>Server Validation Failed</AlertTitle>
                  <AlertDescription>{createMutation.error.message}</AlertDescription>
                </Alert>
              )}

              <form className="space-y-6" onSubmit={submitMcpRequest}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Server Name</Label>
                    <Input id="name" placeholder="e.g. Notion" {...mcpForm.register('name')} />
                    {mcpForm.formState.errors.name && (
                      <p className="text-xs text-destructive">
                        {mcpForm.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="url">Server URL</Label>
                    <Input
                      id="url"
                      placeholder="https://..."
                      {...mcpForm.register('url')}
                      className={mcpForm.formState.errors.url ? 'border-destructive' : ''}
                    />
                    {mcpForm.formState.errors.url ? (
                      <p className="text-xs text-destructive">
                        {mcpForm.formState.errors.url.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Enter the full URL including protocol (http:// or https://). You may need to
                        append /mcp to the end of the URL.
                      </p>
                    )}
                    {createMutation.isPending && (
                      <p className="text-xs text-muted-foreground">
                        Validating MCP server connection...
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="authType">Authentication Type</Label>
                      {authDetection.status === 'detected' && !authDetection.overrideEnabled && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                          onClick={() =>
                            setAuthDetection((prev) => ({ ...prev, overrideEnabled: true }))
                          }
                        >
                          Override
                        </button>
                      )}
                    </div>
                    <Controller
                      control={mcpForm.control}
                      name="authType"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={
                            authDetection.status === 'detected' && !authDetection.overrideEnabled
                          }
                        >
                          <SelectTrigger
                            className={
                              authDetection.status === 'detected' && !authDetection.overrideEnabled
                                ? 'opacity-70'
                                : ''
                            }
                          >
                            <SelectValue placeholder="Select auth type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">None</SelectItem>
                            <SelectItem value="API_KEY">API Key</SelectItem>
                            <SelectItem value="OAUTH">OAuth</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {authDetection.status === 'probing' && (
                      <p className="text-xs text-muted-foreground">Detecting auth type...</p>
                    )}
                    {authDetection.status === 'detected' && authDetection.reason && (
                      <p className="text-xs text-muted-foreground">
                        Detected: {authDetection.reason}
                      </p>
                    )}
                    {authDetection.status === 'error' && authDetection.reason && (
                      <div className="space-y-2">
                        <p className="text-xs text-destructive">
                          Detection failed: {authDetection.reason}
                        </p>
                        {!authDetection.overrideEnabled ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              Cannot submit: endpoint validation failed.
                            </span>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground underline"
                              onClick={() =>
                                setAuthDetection((prev) => ({ ...prev, overrideEnabled: true }))
                              }
                            >
                              Override
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600">
                            Override enabled - you may submit despite validation failure.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {watchedAuthType === 'API_KEY' && (
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API Key (optional)</Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="Enter API Key"
                        {...mcpForm.register('apiKey')}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave blank to add later. Tool discovery may be skipped until a key is
                        provided.
                      </p>
                      {mcpForm.formState.errors.apiKey && (
                        <p className="text-xs text-destructive">
                          {mcpForm.formState.errors.apiKey.message}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="mcpReason">Reason</Label>
                    <Textarea
                      id="mcpReason"
                      placeholder="Why should this server be added?"
                      {...mcpForm.register('reason')}
                    />
                    {mcpForm.formState.errors.reason && (
                      <p className="text-xs text-destructive">
                        {mcpForm.formState.errors.reason.message}
                      </p>
                    )}
                  </div>
                  <Controller
                    control={mcpForm.control}
                    name="alsoRequestTools"
                    render={({ field }) => (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="alsoRequestTools"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <Label
                          htmlFor="alsoRequestTools"
                          className="text-sm font-normal cursor-pointer"
                        >
                          Also request access to all tools on this server
                        </Label>
                      </div>
                    )}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => handleOpenMcpRequest(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      createMutation.isPending ||
                      authDetection.status === 'probing' ||
                      (authDetection.status === 'error' && !authDetection.overrideEnabled)
                    }
                  >
                    {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Request history</CardTitle>
            <CardDescription>Track all requests submitted from your account.</CardDescription>
          </CardHeader>
          <CardContent>
            {requestsQuery.isPending ? (
              <TableSkeleton />
            ) : requests && requests.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => {
                    const isMcpRequest = request.type === 'MCP_SERVER';

                    let detailsContent;
                    if (isMcpRequest) {
                      const mcpData = getMcpServerData(request.data);
                      detailsContent = (
                        <span className="font-semibold">{mcpData?.name || 'Unknown Server'}</span>
                      );
                    } else {
                      // Format tool names for display
                      const serversForDisplay = toolsQuery.data
                        ? toolsQuery.data.map((s) => ({
                            name: s.serverName,
                            url: s.serverUrl,
                          }))
                        : [];
                      const formattedToolNames = request.toolNames.map((tool) =>
                        formatToolNameForDisplay(tool, serversForDisplay),
                      );
                      detailsContent = (
                        <span className="font-medium text-sm">{formattedToolNames.join(', ')}</span>
                      );
                    }

                    return (
                      <TableRow key={request.id}>
                        <TableCell className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                          {request.type === 'MCP_SERVER'
                            ? 'MCP Server'
                            : request.type === 'DENY_REMOVAL'
                              ? 'Restriction Removal'
                              : 'Tool Access'}
                        </TableCell>
                        <TableCell>{detailsContent}</TableCell>
                        <TableCell
                          className={`text-xs font-bold ${getRequestStatusColor(request.status === 'MODIFIED' ? 'APPROVED' : request.status)}`}
                        >
                          {request.status === 'MODIFIED' ? 'APPROVED' : request.status}
                        </TableCell>
                        <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {request.status === 'WITHDRAWN'
                                ? 'Withdrawn'
                                : request.status === 'APPROVED'
                                  ? 'Approved as requested'
                                  : request.status === 'MODIFIED'
                                    ? 'Approved with modifications'
                                    : request.status === 'DENIED'
                                      ? 'Denied'
                                      : 'Pending review'}
                            </p>
                            {request.reviewNote && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px] cursor-help">
                                      {request.reviewNote}
                                    </p>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-sm">
                                    <p className="text-sm">{request.reviewNote}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {request.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRequestToWithdraw(request.id);
                                handleOpenWithdrawDialog(true);
                              }}
                            >
                              Withdraw
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No requests yet"
                description="Submit a request to start tracking approvals."
              />
            )}
          </CardContent>
        </Card>

        {/* Withdraw Confirmation Dialog */}
        <Dialog open={withdrawDialogOpen} onOpenChange={handleOpenWithdrawDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Withdraw Request</DialogTitle>
              <DialogDescription>
                Are you sure you want to withdraw this permission request? This action cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            {withdrawMutation.error && (
              <Alert variant="destructive">
                <AlertTitle>Withdraw Failed</AlertTitle>
                <AlertDescription>{withdrawMutation.error.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => handleOpenWithdrawDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (requestToWithdraw) {
                    withdrawMutation.mutate({ id: requestToWithdraw });
                  }
                }}
                disabled={withdrawMutation.isPending}
              >
                {withdrawMutation.isPending ? 'Withdrawing...' : 'Withdraw Request'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </UserLayout>
  );
}
