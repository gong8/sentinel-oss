# Cline (VS Code) Setup Guide

> **Time**: ~5 minutes

This guide covers connecting Cline extension in VS Code to Sentinel.

---

## Prerequisites

- Sentinel running and accessible
- Your Sentinel API key (from Dashboard > Credentials)
- VS Code with Cline extension installed

---

## Configuration

### Method 1: VS Code Settings UI

1. Open VS Code
2. Go to **Settings** (`Cmd/Ctrl + ,`)
3. Search for "Cline MCP" or "Cline servers"
4. Add Sentinel configuration:
   - Server URL: `http://localhost:3001/mcp`
   - Authorization header with your API key

### Method 2: settings.json

Open VS Code settings.json (`Cmd/Ctrl + Shift + P` > "Open Settings (JSON)"):

```json
{
  "cline.mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Method 3: Workspace Settings

Create `.vscode/settings.json` in your project:

```json
{
  "cline.mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer ${env:SENTINEL_API_KEY}"
      }
    }
  }
}
```

Set the environment variable before opening VS Code:
```bash
export SENTINEL_API_KEY="your-api-key"
code .
```

---

## Verification

1. Reload VS Code window (`Cmd/Ctrl + Shift + P` > "Reload Window")
2. Open Cline panel
3. Ask: "What tools do you have access to?"
4. You should see tools from Sentinel servers

---

## Remote Server

For remote Sentinel:

```json
{
  "cline.mcpServers": {
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

With Cline connected to Sentinel:

1. Type your request in the Cline chat
2. Cline uses tools through Sentinel
3. Sentinel checks policies:
   - **Allowed**: Tool runs immediately
   - **Requires Approval**: Check Dashboard > Approvals
   - **Denied**: Tool call fails

---

## Troubleshooting

### "Failed to connect to MCP server"

1. Verify Sentinel is running: `curl http://localhost:3001/health`
2. Check URL includes `/mcp` suffix
3. Reload VS Code window

### "Authentication failed"

1. Verify API key in Dashboard > Credentials
2. Check header format is correct
3. Regenerate key if needed

### "No tools available"

1. Check MCP servers in Sentinel Dashboard
2. Verify policies allow access
3. Check Cline output channel for errors

### Extension not recognizing config

1. Ensure JSON syntax is valid
2. Check setting name matches Cline's expected format
3. Try user settings instead of workspace settings

---

## Cline Output Channel

For debugging, check Cline's output:

1. Open Output panel (`Cmd/Ctrl + Shift + U`)
2. Select "Cline" from dropdown
3. Look for MCP-related messages
