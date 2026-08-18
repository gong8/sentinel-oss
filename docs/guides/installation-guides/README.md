# LLM Client Installation Guides

Step-by-step instructions for connecting AI clients to Sentinel.

## Available Guides

| Client | Guide | Description |
|--------|-------|-------------|
| Claude Code | [claude-code.md](./claude-code.md) | CLI and Desktop setup |
| Cursor | [cursor.md](./cursor.md) | Cursor IDE integration |
| Windsurf | [windsurf.md](./windsurf.md) | Codeium's Windsurf setup |
| Cline | [cline.md](./cline.md) | VS Code extension config |
| Custom/API | [custom.md](./custom.md) | Direct MCP integration |

## Quick Reference

All clients need:
1. **Sentinel URL**: `http://your-server:3001/mcp`
2. **API Key**: From Dashboard > Credentials
3. **Header**: `Authorization: Bearer <api-key>`

## Common Configuration

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

## Environment Variables

For security, use environment variables:

```bash
export SENTINEL_API_KEY="your-api-key"
```

Then reference in config:
```json
{
  "headers": {
    "Authorization": "Bearer $SENTINEL_API_KEY"
  }
}
```

## Need Help?

- [Quickstart Guide](../quickstart.md) - Full setup walkthrough
- [Troubleshooting](../troubleshooting.md) - Common issues
- [User Guide](../user-guide.md) - Using tools through Sentinel
