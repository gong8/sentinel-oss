# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) documenting major technical decisions in SENTINEL.

## Current ADRs

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](./001-trpc-for-api.md) | tRPC for API Layer | Accepted | 2025-12-01 |
| [002](./002-prisma-for-database.md) | Prisma for Database ORM | Accepted | 2025-12-01 |
| [003](./003-deny-first-policy.md) | DENY-First Policy Evaluation | Accepted | 2025-12-01 |
| [004](./004-monorepo-structure.md) | Monorepo Structure | Accepted | 2025-12-01 |
| [005](./005-credential-encryption.md) | Credential Encryption Strategy | Accepted | 2025-12-01 |
| [006](./006-a2a-protocol-support.md) | A2A Protocol Support | Accepted | 2026-01-05 |

## ADR Summaries

### ADR-001: tRPC for API

- End-to-end type safety without codegen
- React Query integration built-in
- Internal API focus (not public REST)

### ADR-002: Prisma for Database

- Type-safe database access
- Schema-first development
- Migration support

### ADR-003: DENY-First Policy

- DENY always wins over ALLOW
- Fail-closed by default
- No bypass mechanisms
- **CRITICAL: Never change this behavior**

### ADR-004: Monorepo Structure

- Packages: api, db, web, mcp, a2a, shared, etc.
- Shared code in @sentinel/shared
- Independent deployment possible

### ADR-005: Credential Encryption

- AES-256-GCM encryption
- HKDF key derivation
- Never log plaintext

### ADR-006: A2A Protocol Support

- MCP + A2A = market differentiation
- Agent Card with JWS verification
- Credential injection for A2A agents

## ADR Format

```markdown
# ADR-XXX: Title

## Status
Proposed | Accepted | Deprecated | Superseded

## Date
YYYY-MM-DD

## Context
What is the issue we're trying to solve?

## Decision
What is the change we're proposing?

## Rationale
Why is this the best choice?

## Consequences
What are the trade-offs?

## Alternatives Considered
What other options did we evaluate?
```

## When to Create an ADR

Create an ADR for decisions that:

- Affect multiple packages
- Change fundamental architecture
- Have long-term implications
- Are difficult to reverse
- Need to be understood by future developers

## For AI Assistants

**Before suggesting changes**, check if an ADR exists that documents why things are the way they are. If you're about to make a significant decision, consider creating a new ADR to document it.
