import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Name to highlight in description (wrapped in font-medium span) */
  highlightName?: string;
  isSubmitting: boolean;
  submitText: string;
  submittingText: string;
  onSubmit: (e: React.FormEvent) => void;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  children: React.ReactNode;
}

const maxWidthClasses = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[500px]',
  lg: 'sm:max-w-[600px]',
  xl: 'sm:max-w-[700px]',
  '2xl': 'max-w-2xl',
} as const;

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  highlightName,
  isSubmitting,
  submitText,
  submittingText,
  onSubmit,
  maxWidth = 'md',
  children,
}: FormDialogProps): React.ReactElement | null {
  if (!open) return null;

  const widthClass = maxWidthClasses[maxWidth];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${widthClass} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>
              {highlightName ? (
                <>
                  {description} <span className="font-medium">{highlightName}</span>.
                </>
              ) : (
                description
              )}
            </DialogDescription>
          )}
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          {children}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? submittingText : submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
