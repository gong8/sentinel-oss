# Cursor IDE Setup Guide

> **Time**: ~5 minutes

This guide covers connecting Cursor IDE to Sentinel.

---

## Prerequisites

- Sentinel running and accessible
- Your Sentinel API key (from Dashboard > Credentials)
- Cursor IDE installed

---

## Method 1: Settings UI

1. Open Cursor
2. Open Command Palette: `Cmd/Ctrl + Shift + P`
3. Search for "MCP" or "Model Context Protocol"
4. Click **Add Server**
5. Configure:
   - **Name**: Sentinel
   - **URL**: `http://localhost:3001/mcp`
   - **Authentication**: Bearer token
   - **Token**: Your Sentinel API key

---

## Method 2: Settings File

### File Location

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Cursor/User/settings.json` |
| Linux | `~/.config/Cursor/User/settings.json` |
| Windows | `%APPDATA%\Cursor\User\settings.json` |

### Configuration

Add to your settings.json:

```json
{
  "mcp.servers": {
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

## Method 3: Workspace Config

Create `.cursor/mcp.json` in your project:

```json
{
  "servers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer $SENTINEL_API_KEY"
      }
    }
  }
}
```

Set the environment variable:
```bash
export SENTINEL_API_KEY="your-api-key"
```

---

## Verification

1. Restart Cursor
2. Open a file and ask: "What tools can you use?"
3. Cursor should list tools from Sentinel

---

## Remote Server

For remote Sentinel:

```json
{
  "mcp.servers": {
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

## Using Tools

Once connected, ask Cursor to use tools:

- "Read the contents of package.json"
- "Search for TODO comments in src/"
- "Create a new file called utils.ts"

Sentinel will check permissions and either:
- Allow the action
- Require your approval (check Dashboard > Approvals)
- Deny the action (check your policies)

---

## Troubleshooting

### Server not connecting

1. Check Cursor's output panel for MCP logs
2. Verify Sentinel is running: `curl http://localhost:3001/health`
3. Restart Cursor after config changes

### Authentication failed

1. Check API key is correct
2. Ensure header format is `Authorization: Bearer <key>`
3. Regenerate key in Sentinel Dashboard

### Tools not loading

1. Verify MCP servers are configured in Sentinel
2. Check you have appropriate policies
3. Look at Sentinel Activity log for errors

### Slow performance

1. Some tools may require approval
2. Check network connectivity
3. Increase timeout in Cursor MCP settings
