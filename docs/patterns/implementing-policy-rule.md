# Implementing a Policy Rule

## When to Use This Pattern

Use this pattern when adding new policy matching capabilities or conditions to the policy engine.

## Policy Engine Overview

The policy engine evaluates policies in this order:

1. **DENY policies** - Evaluated first (cannot be bypassed)
2. **ALLOW policies** - Evaluated if no DENY matched
3. **Default DENY** - If no policies matched (fail-closed)

## Policy Structure

```typescript
interface Policy {
  id: string;
  organizationId: string;
  workspaceId?: string;  // null = org-wide
  slug: string;
  matchers: string[];    // WHO: *, role:Name, user:email, agent:id
  toolPatterns: string[]; // WHAT: server::tool, a2a::agent::skill
  effect: 'ALLOW' | 'DENY';
  enabled: boolean;

  // Conditions (WHEN)
  conditionMode: 'SIMPLE' | 'ADVANCED';
  conditions?: Condition[];        // SIMPLE mode
  conditionExpression?: string;    // ADVANCED mode
}
```

### Matchers (WHO)

Matchers define who the policy applies to:

| Pattern | Description |
|---------|-------------|
| `*` | All users and agents |
| `role:Admin` | Users with Admin role |
| `role:Developer` | Users with Developer role |
| `user:alice@example.com` | Specific user by email |
| `agent:agent-id-123` | Specific agent by ID |

### Tool Patterns (WHAT)

Tool patterns define which tools the policy controls:

| Pattern | Description |
|---------|-------------|
| `*::*` | All tools on all servers |
| `github::*` | All tools on github server |
| `*::delete` | Delete tool on any server |
| `github::create_issue` | Specific tool |
| `a2a::agent-name::skill` | A2A agent skill |

## Condition System

Conditions add contextual restrictions to policies (WHEN they apply).

### Simple Conditions (Array with AND logic)

Simple mode uses an array of conditions that are all ANDed together:

```json
{
  "conditionMode": "SIMPLE",
  "conditions": [
    { "field": "params.branch", "operator": "equals", "value": "main" },
    { "field": "context.hourOfDay", "operator": "between", "value": [9, 17] }
  ]
}
```

### Advanced Conditions (Expression)

Advanced mode uses a string expression for complex logic:

```json
{
  "conditionMode": "ADVANCED",
  "conditionExpression": "params.amount < 1000 AND context.dayOfWeek IN [1,2,3,4,5]"
}
```

Advanced expressions support:
- Boolean operators: `AND`, `OR`, `NOT`
- Parentheses for grouping: `(a OR b) AND c`
- All operators from the operator table below

### Available Operators

| Category | Operators | Example |
|----------|-----------|---------|
| **Equality** | `equals`, `notEquals` | `{ "field": "params.env", "operator": "equals", "value": "production" }` |
| **String** | `contains`, `startsWith`, `endsWith`, `matches` (regex) | `{ "field": "params.query", "operator": "contains", "value": "DROP" }` |
| **Numeric** | `lessThan`, `greaterThan`, `lessThanOrEquals`, `greaterThanOrEquals`, `between` | `{ "field": "params.amount", "operator": "lessThan", "value": 1000 }` |
| **Set** | `in`, `notIn`, `containsAny`, `containsNone` | `{ "field": "context.dayOfWeek", "operator": "in", "value": [1,2,3,4,5] }` |
| **Existence** | `exists`, `notExists` | `{ "field": "params.apiKey", "operator": "notExists" }` |
| **Network** | `inCidr`, `notInCidr` | `{ "field": "context.sourceIp", "operator": "inCidr", "value": "10.0.0.0/8" }` |

### Available Context Fields

| Field | Description | Example Value |
|-------|-------------|---------------|
| **Tool Parameters** | | |
| `params.*` | Any tool parameter | `params.query`, `params.branch` |
| **Request Context** | | |
| `context.sourceIp` | Client IP address | `"192.168.1.100"` |
| `context.timestamp` | Request timestamp (ISO) | `"2024-01-15T10:30:00Z"` |
| `context.dayOfWeek` | Day of week (0=Sun, 6=Sat) | `1` (Monday) |
| `context.hourOfDay` | Hour in UTC (0-23) | `14` |
| **SQL Extraction** | | |
| `sql.operation` | Extracted SQL operation | `"SELECT"`, `"DELETE"` |
| `sql.tables` | Extracted table names | `["users", "orders"]` |
| **GitHub Extraction** | | |
| `github.repository` | Repository from params | `"owner/repo"` |
| `github.branch` | Branch from params | `"main"` |
| **File Extraction** | | |
| `file.path` | File path from params | `"/etc/passwd"` |
| `file.extension` | File extension | `".sql"` |
| **Global Variables** | | |
| `global.<namespace>.<field>` | Organization-wide variables | `global.security.maxFileSize` |

## Implementation Guide

### 1. Add New Condition Operator

**Location**: `packages/shared/src/advancedConditions/`

```typescript
// Step 1: Add to operator registry
// packages/shared/src/advancedConditions/operators.ts

export const OPERATORS = {
  // ... existing operators

  // Add new operator
  matchesGlob: {
    name: 'matchesGlob',
    types: ['string'],
    evaluate: (fieldValue: string, pattern: string) => {
      return minimatch(fieldValue, pattern);
    },
  },
} as const;
```

```typescript
// Step 2: Add type checking
// packages/shared/src/advancedConditions/types.ts

export const operatorTypeRules: Record<string, string[]> = {
  // ... existing rules
  matchesGlob: ['string'],
};
```

```typescript
// Step 3: Update Zod schema
// packages/shared/src/advancedConditions/schema.ts

export const conditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'equals', 'notEquals',
    'contains', 'startsWith', 'endsWith', 'matches',
    'lessThan', 'greaterThan', 'lessThanOrEquals', 'greaterThanOrEquals', 'between',
    'in', 'notIn', 'containsAny', 'containsNone',
    'exists', 'notExists',
    'inCidr', 'notInCidr',
    'matchesGlob', // Add new operator
  ]),
  value: z.unknown(),
});
```

### 2. Add New Context Extractor

**Location**: `packages/api/src/services/toolContext.ts`

```typescript
// Create extractor function
function extractGitHubContext(params: Record<string, unknown>): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  // Extract repository
  if (typeof params.repo === 'string') {
    context['github.repository'] = params.repo;
  } else if (typeof params.owner === 'string' && typeof params.repository === 'string') {
    context['github.repository'] = `${params.owner}/${params.repository}`;
  }

  // Extract branch
  if (typeof params.branch === 'string') {
    context['github.branch'] = params.branch;
  } else if (typeof params.ref === 'string' && params.ref.startsWith('refs/heads/')) {
    context['github.branch'] = params.ref.replace('refs/heads/', '');
  }

  return context;
}

// Register in context builder
export function buildEvaluationContext(
  tool: string,
  params: Record<string, unknown>,
  request: RequestContext,
): EvaluationContext {
  return {
    // Base context
    params,
    context: {
      sourceIp: request.ip,
      timestamp: new Date().toISOString(),
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getUTCHours(),
    },

    // Tool-specific extractors
    ...extractSqlContext(params),
    ...extractGitHubContext(params),
    ...extractFileContext(params),
  };
}
```

### 3. Add Tool-Specific Context Schema

MCP servers can declare what context will be extracted for their tools:

```typescript
// In MCP server tool definition
{
  name: 'execute_query',
  description: 'Execute SQL query',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
  },
  contextSchema: {
    'sql.operation': { type: 'string', description: 'Extracted SQL operation' },
    'sql.tables': { type: 'array', items: { type: 'string' } },
  },
}
```

## Policy Evaluation Service

**Location**: `packages/api/src/services/policy.ts`

```typescript
export async function evaluatePolicy(context: PolicyContext): Promise<PolicyResult> {
  const { tool, userId, organizationId, workspaceId } = context;

  // Fetch enabled policies for organization/workspace
  const policies = await prisma.policy.findMany({
    where: {
      organizationId,
      enabled: true,
      OR: [
        { workspaceId: null }, // Org-wide policies
        { workspaceId },       // Workspace-specific policies
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  // Separate by effect
  const denyPolicies = policies.filter(p => p.effect === 'DENY');
  const allowPolicies = policies.filter(p => p.effect === 'ALLOW');

  // 1. Check DENY policies first (cannot be bypassed)
  for (const policy of denyPolicies) {
    if (matchesPolicy(policy, context)) {
      return { decision: 'DENIED', policyId: policy.id };
    }
  }

  // 2. Check ALLOW policies
  for (const policy of allowPolicies) {
    if (matchesPolicy(policy, context)) {
      return { decision: 'ALLOWED', policyId: policy.id };
    }
  }

  // 3. Default: DENIED (fail-closed)
  return { decision: 'DENIED', reason: 'No matching ALLOW policy' };
}

function matchesPolicy(policy: Policy, context: PolicyContext): boolean {
  // Check matchers (WHO)
  if (!matchesUser(policy.matchers, context)) {
    return false;
  }

  // Check tool patterns (WHAT)
  if (!matchesTool(policy.toolPatterns, context.tool)) {
    return false;
  }

  // Check conditions (WHEN)
  if (!evaluateConditions(policy, context)) {
    return false;
  }

  return true;
}
```

## Condition Evaluation Service

**Location**: `packages/api/src/services/policyCondition.ts`

```typescript
export function evaluateConditions(
  policy: Policy,
  context: EvaluationContext
): boolean {
  // No conditions = always matches
  if (policy.conditionMode === 'SIMPLE' && (!policy.conditions || policy.conditions.length === 0)) {
    return true;
  }
  if (policy.conditionMode === 'ADVANCED' && !policy.conditionExpression) {
    return true;
  }

  if (policy.conditionMode === 'SIMPLE') {
    return evaluateSimpleConditions(policy.conditions!, context);
  } else {
    return evaluateAdvancedExpression(policy.conditionExpression!, context);
  }
}

function evaluateSimpleConditions(
  conditions: Condition[],
  context: EvaluationContext
): boolean {
  // All conditions must match (AND logic)
  return conditions.every(condition =>
    evaluateSingleCondition(condition, context)
  );
}

function evaluateSingleCondition(
  condition: Condition,
  context: EvaluationContext
): boolean {
  const fieldValue = getFieldValue(condition.field, context);

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value;
    case 'notEquals':
      return fieldValue !== condition.value;
    case 'contains':
      return String(fieldValue).includes(String(condition.value));
    case 'startsWith':
      return String(fieldValue).startsWith(String(condition.value));
    case 'endsWith':
      return String(fieldValue).endsWith(String(condition.value));
    case 'matches':
      return new RegExp(String(condition.value)).test(String(fieldValue));
    case 'lessThan':
      return Number(fieldValue) < Number(condition.value);
    case 'greaterThan':
      return Number(fieldValue) > Number(condition.value);
    case 'lessThanOrEquals':
      return Number(fieldValue) <= Number(condition.value);
    case 'greaterThanOrEquals':
      return Number(fieldValue) >= Number(condition.value);
    case 'between':
      const [min, max] = condition.value as [number, number];
      return Number(fieldValue) >= min && Number(fieldValue) <= max;
    case 'in':
      return (condition.value as unknown[]).includes(fieldValue);
    case 'notIn':
      return !(condition.value as unknown[]).includes(fieldValue);
    case 'containsAny':
      return (condition.value as unknown[]).some(v =>
        (fieldValue as unknown[]).includes(v)
      );
    case 'containsNone':
      return !(condition.value as unknown[]).some(v =>
        (fieldValue as unknown[]).includes(v)
      );
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'notExists':
      return fieldValue === undefined || fieldValue === null;
    case 'inCidr':
      return isIpInCidr(String(fieldValue), String(condition.value));
    case 'notInCidr':
      return !isIpInCidr(String(fieldValue), String(condition.value));
    default:
      return false;
  }
}

function getFieldValue(field: string, context: EvaluationContext): unknown {
  const parts = field.split('.');
  let value: unknown = context;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}
```

## Testing Policies

**Location**: `test/unit/api/services/policy.test.ts`

### Test DENY Precedence

```typescript
test('DENY always wins over ALLOW', async () => {
  await createTestPolicy({
    effect: 'ALLOW',
    toolPatterns: ['*::*'],
    matchers: ['*'],
  });
  await createTestPolicy({
    effect: 'DENY',
    toolPatterns: ['*::delete'],
    matchers: ['*'],
  });

  const result = await evaluatePolicy({
    tool: 'server::delete',
    userId: 'user-1',
    organizationId: 'org-1',
  });

  expect(result.decision).toBe('DENIED');
});
```

### Test Simple Conditions

```typescript
test('time-based condition restricts access', async () => {
  await createTestPolicy({
    effect: 'ALLOW',
    toolPatterns: ['*::*'],
    matchers: ['*'],
    conditions: [
      { field: 'context.hourOfDay', operator: 'between', value: [9, 17] }
    ],
    conditionMode: 'SIMPLE',
  });

  // Test at 3 AM - should be denied (no matching ALLOW)
  const result = await evaluatePolicyWithContext({
    tool: 'server::action',
    userId: 'user-1',
    organizationId: 'org-1',
    context: { hourOfDay: 3 },
  });

  expect(result.decision).toBe('DENIED');
});

test('parameter condition validates input', async () => {
  await createTestPolicy({
    effect: 'DENY',
    toolPatterns: ['database::execute_query'],
    matchers: ['*'],
    conditions: [
      { field: 'sql.operation', operator: 'in', value: ['DROP', 'DELETE', 'TRUNCATE'] }
    ],
    conditionMode: 'SIMPLE',
  });

  const result = await evaluatePolicy({
    tool: 'database::execute_query',
    userId: 'user-1',
    organizationId: 'org-1',
    params: { query: 'DROP TABLE users' },
  });

  expect(result.decision).toBe('DENIED');
});
```

### Test Advanced Conditions

```typescript
test('advanced expression with OR logic', async () => {
  await createTestPolicy({
    effect: 'DENY',
    toolPatterns: ['*::*'],
    matchers: ['*'],
    conditionExpression: 'context.hourOfDay < 6 OR context.hourOfDay > 22',
    conditionMode: 'ADVANCED',
  });

  // Test at 23:00 - should be denied
  const result = await evaluatePolicyWithContext({
    tool: 'server::action',
    context: { hourOfDay: 23 },
  });

  expect(result.decision).toBe('DENIED');
});

test('advanced expression with complex logic', async () => {
  await createTestPolicy({
    effect: 'ALLOW',
    toolPatterns: ['github::*'],
    matchers: ['role:Developer'],
    conditionExpression:
      '(github.branch == "main" AND params.action == "read") OR ' +
      '(github.branch != "main")',
    conditionMode: 'ADVANCED',
  });

  // Developer can read from main
  const readResult = await evaluatePolicy({
    tool: 'github::get_file',
    userRoles: ['Developer'],
    params: { action: 'read', branch: 'main' },
  });
  expect(readResult.decision).toBe('ALLOWED');

  // Developer cannot write to main
  const writeResult = await evaluatePolicy({
    tool: 'github::push',
    userRoles: ['Developer'],
    params: { action: 'write', branch: 'main' },
  });
  expect(writeResult.decision).toBe('DENIED');
});
```

### Test Network Conditions

```typescript
test('IP-based restrictions with CIDR', async () => {
  await createTestPolicy({
    effect: 'ALLOW',
    toolPatterns: ['*::*'],
    matchers: ['*'],
    conditions: [
      { field: 'context.sourceIp', operator: 'inCidr', value: '10.0.0.0/8' }
    ],
    conditionMode: 'SIMPLE',
  });

  // Internal IP - allowed
  const internalResult = await evaluatePolicy({
    tool: 'server::action',
    context: { sourceIp: '10.1.2.3' },
  });
  expect(internalResult.decision).toBe('ALLOWED');

  // External IP - denied
  const externalResult = await evaluatePolicy({
    tool: 'server::action',
    context: { sourceIp: '203.0.113.1' },
  });
  expect(externalResult.decision).toBe('DENIED');
});
```

## Common Policy Examples

### Block Destructive Operations

```typescript
{
  slug: 'block-destructive-ops',
  effect: 'DENY',
  matchers: ['*'],
  toolPatterns: ['*::delete*', '*::drop*', '*::truncate*'],
  conditionMode: 'SIMPLE',
  conditions: [],
}
```

### Business Hours Only

```typescript
{
  slug: 'business-hours-only',
  effect: 'ALLOW',
  matchers: ['*'],
  toolPatterns: ['*::*'],
  conditionMode: 'SIMPLE',
  conditions: [
    { field: 'context.hourOfDay', operator: 'between', value: [9, 17] },
    { field: 'context.dayOfWeek', operator: 'in', value: [1, 2, 3, 4, 5] },
  ],
}
```

### Block SQL Injection Patterns

```typescript
{
  slug: 'block-dangerous-sql',
  effect: 'DENY',
  matchers: ['*'],
  toolPatterns: ['database::execute_query'],
  conditionMode: 'ADVANCED',
  conditionExpression:
    'sql.operation IN ["DROP", "DELETE", "TRUNCATE"] OR ' +
    'params.query matches "(?i)(union|select.*from|;\\s*drop)"',
}
```

### Protect Production Branch

```typescript
{
  slug: 'protect-main-branch',
  effect: 'DENY',
  matchers: ['*'],
  toolPatterns: ['github::push', 'github::merge', 'github::delete_branch'],
  conditionMode: 'SIMPLE',
  conditions: [
    { field: 'github.branch', operator: 'equals', value: 'main' },
  ],
}
```

### Rate Limit High-Cost Operations

```typescript
{
  slug: 'limit-expensive-queries',
  effect: 'DENY',
  matchers: ['*'],
  toolPatterns: ['database::execute_query'],
  conditionMode: 'SIMPLE',
  conditions: [
    { field: 'params.estimated_cost', operator: 'greaterThan', value: 1000 },
  ],
}
```

### Admin-Only During Off-Hours

```typescript
{
  slug: 'off-hours-admin-only',
  effect: 'DENY',
  matchers: ['role:User', 'role:Developer'],  // Everyone except Admin
  toolPatterns: ['*::*'],
  conditionMode: 'ADVANCED',
  conditionExpression: 'context.hourOfDay < 9 OR context.hourOfDay > 17',
}
```

### Restrict by Source IP

```typescript
{
  slug: 'internal-network-only',
  effect: 'ALLOW',
  matchers: ['*'],
  toolPatterns: ['internal::*'],
  conditionMode: 'SIMPLE',
  conditions: [
    { field: 'context.sourceIp', operator: 'inCidr', value: '10.0.0.0/8' },
  ],
}
```

## Common Mistakes

### Forgetting DENY-First Evaluation

```typescript
// BAD - Checks ALLOW first
if (allowPolicyMatches) return 'ALLOWED';
if (denyPolicyMatches) return 'DENIED';
```

```typescript
// GOOD - DENY always evaluated first
if (denyPolicyMatches) return 'DENIED';
if (allowPolicyMatches) return 'ALLOWED';
return 'DENIED'; // Default deny
```

### Not Validating Operator Types

```typescript
// BAD - String operator on number field
{ field: 'context.hourOfDay', operator: 'contains', value: '10' }
```

```typescript
// GOOD - Numeric operator for numeric field
{ field: 'context.hourOfDay', operator: 'between', value: [9, 17] }
```

### Forgetting Organization Scope

```typescript
// BAD - Missing organization filter
const policies = await prisma.policy.findMany({
  where: { enabled: true },
});
```

```typescript
// GOOD - Always scope to organization
const policies = await prisma.policy.findMany({
  where: {
    organizationId,  // REQUIRED
    enabled: true,
  },
});
```

### Using OR in Simple Mode

```typescript
// BAD - Simple mode only supports AND
{
  conditionMode: 'SIMPLE',
  conditions: [
    // These are ANDed, not ORed!
    { field: 'context.dayOfWeek', operator: 'equals', value: 0 },
    { field: 'context.dayOfWeek', operator: 'equals', value: 6 },
  ],
}
```

```typescript
// GOOD - Use ADVANCED mode for OR logic
{
  conditionMode: 'ADVANCED',
  conditionExpression: 'context.dayOfWeek == 0 OR context.dayOfWeek == 6',
}
```

## Real Examples

See existing policy evaluation in:

- `packages/api/src/services/policy.ts` - Main evaluation logic
- `packages/api/src/services/policyCondition.ts` - Condition evaluation
- `packages/shared/src/advancedConditions/` - Operator definitions
- `test/unit/api/services/policy.test.ts` - Test examples

## Next Steps

After implementing a policy rule:

1. Add comprehensive tests (edge cases, multiple policies)
2. Update policy documentation
3. Add example policies to `docs/spec/appendix-a-example-policies.md`
