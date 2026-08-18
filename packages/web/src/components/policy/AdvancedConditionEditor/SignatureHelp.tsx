/**
 * Signature Help Popup
 *
 * Displays function signature with highlighted active parameter.
 * Similar to VS Code's parameter hints.
 */

import { cn } from '../../../lib/utils';

interface Parameter {
  name: string;
  type: string;
  optional?: boolean;
  variadic?: boolean;
}

interface SignatureHelpProps {
  functionName: string;
  description: string;
  parameters: Parameter[];
  activeParameter: number;
  returnType: string;
  position: { x: number; y: number };
}

export function SignatureHelp({
  functionName,
  description,
  parameters,
  activeParameter,
  returnType,
  position,
}: SignatureHelpProps) {
  // Use CSS max() to constrain horizontal position without JavaScript measurement
  // max-w-md = 448px, add 8px padding
  return (
    <div
      className="absolute z-50 max-w-md rounded-lg border border-border bg-card shadow-lg overflow-hidden"
      style={{
        left: `min(${position.x}px, calc(100% - 456px))`,
        top: position.y,
      }}
    >
      {/* Signature */}
      <div className="px-3 py-2 font-mono text-sm">
        <span className="text-blue-600 dark:text-blue-400">{functionName}</span>
        <span className="text-muted-foreground">(</span>
        {parameters.map((param, index) => (
          <span key={param.name}>
            {index > 0 && <span className="text-muted-foreground">, </span>}
            <span
              className={cn(
                'transition-colors',
                index === activeParameter
                  ? 'text-amber-600 dark:text-amber-400 font-semibold underline underline-offset-2'
                  : 'text-foreground',
              )}
            >
              {param.name}
              {param.optional && '?'}
              {param.variadic && '...'}
              <span className="text-muted-foreground">: {param.type}</span>
            </span>
          </span>
        ))}
        <span className="text-muted-foreground">)</span>
        <span className="text-muted-foreground"> → </span>
        <span className="text-green-600 dark:text-green-400">{returnType}</span>
      </div>

      {/* Description */}
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground bg-muted">
        {description}
      </div>

      {/* Active parameter info */}
      {parameters[activeParameter] && (
        <div className="border-t border-border px-3 py-1.5 text-xs bg-amber-50 dark:bg-amber-950/30">
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {parameters[activeParameter].name}
          </span>
          <span className="text-muted-foreground">
            {' '}
            &mdash; {parameters[activeParameter].type}
            {parameters[activeParameter].optional && ' (optional)'}
            {parameters[activeParameter].variadic && ' (multiple values)'}
          </span>
        </div>
      )}
    </div>
  );
}
