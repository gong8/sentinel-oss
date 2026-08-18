/**
 * Feature Discovery Types
 * Shared types for feature discovery and notifications system
 */

export interface FeatureTip {
  id: string; // Unique identifier, e.g., "advanced-conditions"
  title: string; // "Try Advanced Policy Conditions"
  description: string; // "Create time-based rules, IP restrictions, and more"
  docUrl: string; // "https://docs.sentinel.london/policies/conditions"

  // Targeting
  pageContexts: string[]; // ["/admin/policies", "/admin/policies/*"]
  prerequisiteFeatures?: string[]; // Must have used these first: ["basic-policy"]

  // Detection: How we know the feature is "unused"
  detectUsage: {
    actionTypes?: string[]; // Check admin action log for these action types
    customCheck?: string; // Named check function for complex logic
  };

  // Display
  priority: number; // Higher = show first (1-100)
  category: 'basic' | 'intermediate' | 'advanced' | 'enterprise';
}

export interface Milestone {
  id: string;
  metric: string; // What we're counting (action type)
  threshold: number; // When to trigger
  title: string; // "You've created your 10th policy!"
  description: string; // Encouraging message
  featureLink?: string; // Optional related feature to highlight
  emailEligible: boolean; // Whether this milestone can trigger email
}

export interface FeatureUsageStatus {
  [featureId: string]: boolean;
}

export interface MonthlyStats {
  toolCalls: { total: number; allowed: number; denied: number };
  activeUsers: number;
  activeAgents: number;
  policiesTriggered: number;
  peakHour: { hour: number; dayOfWeek: string } | null;
}

export type FeatureTipsSetting = 'ON' | 'OFF' | 'INHERIT';
export type DismissType = 'NOT_INTERESTED' | 'REMIND_LATER';
