import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copyToClipboard}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded text-sm',
        'text-muted-foreground hover:text-foreground transition-colors',
        'border border-border hover:bg-muted',
        className,
      )}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-500" />
          <span className="text-green-500">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
