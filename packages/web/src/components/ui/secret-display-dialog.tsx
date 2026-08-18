import * as React from 'react';

import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

interface SecretDisplayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  secret: string | null;
  secretLabel?: string;
}

export function SecretDisplayDialog({
  open,
  onOpenChange,
  title = 'Secret Created',
  description = 'Copy this secret now. It will not be shown again.',
  secret,
  secretLabel = 'Secret',
}: SecretDisplayDialogProps): React.ReactElement {
  const [copied, copyToClipboard] = useCopyToClipboard();

  async function handleCopy(): Promise<void> {
    if (!secret) return;
    await copyToClipboard(secret);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{secretLabel}</Label>
          <div className="flex gap-2">
            <Input value={secret ?? ''} readOnly className="font-mono text-sm" />
            <Button variant="outline" onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
