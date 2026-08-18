# Installation

Sentinel runs entirely on your own machine. Postgres is the only hard dependency.

## Requirements

- **Node.js 20+**
- **pnpm 9+** (`npm install -g pnpm`)
- **PostgreSQL 14+** — local install, or `docker compose up -d postgres`

## Install

```bash
git clone https://github.com/gong8/sentinel-oss.git
cd sentinel-oss
cp .env.example .env
```

Edit `.env`:

- Point `DATABASE_URL` at your Postgres instance
- Generate the three secrets:

```bash
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('PROXY_API_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bash
pnpm setup    # install deps, generate Prisma client, push schema, seed
pnpm dev
```

## What you get

| Service | URL |
|---------|-----|
| Web console | http://localhost:5173 |
| Docs site | http://localhost:5174 |
| API | http://localhost:3000 |
| MCP proxy | http://localhost:3001 |
| Admin MCP | http://localhost:3003 |

The seed creates an `Acme Corporation` organization with three accounts — an org owner, a workspace
admin, and a regular member — and prints their access tokens. Print them again any time:

```bash
pnpm db:creds
```

Log in at http://localhost:5173 with an access token.

## Database commands

| Command | What it does |
|---------|--------------|
| `pnpm db:push` | Sync schema to the database without a migration |
| `pnpm db:migrate` | Create and apply a migration |
| `pnpm db:seed` | Seed demo org, users, and workspace |
| `pnpm db:creds` | Print seeded access tokens |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:reset` | Drop and recreate the database |

## Optional: LLM provider

Sentinel's built-in admin agent needs an LLM. Everything else works without one.

For a zero-cost local setup, run [Ollama](https://ollama.com) and configure it in the web console
under Settings. Any OpenAI-compatible endpoint works too (LM Studio, llama.cpp, vLLM). If you'd
rather use a hosted provider, set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`.

## Running it for real

Development defaults are not safe for a real deployment. Before exposing Sentinel to anything:

- Generate fresh secrets — never reuse the ones from an example file
- Delete the seeded demo accounts and their tokens
- Set `NODE_ENV=production`, and set `FRONTEND_URL` and `API_URL` to your domain
- Put it behind TLS
- Restrict network access to Postgres

`Dockerfile.api` and `Dockerfile.web` are included if you'd rather build containers.

## Troubleshooting

**Port already in use** — `pnpm kill` frees the ports Sentinel uses.

**`ColumnNotFound` or `P2022` on seed** — schema drifted from the database. Run `pnpm db:push`.

**Database access denied** — check `DATABASE_URL` credentials and that the role exists:

```sql
CREATE ROLE sentinel LOGIN PASSWORD 'your-password';
CREATE DATABASE sentinel OWNER sentinel;
```

More in [`guides/troubleshooting.md`](guides/troubleshooting.md).
