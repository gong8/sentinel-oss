import { Check, Minus } from 'lucide-react';
import { cn } from '../lib/utils';

type Tier = 'free' | 'standard' | 'enterprise';

interface FeatureRow {
  name: string;
  free: boolean | string | number;
  standard: boolean | string | number;
  enterprise: boolean | string | number;
}

interface FeatureCategory {
  category: string;
  features: FeatureRow[];
}

const FEATURE_COMPARISON: FeatureCategory[] = [
  {
    category: 'Core Features',
    features: [
      { name: 'MCP Proxy', free: true, standard: true, enterprise: true },
      { name: 'Basic Policies', free: true, standard: true, enterprise: true },
      { name: 'Advanced Policies', free: false, standard: true, enterprise: true },
      { name: 'Webhooks', free: false, standard: true, enterprise: true },
      { name: 'Audit Logs', free: false, standard: true, enterprise: true },
    ],
  },
  {
    category: 'Limits',
    features: [
      { name: 'Team Members', free: '3', standard: '10', enterprise: 'Unlimited' },
      { name: 'MCP Servers', free: '3', standard: '25', enterprise: 'Unlimited' },
    ],
  },
  {
    category: 'Enterprise Features',
    features: [
      { name: 'Sentinel Admin Agent', free: false, standard: false, enterprise: true },
      { name: 'Approval Workflows', free: false, standard: false, enterprise: true },
      { name: 'Global Variables', free: false, standard: false, enterprise: true },
      { name: 'Single Sign-On (SSO)', free: false, standard: false, enterprise: true },
      { name: 'Priority Support', free: false, standard: false, enterprise: true },
    ],
  },
];

const TIER_LABELS: Record<Tier, string> = {
  free: 'Free',
  standard: 'Team',
  enterprise: 'Enterprise',
};

interface TierComparisonTableProps {
  currentTier: string;
  highlightTier?: Tier;
  className?: string;
}

function renderValue(value: boolean | string | number) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="mx-auto h-4 w-4 text-primary" />
    ) : (
      <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />
    );
  }
  return <span className="text-sm">{value}</span>;
}

export function TierComparisonTable({
  currentTier,
  highlightTier = 'standard',
  className,
}: TierComparisonTableProps) {
  const tiers: Tier[] = ['free', 'standard', 'enterprise'];
  const normalizedCurrentTier = currentTier.toLowerCase() as Tier;

  return (
    <div className={cn('overflow-hidden rounded-md border border-border/50', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Feature</th>
            {tiers.map((tier) => (
              <th
                key={tier}
                className={cn(
                  'px-3 py-2 text-center font-medium',
                  tier === highlightTier && 'bg-primary/10 text-primary',
                  tier === normalizedCurrentTier && tier !== highlightTier && 'bg-muted/50',
                )}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{TIER_LABELS[tier]}</span>
                  {tier === normalizedCurrentTier && (
                    <span className="text-[10px] font-normal text-muted-foreground">Current</span>
                  )}
                  {tier === highlightTier && tier !== normalizedCurrentTier && (
                    <span className="text-[10px] font-normal text-primary/80">Recommended</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_COMPARISON.map((category, categoryIndex) => (
            <>
              <tr
                key={`category-${categoryIndex}`}
                className="border-b border-border/30 bg-muted/20"
              >
                <td
                  colSpan={4}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {category.category}
                </td>
              </tr>
              {category.features.map((feature, featureIndex) => (
                <tr
                  key={`feature-${categoryIndex}-${featureIndex}`}
                  className={cn(
                    'border-b border-border/20',
                    featureIndex === category.features.length - 1 &&
                      categoryIndex < FEATURE_COMPARISON.length - 1 &&
                      'border-b-0',
                  )}
                >
                  <td className="px-3 py-2 text-muted-foreground">{feature.name}</td>
                  {tiers.map((tier) => (
                    <td
                      key={tier}
                      className={cn(
                        'px-3 py-2 text-center',
                        tier === highlightTier && 'bg-primary/5',
                        tier === normalizedCurrentTier && tier !== highlightTier && 'bg-muted/30',
                      )}
                    >
                      {renderValue(feature[tier])}
                    </td>
                  ))}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
