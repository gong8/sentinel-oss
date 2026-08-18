# Windsurf Setup Guide

> **Time**: ~5 minutes

This guide covers connecting Windsurf (Codeium) IDE to Sentinel.

---

## Prerequisites

- Sentinel running and accessible
- Your Sentinel API key (from Dashboard > Credentials)
- Windsurf IDE installed

---

## Configuration

### Method 1: Settings UI

1. Open Windsurf
2. Go to **Settings** > **MCP Configuration**
3. Add a new server:
   - **Name**: Sentinel
   - **URL**: `http://localhost:3001/mcp`
   - **Headers**: Add `Authorization: Bearer YOUR_API_KEY`

### Method 2: Config File

Windsurf stores MCP configuration in:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Windsurf/mcp.json` |
| Linux | `~/.config/Windsurf/mcp.json` |
| Windows | `%APPDATA%\Windsurf\mcp.json` |

Create or edit the file:

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

---

## Environment Variables

For security, use an environment variable:

```bash
# Add to shell profile
export SENTINEL_API_KEY="your-api-key"
```

Then in config:
```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer ${SENTINEL_API_KEY}"
      }
    }
  }
}
```

---

## Verification

1. Restart Windsurf
2. Ask the AI: "List available tools"
3. You should see tools from your Sentinel servers

---

## Remote Server

For remote Sentinel instances:

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "https://sentinel.company.com:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

---

## Troubleshooting

### Connection issues

1. Check Sentinel health: `curl http://localhost:3001/health`
2. Verify URL includes `/mcp` suffix
3. Restart Windsurf after config changes

### Authentication errors

1. Verify API key in Dashboard > Credentials
2. Check header format: `Authorization: Bearer <key>`
3. No extra whitespace in key

### Tools not appearing

1. Check MCP servers are registered in Sentinel
2. Verify your policies allow tool access
3. Check Sentinel Activity log

### Slow responses

1. Tools requiring approval will pause
2. Check Dashboard > Approvals for pending requests
3. Verify network connectivity
