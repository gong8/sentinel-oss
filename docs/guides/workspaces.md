# Enterprise Workspaces Guide

> **Target audience**: Organization owners and workspace administrators

This guide covers the Enterprise Workspaces feature for team isolation and resource management within an organization.

---

## Overview

Workspaces provide isolation within an organization for different teams, projects, or environments. They allow you to segment policies, MCP servers, agents, and other resources while maintaining centralized organization-level control.

### Key Benefits

- **Team Isolation**: Separate resources and access by team or project
- **Delegated Administration**: Workspace admins manage their own resources
- **Resource Scoping**: Policies and servers can be org-wide or workspace-specific
- **AI Chat per Workspace**: Each workspace can have its own AI chat configuration

---

## Core Concepts

### Organization vs Workspace

| Level | Description |
|-------|-------------|
| **Organization** | Top-level tenant (multi-tenancy boundary). All workspaces belong to one organization. |
| **Workspace** | Subdivision within an org for team isolation. Resources are scoped to workspaces. |

### Hierarchy

```
Organization (Acme Corp)
  ├── Workspace: Engineering
  │     ├── Policies (workspace-scoped)
  │     ├── MCP Servers (workspace-scoped)
  │     └── Members
  ├── Workspace: Marketing
  │     ├── Policies (workspace-scoped)
  │     └── Members
  └── Org-Wide Resources
        ├── Policies (workspaceId = null)
        └── MCP Servers (workspaceId = null)
```

### Resource Scoping

Resources can be either org-wide or workspace-scoped:

| Scope | `workspaceId` | Visibility |
|-------|---------------|------------|
| **Org-Wide** | `null` | All workspace members see these |
| **Workspace-Scoped** | `<workspaceId>` | Only members of that workspace see these |

**Scoped resources include:**
- Policies
- MCP Servers
- Agents
- Global Variables (Namespaces)

---

## Roles and Permissions

### Organization Roles

| Role | Description | Workspace Access |
|------|-------------|------------------|
| **Org Owner** | Full organization control | Access to ALL workspaces as admin |
| **Org Member** | Standard organization member | Access via workspace membership only |

### Workspace Roles

| Role | Capabilities |
|------|-------------|
| **Workspace Admin** | Manage workspace policies, servers, agents, and members. Cannot create/delete workspaces. |
| **Workspace Member** | View workspace resources, use tools, access chat |

### Permission Matrix

| Action | Org Owner | Workspace Admin | Workspace Member |
|--------|-----------|-----------------|------------------|
| Create/delete workspaces | Yes | No | No |
| View all workspaces | Yes | No | No |
| Manage workspace resources | Yes | Own workspace only | No |
| Add/remove workspace members | Yes | Own workspace only | No |
| View workspace resources | Yes | Own workspace only | Own workspace only |
| Use workspace chat | Yes | Yes | Yes |
| Propose org-wide policies | Yes | Yes | No |

---

## Data Model

### Workspace

```prisma
model Workspace {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  slug           String   // URL-friendly identifier
  description    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  // Soft delete fields
  deletedAt      DateTime?
  deletedBy      String?

  // Relations
  members        WorkspaceMember[]
  policies       Policy[]
  mcpServers     McpServer[]
  agents         Agent[]
}
```

### Workspace Member

```prisma
model WorkspaceMember {
  id          String              @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceMemberRole  // MEMBER or ADMIN
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
}

enum WorkspaceMemberRole {
  MEMBER // Standard workspace member
  ADMIN  // Workspace admin, can manage workspace resources
}
```

### Resource Scoping Pattern

Resources that can be workspace-scoped include a nullable `workspaceId`:

```prisma
model Policy {
  // ... other fields
  workspaceId String?  // null = org-wide, otherwise workspace-scoped
  workspace   Workspace? @relation(fields: [workspaceId], references: [id])
}
```

---

## API Endpoints

### Admin Endpoints (Org Owners)

| Endpoint | Description |
|----------|-------------|
| `admin.workspaces.list` | List all workspaces in the organization |
| `admin.workspaces.get` | Get a specific workspace by ID |
| `admin.workspaces.getBySlug` | Resolve workspace slug to workspace data |
| `admin.workspaces.create` | Create a new workspace |
| `admin.workspaces.update` | Update workspace name/description |
| `admin.workspaces.delete` | Soft delete a workspace |
| `admin.workspaces.restore` | Restore a soft-deleted workspace |
| `admin.workspaces.getDeletionImpact` | Preview deletion impact |

### Workspace Member Management

| Endpoint | Description |
|----------|-------------|
| `admin.workspaceMembers.list` | List members of a workspace |
| `admin.workspaceMembers.add` | Add a member to a workspace |
| `admin.workspaceMembers.remove` | Remove a member from a workspace |

**Note**: Workspace member roles are automatically determined by the user's org-level admin status. Org-level admins become workspace admins; others become members.

### User Endpoints

| Endpoint | Description |
|----------|-------------|
| `user.workspaces.list` | List workspaces the user has access to |
| `user.workspaces.getBySlug` | Get workspace by slug (for URL validation) |

### Workspace Chat Endpoints

| Endpoint | Description |
|----------|-------------|
| `workspace.chat.sendMessage` | Send a message to the AI chat |
| `workspace.chat.listConversations` | List user's conversations |
| `workspace.chat.getConversation` | Get a specific conversation with messages |
| `workspace.chat.deleteConversation` | Delete a conversation |
| `workspace.chat.executeTool` | Execute a tool after user confirmation |
| `workspace.chat.requestToolAccess` | Request access to a specific tool |
| `workspace.chat.requestServerAccess` | Request access to an MCP server |
| `workspace.chat.getAvailableTools` | Get available tools for the workspace |

---

## UI Navigation

### URL Structure

```
/select-workspace                    # Workspace selection page
/admin/:workspaceSlug/policies       # Workspace-scoped policies
/admin/:workspaceSlug/mcp-servers    # Workspace-scoped MCP servers
/admin/:workspaceSlug/agents         # Workspace-scoped agents
/admin/:workspaceSlug/activity       # Workspace activity logs
/global/admin/workspaces             # Org owner: Manage all workspaces
/global/admin/policies               # Org owner: Org-wide policies
```

### Navigation Flow

1. User logs in and is directed to `/select-workspace`
2. User selects a workspace they have access to
3. URL becomes `/:workspaceSlug/...` for workspace-scoped pages
4. Org owners can access `/global/admin/...` for organization-wide management

---

## Workspace Chat

Each workspace can have AI chat capabilities enabled.

### Related Models

| Model | Purpose |
|-------|---------|
| `WorkspaceChatSettings` | Per-workspace chat configuration (enabled, quotas, system prompt) |
| `UserLLMConfig` | Per-user LLM provider settings (API key, model, always-allow tools) |
| `WorkspaceChatConversation` | Chat sessions between users and AI |
| `WorkspaceChatMessage` | Individual messages in conversations |
| `WorkspaceChatUsage` | Monthly usage tracking per user |

### Chat Settings

```prisma
model WorkspaceChatSettings {
  id                  String       @id @default(cuid())
  workspaceId         String       @unique
  enabled             Boolean      @default(true)
  defaultLlmProvider  LLMProvider?
  defaultLlmModel     String?
  systemPrompt        String?      @db.Text
  monthlyMessageQuota Int?
  monthlyTokenQuota   Int?
  adminChatVisibility Boolean      @default(false)
}
```

### User LLM Configuration

Users can configure their own LLM provider settings per workspace:

```prisma
model UserLLMConfig {
  id               String      @id @default(cuid())
  userId           String
  workspaceId      String
  provider         LLMProvider // CLAUDE, OPENAI, GEMINI
  apiKey           String      // Encrypted
  model            String?
  alwaysAllowTools String[]    @default([])
}
```

---

## Policy Proposals

Workspace admins can propose org-wide policies for org owner review.

### Workflow

1. Workspace admin creates an `OrgWidePolicyProposal`
2. Proposal includes: matchers, effect, description, justification
3. Org owner reviews pending proposals
4. If approved, a `Policy` is created from the proposal
5. If rejected, the proposal is closed with a review note

### Proposal Model

```prisma
model OrgWidePolicyProposal {
  id             String @id @default(cuid())
  organizationId String
  workspaceId    String // Workspace admin proposing
  proposedById   String

  // Proposed policy data
  matchers      String[]
  toolPatterns  String[]
  effect        PolicyEffect
  description   String
  conditions    Json?
  justification String

  status        PolicyProposalStatus // PENDING, APPROVED, REJECTED
  reviewedAt    DateTime?
  reviewedBy    String?
  reviewNote    String?
  createdPolicyId String? // If approved
}
```

---

## Best Practices

### Creating Workspaces

1. **Use descriptive names**: "Engineering", "Marketing", "Production"
2. **Add descriptions**: Explain the purpose of each workspace
3. **Assign workspace admins**: Delegate management to team leads

### Scoping Resources

1. **Org-wide for shared resources**: Common MCP servers everyone needs
2. **Workspace-scoped for team-specific**: Tools only one team uses
3. **Consider inheritance**: Workspace members see both workspace-scoped AND org-wide resources

### Querying Scoped Resources

When querying resources that can be workspace-scoped, include both org-wide and workspace-specific:

```typescript
// Get policies for a workspace (includes org-wide)
const policies = await prisma.policy.findMany({
  where: {
    organizationId,
    OR: [
      { workspaceId: null },      // Org-wide
      { workspaceId: workspaceId } // Workspace-scoped
    ],
    deletedAt: null
  }
});
```

### Authorization Checks

Always verify workspace membership before allowing access:

```typescript
// Check if user can access workspace
if (!ctx.auth.isOrgOwner && !ctx.auth.workspaceIds.includes(workspaceId)) {
  throw new TRPCError({ code: 'FORBIDDEN' });
}

// Check if user can manage workspace
function canManageWorkspace(auth: AuthContext, workspaceId: string): boolean {
  return auth.isOrgOwner || auth.adminWorkspaceIds.includes(workspaceId);
}
```

---

## Common Operations

### Create a Workspace

```typescript
const workspace = await trpc.admin.workspaces.create.mutate({
  name: 'Engineering',
  description: 'Engineering team workspace'
});
```

### Add a Member

```typescript
await trpc.admin.workspaceMembers.add.mutate({
  workspaceId: 'clxxx...',
  userId: 'clyyy...'
});
// Role is automatically determined by user's org-level admin status
```

### Create a Workspace-Scoped Policy

```typescript
await trpc.admin.policies.create.mutate({
  name: 'Engineering File Access',
  rule: 'ALLOW',
  matcher: 'mcp-tool:filesystem::*',
  workspaceId: 'clxxx...',  // Scope to workspace
  roles: ['developer']
});
```

### List User's Workspaces

```typescript
const workspaces = await trpc.user.workspaces.list.query();
// Returns workspaces with userRole: 'ADMIN' | 'MEMBER'
```

---

## Troubleshooting

### User cannot see a workspace

- Verify user is a workspace member
- Check if workspace is soft-deleted (`deletedAt` is set)
- Confirm user is in the same organization

### Workspace admin cannot manage resources

- Workspace admins can only manage workspace-scoped resources
- Org-wide resources (`workspaceId = null`) require org owner access
- Verify the admin has `ADMIN` role in the workspace membership

### Policy not applying to workspace members

- Check if policy is scoped correctly (org-wide vs workspace-scoped)
- Verify policy roles include the user's roles
- Review policy priority and evaluation order

### Chat not working in workspace

- Check `WorkspaceChatSettings.enabled` is `true`
- Verify user's `UserLLMConfig` has valid API key
- Check quota limits in `WorkspaceChatUsage`

---

## Related Documentation

- [Policy Configuration Guide](./policies.md) - Creating and managing policies
- [Admin Dashboard Tour](./admin-tour.md) - Navigating the admin interface
- [Quickstart Guide](./quickstart.md) - Getting started with Sentinel
