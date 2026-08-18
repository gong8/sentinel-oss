import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface TokenInfo {
  email: string;
  token: string;
}

interface TokenDisplayDialogProps {
  tokenInfo: TokenInfo | null;
  onClose: () => void;
}

export function TokenDisplayDialog({ tokenInfo, onClose }: TokenDisplayDialogProps) {
  const [copied, copyToClipboard] = useCopyToClipboard();

  if (!tokenInfo) return null;

  async function handleCopy(): Promise<void> {
    if (!tokenInfo) return;
    await copyToClipboard(tokenInfo.token);
  }

  return (
    <Dialog open={Boolean(tokenInfo)} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New access token</DialogTitle>
          <DialogDescription>
            Token for <span className="font-medium">{tokenInfo.email}</span>. Copy it now - you will
            not be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <div className="rounded-md border border-border bg-muted/50 p-4 font-mono text-sm break-all">
              {tokenInfo.token}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="absolute right-2 top-2"
              onClick={handleCopy}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <Alert>
            <AlertDescription className="text-xs">
              This token provides full access to the API. Store it securely and never share it
              publicly.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
