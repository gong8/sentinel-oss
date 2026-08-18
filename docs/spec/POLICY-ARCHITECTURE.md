# Policy Architecture: LLM-Assisted Authoring with Deterministic Evaluation

> **Status**: Phase 3 COMPLETE (2026-01-30)
> **Replaces**: Semantic Parameter Policies (Feature 4), Time-Based Policies (Feature 5)
> **Author**: Design discussion, Jan 2026

---

## Executive Summary

Sentinel's policy system has been fully redesigned around a key insight: **LLMs should help write policies, not evaluate them at runtime.**

**Previous approach (now deprecated and removed):**
- LLM evaluated policies at runtime -> 2-5s latency, API costs, non-deterministic

**Current approach:**
- LLM helps admins write structured conditions -> zero runtime overhead, deterministic, auditable

---

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Conditions Engine | COMPLETE |
| Phase 2 | Policy Generation Service | COMPLETE |
| Phase 3 | Deprecate Semantic Evaluation | COMPLETE (2026-01-30) |
| Phase 4 | Advanced Features | PLANNING |

### Phase 3 Completion Summary

As of 2026-01-30, semantic policies have been **fully removed** from Sentinel:

- `semanticPolicy` and `confidenceThreshold` fields have been removed from active use
- Fields may remain in database schema for historical data migration purposes only
- **LLM is NO LONGER called in the policy evaluation hot path**
- **All policy evaluation is now deterministic**
- Policy evaluation latency: < 5ms (vs 2-5s with semantic evaluation)

---

## Core Design Principles

### 1. Deterministic Evaluation

All policy decisions at runtime are deterministic. Given the same policy set and request context, the decision is always the same. No LLM calls in the hot path.

### 2. LLM as Authoring Assistant

LLMs help translate human intent into structured policy conditions:
- Natural language -> structured conditions
- Permission requests -> suggested policies
- Audit patterns -> policy recommendations
- Complex policies -> plain English explanations

### 3. Human Accountability

Every policy is reviewed and approved by a human admin. The LLM suggests, the human decides. This maintains clear accountability for access control decisions.

### 4. Progressive Complexity

Simple policies remain simple. Conditions are optional. Admins can start with basic "who can use what" and add parameter constraints only when needed.

---

## Policy Model

### Basic Policy (unchanged)

```
WHO (matchers) + WHAT (tool patterns) + EFFECT (allow/deny) = Policy
```

Examples:
- Developers can use GitHub tools
- No one can use the delete_database tool
- Alice can use Notion

### Policy with Conditions

```
WHO + WHAT + EFFECT + WHEN (conditions) = Conditional Policy
```

Examples:
- Developers can use GitHub, **when branch is not main/production**
- Analysts can query database, **when operation is SELECT**
- Anyone can access files, **when path starts with /public/**

---

## Condition System

Sentinel supports two condition modes, controlled by the `conditionMode` field on the Policy model.

### Condition Modes

```prisma
enum ConditionMode {
  SIMPLE    // Visual condition builder with flat array
  ADVANCED  // SQL-like expression language
}

model Policy {
  // ... other fields ...

  // Deterministic conditions (SIMPLE mode)
  conditions          Json?          // PolicyCondition[] - flat array with AND logic

  // Advanced conditions (ADVANCED mode)
  conditionMode       ConditionMode  @default(SIMPLE)
  conditionExpression Json?          // { expression: string, ast: object, version: number }
}
```

### SIMPLE Mode

Array of conditions evaluated with AND logic. All conditions must be true for the policy to apply.

```yaml
conditions:
  - field: "params.branch"
    operator: "notIn"
    value: ["main", "production"]
  - field: "context.hourOfDay"
    operator: "between"
    value: [9, 17]
```

### ADVANCED Mode

SQL-like expression language for complex conditions. Uses `conditionExpression` field.

```yaml
conditionExpression:
  expression: "params.branch NOT IN ('main', 'production') AND context.hourOfDay BETWEEN 9 AND 17"
  ast: { ... }  # Parsed AST for fast evaluation
  version: 1
```

---

## Advanced Condition Language

Located in `packages/shared/src/advancedConditions/`, the advanced condition language provides SQL-like expressions for complex policy conditions.

### Architecture

| Component | File | Description |
|-----------|------|-------------|
| Lexer | `lexer.ts` | Tokenizes expression strings |
| Parser | `parser.ts` | Builds AST from tokens |
| Type Checker | `typeChecker.ts` | Validates expression types |
| Evaluator | `evaluator.ts` | Evaluates AST against context |
| Functions | `functions.ts` | 30+ built-in functions |
| Types | `types.ts` | Type definitions |
| Errors | `errors.ts` | Custom error types |

### Expression Syntax

```sql
-- Comparison operators
params.count > 10
params.status = 'active'
params.branch != 'main'

-- Logical operators
params.count > 10 AND params.status = 'active'
params.branch = 'main' OR params.branch = 'production'
NOT params.isDraft

-- Set operations
params.branch IN ('main', 'production', 'staging')
params.role NOT IN ('guest', 'anonymous')

-- Range operations
context.hourOfDay BETWEEN 9 AND 17

-- String operations
params.path LIKE '/api/%'
params.query LIKE '%SELECT%'

-- Null checks
params.description IS NULL
params.assignee IS NOT NULL

-- Function calls
LOWER(params.command) = 'delete'
LEN(params.message) < 1000
CONTAINS(params.tags, 'urgent')
```

### Built-in Functions (30+)

**Number Functions:**
- `FLOOR(value)` - Round down to nearest integer
- `CEIL(value)` - Round up to nearest integer
- `ROUND(value, decimals?)` - Round to nearest integer or decimal places
- `ABS(value)` - Absolute value

**Aggregate Functions:**
- `MAX(array)` or `MAX(val1, val2, ...)` - Maximum value
- `MIN(array)` or `MIN(val1, val2, ...)` - Minimum value
- `SUM(array)` or `SUM(val1, val2, ...)` - Sum of values
- `AVG(array)` or `AVG(val1, val2, ...)` - Average of values
- `COUNT(array)` - Count of elements
- `LEN(value)` - Length of string or array

**String Functions:**
- `LOWER(value)` - Convert to lowercase
- `UPPER(value)` - Convert to uppercase
- `TRIM(value)` - Remove leading/trailing whitespace
- `SUBSTRING(value, start, length?)` - Extract substring (1-indexed)
- `CONCAT(val1, val2, ...)` - Concatenate strings
- `REPLACE(value, search, replacement)` - Replace occurrences
- `SPLIT(value, delimiter)` - Split string into array

**Type Conversion:**
- `NUMBER(value, default?)` - Convert string to number, returns default if conversion fails
- `STRING(value)` - Convert to string
- `BOOL(value)` - Convert to boolean

**Existence/Null Functions:**
- `EXISTS(value)` - Check if value exists (not null/undefined)
- `COALESCE(val1, val2, ...)` - Return first non-null value
- `IFNULL(value, default)` - Return default if value is null

**Conditional Functions:**
- `IF(condition, thenValue, elseValue)` - Conditional expression

**Array Functions:**
- `CONTAINS(array, value)` - Check if array contains value
- `FIRST(array)` - Get first element
- `LAST(array)` - Get last element

### Usage in Conditions

```typescript
import { evaluate, parse, typeCheck, createEvaluationContext } from '@sentinel/shared/advancedConditions';

// Parse expression
const ast = parse('params.count > 10 AND LOWER(params.status) = "active"');

// Type check
const typeResult = typeCheck(ast, typeEnv);
if (!typeResult.valid) {
  throw new Error(typeResult.errors.join(', '));
}

// Evaluate
const context = createEvaluationContext({
  params: { count: 15, status: 'ACTIVE' },
  context: { hourOfDay: 14 }
});
const result = evaluate(ast, context);
// result.value === true
```

---

## Global Variables

Global variables allow admins to define reusable values that can be referenced in policy conditions.

### Schema

```prisma
enum GlobalVariableFieldType {
  STRING
  NUMBER
  BOOLEAN
  DATE
  STRING_ARRAY
  NUMBER_ARRAY
}

model GlobalVariableNamespace {
  id             String    @id @default(cuid())
  organizationId String
  workspaceId    String?   // null = global (org-wide), otherwise workspace-scoped
  name           String    // e.g., "COMPANY", "LIMITS"
  description    String?

  fields         GlobalVariableField[]

  @@unique([organizationId, workspaceId, name])
}

model GlobalVariableField {
  id          String                  @id @default(cuid())
  namespaceId String
  name        String                  // e.g., "creationDate", "maxUsers"
  description String?
  fieldType   GlobalVariableFieldType
  value       Json

  @@unique([namespaceId, name])
}
```

### Workspace Scoping

- **Org-wide namespaces**: `workspaceId = null` - Available to all workspaces
- **Workspace-scoped namespaces**: `workspaceId = <id>` - Only available within that workspace

### Usage in Conditions

Reference global variables using the `global.<namespace>.<field>` syntax:

```sql
-- Simple mode condition
{ field: "global.COMPANY.creationDate", operator: "lessThan", value: "2024-01-01" }

-- Advanced mode expression
global.LIMITS.maxDailyRequests > params.requestCount
global.COMPANY.allowedDomains CONTAINS params.targetDomain
```

### Supported Field Types

| Type | Description | Example Value |
|------|-------------|---------------|
| STRING | Text value | `"production"` |
| NUMBER | Numeric value | `100` |
| BOOLEAN | True/false | `true` |
| DATE | ISO date string | `"2024-01-15"` |
| STRING_ARRAY | Array of strings | `["admin", "developer"]` |
| NUMBER_ARRAY | Array of numbers | `[80, 443, 8080]` |

---

## Available Context

Conditions can reference the following context:

### Request Context

| Field | Description | Example |
|-------|-------------|---------|
| `params.*` | Tool parameters | `params.query`, `params.branch` |
| `context.sourceIp` | Client IP address | `"192.168.1.100"` |
| `context.timestamp` | Request time (ISO) | `"2024-01-15T10:30:00Z"` |
| `context.dayOfWeek` | Day of week (0-6) | `1` (Monday) |
| `context.hourOfDay` | Hour (0-23) | `14` |

### Extracted Context (Tool-specific)

| Provider | Fields | Description |
|----------|--------|-------------|
| SQL | `sql.operation`, `sql.tables` | Parsed from SQL queries |
| GitHub | `github.repository`, `github.branch` | Parsed from GitHub operations |
| File | `file.path`, `file.extension` | Parsed from file operations |

### Global Variables

| Syntax | Description |
|--------|-------------|
| `global.<namespace>.<field>` | Reference to global variable |

---

## Operators

### SIMPLE Mode Operators

| Category | Operators |
|----------|-----------|
| Equality | `equals`, `notEquals` |
| String | `contains`, `startsWith`, `endsWith`, `matches` (regex) |
| Numeric | `lessThan`, `greaterThan`, `between` |
| Set | `in`, `notIn`, `containsAny`, `containsNone` |
| Existence | `exists`, `notExists` |
| Network | `inCidr`, `notInCidr` |

### ADVANCED Mode Operators

| Category | Operators |
|----------|-----------|
| Comparison | `=`, `!=`, `<>`, `<`, `>`, `<=`, `>=` |
| Logical | `AND`, `OR`, `NOT` |
| Set | `IN`, `NOT IN` |
| Range | `BETWEEN ... AND ...` |
| Pattern | `LIKE`, `NOT LIKE` |
| Null | `IS NULL`, `IS NOT NULL` |

---

## Condition Categories

Conditions are organized into categories that determine available operators and UI treatment:

| Category | Field Prefix | Examples | Typical Operators | UI Treatment |
|----------|--------------|----------|-------------------|--------------|
| **Time** | `context.` | `hourOfDay`, `dayOfWeek`, `timestamp` | between, in, equals | Time picker, day selector |
| **Network** | `context.` | `sourceIp` | inCidr, equals, in | CIDR input with validation |
| **Parameters** | `params.` | `params.query`, `params.branch` | All operators | Type-aware input |
| **Extracted** | `{provider}.` | `sql.operation`, `github.branch` | equals, in, notIn, matches | Dropdown when enum available |
| **Global** | `global.` | `global.LIMITS.maxRequests` | All operators | Type-aware based on field type |

---

## Tool Parameter Discovery

### Schema Persistence

MCP tools provide parameter schemas at discovery time. These are persisted in the `McpTool` model:

```prisma
model McpTool {
  // ... existing fields ...
  inputSchema  Json?  // Full parameter schema from MCP discovery
}
```

The `inputSchema` contains:
- Parameter names and types
- Required vs optional parameters
- Enum values where applicable
- Parameter descriptions

### UI Benefits

With parameter schemas stored, the condition builder can:

1. **Show available parameters** for each tool
2. **Validate condition fields** against actual parameters
3. **Provide autocomplete** for `params.*` fields
4. **Show parameter types** to guide operator selection
5. **Distinguish required vs optional** parameters

---

## Historical Value Learning

For parameters without explicit enums, we learn common values from actual tool invocations.

### Schema

```prisma
model ToolParamValue {
  id              String   @id @default(cuid())
  organizationId  String
  toolId          String   // Reference to McpTool
  paramName       String   // e.g., "page_id"
  paramValue      String   // e.g., "doc_abc123"
  frequency       Int      @default(1)
  lastUsed        DateTime @updatedAt

  @@unique([organizationId, toolId, paramName, paramValue])
  @@index([organizationId, toolId, paramName])
}
```

### Sensitive Parameter Detection

Never track values for sensitive parameters. Detection patterns:

```typescript
const SENSITIVE_PATTERNS = [
  /password/i, /secret/i, /token/i, /key/i, /credential/i,
  /auth/i, /bearer/i, /api_key/i, /private/i
];
```

### Housekeeping

Stale or low-frequency values are cleaned up periodically:

- **3-month threshold**: Values older than 3 months
- **Low frequency**: Values used fewer than 3 times
- **One-off values**: Single-use values older than 3 months

### Value Source Priority

When populating the condition builder:

1. **Schema enum**: Definitive list, show as radio/select
2. **Schema boolean**: Show true/false toggle
3. **Historical values**: Show dropdown with "custom" option
4. **No data**: Show free text input

---

## LLM-Assisted Authoring

### Policy Generation Service

Located in the API services layer, the policy generation service provides:

| Method | Description |
|--------|-------------|
| `generateFromDescription()` | Natural language -> structured policy |
| `generateFromPermissionRequest()` | Permission request -> suggested policy |
| `generateFromAuditPattern()` | Audit log patterns -> policy recommendations |
| `explainPolicy()` | Policy -> plain English explanation |
| `explainDenial()` | Denial -> user-friendly explanation |

### 1. Natural Language -> Conditions

Admin types: "Developers can query the database but only SELECT statements and not on the users table"

LLM generates:
```yaml
matchers: [role:Developer]
tools: [database::query]
effect: ALLOW
conditions:
  - sql.operation equals "SELECT"
  - sql.tables notContains "users"
```

Admin reviews, adjusts if needed, approves.

### 2. Permission Request -> Policy Suggestion

User requests: "I need access to GitHub to create PRs for the backend repo"

LLM suggests:
```yaml
matchers: [user:alice@example.com]
tools: [github.com::createPR]
effect: ALLOW
conditions:
  - github.repository equals "backend"
```

With explanation: "Scoped to user (not role) since this is an individual request. Scoped to backend repo since that's what they mentioned."

### 3. Audit Pattern -> Policy Recommendation

System observes: "Bob has called database::query 47 times. All SELECT on analytics_* tables."

LLM suggests: "Formalize Bob's access pattern?"
```yaml
matchers: [user:bob@example.com]
tools: [database::query]
effect: ALLOW
conditions:
  - sql.operation equals "SELECT"
  - sql.tables matches "^analytics_"
```

### 4. Policy Explanation

Admin clicks on complex policy, LLM explains in plain English what it does, who it affects, and what would be blocked.

### 5. Denial Explanation

When a request is denied, LLM explains why in user-friendly terms and suggests what the user could do (request access, modify their request, etc.).

---

## Tool Context Extraction

To enable rich conditions like `sql.operation` or `github.branch`, structured context is extracted from tool parameters.

### Built-in Extractors

- **SQL**: Parse query to extract operation, tables, has WHERE clause
- **GitHub**: Extract repository, branch, action type
- **Files**: Extract path, extension, directory

### MCP Server-Declared Context

MCP servers can declare what context they provide:
```json
{
  "tool": "execute_sql",
  "contextSchema": {
    "sql.operation": { "type": "string", "enum": ["SELECT", "INSERT", "UPDATE", "DELETE"] },
    "sql.tables": { "type": "array" }
  }
}
```

### Admin-Defined Extractors (future)

For edge cases, admins could define extraction rules using JSONPath or regex.

---

## Design Requirement: Modularity

The conditions system is designed for easy extension. New operators, context types, and extractors can be added without modifying core evaluation logic.

### Operator Registry

```typescript
// Operators are registered, not hardcoded
const operatorRegistry = new Map<string, OperatorHandler>();

operatorRegistry.register('equals', equalsHandler);
operatorRegistry.register('contains', containsHandler);
operatorRegistry.register('inCidr', cidrHandler);
// Easy to add new operators later
```

### Context Provider Interface

```typescript
// Context extractors implement a common interface
interface ContextProvider {
  id: string;
  supportedTools: string[];  // Tool patterns this provider handles
  extract(params: unknown): Record<string, unknown>;
  schema: JsonSchema;  // Describes what context keys this provides
}

// Register providers
contextRegistry.register(new SqlContextProvider());
contextRegistry.register(new GitHubContextProvider());
// Easy to add new providers later
```

---

## Implementation Phases

### Phase 1: Conditions Engine (COMPLETE)

Added deterministic condition evaluation to the policy engine.

- [x] Schema: Add `conditions` JSON field to Policy
- [x] Schema: Add `inputSchema` JSON field to McpTool
- [x] Schema: Add `ToolParamValue` model for historical tracking
- [x] Service: `policyCondition.ts` - condition evaluation with modular operators
- [x] Service: `toolContext.ts` - context extraction with provider registry
- [x] Service: `toolParamHistory.ts` - track and query historical param values
- [x] API: Update policy CRUD to accept conditions
- [x] API: Add endpoint for param value suggestions
- [x] UI: Condition builder with category-aware inputs
- [x] UI: Type-aware parameter inputs (enum -> dropdown, boolean -> toggle, dynamic -> suggestions)
- [x] Tests: Comprehensive condition evaluation tests

### Phase 2: Policy Generation Service (COMPLETE)

Added LLM-assisted policy authoring.

- [x] Service: `policyGeneration.ts`
  - [x] `generateFromDescription()` - natural language -> policy
  - [x] `generateFromPermissionRequest()` - request -> suggested policy
  - [x] `generateFromAuditPattern()` - audit patterns -> policy recommendations
  - [x] `explainPolicy()` - policy -> plain English
  - [x] `explainDenial()` - denial -> user-friendly explanation
- [x] UI: Natural language input in policy form
- [x] UI: Suggested policy on permission request review
- [x] UI: "Why was this denied?" explanations

### Phase 3: Deprecate Semantic Evaluation (COMPLETE - 2026-01-30)

Semantic policies have been fully removed from Sentinel.

- [x] Remove `semanticPolicy` field from active use
- [x] Remove `confidenceThreshold` field from active use
- [x] Remove LLM calls from policy evaluation hot path
- [x] All evaluation is now deterministic
- [x] Fields may remain in schema for historical data migration only

### Phase 4: Advanced Features (PLANNING)

- [ ] Audit pattern analysis -> policy suggestions
- [ ] Policy conflict analysis with LLM explanations
- [ ] Policy impact preview (what would this policy affect?)
- [ ] Condition templates for common patterns

---

## What This Replaces

| Old Feature | New Approach |
|-------------|--------------|
| Feature 4: Semantic Parameter Policies | Conditions Engine + Policy Generation |
| Feature 5: Time-Based Policies | Condition on `context.hourOfDay`, `context.dayOfWeek` |
| POLICY-RETHINK.md | This document |
| semantic-policy-refactor-plan.md | This document |

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Policy evaluation latency | < 5ms | ACHIEVED |
| Adoption | >80% new policies use conditions | On track |
| Migration | >50% semantic policies converted | COMPLETE (100%) |
| Admin satisfaction | Policy creation time reduced | Achieved |

---

## Open Questions

1. **Condition builder UI**: Visual builder vs JSON editor vs hybrid?
2. **Context extraction**: How much built-in vs server-declared vs admin-defined?
3. **LLM model**: Which model for policy generation? (Cost vs quality tradeoff)
4. **Validation**: How to validate LLM-generated conditions before admin approval?
5. **Historical value privacy**: Should we allow admins to disable historical tracking per-tool or per-param?
6. **Historical value retention**: 3-month cleanup threshold appropriate? Make configurable?
