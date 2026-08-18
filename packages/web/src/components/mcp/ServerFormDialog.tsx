import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useAuthTypeDetection } from '../../hooks/useAuthTypeDetection';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { AuthTypeSelect } from './AuthTypeSelect';

const AUTH_TYPE_OPTIONS = ['NONE', 'OAUTH', 'API_KEY'] as const;

function getSubmitButtonText(mode: 'create' | 'edit', isSubmitting: boolean): string {
  if (isSubmitting) {
    return mode === 'create' ? 'Adding...' : 'Saving...';
  }
  return mode === 'create' ? 'Add server' : 'Save changes';
}

const serverSchema = z.object({
  name: z.string().min(2, 'Name is required.'),
  url: z.string().url('Enter a valid URL.'),
  authType: z.enum(AUTH_TYPE_OPTIONS),
  trusted: z.boolean(),
  apiKey: z.string().optional(),
});

export type ServerFormValues = z.infer<typeof serverSchema>;

interface McpServerItem {
  id: string;
  name: string;
  url: string;
  authType: 'OAUTH' | 'API_KEY' | 'NONE';
  trusted: boolean;
  hasApiKey?: boolean;
}

interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  server?: McpServerItem | null;
  onSubmit: (values: ServerFormValues) => void;
  isSubmitting: boolean;
  submitError?: string | null;
}

export function ServerFormDialog({
  open,
  onOpenChange,
  mode,
  server,
  onSubmit,
  isSubmitting,
  submitError,
}: ServerFormDialogProps): React.ReactElement {
  const form = useForm<ServerFormValues>({
    resolver: zodResolver(serverSchema),
    defaultValues: {
      name: '',
      url: '',
      authType: 'NONE',
      trusted: true,
      apiKey: '',
    },
  });

  const authType = useWatch({ control: form.control, name: 'authType' });
  const url = useWatch({ control: form.control, name: 'url' });

  const setAuthType = (value: 'NONE' | 'OAUTH' | 'API_KEY') => {
    form.setValue('authType', value, { shouldValidate: true, shouldDirty: true });
  };

  const authDetection = useAuthTypeDetection({
    url,
    setAuthType,
    enabled: open,
  });

  // Reset form when modal opens with server data (edit mode)
  useEffect(() => {
    if (open && mode === 'edit' && server) {
      form.reset({
        name: server.name,
        url: server.url,
        authType: server.authType,
        trusted: server.trusted,
        apiKey: '',
      });
    } else if (open && mode === 'create') {
      form.reset({
        name: '',
        url: '',
        authType: 'NONE',
        trusted: true,
        apiKey: '',
      });
    }
  }, [open, mode, server, form]);

  // Reset auth detection when modal closes
  useEffect(() => {
    if (!open) {
      authDetection.reset();
    }
  }, [open, authDetection]);

  // Set error from parent mutation
  useEffect(() => {
    if (submitError) {
      const values = form.getValues();
      const trimmedApiKey = values.apiKey?.trim();
      const authFailure = /authentication|unauthorized|forbidden|401|403/i.test(submitError);

      if (values.authType === 'API_KEY' && trimmedApiKey && authFailure) {
        form.setError('apiKey', { type: 'server', message: submitError });
      } else {
        form.setError('url', { type: 'server', message: submitError });
      }
    }
  }, [submitError, form]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit(values);
  });

  const title = mode === 'create' ? 'Add MCP server' : 'Edit MCP server';
  const description =
    mode === 'create'
      ? 'Register a server and set authentication requirements.'
      : 'Update connection details and trust settings.';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              placeholder="https://example.com/mcp"
              {...form.register('url')}
              className={form.formState.errors.url ? 'border-destructive' : ''}
            />
            {form.formState.errors.url && (
              <p className="text-xs text-destructive">{form.formState.errors.url.message}</p>
            )}
            {!form.formState.errors.url && !isSubmitting && (
              <p className="text-xs text-muted-foreground">
                Enter the full URL including protocol (http:// or https://). You may need to append
                /mcp to the end of the URL.
              </p>
            )}
            {isSubmitting && (
              <p className="text-xs text-muted-foreground">Validating MCP server connection...</p>
            )}
          </div>

          <AuthTypeSelect
            value={authType}
            onChange={setAuthType}
            detection={authDetection.state}
            onEnableOverride={authDetection.enableOverride}
          />

          {authType === 'API_KEY' && (
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key (optional)</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={
                  mode === 'edit' && server?.hasApiKey
                    ? 'Leave blank to keep existing key'
                    : 'Paste API key'
                }
                {...form.register('apiKey')}
              />
              {form.formState.errors.apiKey ? (
                <p className="text-xs text-destructive">{form.formState.errors.apiKey.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {mode === 'edit'
                    ? 'Leave blank to keep the current key. Tool discovery runs after a valid key is set.'
                    : 'Leave blank to add later. Tool discovery will run after a valid key is provided.'}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Trust server</Label>
              <p className="text-xs text-muted-foreground">
                Untrust this server to prevent anyone from using it.
              </p>
            </div>
            <Controller
              control={form.control}
              name="trusted"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || (mode === 'create' && authDetection.isBlocking)}
            >
              {getSubmitButtonText(mode, isSubmitting)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
