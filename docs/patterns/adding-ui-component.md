# Adding a UI Component

## When to Use This Pattern

Use this pattern when creating reusable React components for the SENTINEL web interface.

## Component Library

SENTINEL uses **shadcn/ui** components located in `packages/web/src/components/ui/`. This provides 40+ pre-built, accessible components that use Tailwind CSS.

## Component Structure

```
packages/web/src/components/
├── ui/                  # shadcn base components (40+ components)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── table.tsx
│   └── ...
├── agent/               # Agent chat components
│   ├── ChatPanel.tsx    # Floating chat panel (Cmd+. shortcut)
│   ├── ChatMessage.tsx  # Message display
│   ├── ChatInput.tsx    # Message input
│   └── ConfirmationCard.tsx # Tool confirmations
├── layout/              # Layout components
│   ├── AppShell.tsx     # Main application shell
│   ├── PageHeader.tsx   # Page headers
│   └── TabbedPageLayout.tsx
├── gates/               # Feature gating
│   ├── FeatureGate.tsx
│   └── TierGate.tsx
└── shared/              # Shared utilities
```

## Component Types

- **Layout Components**: AppShell, PageHeader, TabbedPageLayout
- **Form Components**: Input, Select, Checkbox, Form (with react-hook-form)
- **Data Display**: Table, Card, Badge, Avatar
- **Feedback**: Alert, Toast, Dialog, Skeleton
- **Navigation**: Link, Breadcrumb, Tabs

## Using shadcn Components

### Basic Imports

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

### Button Component

```typescript
import { Button } from '@/components/ui/button';

// Variants: default, destructive, outline, secondary, ghost, link
<Button variant="default">Save</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Menu</Button>

// Sizes: default, sm, lg, icon
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// With loading state
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Please wait
</Button>
```

### Card Component

```typescript
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description text</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Dialog (Modal) Pattern

```typescript
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const [isOpen, setIsOpen] = useState(false);

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogTrigger asChild>
    <Button>Open Modal</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Modal Title</DialogTitle>
      <DialogDescription>
        This is a description of what this modal does.
      </DialogDescription>
    </DialogHeader>
    {/* Modal content */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button onClick={handleSubmit}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Form Components with react-hook-form

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
});

type FormValues = z.infer<typeof schema>;

function MyForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
    },
  });

  const onSubmit = (data: FormValues) => {
    console.log(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter name" {...field} />
              </FormControl>
              <FormDescription>Your display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="Enter email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

### Table Pattern

```typescript
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map((item) => (
      <TableRow key={item.id}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell>
          <Badge variant={item.active ? 'default' : 'secondary'}>
            {item.active ? 'Active' : 'Inactive'}
          </Badge>
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="sm">Edit</Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Badge Component

```typescript
import { Badge } from '@/components/ui/badge';

// Variants: default, secondary, destructive, outline
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>

// Common pattern for policy effects
<Badge variant={policy.effect === 'ALLOW' ? 'default' : 'destructive'}>
  {policy.effect}
</Badge>
```

### Loading States

```typescript
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

// Skeleton loader for content placeholders
<div className="space-y-2">
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-3/4" />
  <Skeleton className="h-4 w-1/2" />
</div>

// Skeleton for cards
<Card>
  <CardHeader>
    <Skeleton className="h-6 w-1/3" />
  </CardHeader>
  <CardContent>
    <Skeleton className="h-20 w-full" />
  </CardContent>
</Card>

// Full page loading spinner
<div className="flex items-center justify-center h-full">
  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
</div>

// Button with loading state
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Loading...
</Button>
```

### Select Component

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>
```

## Styling with Tailwind CSS

### Using the cn() Utility

The `cn()` utility function merges Tailwind classes and handles conditional classes:

```typescript
import { cn } from '@/lib/utils';

// Basic usage
<div className={cn('base-classes', 'more-classes')} />

// Conditional classes
<div className={cn(
  'px-4 py-2 rounded-md',
  isActive && 'bg-primary text-primary-foreground',
  isDisabled && 'opacity-50 cursor-not-allowed',
  className // Allow parent to override
)} />

// With variants
<button
  className={cn(
    'inline-flex items-center justify-center rounded-md text-sm font-medium',
    {
      'bg-primary text-primary-foreground': variant === 'default',
      'bg-destructive text-destructive-foreground': variant === 'destructive',
      'border border-input bg-background': variant === 'outline',
    }
  )}
/>
```

### Styling Guidelines

- Use Tailwind CSS for all styling
- No inline styles
- Use semantic color tokens (e.g., `bg-primary`, `text-muted-foreground`)
- Always accept and merge `className` prop for customization

## Creating Custom Components

### 1. Create the Component File

**Location**: `packages/web/src/components/[category]/[ComponentName].tsx`

### 2. Define Component Interface

```typescript
interface MyComponentProps {
  // Required props
  title: string;

  // Optional props with defaults
  variant?: 'primary' | 'secondary' | 'danger';

  // Event handlers
  onClick?: () => void;

  // Children
  children?: React.ReactNode;

  // Always accept className for customization
  className?: string;
}
```

### 3. Implement Component

```typescript
import { cn } from '@/lib/utils';

export function MyComponent({
  title,
  variant = 'primary',
  onClick,
  children,
  className,
}: MyComponentProps) {
  return (
    <div
      className={cn(
        'rounded-lg p-6',
        variant === 'primary' && 'bg-primary text-primary-foreground',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground',
        variant === 'danger' && 'bg-destructive text-destructive-foreground',
        className
      )}
    >
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      {children}
      {onClick && (
        <Button onClick={onClick} variant={variant === 'danger' ? 'destructive' : 'default'}>
          Confirm
        </Button>
      )}
    </div>
  );
}
```

## SENTINEL-Specific Components

### AllowDenyToggle

```typescript
import { AllowDenyToggle } from '@/components/shared/AllowDenyToggle';

<AllowDenyToggle
  value={effect}
  onChange={setEffect}
/>
```

### DataCard

```typescript
import { DataCard } from '@/components/shared/DataCard';

<DataCard
  title="Total Policies"
  value={policyCount}
  description="Active policies in your organization"
/>
```

### Feature Gates

```typescript
import { FeatureGate } from '@/components/gates/FeatureGate';
import { TierGate } from '@/components/gates/TierGate';

// Show content only when feature is enabled
<FeatureGate feature="advanced-analytics">
  <AdvancedAnalytics />
</FeatureGate>

// Show content only when the viewer is authorized
<TierGate requiredTier="pro">
  <ProFeatures />
</TierGate>
```

## Component Testing

**Location**: `test/unit/web/components/[ComponentName].test.tsx`

```typescript
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  test('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  test('calls onClick handler', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('disables when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('applies variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
  });
});
```

## Common Mistakes

### Do Not: Use raw HTML elements when shadcn provides components

```typescript
// BAD
<button className="bg-blue-500 text-white px-4 py-2">Click</button>

// GOOD
import { Button } from '@/components/ui/button';
<Button>Click</Button>
```

### Do Not: Use string concatenation for classes

```typescript
// BAD
<div className={'base ' + (isActive ? 'active' : '')} />

// GOOD
import { cn } from '@/lib/utils';
<div className={cn('base', isActive && 'active')} />
```

### Do Not: Forget to accept className prop

```typescript
// BAD - Cannot be customized from parent
export function Card({ children }) {
  return <div className="bg-white p-4">{children}</div>;
}

// GOOD - Allows customization
export function Card({ children, className }) {
  return <div className={cn('bg-white p-4', className)}>{children}</div>;
}
```

### Do Not: Skip TypeScript types

```typescript
// BAD
export function Input({ label, error, ...props }) { /* ... */ }

// GOOD
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export function Input({ label, error, ...props }: InputProps) { /* ... */ }
```

## Accessibility Checklist

- Use semantic HTML elements (`<button>`, `<input>`, not just `<div>`)
- Add ARIA labels for icon-only buttons
- Ensure keyboard navigation support
- Include focus visible styles
- Maintain color contrast (WCAG standards)
- Test with screen readers

## Real Examples in Codebase

- **Agent Chat**: `packages/web/src/components/agent/ChatPanel.tsx`
- **Layout**: `packages/web/src/components/layout/AppShell.tsx`
- **Forms**: Policy creation forms throughout admin pages
- **Tables**: Audit logs, user management lists
- **Dialogs**: Confirmation modals, form modals

## Next Steps

After creating a component:

1. Test in isolation with component tests
2. Test in context within a page
3. Check accessibility with screen reader
4. Ensure responsive design
5. Document props in JSDoc comments
