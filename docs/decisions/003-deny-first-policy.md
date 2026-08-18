# ADR-003: DENY-First Policy Evaluation

**Status**: Accepted
**Date**: 2024-01
**Deciders**: Project Team

## Context

The policy engine is SENTINEL's security boundary. It decides whether to allow or deny tool invocations. The evaluation algorithm must be:

- **Secure by default**: Fail closed when uncertain
- **Predictable**: No surprising outcomes
- **Unambiguous**: No conflicting policy resolution needed
- **Auditable**: Clear why each decision was made

Two main approaches:

1. **DENY-first**: Check DENY policies before ALLOW policies
2. **ALLOW-first**: Check ALLOW policies before DENY policies

## Decision

Use **DENY-first, fail-closed** policy evaluation.

### Algorithm

```
1. Load all enabled policies for the organization
2. Check DENY policies first
   - If ANY DENY policy matches → DENIED (stop evaluation)
3. Check ALLOW policies
   - If ANY ALLOW policy matches → ALLOWED
   - If NO ALLOW policy matches → DENIED (fail-closed)
4. Log audit entry with matched policy IDs
```

## Rationale

### Why DENY-First

1. **Security First**: DENY policies cannot be overridden by ALLOW policies
2. **No Conflicts**: DENY always wins, simple and predictable
3. **Explicit Denials**: Can block specific dangerous operations
4. **Fail-Closed**: Default is to deny unless explicitly allowed

### Example

```typescript
Policies:
- ALLOW role:DEVELOPER → github.com::*
- DENY  *                → github.com::deleteBranch

User: developer@example.com (role: DEVELOPER)
Tool: github.com::deleteBranch

Evaluation:
1. Check DENY: Matches "* → github.com::deleteBranch" ✅
2. Result: DENIED (DENY policy wins)

// Even though ALLOW matches, DENY takes precedence
```

## Consequences

### Positive ✅

- **No Ambiguity**: DENY always wins, easy to reason about
- **Security**: Can't accidentally allow dangerous operations
- **Auditable**: Clear policy precedence
- **Simple Logic**: Easy to implement and test

### Negative ❌

- **Less Flexible**: Can't override DENY policies (by design)
- **Requires Careful Policy Design**: DENY policies must be specific
- **No Policy Priorities**: All DENYs are equal, all ALLOWs are equal

## Alternatives Considered

### ALLOW-First

- **Pros**: More permissive by default
- **Cons**: Security risk, ALLOW could override DENY
- **Why Not**: Violates "secure by default" principle

### Priority-Based (AWS IAM style)

- **Pros**: More flexible, can have explicit priorities
- **Cons**: Complex, hard to reason about, conflicts possible
- **Why Not**: Complexity not needed for SENTINEL's use case

### Role-Based Only (no policies)

- **Pros**: Simpler, roles map to permissions directly
- **Cons**: Not granular enough, can't deny specific tools
- **Why Not**: Need fine-grained control per tool

## Implementation Notes

**Fail-Closed Behavior**:

```typescript
// If no ALLOW policy matches, DENY
if (allowPolicies.length === 0 || !allowPolicies.some((p) => matches(p, context))) {
  return { effect: 'DENIED', justification: 'No matching ALLOW policy' };
}
```

**Policy Matching**:

- Matcher patterns: `role:ADMIN`, `user:email@example.com`, `agent:agentId`, `*`
- Tool patterns: `domain::tool`, `domain::*`, `*::tool`, `*::*`

## Security Considerations

**CRITICAL**: DENY policies must NEVER be bypassable. No exceptions:

- ❌ No "admin override" for DENY policies
- ❌ No "emergency access" that skips DENY checks
- ❌ No "disabled" DENY policies that still match

**Why**: DENY policies are the last line of defense against destructive operations.

## Related Decisions

- See `docs/spec/05-policy-engine.md` for full specification
- See `packages/api/src/services/policy.ts` for implementation
