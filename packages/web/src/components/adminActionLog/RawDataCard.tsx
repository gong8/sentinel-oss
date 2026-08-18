/**
 * RawDataCard Component
 * Collapsible card showing raw JSON data for debugging
 */

import { Check, ChevronDown, ChevronRight, Code, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

interface RawDataCardProps {
  data: Record<string, unknown>;
  title?: string;
  defaultOpen?: boolean;
}

export function RawDataCard({ data, title = 'Raw Data', defaultOpen = false }: RawDataCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const formattedJson = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = formattedJson;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center gap-2 text-left">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Code className="h-4 w-4" />
              <CardTitle className="text-base">{title}</CardTitle>
              <span className="ml-auto text-xs text-muted-foreground">
                {isOpen ? 'Click to collapse' : 'Click to expand'}
              </span>
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 h-8 w-8 p-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="sr-only">Copy JSON</span>
              </Button>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
                {formattedJson}
              </pre>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Simplified version for inline use
 */
interface RawJsonPreviewProps {
  data: unknown;
  maxLines?: number;
}

export function RawJsonPreview({ data, maxLines = 10 }: RawJsonPreviewProps) {
  const formatted = JSON.stringify(data, null, 2);
  const lines = formatted.split('\n');
  const truncated = lines.length > maxLines;
  const displayText = truncated ? lines.slice(0, maxLines).join('\n') + '\n...' : formatted;

  return (
    <div className="relative">
      <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{displayText}</pre>
      {truncated && (
        <div className="mt-1 text-xs text-muted-foreground">
          {lines.length - maxLines} more lines...
        </div>
      )}
    </div>
  );
}
