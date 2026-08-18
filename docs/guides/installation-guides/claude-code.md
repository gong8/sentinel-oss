# Claude Code Setup Guide

> **Time**: ~5 minutes

This guide covers connecting Claude Code (CLI) and Claude Desktop to Sentinel.

---

## Prerequisites

- Sentinel running and accessible
- Your Sentinel API key (from Dashboard > Credentials)
- Claude Code CLI or Claude Desktop installed

---

## Claude Code (CLI)

### Option 1: Config File

Edit `~/.claude.json` or use `claude config`:

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

### Option 2: Environment Variable

For better security, use an environment variable:

```bash
# Add to ~/.bashrc or ~/.zshrc
export SENTINEL_API_KEY="your-api-key-here"
```

Then in config:
```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer $SENTINEL_API_KEY"
      }
    }
  }
}
```

### Option 3: Project-Level Config

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer $SENTINEL_API_KEY"
      }
    }
  }
}
```

---

## Claude Desktop

### macOS

1. Open Claude Desktop
2. Go to **Settings** > **MCP Servers**
3. Click **Add Server**
4. Enter:
   - Name: `Sentinel`
   - URL: `http://localhost:3001/mcp`
   - API Key: Your Sentinel API key

### Alternatively, edit config file

Location: `~/Library/Application Support/Claude Desktop/config.json`

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

## Verification

1. Restart Claude Code/Desktop
2. Ask: "What tools are available?"
3. Claude should list tools from your Sentinel-connected servers

---

## Remote Sentinel Server

If Sentinel is running on a remote server:

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "https://sentinel.yourcompany.com:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Note: Use `https://` if TLS is configured.

---

## Troubleshooting

### "Connection refused"

- Check Sentinel is running: `curl http://localhost:3001/health`
- Verify the URL includes `/mcp` suffix
- Check port 3001 is not blocked

### "Invalid API key"

- Regenerate key in Dashboard > Credentials
- Check for extra whitespace
- Ensure format is `Bearer <key>` (with space)

### "No tools available"

- Check MCP servers are registered in Sentinel
- Verify you have ALLOW policies
- Check Activity log for errors

### Connection timeout

- Increase timeout in Claude settings
- Check network connectivity to Sentinel server
- Verify Sentinel API is responsive
