import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface CodeBlockProps {
  children: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}

export function CodeBlock({
  children,
  language = 'typescript',
  filename,
  showLineNumbers = false,
  highlightLines: _highlightLines = [],
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    // Dynamically import shiki for syntax highlighting
    const highlight = async () => {
      try {
        const { codeToHtml } = await import('shiki');
        // Shiki produces safe HTML from code - the input is code strings,
        // not user-generated content, and Shiki escapes all HTML entities
        const highlighted = await codeToHtml(children.trim(), {
          lang: language,
          themes: {
            light: 'github-light',
            dark: 'github-dark',
          },
        });
        setHtml(highlighted);
      } catch {
        // Fallback to plain code with manual escaping
        setHtml(`<pre><code>${escapeHtml(children.trim())}</code></pre>`);
      }
    };

    highlight();
  }, [children, language]);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-6 rounded-lg border border-border overflow-hidden bg-card">
      {/* Header with filename and copy button */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          {filename && <span className="text-sm text-muted-foreground font-mono">{filename}</span>}
          {!filename && language && (
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {language}
            </span>
          )}
        </div>
        <button
          onClick={copyToClipboard}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xs',
            'text-muted-foreground hover:text-foreground transition-colors',
            'opacity-0 group-hover:opacity-100',
          )}
          aria-label="Copy code"
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
      </div>

      {/* Code content - HTML from Shiki is safe as it only transforms code syntax */}
      <div
        className={cn(
          'overflow-x-auto text-sm [&_pre]:m-0 [&_pre]:rounded-none [&_pre]:border-0 [&_code]:block [&_code]:p-4',
          showLineNumbers && 'line-numbers',
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
