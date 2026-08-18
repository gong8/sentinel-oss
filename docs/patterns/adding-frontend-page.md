# Adding a Frontend Page

## When to Use This Pattern

Use this pattern when adding a new page to the SENTINEL web interface (admin or user).

## Prerequisites

- tRPC API endpoint exists (see [Adding an API Endpoint](./adding-api-endpoint.md))
- You know whether this is an admin or user page
- You understand the workspace-scoped routing structure

## Route Structure

SENTINEL uses workspace-scoped routing. All pages are organized under workspace contexts:

```
/select-workspace              - Workspace selection (entry point)
/admin/:workspaceSlug/*        - Admin pages (workspace-scoped)
/user/:workspaceSlug/*         - User pages (workspace-scoped)
/global/admin/*                - Org-owner global admin pages
/global/user/*                 - Org-owner global user pages
/admin/:workspaceSlug/agent/*  - Workspace agent pages
/login                         - Authentication
/oauth/result                  - OAuth callback
```

## Page File Locations

```
packages/web/src/pages/
├── admin/                    # Admin-only pages (25+)
│   ├── Policies.tsx
│   ├── Users.tsx
│   ├── Roles.tsx
│   ├── McpServers.tsx
│   ├── Agents.tsx
│   ├── Workspaces.tsx
│   ├── GlobalVariables.tsx
│   └── ...
├── user/                     # User pages
│   ├── Dashboard.tsx
│   ├── Tools.tsx
│   └── ...
├── agent/                    # Workspace agent pages
│   ├── WorkspaceAgentPage.tsx
│   └── AgentSettingsPage.tsx
├── SelectWorkspace.tsx       # Workspace selection
└── Login.tsx                 # Authentication
```

## Steps

### 1. Create the Page Component

**Location**: `packages/web/src/pages/admin/[PageName].tsx` or `packages/web/src/pages/user/[PageName].tsx`

```typescript
import { trpc } from '../../lib/trpc';
import { useWorkspace } from '../../hooks/WorkspaceContext';
import { PageHeader } from '../../components/PageHeader';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useState } from 'react';

export default function MyResourcesPage() {
  // Get workspace context - required for workspace-scoped queries
  const { selectedWorkspaceId } = useWorkspace();

  // Query data with tRPC - always scope to workspace
  const { data: resources, isPending, error } = trpc.admin.myResource.list.useQuery(
    { workspaceId: selectedWorkspaceId },
    { enabled: Boolean(selectedWorkspaceId) }
  );

  // Mutations
  const utils = trpc.useUtils();
  const { mutate: createResource, isPending: isCreating } = trpc.admin.myResource.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch
      utils.admin.myResource.list.invalidate();
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  // Local state
  const [isFormOpen, setIsFormOpen] = useState(false);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="p-8">
      {/* Header */}
      <PageHeader
        title="My Resources"
        description="Manage your resources"
      />

      <div className="flex items-center justify-end mb-6">
        <button
          onClick={() => setIsFormOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Resource
        </button>
      </div>

      {/* List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {resources?.map((resource) => (
              <tr key={resource.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {resource.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {resource.description || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    resource.enabled
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {resource.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {resources?.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No resources yet</p>
          <button
            onClick={() => setIsFormOpen(true)}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            Create your first resource
          </button>
        </div>
      )}
    </div>
  );
}
```

### 2. Add Route Protection

SENTINEL uses protected route components to enforce authentication and authorization.

**Basic protection** (requires authentication):

```typescript
<ProtectedRoute>
  <MyPage />
</ProtectedRoute>
```

**Workspace-scoped protection** (validates workspace access):

```typescript
// For admin pages - requires admin role in workspace
<WorkspaceProtectedRoute requireAdmin={true}>
  <AdminPage />
</WorkspaceProtectedRoute>

// For user pages - requires any access to workspace
<WorkspaceProtectedRoute requireAdmin={false}>
  <UserPage />
</WorkspaceProtectedRoute>
```

### 3. Add Route to App

**Location**: `packages/web/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MyResourcesPage from './pages/admin/MyResources';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Workspace selection */}
        <Route path="/select-workspace" element={<SelectWorkspace />} />

        {/* Admin routes (workspace-scoped) */}
        <Route path="/admin/:workspaceSlug">
          <Route
            path="dashboard"
            element={
              <WorkspaceProtectedRoute requireAdmin={true}>
                <AdminDashboard />
              </WorkspaceProtectedRoute>
            }
          />
          <Route
            path="my-resources"
            element={
              <WorkspaceProtectedRoute requireAdmin={true}>
                <MyResourcesPage />
              </WorkspaceProtectedRoute>
            }
          />
        </Route>

        {/* User routes (workspace-scoped) */}
        <Route path="/user/:workspaceSlug">
          <Route
            path="dashboard"
            element={
              <WorkspaceProtectedRoute requireAdmin={false}>
                <UserDashboard />
              </WorkspaceProtectedRoute>
            }
          />
        </Route>

        {/* Global admin routes (org-owner only) */}
        <Route path="/global/admin">
          <Route path="settings" element={<GlobalSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/select-workspace" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### 4. Use Workspace Context

The `useWorkspace` hook provides workspace state for all pages:

```typescript
import { useWorkspace } from '../hooks/WorkspaceContext';

function MyPage() {
  const {
    selectedWorkspaceSlug,    // Current workspace slug from URL
    selectedWorkspaceId,      // Current workspace ID (for API calls)
    selectedWorkspace,        // Full workspace object
    workspaces,               // All accessible workspaces
    isOrgOwner,               // Is user the organization owner
    isGlobalView,             // Is viewing global admin pages
  } = useWorkspace();

  // Use workspace context for queries
  const { data } = trpc.admin.policies.list.useQuery({
    workspaceId: selectedWorkspaceId,
  });
}
```

### 5. Add Navigation Link (Optional)

**Location**: `packages/web/src/components/Sidebar.tsx`

```typescript
import { Link, useLocation } from 'react-router-dom';
import { useWorkspace } from '../hooks/WorkspaceContext';

export function Sidebar() {
  const location = useLocation();
  const { selectedWorkspaceSlug } = useWorkspace();

  const navItems = [
    { name: 'Dashboard', path: `/admin/${selectedWorkspaceSlug}/dashboard`, icon: '📊' },
    { name: 'Users', path: `/admin/${selectedWorkspaceSlug}/users`, icon: '👥' },
    { name: 'Policies', path: `/admin/${selectedWorkspaceSlug}/policies`, icon: '🛡️' },
    { name: 'My Resources', path: `/admin/${selectedWorkspaceSlug}/my-resources`, icon: '📦' },
  ];

  return (
    <nav className="w-64 bg-gray-800 text-white p-4">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`block px-4 py-2 rounded mb-2 ${
            location.pathname === item.path
              ? 'bg-gray-700'
              : 'hover:bg-gray-700'
          }`}
        >
          <span className="mr-2">{item.icon}</span>
          {item.name}
        </Link>
      ))}
    </nav>
  );
}
```

## Page Layout Patterns

### Standard Page with Header

```typescript
<PageHeader
  title="Policies"
  description="Manage access control policies"
/>
```

### Tabbed Page Layout

```typescript
<TabbedPageLayout
  tabs={[
    { label: 'General', path: 'general' },
    { label: 'Security', path: 'security' },
  ]}
/>
```

### Policy-Specific Layout with Side Nav

```typescript
<PolicyPageLayout>
  {/* content */}
</PolicyPageLayout>
```

## Feature Gating

Conditionally show features based on the viewer's role:

```typescript
import { FeatureGate, TierGate } from '../components/gates';

// Hide feature if not available
<FeatureGate feature="workspaces">
  <WorkspacesSection />
</FeatureGate>

// Hide the section if the viewer lacks access
<TierGate minTier="standard">
  <AdvancedFeature />
</TierGate>
```

## Data Fetching Pattern

Always scope queries to workspace and handle loading/error states:

```typescript
function PoliciesPage() {
  const { selectedWorkspaceId } = useWorkspace();

  const { data, isPending, error } = trpc.admin.policies.list.useQuery(
    { workspaceId: selectedWorkspaceId },
    { enabled: Boolean(selectedWorkspaceId) }
  );

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return <PolicyList policies={data} />;
}
```

## Extract Components (Optional)

For complex pages, extract reusable components:

**Location**: `packages/web/src/components/ResourceForm.tsx`

```typescript
import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useWorkspace } from '../hooks/WorkspaceContext';

interface ResourceFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ResourceForm({ onSuccess, onCancel }: ResourceFormProps) {
  const { selectedWorkspaceId } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { mutate, isPending } = trpc.admin.myResource.create.useMutation({
    onSuccess: () => {
      onSuccess?.();
      setName('');
      setDescription('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate({
      workspaceId: selectedWorkspaceId,
      name,
      description,
      enabled: true
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Creating...' : 'Create'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
```

## Common Patterns

### Loading States

```typescript
const { data, isPending, error } = trpc.admin.myResource.list.useQuery(
  { workspaceId: selectedWorkspaceId },
  { enabled: Boolean(selectedWorkspaceId) }
);

if (isPending) return <LoadingState />;
if (error) return <ErrorState error={error} />;
```

### Optimistic Updates

```typescript
const utils = trpc.useUtils();

const { mutate } = trpc.admin.myResource.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.admin.myResource.list.cancel();

    // Snapshot previous value
    const previous = utils.admin.myResource.list.getData({ workspaceId: selectedWorkspaceId });

    // Optimistically update
    utils.admin.myResource.list.setData(
      { workspaceId: selectedWorkspaceId },
      (old) => old?.map((item) => (item.id === newData.id ? { ...item, ...newData } : item)),
    );

    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.admin.myResource.list.setData(
      { workspaceId: selectedWorkspaceId },
      context?.previous
    );
  },
  onSettled: () => {
    // Refetch after error or success
    utils.admin.myResource.list.invalidate();
  },
});
```

### Form Validation

```typescript
const [errors, setErrors] = useState<Record<string, string>>({});

const validate = () => {
  const newErrors: Record<string, string> = {};

  if (!name.trim()) {
    newErrors.name = 'Name is required';
  }

  if (name.length > 100) {
    newErrors.name = 'Name must be less than 100 characters';
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (validate()) {
    mutate({ workspaceId: selectedWorkspaceId, name, description });
  }
};
```

### Modals/Dialogs

```typescript
import { Dialog } from '@headlessui/react';

const [isOpen, setIsOpen] = useState(false);

<Dialog open={isOpen} onClose={() => setIsOpen(false)}>
  <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

  <div className="fixed inset-0 flex items-center justify-center p-4">
    <Dialog.Panel className="bg-white rounded-lg p-6 max-w-md w-full">
      <Dialog.Title className="text-lg font-medium mb-4">
        Create Resource
      </Dialog.Title>

      <ResourceForm
        onSuccess={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      />
    </Dialog.Panel>
  </div>
</Dialog>
```

## Styling with Tailwind

Common utility patterns:

```typescript
// Container
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

// Card
<div className="bg-white shadow rounded-lg p-6">

// Button (primary)
<button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">

// Button (secondary)
<button className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">

// Input
<input className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />

// Badge
<span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">

// Table
<table className="min-w-full divide-y divide-gray-200">
```

## Common Mistakes

### Not Using Workspace Context

```typescript
// BAD - Not scoped to workspace
const { data } = trpc.admin.myResource.list.useQuery();
```

```typescript
// GOOD - Scoped to workspace
const { selectedWorkspaceId } = useWorkspace();
const { data } = trpc.admin.myResource.list.useQuery(
  { workspaceId: selectedWorkspaceId },
  { enabled: Boolean(selectedWorkspaceId) }
);
```

### Not Invalidating Queries After Mutations

```typescript
// BAD - List doesn't update after create
const { mutate } = trpc.admin.myResource.create.useMutation();
```

```typescript
// GOOD
const utils = trpc.useUtils();
const { mutate } = trpc.admin.myResource.create.useMutation({
  onSuccess: () => {
    utils.admin.myResource.list.invalidate();
  },
});
```

### Not Handling Loading/Error States

```typescript
// BAD - Renders undefined while loading
const { data } = trpc.admin.myResource.list.useQuery({ workspaceId });
return <div>{data.length}</div>; // Crashes if data is undefined
```

```typescript
// GOOD
const { data, isPending, error } = trpc.admin.myResource.list.useQuery(
  { workspaceId },
  { enabled: Boolean(workspaceId) }
);

if (isPending) return <LoadingState />;
if (error) return <ErrorState error={error} />;
return <div>{data?.length ?? 0}</div>;
```

### Not Using Protected Routes

```typescript
// BAD - No access control
<Route path="/admin/:workspaceSlug/settings" element={<SettingsPage />} />
```

```typescript
// GOOD - Protected with workspace validation
<Route
  path="/admin/:workspaceSlug/settings"
  element={
    <WorkspaceProtectedRoute requireAdmin={true}>
      <SettingsPage />
    </WorkspaceProtectedRoute>
  }
/>
```

## Real Examples in Codebase

- **Admin Dashboard**: `packages/web/src/pages/admin/Dashboard.tsx`
- **Users Page**: `packages/web/src/pages/admin/Users.tsx`
- **Policies Page**: `packages/web/src/pages/admin/Policies.tsx`
- **Workspaces Page**: `packages/web/src/pages/admin/Workspaces.tsx`
- **Workspace Agent**: `packages/web/src/pages/agent/WorkspaceAgentPage.tsx`

## Testing

```bash
# Run dev server
pnpm web:dev

# Build for production
pnpm web:build

# Preview production build
pnpm web:preview
```

## Next Steps

After creating the page:

1. Test in browser manually
2. Add E2E test for critical workflows
3. Ensure responsive design (mobile/tablet/desktop)
4. Add to navigation sidebar if needed
