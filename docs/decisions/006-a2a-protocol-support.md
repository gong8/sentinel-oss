# ADR-006: A2A Protocol Support

**Status**: Accepted  
**Date**: 2026-01-05  
**Author**: Nelson Gong  
**Deciders**: Nelson Gong

## Context

Sentinel was originally built as a control plane for MCP (Model Context Protocol) servers. The MCP security space is becoming crowded:

- Runlayer raised $11M (managed SaaS, MCP-only)
- Cloudflare, Docker, and Wiz are adding MCP features
- Competition on MCP-only positioning is intensifying

Google's A2A (Agent2Agent) protocol launched in April 2025, enabling agent-to-agent communication. The MCP + A2A intersection is currently uncontested.

Both protocols share a common gap: they define how to declare authentication requirements but not how to manage credentials. This is Sentinel's core value proposition.

## Decision

**Sentinel will expand to support both MCP and A2A protocols as a unified agent authorization platform.**

### Architectural Decisions

1. **Proxy Architecture**: Start with sidecar credential injection (option A), design credential layer to support direct API access (option C) in the future. Skip full protocol proxy (option B).

2. **Data Model**: Extend Agent model with `protocolType` enum (MCP | A2A) and A2A-specific fields (agentCardUrl, verification status).

3. **Credential Layer**: Protocol-agnostic design that outputs ready-to-inject HTTP headers, serving both proxy injection and future API access patterns.

4. **Policy Engine**: Extend matcher patterns with A2A-specific prefixes (`a2a-agent:`, `a2a-provider:`, `a2a-skill:`).

5. **Identity Verification**: Implement Agent Card signature verification (JWS) as a security differentiator for regulated enterprises.

## Rationale

### Why Support A2A?

1. **Market differentiation**: Runlayer and others are MCP-only. MCP + A2A creates defensible positioning.

2. **Technical fit**: A2A uses standard HTTP-layer auth (OpenAPI-style security schemes). Our OAuth proxy work applies directly.

3. **Same gap**: A2A explicitly states credential acquisition is "out-of-band" — Sentinel fills this gap.

4. **Target market alignment**: Regulated enterprises (finance, healthcare, gov) need self-hosted infrastructure and will need A2A support as agent-to-agent communication grows.

### Why Sidecar Over Full Proxy?

- A2A auth is HTTP-layer (headers only), not protocol-layer
- Full proxy adds latency and complexity for simple header injection
- Sidecar pattern matches existing MCP proxy architecture

### Why JWS Verification?

- Most implementations skip signature verification
- Regulated enterprises require proof of agent identity
- Aligns with Phase 1 Feature 2 (Agent Identity Attestation)
- Security differentiator in enterprise sales

## Consequences

### Positive

- First-mover advantage in MCP + A2A unified auth space
- ~70-80% infrastructure reuse from MCP implementation
- Clear differentiation from Runlayer and others
- Positions Sentinel for enterprise adoption of A2A

### Negative

- A2A adoption is uncertain (protocol is 8 months old)
- Increased surface area to maintain
- Different mental models (MCP hierarchical vs A2A peer) may confuse users

### Risks

1. **A2A may not achieve adoption**: Mitigated by keeping MCP as foundation, A2A as expansion
2. **Scope creep into orchestration**: Mitigated by staying focused on auth layer only
3. **Spec instability**: A2A is young, spec may change. Design for flexibility.

## Implementation

See [A2A Integration Strategy](../archive/sessions/a2a-integration-strategy.md) for detailed implementation phases.

**Timeline**: Q1 2026 for Phase A2A-0 (basic support)

**Key Milestones**:

- Week 1-2: Data model extensions
- Week 3-4: Agent Card service with JWS verification
- Week 5-6: A2A auth proxy (header injection)
- Week 7-8: Admin UI for A2A agents
- Week 9-10: Testing and hardening

## Alternatives Considered

### 1. Stay MCP-Only

**Rejected**: Market is crowding, no differentiation path. Runlayer has more funding for enterprise sales.

### 2. Build Full A2A Proxy (Option B)

**Rejected**: Unnecessary complexity. A2A auth is HTTP-layer, doesn't require protocol mediation. Full proxy adds latency without benefit.

### 3. Credential API Only (Option C)

**Rejected for now**: Good pattern but requires agents to integrate with Sentinel API. Sidecar injection is transparent to agents. Will add API access as Phase A2A-1 for agents that can't route through proxy.

### 4. Wait for A2A Adoption

**Rejected**: First-mover advantage matters. Building now positions us ahead of competitors if/when A2A gains traction. Cost of being early is low given infrastructure reuse.

## References

- [A2A Protocol Specification](https://github.com/google/A2A)
- [A2A Authentication Documentation](https://github.com/google/a2a/blob/main/docs/topics/enterprise-ready.md)
- [Sentinel A2A Integration Strategy](../archive/sessions/a2a-integration-strategy.md)
