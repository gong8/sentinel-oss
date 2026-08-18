/**
 * ToolInvocationBuilder Component
 * Main composite component for building tool invocations with parameters,
 * context overrides, and extracted context
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { ContextOverridesEditor } from './ContextOverridesEditor';
import { ExtractedContextEditor } from './ExtractedContextEditor';
import { InvocationPreview } from './InvocationPreview';
import { SchemaParameterBuilder } from './SchemaParameterBuilder';
import type {
  ContextOverrides,
  ExtractedContext,
  ExtractedMode,
  ToolCategory,
  ToolInvocation,
} from './types';
import { getToolCategory } from './types';

interface ToolInvocationBuilderProps {
  toolName: string;
  value: ToolInvocation;
  onChange: (value: ToolInvocation) => void;
  disabled?: boolean;
  /** Show which condition fields are used by policies for this tool */
  conditionFields?: string[];
}

interface SectionProps {
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
  hasContent: boolean;
  children: React.ReactNode;
}

function Section({
  title,
  description,
  isOpen,
  onToggle,
  hasContent,
  children,
}: SectionProps): JSX.Element {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="text-left">
            <span className="text-sm font-medium">{title}</span>
            {hasContent && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded">
                configured
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">{description}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <div className="pt-2 border-t border-border mt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ToolInvocationBuilder({
  toolName,
  value,
  onChange,
  disabled = false,
  conditionFields = [],
}: ToolInvocationBuilderProps): JSX.Element {
  // Track which sections are open
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const sections = new Set<string>();
    // Open sections that have content by default
    if (value.parameters && Object.keys(value.parameters).length > 0) {
      sections.add('parameters');
    }
    if (value.contextOverrides && Object.keys(value.contextOverrides).length > 0) {
      sections.add('context');
    }
    if (value.extractedMode === 'manual') {
      sections.add('extracted');
    }
    return sections;
  });

  const toggleSection = useCallback((section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  // Detect tool category for extracted context
  const toolCategory: ToolCategory = useMemo(() => getToolCategory(toolName), [toolName]);

  // Check if sections have content
  const hasParameters = useMemo(
    () => value.parameters && Object.keys(value.parameters).length > 0,
    [value.parameters],
  );
  const hasContextOverrides = useMemo(
    () => value.contextOverrides && Object.keys(value.contextOverrides).length > 0,
    [value.contextOverrides],
  );
  const hasExtractedContext = useMemo(
    () => value.extractedMode === 'manual' && Boolean(value.extractedContext),
    [value.extractedMode, value.extractedContext],
  );

  // Determine which condition field categories are used
  const usedFieldCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const field of conditionFields) {
      if (field.startsWith('params.')) categories.add('params');
      if (field.startsWith('context.')) categories.add('context');
      if (field.startsWith('sql.') || field.startsWith('extracted.sql.')) categories.add('sql');
      if (field.startsWith('github.') || field.startsWith('extracted.github.'))
        categories.add('github');
      if (field.startsWith('file.') || field.startsWith('extracted.file.')) categories.add('file');
    }
    return categories;
  }, [conditionFields]);

  // Update handlers
  const updateParameters = useCallback(
    (parameters: Record<string, unknown>) => {
      onChange({ ...value, parameters });
    },
    [value, onChange],
  );

  const updateContextOverrides = useCallback(
    (contextOverrides: ContextOverrides) => {
      onChange({ ...value, contextOverrides });
    },
    [value, onChange],
  );

  const updateExtractedContext = useCallback(
    (extractedContext: ExtractedContext) => {
      onChange({ ...value, extractedContext });
    },
    [value, onChange],
  );

  const updateExtractedMode = useCallback(
    (extractedMode: ExtractedMode) => {
      onChange({ ...value, extractedMode });
    },
    [value, onChange],
  );

  return (
    <div className="space-y-2 border rounded-lg">
      {/* Condition fields indicator */}
      {conditionFields.length > 0 && (
        <div className="px-3 py-2 bg-muted/30 border-b text-xs text-muted-foreground">
          <span className="font-medium">Policies use these condition fields:</span>{' '}
          {conditionFields.map((field, i) => (
            <span key={field}>
              <code className="bg-muted px-1 py-0.5 rounded">{field}</code>
              {i < conditionFields.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      )}

      {/* Parameters Section */}
      <Section
        title="Tool Parameters"
        description={usedFieldCategories.has('params') ? 'Used by conditions' : 'Optional'}
        isOpen={openSections.has('parameters')}
        onToggle={() => toggleSection('parameters')}
        hasContent={hasParameters ?? false}
      >
        <SchemaParameterBuilder
          toolName={toolName}
          value={value.parameters ?? {}}
          onChange={updateParameters}
          disabled={disabled}
        />
      </Section>

      {/* Context Overrides Section */}
      <Section
        title="Context Overrides"
        description={usedFieldCategories.has('context') ? 'Used by conditions' : 'Optional'}
        isOpen={openSections.has('context')}
        onToggle={() => toggleSection('context')}
        hasContent={hasContextOverrides ?? false}
      >
        <ContextOverridesEditor
          value={value.contextOverrides ?? {}}
          onChange={updateContextOverrides}
          disabled={disabled}
        />
      </Section>

      {/* Extracted Context Section */}
      <Section
        title="Extracted Context"
        description={
          usedFieldCategories.has('sql') ||
          usedFieldCategories.has('github') ||
          usedFieldCategories.has('file')
            ? 'Used by conditions'
            : 'Optional'
        }
        isOpen={openSections.has('extracted')}
        onToggle={() => toggleSection('extracted')}
        hasContent={hasExtractedContext ?? false}
      >
        <ExtractedContextEditor
          value={value.extractedContext ?? {}}
          onChange={updateExtractedContext}
          mode={value.extractedMode ?? 'auto'}
          onModeChange={updateExtractedMode}
          toolCategory={toolCategory}
          disabled={disabled}
        />
      </Section>

      {/* JSON Preview */}
      <div className="px-2 pb-2">
        <InvocationPreview
          toolName={toolName}
          parameters={value.parameters ?? {}}
          contextOverrides={value.contextOverrides}
          extractedContext={value.extractedContext}
        />
      </div>
    </div>
  );
}
