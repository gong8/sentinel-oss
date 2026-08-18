import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import type {
  McpServerData,
  ToolAccessType,
  ToolRiskLevel,
  ToolWithFlagStatus,
} from '../../../hooks/useMcpServers';
import type { CategoryOption, OperatorGroups } from '../ConditionBuilder';

// Tool flag data with classification for modal
export interface ToolFlagData {
  servers: Array<{
    id: string;
    name: string;
    url: string;
    serverKey: string;
    tools: Array<{
      id: string;
      name: string;
      description?: string | null;
      qualifiedName: string;
      isFlagged: boolean;
      flagBehaviors: string[];
      riskLevel: ToolRiskLevel | null;
      accessType: ToolAccessType | null;
    }>;
  }>;
}

// Form schemas
export const matcherEntrySchema = z.object({
  type: z.enum(['all', 'user', 'role', 'agent']),
  value: z.string(),
});

export const toolPatternEntrySchema = z.object({
  server: z.string().min(1, 'Server is required'),
  tool: z.string().min(1, 'Tool is required'),
});

export const conditionOperators = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'matches',
  'lessThan',
  'greaterThan',
  'between',
  'in',
  'notIn',
  'containsAny',
  'containsNone',
  'exists',
  'notExists',
  'inCidr',
  'notInCidr',
] as const;

export const conditionsSchema = z
  .array(
    z.object({
      field: z.string(),
      operator: z.enum(conditionOperators),
      value: z.unknown().optional(),
      valueRef: z.string().optional(),
    }),
  )
  .nullable();

export const policyFormSchema = z
  .object({
    matchers: z.array(matcherEntrySchema).min(1, 'At least one matcher is required'),
    toolPatterns: z.array(toolPatternEntrySchema).min(1, 'At least one tool pattern is required'),
    effect: z.enum(['ALLOW', 'DENY']),
    description: z.string().min(4, 'Add a short description.'),
    enabled: z.boolean(),
    conditions: conditionsSchema.optional(),
    conditionsTree: z.unknown().nullable().optional(), // Tree structure with AND/OR nesting
    conditionMode: z.enum(['SIMPLE', 'ADVANCED']).optional(),
    conditionExpression: z.string().max(10000).optional(),
    workspaceId: z.string().cuid().nullable().optional(), // null = global (org-wide)
    tagIds: z.array(z.string()).optional(), // Policy tag IDs
  })
  .refine((data) => data.matchers.every((m) => m.type === 'all' || m.value.length > 0), {
    message: 'Please select a user, role, or agent for each matcher.',
    path: ['matchers'],
  });

export type PolicyFormValues = z.infer<typeof policyFormSchema>;

export const DEFAULT_FORM_VALUES: PolicyFormValues = {
  matchers: [{ type: 'role', value: '' }],
  toolPatterns: [],
  effect: 'ALLOW',
  description: '',
  enabled: true,
  conditions: null,
  conditionsTree: null,
  conditionMode: 'SIMPLE',
  conditionExpression: undefined,
  workspaceId: null, // null = global (org-wide)
  tagIds: [],
};

// Shared props for form components
export interface PolicyFormTabProps {
  form: UseFormReturn<PolicyFormValues>;
  mode: 'create' | 'edit';
}

// Data types from queries - use flexible types to match hook outputs
export interface UserData {
  id: string;
  email: string;
  name?: string | null;
  [key: string]: unknown;
}

export interface RoleData {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface AgentData {
  id: string;
  name: string;
  [key: string]: unknown;
}

// Re-export from hooks to ensure type compatibility for external consumers
export type { McpServerData, ToolWithFlagStatus };

// A2A agent data from tRPC query
export interface A2aAgentData {
  id: string;
  name: string;
  skills?: { id: string; name: string }[];
}

// Workspace data for scope selector
export interface WorkspaceData {
  id: string;
  name: string;
}

// Policy tag data
export interface PolicyTagData {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  workspaceId?: string | null;
  workspace?: { id: string; name: string } | null;
}

// Props for the main modal
export interface PolicyFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit' | 'view';
  defaultValues?: Partial<PolicyFormValues>;
  onSubmit: (values: PolicyFormValues) => void;
  isSubmitting?: boolean;
  isLoading?: boolean;
  error?: string | null;
  readOnly?: boolean; // If true, all inputs are disabled and no submit button

  // Data for selectors
  users?: UserData[];
  roles?: RoleData[];
  agents?: AgentData[];
  mcpServers?: McpServerData[];
  a2aAgents?: A2aAgentData[];
  workspaces?: WorkspaceData[];
  isOrgOwner?: boolean; // If true, can select "Global" scope

  // Policy tags
  tags?: PolicyTagData[];
  onCreateTag?: (tag: {
    name: string;
    description?: string;
    color: string;
    workspaceId?: string | null;
  }) => Promise<PolicyTagData>;
  isCreatingTag?: boolean;

  // Callbacks for tools - match useMcpServers hook return types exactly
  getToolsForServer?: (serverKey: string) => { id: string; name: string }[];
  isToolFlagged?: (serverKey: string, toolName: string) => boolean;
  getToolFlagCountsForServer?: (serverKey: string) => {
    flagged: number;
    unflagged: number;
    flaggedTools: ToolWithFlagStatus[];
    unflaggedTools: ToolWithFlagStatus[];
  };
  // Tool flag data with classification for modal
  toolFlagData?: ToolFlagData;

  // Condition builder data
  categories?: CategoryOption[];
  operators?: OperatorGroups;

  // Generate description from form values (client-side)
  onGenerateDescription?: (values: PolicyFormValues) => string;

  // Prefill from request
  prefillRequest?: {
    requestId: string;
    userEmail: string;
    toolNames: string[];
    reason: string | null;
    createdAt: string;
  };

  // Review feedback for permission request resolution
  reviewNote?: string;
  onReviewNoteChange?: (value: string) => void;

  // Custom footer configuration
  submitButtonText?: string;
  submitButtonLoadingText?: string;
  extraFooterButtons?: React.ReactNode;
}
