# Policy Configuration Guide

> **Target audience**: Administrators managing AI tool access

This guide covers creating and managing policies in Sentinel to control which users can access which tools.

---

## Policy Basics

Policies are rules that determine what happens when an AI agent tries to use a tool. Each policy has:

- **Name**: Human-readable identifier
- **Rule**: What action to take (ALLOW, DENY, DEFER, FLAG)
- **Matcher**: Pattern matching tool requests
- **Priority**: Evaluation order (higher = evaluated first)
- **Roles**: Which user roles this policy applies to

---

## Rule Types

| Rule | Behavior |
|------|----------|
| `DENY` | Block the request immediately |
| `ALLOW` | Permit the request |
| `DEFER` | Require human approval before proceeding |
| `FLAG` | Allow but log/alert (for monitoring) |

**Evaluation Order**: DENY rules are always checked first and cannot be overridden.

---

## Matcher Patterns

Matchers determine which requests a policy applies to.

### MCP Tool Matchers

Pattern: `mcp-tool:<server>::<tool>`

| Pattern | Matches |
|---------|---------|
| `mcp-tool:*` | All MCP tools from all servers |
| `mcp-tool:filesystem::*` | All tools from "filesystem" server |
| `mcp-tool:filesystem::read_file` | Specific tool |
| `mcp-tool:*::write_*` | Any write tool from any server |

### A2A Matchers (Agent-to-Agent)

| Pattern | Matches |
|---------|---------|
| `a2a-agent:*` | Any A2A agent |
| `a2a-provider:github` | GitHub provider |
| `a2a-skill:code-review` | Code review skill |

### Parameter Conditions

Add conditions to match based on tool parameters:

```yaml
# Only allow reading from /safe directory
matcher: mcp-tool:filesystem::read_file
conditions:
  - field: path
    operator: startsWith
    value: /safe/
```

Available operators:
- `equals`, `notEquals`
- `contains`, `notContains`
- `startsWith`, `endsWith`
- `matches` (regex)
- `in`, `notIn` (arrays)

---

## Creating Policies

### Via Dashboard

1. Go to **Admin** > **Policies**
2. Click **Create Policy**
3. Fill in the form:
   - Name: Descriptive name
   - Rule: Select ALLOW/DENY/DEFER/FLAG
   - Matcher: Tool pattern
   - Priority: Number (default 0)
   - Roles: Select applicable roles

### Best Practices

1. **Start with DENY by default**: Create a `mcp-tool:*` DENY policy with low priority
2. **Add specific ALLOW policies**: Higher priority policies for permitted tools
3. **Use DEFER for sensitive operations**: File writes, database modifications
4. **Use FLAG for monitoring**: Track usage patterns without blocking

---

## Common Policy Patterns

### Read-Only Access

```yaml
# Deny all by default
- name: Default Deny
  rule: DENY
  matcher: mcp-tool:*
  priority: 0

# Allow read operations
- name: Allow Read Operations
  rule: ALLOW
  matcher: mcp-tool:*::read_*
  priority: 10

# Allow list operations
- name: Allow List Operations
  rule: ALLOW
  matcher: mcp-tool:*::list_*
  priority: 10
```

### Developer vs. Admin Access

```yaml
# Developers can read
- name: Developer Read Access
  rule: ALLOW
  matcher: mcp-tool:*::read_*
  roles: [developer]
  priority: 10

# Admins can write (with approval)
- name: Admin Write Access
  rule: DEFER
  matcher: mcp-tool:*::write_*
  roles: [admin]
  priority: 10

# Admins can delete (with approval)
- name: Admin Delete Access
  rule: DEFER
  matcher: mcp-tool:*::delete_*
  roles: [admin]
  priority: 10
```

### Sensitive File Protection

```yaml
# Block access to secrets
- name: Block Secrets Access
  rule: DENY
  matcher: mcp-tool:filesystem::*
  conditions:
    - field: path
      operator: matches
      value: ".*\\.(env|key|pem|secret)$"
  priority: 100

# Block /etc access
- name: Block System Configs
  rule: DENY
  matcher: mcp-tool:filesystem::*
  conditions:
    - field: path
      operator: startsWith
      value: /etc/
  priority: 100
```

### Approval for External Actions

```yaml
# Require approval for API calls
- name: External API Approval
  rule: DEFER
  matcher: mcp-tool:http::*
  priority: 20

# Require approval for database writes
- name: Database Write Approval
  rule: DEFER
  matcher: mcp-tool:database::insert_*
  priority: 20
```

---

## Testing Policies

Before deploying policies to production:

1. **Use FLAG rule first**: See what would be blocked without actually blocking
2. **Check Activity logs**: Review which requests hit which policies
3. **Test with a non-admin user**: Verify policies apply correctly
4. **Check for conflicts**: Higher priority policies override lower ones

---

## Policy Evaluation Flow

```
Request arrives
    ↓
Check DENY policies (highest priority first)
    ↓ (no match)
Check DEFER policies
    ↓ (no match)
Check FLAG policies
    ↓ (no match)
Check ALLOW policies
    ↓ (no match)
Default: DENY (fail-closed)
```

---

## Troubleshooting

### Policy not being applied

- Check matcher pattern matches the tool request
- Verify priority is high enough
- Check role assignment
- Review Activity logs for policy evaluation details

### Unexpected DENY

- Check for higher-priority DENY policies
- Verify conditions are correct
- Check for wildcard patterns that match unexpectedly

### DEFER not prompting for approval

- Verify user has the DEFER policy role
- Check webhook configuration for notifications
- Confirm the tool request matches the DEFER policy pattern
