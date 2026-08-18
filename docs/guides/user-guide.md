# User Guide

> **Target audience**: End users who interact with AI tools through Sentinel

This guide covers using Sentinel as a regular user (not an administrator).

---

## Overview

Sentinel sits between your AI assistant (Claude, Cursor, etc.) and the tools it uses. When your AI tries to use a tool, Sentinel checks if you're allowed to use it based on your organization's policies.

**What this means for you**:
- Some tools work immediately (allowed by policy)
- Some tools need your approval first (for safety)
- Some tools are blocked (restricted by policy)

---

## Getting Started

### 1. Get Your API Key

1. Log in to the Sentinel dashboard
2. Go to **Credentials** in the sidebar
3. Copy your API key

### 2. Configure Your AI Client

Add Sentinel to your AI client's MCP configuration:

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://your-sentinel-server:3001/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

See [Client Installation Guides](./installation-guides/) for specific instructions.

### 3. Start Using Tools

Ask your AI to use tools normally. Sentinel handles access control automatically.

---

## Dashboard Sections

### Dashboard

Your personal overview showing:
- Recent tool usage
- Pending approvals
- Quick stats

### Tools

Browse all tools available through your organization's MCP servers.

**Information shown**:
- Tool name and description
- Server it belongs to
- Your access level (allowed/requires approval/denied)

**Requesting access**:
If a tool shows "Requires Approval" or "Denied", click **Request Access** to ask an admin for permission.

### Activity

Your personal activity log showing:
- Tools you've used
- Requests that were blocked
- Approval decisions

**Detail view**: Click any entry to see:
- Full request parameters
- Policy that was applied
- Time and duration

### Approvals

Pending requests waiting for approval.

**Approval flow**:
1. Your AI tries to use a tool requiring approval
2. Request appears here (and possibly in Slack/Discord)
3. You (or an admin) approve or deny
4. Your AI continues or stops based on the decision

### Credentials

Manage your personal credentials for tools.

**Uses**:
- Store API keys for external services
- OAuth connections (GitHub, Google, etc.)
- Personal tokens

**Security**: Credentials are encrypted and only used when tools need them.

### MCP Servers

View connected tool servers and their status.

**What you can see**:
- Server name and description
- Connection status
- Available tools
- Personal server settings (if allowed)

---

## Understanding Access Levels

### Allowed

The tool works without any extra steps. Your AI can use it freely.

### Requires Approval

The tool is considered sensitive. When used:
1. Execution pauses
2. You get a notification (dashboard, Slack, email, etc.)
3. You review the request details
4. You approve or deny
5. Execution continues or stops

### Denied

The tool is blocked for your role. You cannot use it unless:
- An admin changes the policy
- You request access and it's granted
- You're assigned a different role

---

## Handling Approvals

When a tool requires approval:

### In the Dashboard

1. Go to **Approvals**
2. Review the pending request:
   - What tool is being called
   - What parameters are being passed
   - When it was requested
3. Click **Approve** or **Deny**
4. Optionally add a note

### Via Notifications

If webhooks are configured:
- **Slack/Discord**: Click the approve/deny buttons in the message
- **Email**: Click the link to open the approval in the dashboard

### Tips

- Keep the dashboard open while working with AI
- Set up notifications so you don't miss approvals
- Review parameters carefully before approving writes/deletes
- Denying stops the AI but you can try again

---

## Managing Credentials

### Adding Credentials

1. Go to **MCP Servers**
2. Click on a server row to view its details
3. In the server details panel, manage credentials for that server:
   - **API Key**: Enter key directly
   - **OAuth**: Connect via authorization flow
   - **Token**: Personal access tokens

4. Name your credential
5. Save

### Credential Security

- Credentials are encrypted at rest
- Only you can see your credentials
- Credentials are injected into tool calls automatically
- You can revoke/rotate anytime

### OAuth Connections

For services like GitHub, Google, etc.:

1. Click **Connect** on the service
2. You're redirected to the service
3. Authorize Sentinel
4. You're redirected back with connection established

---

## Troubleshooting

### "No tools available"

1. Check your API key is correct
2. Verify the Sentinel URL in your client config
3. Ask your admin if tool servers are configured
4. Check you have at least one ALLOW policy

### "Access denied"

1. Check the Tools page for your access level
2. Request access if needed
3. Ask your admin about policies

### Tools are slow

1. Some tools require approval - check Approvals
2. Tool servers may be starting up
3. Check your network connection

### Approval not appearing

1. Refresh the Approvals page
2. Check notification channels (Slack, email)
3. The request may have timed out

### Can't find a specific tool

1. Check the tool is on an allowed server
2. Search in the Tools page
3. Ask your admin if the tool is available

---

## Best Practices

### Security

- Don't share your API key
- Rotate credentials regularly
- Review approval requests carefully
- Report suspicious activity to your admin

### Productivity

- Bookmark the Approvals page for quick access
- Set up notifications in your preferred channel
- Learn which tools require approval
- Use the Activity log to understand patterns

### Working with AI

- If a tool is denied, ask why before requesting access
- For approvals, be ready to respond quickly
- Review what the AI is doing in Activity
- Report any unexpected behavior

---

## FAQ

**Q: Can I use tools while offline?**
A: No, Sentinel requires network connectivity to the server.

**Q: Do I need to approve every tool call?**
A: Only tools marked as requiring approval. Allowed tools work automatically.

**Q: Can I see what the AI is doing?**
A: Yes, check the Activity page for all tool calls.

**Q: How long do I have to approve a request?**
A: Requests typically time out after a few minutes. Check with your admin.

**Q: Can I approve from my phone?**
A: Yes, the dashboard is mobile-friendly. You can also use Slack/Discord notifications.

**Q: What happens if I deny a request?**
A: The AI is notified the tool call failed and may try a different approach.

**Q: Can I undo an approval?**
A: No, but future calls to the same tool will still require approval.
