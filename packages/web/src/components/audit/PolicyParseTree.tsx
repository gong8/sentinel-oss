/**
 * PolicyParseTree Component
 * Visualizes the complete policy evaluation decision tree with RED/GREEN indicators
 */

import type {
  BooleanNode,
  ConditionNode,
  EvaluationNode,
  PolicyEvaluationTree,
  PolicyNode,
} from '@sentinel/shared';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Info,
  Minus,
  Shield,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { formatConditionValue } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface PolicyParseTreeProps {
  evaluationTree: PolicyEvaluationTree;
  className?: string;
}

function PassFailIcon({ passed, size = 'sm' }: { passed: boolean; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return passed ? (
    <Check className={cn(sizeClass, 'text-green-600 dark:text-green-400')} />
  ) : (
    <X className={cn(sizeClass, 'text-destructive')} />
  );
}

function ConditionNodeView({ node, indent = 0 }: { node: ConditionNode; indent?: number }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 py-1.5 rounded-md px-2 text-xs',
        node.passed ? 'bg-green-500/5' : 'bg-destructive/5',
      )}
      style={{ marginLeft: `${indent * 16}px` }}
    >
      <PassFailIcon passed={node.passed} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{node.field}</code>
          <span className="text-muted-foreground">{node.operator}</span>
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
            {formatConditionValue(node.expectedValue)}
          </code>
        </div>
        {!node.passed && (
          <div className="mt-1 text-[10px] text-destructive">
            <span className="text-muted-foreground">actual: </span>
            <code className="font-mono bg-destructive/10 px-1 py-0.5 rounded">
              {formatConditionValue(node.actualValue)}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

function BooleanNodeView({ node, indent = 0 }: { node: BooleanNode; indent?: number }) {
  const [isOpen, setIsOpen] = useState(true);

  if (node.children.length === 0) {
    return (
      <div
        className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
        style={{ marginLeft: `${indent * 16}px` }}
      >
        <Minus className="w-4 h-4" />
        <span>No conditions</span>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 py-1 text-xs hover:bg-muted/50 rounded px-1 w-full',
          node.passed ? 'text-green-600 dark:text-green-400' : 'text-destructive',
        )}
        style={{ marginLeft: `${indent * 16}px` }}
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <PassFailIcon passed={node.passed} />
        <span className="font-medium">{node.type}</span>
        <span className="text-muted-foreground">
          ({node.children.length} condition{node.children.length !== 1 ? 's' : ''})
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 mt-1">
          {node.children.map((child, idx) => (
            <EvaluationNodeView key={idx} node={child} indent={indent + 1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EvaluationNodeView({ node, indent = 0 }: { node: EvaluationNode; indent?: number }) {
  switch (node.type) {
    case 'condition':
      return <ConditionNodeView node={node} indent={indent} />;
    case 'AND':
    case 'OR':
      return <BooleanNodeView node={node} indent={indent} />;
    default:
      return null;
  }
}

function PolicyNodeView({ node }: { node: PolicyNode }) {
  const [isOpen, setIsOpen] = useState(
    node.matched || node.evaluationStatus === 'CONDITIONS_FAILED',
  );

  const getStatusBadge = () => {
    switch (node.evaluationStatus) {
      case 'MATCHED':
        return (
          <Badge
            variant={node.effect === 'DENY' ? 'destructive' : 'success'}
            className="text-[10px]"
          >
            MATCHED
          </Badge>
        );
      case 'CONDITIONS_FAILED':
        return (
          <Badge variant="warning" className="text-[10px]">
            CONDITIONS FAILED
          </Badge>
        );
      case 'SKIPPED':
        return (
          <Badge variant="secondary" className="text-[10px]">
            SKIPPED
          </Badge>
        );
      case 'NOT_MATCHED':
        return (
          <Badge variant="outline" className="text-[10px]">
            NOT MATCHED
          </Badge>
        );
    }
  };

  const getEffectBadge = () => {
    return node.effect === 'DENY' ? (
      <Badge variant="destructive" className="text-[10px]">
        DENY
      </Badge>
    ) : (
      <Badge variant="success" className="text-[10px]">
        ALLOW
      </Badge>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 py-2 px-2 rounded-lg border w-full text-left transition-colors',
          node.matched && node.effect === 'DENY' && 'border-destructive/30 bg-destructive/5',
          node.matched && node.effect === 'ALLOW' && 'border-green-500/30 bg-green-500/5',
          !node.matched && 'border-border/50 bg-muted/30 opacity-70',
        )}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
        <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{node.policySlug}</span>
            {getEffectBadge()}
            {getStatusBadge()}
          </div>
        </div>
        <PassFailIcon passed={node.matched} size="md" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 ml-6 space-y-2 text-xs">
          {/* Matcher evaluation */}
          <div className="flex items-center gap-2">
            <PassFailIcon passed={node.matcherMatched} />
            <span className="text-muted-foreground">Matcher:</span>
            {node.matcherDetails && (
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {node.matcherDetails.patterns.join(', ')}
              </code>
            )}
            {node.matcherMatched && node.matcherDetails && (
              <span className="text-green-600 dark:text-green-400">
                (matched: {node.matcherDetails.matched.join(', ')})
              </span>
            )}
          </div>

          {/* Tool pattern evaluation */}
          <div className="flex items-center gap-2">
            <PassFailIcon passed={node.toolPatternMatched} />
            <span className="text-muted-foreground">Tool pattern:</span>
            {node.toolPatternDetails && (
              <>
                <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {node.toolPatternDetails.pattern}
                </code>
                <span className="text-muted-foreground">vs</span>
                <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {node.toolPatternDetails.toolName}
                </code>
              </>
            )}
          </div>

          {/* Conditions tree */}
          {node.conditionsResult && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1">Conditions:</div>
              <EvaluationNodeView node={node.conditionsResult} />
            </div>
          )}

          {/* Skip reason */}
          {node.skipReason && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>{node.skipReason}</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DecisionHeader({ tree }: { tree: PolicyEvaluationTree }) {
  const decisionStyles = {
    ALLOWED: 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400',
    DENIED: 'bg-destructive/10 border-destructive/30 text-destructive',
    PENDING_APPROVAL: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400',
  };

  const decisionIcons = {
    ALLOWED: Check,
    DENIED: X,
    PENDING_APPROVAL: CircleDashed,
  };

  const Icon = decisionIcons[tree.decision];

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border',
        decisionStyles[tree.decision],
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6" />
        <div>
          <div className="font-semibold text-base">{tree.decision}</div>
          {tree.justification && <div className="text-xs opacity-80">{tree.justification}</div>}
        </div>
      </div>
      {tree.decidingPolicyId && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-xs">
                {tree.policies.find((p) => p.policyId === tree.decidingPolicyId)?.policySlug ??
                  tree.decidingPolicyId}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Deciding policy</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export function PolicyParseTree({ evaluationTree, className }: PolicyParseTreeProps) {
  const matchedPolicies = evaluationTree.policies.filter(
    (p) => p.matched || p.evaluationStatus === 'CONDITIONS_FAILED',
  );
  const unmatchedPolicies = evaluationTree.policies.filter(
    (p) => !p.matched && p.evaluationStatus !== 'CONDITIONS_FAILED',
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Decision header */}
      <DecisionHeader tree={evaluationTree} />

      {/* Matched/relevant policies */}
      {matchedPolicies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Evaluated Policies ({matchedPolicies.length})
          </h4>
          <div className="space-y-2">
            {matchedPolicies.map((policy) => (
              <PolicyNodeView key={policy.policyId} node={policy} />
            ))}
          </div>
        </div>
      )}

      {/* Unmatched policies (collapsed by default) */}
      {unmatchedPolicies.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
            <span>Other policies not applicable ({unmatchedPolicies.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2 opacity-70">
              {unmatchedPolicies.map((policy) => (
                <PolicyNodeView key={policy.policyId} node={policy} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* No policies case */}
      {evaluationTree.policies.length === 0 && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <AlertCircle className="w-5 h-5" />
          <span>No policies were evaluated</span>
        </div>
      )}
    </div>
  );
}
