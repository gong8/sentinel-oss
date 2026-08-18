/**
 * InvocationPreview Component
 * Shows a formatted JSON preview of the current tool invocation
 * Collapsible panel with syntax highlighting and copy button
 */

import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';

import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { cleanObject, cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import type { ContextOverrides, ExtractedContext } from './types';

interface InvocationPreviewProps {
  toolName: string;
  parameters: Record<string, unknown>;
  contextOverrides?: ContextOverrides;
  extractedContext?: ExtractedContext;
  /** Whether to show the preview expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Simple JSON syntax highlighting
 */
function highlightJson(json: string): JSX.Element[] {
  const elements: JSX.Element[] = [];
  let key = 0;

  // Pattern to match JSON tokens
  const tokenRegex =
    /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\]:,])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(json)) !== null) {
    // Add any whitespace/text before this match
    if (match.index > lastIndex) {
      elements.push(
        <span key={key++} className="text-foreground">
          {json.slice(lastIndex, match.index)}
        </span>,
      );
    }

    const [fullMatch, keyMatch, stringMatch, numberMatch, boolNullMatch, punctMatch] = match;

    if (keyMatch) {
      // Property key
      elements.push(
        <span key={key++} className="text-violet-600 dark:text-violet-400">
          {keyMatch}
        </span>,
      );
      // Add the colon that follows
      const colonIdx = json.indexOf(':', match.index + keyMatch.length);
      if (colonIdx !== -1 && colonIdx === match.index + keyMatch.length) {
        elements.push(
          <span key={key++} className="text-foreground">
            :
          </span>,
        );
      }
    } else if (stringMatch) {
      // String value
      elements.push(
        <span key={key++} className="text-green-600 dark:text-green-400">
          {stringMatch}
        </span>,
      );
    } else if (numberMatch) {
      // Number
      elements.push(
        <span key={key++} className="text-amber-600 dark:text-amber-400">
          {numberMatch}
        </span>,
      );
    } else if (boolNullMatch) {
      // Boolean or null
      elements.push(
        <span key={key++} className="text-purple-600 dark:text-purple-400">
          {boolNullMatch}
        </span>,
      );
    } else if (punctMatch) {
      // Punctuation
      elements.push(
        <span key={key++} className="text-muted-foreground">
          {punctMatch}
        </span>,
      );
    } else if (fullMatch) {
      // Fallback
      elements.push(
        <span key={key++} className="text-foreground">
          {fullMatch}
        </span>,
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  // Add any remaining text
  if (lastIndex < json.length) {
    elements.push(
      <span key={key++} className="text-foreground">
        {json.slice(lastIndex)}
      </span>,
    );
  }

  return elements;
}

export function InvocationPreview({
  toolName,
  parameters,
  contextOverrides,
  extractedContext,
  defaultExpanded = false,
}: InvocationPreviewProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [copied, copyToClipboard] = useCopyToClipboard();

  // Build the full invocation object
  const invocationObject = useMemo(() => {
    const obj: Record<string, unknown> = {
      toolName,
    };

    if (parameters && Object.keys(parameters).length > 0) {
      obj.parameters = parameters;
    }

    if (contextOverrides) {
      const cleanedOverrides = cleanObject(contextOverrides);
      if (Object.keys(cleanedOverrides).length > 0) {
        obj.contextOverrides = cleanedOverrides;
      }
    }

    if (extractedContext) {
      const cleanedExtracted = cleanObject(extractedContext);
      if (Object.keys(cleanedExtracted).length > 0) {
        obj.extractedContext = cleanedExtracted;
      }
    }

    return obj;
  }, [toolName, parameters, contextOverrides, extractedContext]);

  // Format JSON
  const jsonString = useMemo(() => {
    return JSON.stringify(invocationObject, null, 2);
  }, [invocationObject]);

  // Highlighted JSON elements
  const highlightedJson = useMemo(() => {
    return highlightJson(jsonString);
  }, [jsonString]);

  // Copy to clipboard
  async function handleCopy(): Promise<void> {
    await copyToClipboard(jsonString);
  }

  // Count of configured sections
  const configuredCount = useMemo(() => {
    let count = 0;
    if (parameters && Object.keys(parameters).length > 0) count++;
    if (
      contextOverrides &&
      Object.keys(contextOverrides).some(
        (k) => contextOverrides[k as keyof ContextOverrides] !== undefined,
      )
    )
      count++;
    if (extractedContext && Object.keys(extractedContext).length > 0) count++;
    return count;
  }, [parameters, contextOverrides, extractedContext]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">JSON Preview</span>
          {configuredCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded">
              {configuredCount} section{configuredCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{jsonString.length} chars</span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3 border-t">
          <div className="mt-3 relative">
            {/* Copy button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className={cn('absolute top-2 right-2 h-7 px-2', copied && 'text-green-600')}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>

            {/* JSON display */}
            <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words">
              {highlightedJson}
            </pre>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
