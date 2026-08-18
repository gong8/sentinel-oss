# Sentinel

**A self-hosted governance layer for MCP servers.** Sentinel sits between your AI agents and the
tools they call, evaluates every request against your policies, and writes an audit trail of what
happened.

Runs entirely on your own machine. Postgres is the only hard dependency — no API keys, no cloud
account, no phoning home.

```
agent ──▶ Sentinel proxy ──▶ policy engine ──▶ MCP server
                                   │
                                   └──▶ audit log
```

---

## Why this exists

If you give an agent a set of MCP tools, you have handed it the ability to act. Most setups have no
answer to three questions:

- **Which tools is this agent allowed to call, under which conditions?**
- **What did it actually do?**
- **Who approved the thing that touched production?**

Sentinel answers all three with a policy engine that evaluates conditions per call, an append-only
audit log with before/after snapshots, and an approval workflow for anything you flag as sensitive.

## What's in the box

| | |
|---|---|
| **Policy engine** | ALLOW/DENY rules with condition trees. DENY always wins — it cannot be overridden by a later ALLOW |
| **Conditions** | Two modes: SIMPLE (flat array) and ADVANCED (nested AND/OR expression trees) |
| **MCP proxy** | Multi-transport: HTTP, STDIO, WebSocket, SSE |
| **Audit log** | Every tool call, policy change, auth event, and admin action, with before/after snapshots |
| **Multi-tenancy** | Organizations → workspaces → members, scoped at the query layer |
| **Approvals** | Flag tools as sensitive; calls block pending human approval |
| **Credentials** | AES-256-GCM encryption at rest for upstream server credentials |
| **Admin MCP server** | 40 tools so an agent can administer Sentinel itself |
| **A2A proxy** | Agent-to-Agent protocol support |
| **Web UI** | Full admin and user console |

## Quick start

Requires Node 20+, pnpm, and Postgres.

```bash
git clone https://github.com/gong8/sentinel-oss.git
cd sentinel-oss
cp .env.example .env        # generate secrets, point DATABASE_URL at your Postgres
pnpm setup                  # install, generate client, push schema, seed
pnpm dev
```

Need a Postgres? `docker compose up -d postgres` starts one.

That gets you:

| Service | URL |
|---|---|
| Web console | http://localhost:5173 |
| Docs site | http://localhost:5174 |
| API | http://localhost:3000 |
| MCP proxy | http://localhost:3001 |
| Admin MCP | http://localhost:3003 |

The seed creates an `Acme Corporation` org with three users and prints their access tokens. Run
`pnpm db:creds` any time to print them again.

## Point an agent at it

Add the proxy to your MCP client config:

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": { "Authorization": "Bearer YOUR_ACCESS_TOKEN" }
    }
  }
}
```

Register upstream servers in the web console, write policies against their tools, and every call
now routes through the policy engine.

## Optional: agent features

Sentinel has a built-in admin agent (chat your way through configuration). It needs an LLM, and
supports several providers — including fully local ones, so you never have to buy an API key:

- **Ollama** or any **OpenAI-compatible** endpoint (LM Studio, llama.cpp, vLLM) — local, free
- Anthropic, OpenAI, or Gemini — if you'd rather bring a key

Everything else in Sentinel works with no LLM configured at all.

## Architecture

A pnpm + Turborepo monorepo.

| Package | Lines | What it does |
|---|---|---|
| `api` | ~72k | tRPC API — services, routers, policy evaluation, audit |
| `web` | ~73k | React admin + user console |
| `docs` | ~11k | Documentation site |
| `shared` | ~6k | Shared types, condition evaluation, admin tool defs |
| `mcp` | ~4.7k | MCP proxy server (HTTP, STDIO, WebSocket, SSE) |
| `db` | ~3.3k | Prisma schema — 67 models |
| `a2a` | ~2.5k | Agent-to-Agent protocol proxy |
| `mcp-admin` | ~1.7k | Admin MCP server (40 tools) |

Roughly **177k lines of source** and **163k lines of tests** across **218 test files**.

The most reusable piece is `packages/api/src/services/policyCondition.ts` — a ~1,300-line condition
tree evaluator with no dependencies beyond Zod and a logger. It knows nothing about MCP, Prisma, or
Sentinel, and could be lifted into any project that needs policy expressions.

Deeper docs live in [`docs/`](docs/) — start at [`docs/README.md`](docs/README.md).

## Testing

```bash
pnpm test:unit          # no database needed
pnpm test:integration   # requires TEST_DATABASE_URL
pnpm test:security      # tenant isolation, DENY precedence
pnpm test:e2e           # Playwright
pnpm check              # format, lint, types, tests
```

## Project conventions

This codebase holds itself to a few non-negotiable rules, enforced by lint config and git hooks in
[`.claude/hooks/`](.claude/hooks/):

- No `as` type assertions (except `as const`), no `any`, no `@ts-ignore`, no `eslint-disable`
- Every database query scoped to `organizationId`
- All input validated with Zod
- Credentials encrypted before storage
- Sensitive actions audit logged, admin actions with before/after snapshots
- DENY policies cannot be bypassed, and that is tested explicitly

See [`CLAUDE.md`](CLAUDE.md) for the full development guide.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Security issues: [`SECURITY.md`](SECURITY.md).

## License

[GNU AGPL-3.0](LICENSE). If you run a modified Sentinel as a network service, you must make your
modifications available to its users.
