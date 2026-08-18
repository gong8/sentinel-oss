# Quickstart Guide

> **Time to complete**: ~30 minutes
> **Target audience**: Operators self-hosting Sentinel

This guide walks you through deploying Sentinel, creating your first admin user, and connecting an AI client.

---

## Before You Begin

Sentinel runs entirely on your own machine. You need Node 20+, pnpm, and Postgres — nothing else.
See [`../installation.md`](../installation.md) for the full install.

---

## Overview

Sentinel is a policy layer for AI tool access. It sits between AI agents (like Claude, Cursor, etc.) and the MCP tool servers they use, enforcing access policies.

**What you'll accomplish:**

1. Deploy Sentinel (local or server)
2. Create an admin account
3. Add a tool server
4. Connect an AI client
5. Create your first policy

---

## Step 1: Choose Deployment Method

| Method | Best For | Time |
|--------|----------|------|
| **Local (Docker)** | Development, testing, evaluation | 10 min |
| **On-Premise Server** | Production, internal use | 20 min |
| **Cloud VPC** | Production, multi-tenant | 30 min |

### Option A: Local Development (Recommended for First-Time Setup)

**Prerequisites**: Docker Desktop installed and running

```bash
# Clone the repository
git clone https://github.com/your-org/sentinel.git
cd sentinel

# Install dependencies and run setup (cross-platform)
pnpm install
pnpm setup
```

The setup script will:
- Generate encryption keys automatically
- Ask for deployment URL (press Enter for `http://localhost`)
- Build and start containers
- Run database migrations
- Optionally create an admin user
- Optionally configure API keys

**Access Points (Local)**:
- Web UI: http://localhost
- API: http://localhost:3000
- MCP Proxy: http://localhost:3001

### Option B: On-Premise/VPC Server

See [Deployment Guide](../deployment.md) for detailed instructions. Quick summary:

```bash
# On your server
git clone https://github.com/your-org/sentinel.git
cd sentinel
pnpm install
pnpm setup

# When prompted for deployment URL:
# Enter: https://sentinel.yourcompany.com
```

For HTTPS, use Caddy (automatic TLS):
```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

---

## Step 2: Initial Login

1. Open the Sentinel dashboard (http://localhost or your deployment URL)
2. If you created an admin user during setup, use those credentials
3. Otherwise, run:
   ```bash
   docker compose exec -w /app/packages/db api tsx prisma/creds.ts
   ```
   This displays the admin access token.

---

## Step 3: Add a Tool Server

Sentinel proxies requests to MCP tool servers. You need to register at least one.

1. Go to **Admin** > **MCP Servers**
2. Click **Add Server**
3. Enter:
   - **Name**: Unique identifier (e.g., "filesystem")
   - **URL**: The MCP server endpoint URL
   - **Auth Type**: Authentication method (None, API Key, OAuth)
   - **Trusted**: Whether this server is trusted for sensitive operations

**Example - MCP server**:
```
Name: filesystem
URL: http://localhost:8080/mcp
Auth Type: None
Trusted: Yes
```

---

## Step 4: Create Your First Policy

Policies control who can use which tools. Start with a simple allow policy.

1. Go to **Admin** > **Policies**
2. Click **Create Policy**
3. Configure:
   - **Name**: "Allow File Reading"
   - **Rule**: `ALLOW`
   - **Matcher**: `filesystem::read_file`
   - **Roles**: Select the roles that should have access

**Understanding Policy Matchers**:

| Pattern | Matches |
|---------|---------|
| `*::*` | All tools from all servers |
| `filesystem::*` | All tools from "filesystem" server |
| `filesystem::read_*` | All read tools from "filesystem" |

---

## Step 5: Connect an AI Client

Now connect your AI client to use tools through Sentinel.

### Claude Code (CLI)

Edit your Claude Code config (usually `~/.claude.json` or via `claude config`):

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Get your API key from the Sentinel dashboard under **Credentials**.

### Cursor IDE

1. Open Cursor Settings (Cmd/Ctrl + Shift + P > "MCP")
2. Add server with URL: `http://localhost:3001/mcp`
3. Set Authorization header with your API key

### Other Clients

See [Client Installation Guides](./installation-guides/) for detailed setup instructions for:
- Claude Desktop
- Windsurf
- Cline (VS Code)
- Custom integrations

---

## Step 6: Test the Connection

1. In your AI client, ask: "What tools are available?"
2. The AI should list tools from your configured MCP servers
3. Try using a tool: "Read the contents of /tmp/test.txt"
4. Check the Sentinel **Activity** page to see the request logged

---

## Next Steps

- **Add more tool servers**: Register additional MCP servers for more capabilities
- **Create role-based policies**: Separate developer vs. admin access
- **Configure sensitive flags**: Mark tools requiring approval
- **Set up webhooks**: Get notified on Slack/Discord/email for approvals

---

## Troubleshooting

### "Connection refused" from AI client

- Verify Sentinel is running: `docker compose ps`
- Check the MCP proxy port (default 3001): `curl http://localhost:3001/health`
- Confirm API key is correct

### "No tools available"

- Check MCP servers are registered in Admin > MCP Servers
- Verify the tool server command starts successfully
- Check you have at least one ALLOW policy

### "Access denied" for a tool

- Check your policies match the tool pattern
- Verify your user has the required role
- Check for DENY policies that might override

### View logs

```bash
# All services
docker compose logs -f

# Just the API
docker compose logs -f api
```

---

## Quick Reference

| Component | Local URL | Port |
|-----------|-----------|------|
| Dashboard | http://localhost | 80 |
| API | http://localhost:3000 | 3000 |
| MCP Proxy | http://localhost:3001 | 3001 |
| A2A Server | http://localhost:3002 | 3002 |
| MCP Admin | http://localhost:3003 | 3003 |

| Environment Variable | Purpose |
|---------------------|---------|
| `ENCRYPTION_KEY` | Credential encryption (auto-generated) |
| `SESSION_SECRET` | Session signing (auto-generated) |
| `OPENAI_API_KEY` | AI agent (primary LLM provider, optional) |
| `RESEND_API_KEY` | Email notifications (optional) |
