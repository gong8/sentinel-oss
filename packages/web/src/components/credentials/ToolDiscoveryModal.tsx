import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

export type DiscoveryState =
  | { status: 'idle' }
  | { status: 'discovering'; serverName: string }
  | { status: 'success'; serverName: string; toolsDiscovered: number }
  | { status: 'error'; serverName: string; error: string };

interface ToolDiscoveryModalProps {
  state: DiscoveryState;
  onClose: () => void;
  autoCloseDelay?: number;
}

export function ToolDiscoveryModal({
  state,
  onClose,
  autoCloseDelay = 3000,
}: ToolDiscoveryModalProps): React.ReactElement | null {
  const isOpen = state.status !== 'idle';

  // Auto-close on success after delay
  useEffect(() => {
    if (state.status === 'success' && autoCloseDelay > 0) {
      const timer = setTimeout(onClose, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [state.status, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {state.status === 'discovering' && 'Connecting to Server'}
            {state.status === 'success' && 'Connection Successful'}
            {state.status === 'error' && 'Connection Failed'}
          </DialogTitle>
          <DialogDescription>{state.serverName}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-6">
          {state.status === 'discovering' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-center text-muted-foreground">
                Validating credentials and discovering tools...
              </p>
            </>
          )}

          {state.status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <div className="text-center">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Discovered {state.toolsDiscovered} tool{state.toolsDiscovered !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tools are now being classified in the background
                </p>
              </div>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </>
          )}

          {state.status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <div className="text-center">
                <p className="font-medium text-destructive">Failed to connect</p>
                <p className="text-sm text-muted-foreground mt-1">{state.error}</p>
              </div>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
