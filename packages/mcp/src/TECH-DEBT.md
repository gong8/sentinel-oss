# Technical Debt: MCP Argument Handling

**Date**: January 3, 2026
**Severity**: P1 - High
**Status**: ✅ RESOLVED - Workaround removed or never implemented

> **Note (2026-01-15)**: The workaround code documented below (`pendingArguments`, `__arg0` handling) does not exist in the current codebase. Either the issue was resolved differently, the workaround was never implemented, or it was removed. This document is retained for historical context. If you encounter MCP argument passing issues, investigate the current SDK version and implementation.

---

## Problem

The MCP SDK (`@modelcontextprotocol/sdk` v1.25.1) does not pass tool arguments to `registerTool` handlers when used with `StreamableHTTPServerTransport`.

### What Should Happen

```typescript
server.registerTool('submit_backtest', {}, async (args) => {
  // args should contain: { runName, data, strategy, costs, initialCash }
});
```

### What Actually Happens

```typescript
server.registerTool('submit_backtest', {}, async (args) => {
  // args contains: { signal, sessionId, _meta, requestInfo, ... }
  // Actual tool arguments are MISSING
});
```

### Evidence

From logs:

```
[MCP] tools/call request body:
  "arguments": {
    "__arg0": "{\"runName\": \"...\", \"data\": [...]}"  ← Cursor sends this
  }

Parameters being sent: {}  ← We receive NOTHING
```

---

## Current Workaround (TEMPORARY)

**Location**: `packages/mcp/src/server.ts` lines ~888-923 and ~530-560

### How It Works

1. Intercept raw JSON-RPC request in `handlePostRequest`
2. Extract `params.arguments.__arg0` from request body
3. Parse JSON string to get actual arguments
4. Store in `this.pendingArguments` map
5. Retrieve in `handleToolInvocation` before forwarding

### Code

```typescript
// Step 1: Intercept and store (line ~900)
const bodyAny = body as any; // ← Type safety violation!
if (bodyAny.params?.arguments?.__arg0) {
  const parsedArgs = JSON.parse(args.__arg0);
  this.pendingArguments.set(`${sessionId}:${toolName}:${requestId}`, parsedArgs);
}

// Step 2: Retrieve and use (line ~540)
const key = `${sessionId}:${toolName}:`;
const latestArgs = findLatestInMap(key); // ← Fragile!
parameters = latestArgs;
```

---

## Why This Is BAD

### 1. Type Safety Violations ❌

```typescript
const bodyAny = body as any; // Forbidden per AGENTS.md
```

**AGENTS.md quote**:

> NEVER use "as any" or unsafe type assertions

### 2. Relies on Side Effects ❌

- State stored in map
- Retrieved later based on timing
- Race conditions possible
- Not functional/pure

### 3. Memory Management ❌

- Arguments stored but might not be cleaned up
- Map grows unbounded if lookups fail
- No TTL or cleanup mechanism

### 4. Fragile Assumptions ❌

- Assumes `__arg0` is always JSON string
- Assumes Cursor's specific format
- Breaks if SDK behavior changes
- Tight coupling to implementation details

### 5. Poor Observability ❌

- Future maintainers won't understand why this exists
- Debugging is harder (arguments come from unexpected place)
- Not obvious from code flow

---

## What Should Be Done Instead

### Option A: Fix MCP SDK Usage (RECOMMENDED)

The SDK must support arguments somehow. Possible approaches:

1. **Use different handler signature**

   ```typescript
   // Maybe the SDK expects:
   server.setRequestHandler(CallToolRequestSchema, async (request) => {
     const { params } = request;
     // params.arguments should be here
   });
   ```

2. **Use SDK's tool definition format**

   ```typescript
   // Maybe we need to define inputSchema?
   server.registerTool('submit_backtest', {
     inputSchema: {
       type: 'object',
       properties: {...}
     }
   }, handler);
   ```

3. **Check SDK version compatibility**
   - Maybe we're on wrong SDK version?
   - Check if there's a newer version with fixes?

### Option B: Fork/Patch MCP SDK

If SDK is genuinely broken:

1. Report bug to MCP SDK maintainers
2. Create patch in `patches/` directory
3. Document why patch is needed

### Option C: Different Transport

Maybe `StreamableHTTPServerTransport` has this bug but other transports don't?

- Try SSE transport?
- Try stdio transport for testing?

---

## Security Impact

### Good News ✅

Despite being a hack, the workaround DOES maintain security:

- ✅ **Policy evaluation works** - Arguments are evaluated against policies
- ✅ **Audit logging works** - All tool calls logged with parameters
- ✅ **Credential management works** - No change to auth flow
- ✅ **No bypass** - All calls still go through SENTINEL proxy

### Bad News ⚠️

- Fragile code is a security risk long-term
- Hard to audit/review
- Could break silently with SDK updates
- Type safety violations hide potential issues

---

## Action Plan

### Immediate (P0)

- [x] Document this technical debt (this file)
- [ ] Add TODO comment in code pointing to this doc
- [ ] Test thoroughly to ensure no regressions

### Short-term (P1)

- [ ] Research correct MCP SDK usage for streaming HTTP
- [ ] Check MCP SDK GitHub issues for similar problems
- [ ] Test with different SDK versions
- [ ] Contact MCP SDK maintainers if needed

### Medium-term (P1)

- [ ] Implement proper solution once found
- [ ] Remove workaround code
- [ ] Add integration tests for argument passing
- [ ] Update documentation

---

## Testing Checklist

Before deploying with this workaround:

- [ ] Test simple tools (no args) - should still work
- [ ] Test complex tools (with args) - should now work
- [ ] Test concurrent requests - check for race conditions
- [ ] Test memory usage - ensure map doesn't grow unbounded
- [ ] Test malformed JSON in \_\_arg0 - ensure graceful failure
- [ ] Verify policy evaluation gets correct arguments
- [ ] Verify audit logs contain correct parameters

---

## If You're Reading This

If you're a future AI agent or developer encountering this code:

**DON'T COPY THIS PATTERN**

This is a workaround for a specific MCP SDK issue, not a best practice.

**DO THIS INSTEAD**:

1. Check if MCP SDK has been updated/fixed
2. Look for proper argument handling in SDK docs
3. Remove this workaround if SDK works correctly now

**Questions?** Contact the original author or check:

- MCP SDK GitHub: https://github.com/modelcontextprotocol/sdk
- SENTINEL issue tracker
- This file's git blame for context

---

## Acceptance Criteria for Proper Fix

The workaround can be removed when:

1. ✅ Tool handlers receive arguments directly (no map lookup)
2. ✅ No `as any` type assertions needed
3. ✅ No side effects or state storage
4. ✅ Works with official MCP SDK (no patches)
5. ✅ All tests pass
6. ✅ Type safety fully preserved

---

**Bottom Line**: This workaround gets us unblocked but violates code quality principles. It MUST be replaced with a proper solution before production deployment.
