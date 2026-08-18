# SENTINEL Policy Engine

> **Implementation**: `packages/api/src/services/policy.ts`

This document is the definitive reference for policy evaluation logic in SENTINEL.

## Policy Evaluation (Deny-First, Fail-Closed)

The policy engine evaluates requests using a deny-first, fail-closed approach:

1. **Any matching DENY policy blocks request** - A single DENY match immediately rejects the request
2. **No matching ALLOW policy → request denied** - If no ALLOW policy matches, the request is denied (fail-closed)
3. **Higher priority policies evaluated first** - Policies with higher priority numbers are checked before lower ones
4. **First match wins** - The first policy that matches determines the outcome

This ensures that explicit denials always take precedence and that unlisted operations are blocked by default.

---

## Matcher Types (WHO is calling)

Matchers identify WHO is making the request. A policy matches if ANY matcher in its list matches the caller.

| Matcher | Format | Example | Description |
|---------|--------|---------|-------------|
| Wildcard | `*` | `*` | Matches everyone |
| Role | `role:RoleName` | `role:ADMIN` | User has this role |
| User | `user:email` | `user:alice@example.com` | Specific user by email |
| Agent | `agent:agentId` | `agent:agt_456` | Specific agent by ID |

**Note**: A2A agents are TARGETS (not callers). Control A2A access via tool patterns, not matchers.

---

## Tool Pattern Types (WHAT is being called)

Tool patterns identify WHAT operation is being performed. A policy matches if ANY tool pattern in its list matches the requested tool.

### MCP Tool Patterns

Format: `serverKey::toolName`

| Pattern Type | Example | Matches |
|--------------|---------|---------|
| Specific tool | `github.com::create_issue` | Single tool on specific server |
| All tools on server | `github.com::*` | Any tool on github.com |
| Tool prefix | `github.com::read_*` | Tools starting with "read_" |
| Universal wildcard | `*::*` | All MCP tools |

### A2A Tool Patterns

Format: `a2a::agentId::skillId`

| Pattern Type | Example | Matches |
|--------------|---------|---------|
| Specific skill | `a2a::agent123::code_review` | Single skill on specific agent |
| All skills on agent | `a2a::agent123::*` | Any skill on agent |
| All A2A agents | `a2a::*::*` | All A2A skills |

---

## Delegation

When `delegatedUser` is present (agent acting on behalf of a user):

1. **Agent must match** via `agent:` matcher
2. **AND delegated user must match** via `user:` or `role:` matcher
3. **Both conditions must be satisfied** for the policy to apply

This ensures that delegated actions are authorized for both the agent AND the user it represents.

---

## Condition System (WHEN)

Conditions allow fine-grained control over WHEN a policy applies based on request parameters and context.

### Two Modes

1. **SIMPLE mode** - Array of conditions (all must match, AND logic)
2. **ADVANCED mode** - Expression language (SQL-like syntax)

### Simple Conditions

An array of condition objects. All conditions must match (AND logic).

```json
{
  "conditions": [
    { "field": "params.branch", "operator": "equals", "value": "main" },
    { "field": "context.hourOfDay", "operator": "between", "value": [9, 17] }
  ]
}
```

### Advanced Conditions

A single expression string using SQL-like syntax.

```json
{
  "conditionExpression": "params.amount < 1000 AND context.hourOfDay BETWEEN 9 AND 17"
}
```

---

## Available Context

Context fields available for use in conditions:

### Request Parameters

| Field | Description | Example |
|-------|-------------|---------|
| `params.*` | Tool parameters | `params.query`, `params.branch`, `params.amount` |

### Request Context

| Field | Description | Example Values |
|-------|-------------|----------------|
| `context.sourceIp` | Client IP address | `192.168.1.100` |
| `context.timestamp` | Request timestamp | ISO 8601 string |
| `context.dayOfWeek` | Day of week | 0 (Sunday) - 6 (Saturday) |
| `context.hourOfDay` | Hour of day | 0 - 23 |

### Tool-Specific Context (Extracted)

| Field | Description | Extracted From |
|-------|-------------|----------------|
| `sql.operation` | SQL operation type | SELECT, INSERT, UPDATE, DELETE |
| `sql.tables` | Tables referenced | Array of table names |
| `github.repository` | Target repository | `owner/repo` |
| `github.branch` | Target branch | `main`, `develop` |
| `file.path` | File path | `/path/to/file.txt` |
| `file.extension` | File extension | `.txt`, `.js` |

### Global Variables

| Field | Description |
|-------|-------------|
| `global.<namespace>.<field>` | Organization-defined global variables |

---

## Operators

### Equality Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `{ "field": "params.status", "operator": "equals", "value": "active" }` |
| `notEquals` | Not equal | `{ "field": "params.env", "operator": "notEquals", "value": "production" }` |

### String Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `contains` | Substring match | `{ "field": "params.query", "operator": "contains", "value": "SELECT" }` |
| `startsWith` | Prefix match | `{ "field": "params.path", "operator": "startsWith", "value": "/api/" }` |
| `endsWith` | Suffix match | `{ "field": "file.path", "operator": "endsWith", "value": ".config" }` |
| `matches` | Regex match | `{ "field": "params.email", "operator": "matches", "value": "^.*@company\\.com$" }` |

### Numeric Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `lessThan` | Less than | `{ "field": "params.amount", "operator": "lessThan", "value": 1000 }` |
| `greaterThan` | Greater than | `{ "field": "params.count", "operator": "greaterThan", "value": 0 }` |
| `lessThanOrEquals` | Less than or equal | `{ "field": "params.retries", "operator": "lessThanOrEquals", "value": 3 }` |
| `greaterThanOrEquals` | Greater than or equal | `{ "field": "params.priority", "operator": "greaterThanOrEquals", "value": 5 }` |
| `between` | Range (inclusive) | `{ "field": "context.hourOfDay", "operator": "between", "value": [9, 17] }` |

### Set Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `in` | Value in set | `{ "field": "params.env", "operator": "in", "value": ["dev", "staging"] }` |
| `notIn` | Value not in set | `{ "field": "params.region", "operator": "notIn", "value": ["cn", "ru"] }` |
| `containsAny` | Array contains any | `{ "field": "sql.tables", "operator": "containsAny", "value": ["users", "accounts"] }` |
| `containsNone` | Array contains none | `{ "field": "sql.tables", "operator": "containsNone", "value": ["audit_logs"] }` |

### Existence Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `exists` | Field exists | `{ "field": "params.approvalId", "operator": "exists" }` |
| `notExists` | Field does not exist | `{ "field": "params.bypassReason", "operator": "notExists" }` |

### Network Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `inCidr` | IP in CIDR range | `{ "field": "context.sourceIp", "operator": "inCidr", "value": "10.0.0.0/8" }` |
| `notInCidr` | IP not in CIDR | `{ "field": "context.sourceIp", "operator": "notInCidr", "value": "192.168.0.0/16" }` |

---

## Advanced Expression Language

The advanced condition expression language supports SQL-like syntax with built-in functions.

### Syntax

```sql
params.amount < 1000 AND context.hourOfDay BETWEEN 9 AND 17
(params.env = 'production' OR params.env = 'staging') AND context.dayOfWeek IN (1, 2, 3, 4, 5)
NOT (sql.tables CONTAINS 'audit_logs') AND params.operation = 'DELETE'
```

### Built-in Functions (30+)

#### String Functions

| Function | Description | Example |
|----------|-------------|---------|
| `upper(str)` | Uppercase | `upper(params.name) = 'ADMIN'` |
| `lower(str)` | Lowercase | `lower(params.email) CONTAINS '@company.com'` |
| `trim(str)` | Remove whitespace | `trim(params.input) != ''` |
| `substring(str, start, len)` | Extract substring | `substring(params.code, 0, 3) = 'PRJ'` |
| `replace(str, old, new)` | Replace text | `replace(params.path, '//', '/') STARTS WITH '/api'` |
| `split(str, delim)` | Split to array | `length(split(params.tags, ',')) > 2` |
| `join(arr, delim)` | Join array | `join(params.items, ', ')` |

#### Array Functions

| Function | Description | Example |
|----------|-------------|---------|
| `length(arr)` | Array/string length | `length(sql.tables) <= 3` |
| `contains(arr, val)` | Array contains value | `contains(params.roles, 'admin')` |
| `first(arr)` | First element | `first(sql.tables) = 'users'` |
| `last(arr)` | Last element | `last(params.path.split('/'))` |
| `slice(arr, start, end)` | Slice array | `slice(params.items, 0, 5)` |
| `map(arr, expr)` | Transform elements | `map(params.items, x -> upper(x))` |
| `filter(arr, expr)` | Filter elements | `filter(params.amounts, x -> x > 100)` |

#### Math Functions

| Function | Description | Example |
|----------|-------------|---------|
| `abs(num)` | Absolute value | `abs(params.delta) < 10` |
| `round(num)` | Round to integer | `round(params.score) >= 80` |
| `floor(num)` | Round down | `floor(params.price)` |
| `ceil(num)` | Round up | `ceil(params.quantity) <= 100` |
| `min(a, b, ...)` | Minimum value | `min(params.x, params.y) > 0` |
| `max(a, b, ...)` | Maximum value | `max(params.attempts, 1) <= 3` |

#### Date Functions

| Function | Description | Example |
|----------|-------------|---------|
| `now()` | Current timestamp | `now()` |
| `date(str)` | Parse date | `date(params.deadline) > now()` |
| `year(ts)` | Extract year | `year(context.timestamp) = 2024` |
| `month(ts)` | Extract month (1-12) | `month(context.timestamp) IN (1, 2, 3)` |
| `day(ts)` | Extract day (1-31) | `day(context.timestamp) <= 15` |
| `hour(ts)` | Extract hour (0-23) | `hour(context.timestamp) BETWEEN 9 AND 17` |
| `minute(ts)` | Extract minute (0-59) | `minute(context.timestamp) = 0` |

#### Logic Functions

| Function | Description | Example |
|----------|-------------|---------|
| `if(cond, then, else)` | Conditional | `if(params.priority = 'high', 1, 0) = 1` |
| `coalesce(a, b, ...)` | First non-null | `coalesce(params.limit, 100) <= 1000` |
| `isNull(val)` | Check if null | `NOT isNull(params.approver)` |

---

## Tool Context Extraction

The policy engine automatically extracts context from tool parameters using built-in extractors.

### Built-in Extractors

| Extractor | Extracted Fields | Description |
|-----------|------------------|-------------|
| SQL Parser | `sql.operation`, `sql.tables` | Parses SQL queries to extract operation type and referenced tables |
| GitHub Extractor | `github.repository`, `github.branch` | Extracts repository and branch from GitHub API parameters |
| File Extractor | `file.path`, `file.extension` | Extracts path components from file operation parameters |

### MCP Server-Declared Context

MCP servers can declare context schemas in their tool definitions via `contextSchema`. This enables:

- Custom context fields specific to the tool
- Type-safe context extraction
- Automatic documentation of available fields

---

## Tool Parameter Discovery

### Schema Persistence

The `McpTool.inputSchema` field persists the parameter schema from MCP tool definitions, enabling:

- Runtime parameter validation
- UI form generation
- Policy condition autocomplete

### Historical Value Tracking

The `ToolParamValue` model tracks historical parameter values, enabling:

- UI autocomplete for `params.*` fields in policy conditions
- Pattern detection for common parameter values
- Sensitive parameter identification

### Sensitive Parameter Detection

Parameters are flagged as sensitive if their names match common patterns:

- `password`
- `secret`
- `token`
- `key`
- `credential`
- `auth`
- `bearer`
- `api_key`
- `private`

Sensitive parameters are masked in logs and UI displays.

---

## Policy Testing

### PolicyTest Model

Stores test results for policy validation:

- Test inputs (matcher, tool, parameters, context)
- Expected outcome
- Actual result
- Pass/fail status

### PolicyAssertion

Reusable assertions for common test cases:

- Define once, use across multiple tests
- Shared assertion libraries per organization

### Conflict Detection

The `detectConflicts()` function identifies overlapping policies:

- Same matcher patterns with different effects
- Ambiguous tool pattern overlaps
- Condition conflicts

---

## Evaluation Tree

The full decision path is stored in `AuditLogEntry.evaluationTree` for debugging and auditing.

### Structure

```json
{
  "stages": [
    {
      "name": "deny-evaluation",
      "policies": [
        {
          "policyId": "pol_123",
          "policyName": "Block Production Deletes",
          "matcherResult": { "matched": true, "matchedOn": "role:DEVELOPER" },
          "toolResult": { "matched": true, "matchedOn": "github.com::*" },
          "conditionResult": { "matched": true, "details": "params.branch = 'main'" },
          "result": "MATCHED"
        }
      ],
      "result": "DENY"
    }
  ],
  "finalDecision": "DENY",
  "justification": "Blocked by policy 'Block Production Deletes'"
}
```

### Tree Contents

| Field | Description |
|-------|-------------|
| `stages` | Pipeline stages (deny-evaluation, allow-evaluation) |
| `policies` | Each policy evaluated with detailed results |
| `matcherResult` | Which matcher matched and how |
| `toolResult` | Which tool pattern matched and how |
| `conditionResult` | Condition evaluation details |
| `finalDecision` | ALLOW, DENY, or NO_MATCH |
| `justification` | Human-readable explanation |

---

## Examples

### Example 1: Time-Based Access Control

Allow read operations only during business hours:

```json
{
  "name": "Business Hours Read Access",
  "effect": "ALLOW",
  "matchers": ["role:DEVELOPER"],
  "toolPatterns": ["*::read_*", "*::get_*", "*::list_*"],
  "conditions": [
    { "field": "context.dayOfWeek", "operator": "between", "value": [1, 5] },
    { "field": "context.hourOfDay", "operator": "between", "value": [9, 17] }
  ],
  "priority": 100
}
```

### Example 2: SQL Table Protection

Block DELETE operations on audit tables:

```json
{
  "name": "Protect Audit Tables",
  "effect": "DENY",
  "matchers": ["*"],
  "toolPatterns": ["database::execute_query"],
  "conditionExpression": "sql.operation = 'DELETE' AND sql.tables CONTAINS 'audit_logs'",
  "priority": 1000
}
```

### Example 3: IP-Based Restrictions

Allow production access only from office network:

```json
{
  "name": "Production Office Only",
  "effect": "ALLOW",
  "matchers": ["role:ADMIN"],
  "toolPatterns": ["production::*"],
  "conditions": [
    { "field": "context.sourceIp", "operator": "inCidr", "value": "10.0.0.0/8" }
  ],
  "priority": 500
}
```

### Example 4: Delegated Agent Access

Allow agents to perform read operations on behalf of users:

```json
{
  "name": "Agent Delegated Read Access",
  "effect": "ALLOW",
  "matchers": ["agent:agt_assistant", "user:*@company.com"],
  "toolPatterns": ["*::read_*"],
  "priority": 200
}
```

### Example 5: A2A Skill Restriction

Block all A2A agent access except for specific skills:

```json
{
  "name": "Block A2A Access",
  "effect": "DENY",
  "matchers": ["*"],
  "toolPatterns": ["a2a::*::*"],
  "priority": 1000
}
```

```json
{
  "name": "Allow Code Review Skill",
  "effect": "ALLOW",
  "matchers": ["role:DEVELOPER"],
  "toolPatterns": ["a2a::code-reviewer::review"],
  "priority": 1001
}
```
