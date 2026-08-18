/**
 * Tool Confirmation Dialog
 * Asks user to confirm write tool execution
 */

import { AlertTriangle, Check, X } from 'lucide-react';

import * as React from 'react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';

interface ToolConfirmationDialogProps {
  open: boolean;
  toolName: string;
  parameters?: unknown;
  onConfirm: (alwaysAllow: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ToolConfirmationDialog({
  open,
  toolName,
  parameters,
  onConfirm,
  onCancel,
  isLoading = false,
}: ToolConfirmationDialogProps) {
  const [alwaysAllow, setAlwaysAllow] = React.useState(false);

  const handleConfirm = () => {
    onConfirm(alwaysAllow);
    setAlwaysAllow(false);
  };

  const handleCancel = () => {
    onCancel();
    setAlwaysAllow(false);
  };

  // Extract domain from tool name (format: "domain::tool")
  const [domain, tool] = toolName.split('::');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Confirm Tool Execution
          </DialogTitle>
          <DialogDescription>
            The agent wants to execute a tool that may make changes. Please review and confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/50 p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Server:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{domain}</code>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Tool:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{tool}</code>
              </div>
            </div>
          </div>

          {parameters != null && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Parameters:</p>
              <ScrollArea className="h-32 rounded-md border border-border/50">
                <pre className="p-3 text-xs">{JSON.stringify(parameters, null, 2)}</pre>
              </ScrollArea>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="always-allow"
              checked={alwaysAllow}
              onCheckedChange={(checked) => setAlwaysAllow(checked === true)}
            />
            <label htmlFor="always-allow" className="text-sm text-muted-foreground cursor-pointer">
              Always allow this tool (you can change this in settings)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
