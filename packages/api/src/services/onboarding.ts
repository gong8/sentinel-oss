/**
 * Onboarding Service
 * Handles user onboarding state and tour definitions
 */

import { prisma } from '@sentinel/db';

// ============================================================================
// TOUR DEFINITIONS
// ============================================================================

export type TourId = 'admin' | 'user' | 'org-owner';

export interface TourStepTrigger {
  type: 'manual' | 'mutation' | 'navigation';
  /** For mutation triggers: the tRPC mutation path e.g. "admin.mcpServers.create" */
  mutationPath?: string;
  /** For navigation triggers: path pattern e.g. "/admin/:slug/audit" */
  navigationPattern?: string;
}

export interface TourStep {
  id: string;
  title: string;
  description: string;
  trigger: TourStepTrigger;
  /** Optional highlight element ID for UI highlighting */
  highlightElement?: string;
}

export interface TourDefinition {
  id: TourId;
  name: string;
  description: string;
  steps: TourStep[];
}

/**
 * Admin Tour - For workspace administrators
 * Covers MCP servers, policies, and audit logs
 */
export const ADMIN_TOUR: TourDefinition = {
  id: 'admin',
  name: 'Admin Tour',
  description: 'Learn to manage MCP servers, policies, and monitor activity',
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to Sentinel',
      description:
        "You have admin access to this workspace. Let's learn how to configure MCP servers, create policies, and monitor activity.",
      trigger: { type: 'manual' },
    },
    {
      id: 'add-server',
      title: 'Add an MCP Server',
      description:
        'MCP servers provide tools your AI agents can use. Add your first server to get started.',
      trigger: { type: 'mutation', mutationPath: 'admin.mcpServers.create' },
      highlightElement: 'add-mcp-server-button',
    },
    {
      id: 'create-policy',
      title: 'Create a Policy',
      description:
        'Policies control who can use which tools. Create a policy to allow or deny access.',
      trigger: { type: 'mutation', mutationPath: 'admin.policies.create' },
      highlightElement: 'add-policy-button',
    },
    {
      id: 'view-audit',
      title: 'View Audit Logs',
      description:
        'Monitor all tool invocations in the audit log. See what tools are being used and by whom.',
      trigger: { type: 'navigation', navigationPattern: '/admin/:slug/audit' },
      highlightElement: 'nav-audit-logs',
    },
    {
      id: 'complete',
      title: "You're Ready!",
      description:
        'Great work! You now know the basics of managing Sentinel. Explore more features or restart this tutorial anytime in Settings.',
      trigger: { type: 'manual' },
    },
  ],
};

/**
 * User Tour - For regular workspace members
 * Covers using the Sentinel Agent chatbot and tools
 */
export const USER_TOUR: TourDefinition = {
  id: 'user',
  name: 'User Tour',
  description: 'Learn to use Sentinel Agent and access available tools',
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to Sentinel',
      description:
        "Sentinel gives you AI-powered access to tools your organization has approved. Let's get you started!",
      trigger: { type: 'manual' },
    },
    {
      id: 'open-agent',
      title: 'Meet Sentinel Agent',
      description:
        'Sentinel Agent is your AI assistant. Open it to chat and use tools through natural language.',
      trigger: { type: 'navigation', navigationPattern: '/agent/:slug' },
      highlightElement: 'nav-agent',
    },
    {
      id: 'configure-llm',
      title: 'Set Up Your AI',
      description:
        'Configure your preferred AI model. Add your API key to enable the Sentinel Agent.',
      trigger: { type: 'mutation', mutationPath: 'user.llmConfig.set' },
      highlightElement: 'agent-settings-button',
    },
    {
      id: 'view-tools',
      title: 'Explore Available Tools',
      description:
        'See all the tools available to you. Your admin has configured these for your workspace.',
      trigger: { type: 'navigation', navigationPattern: '/user/:slug/tools' },
      highlightElement: 'nav-tools',
    },
    {
      id: 'complete',
      title: "You're Ready!",
      description:
        'Awesome! You can now chat with Sentinel Agent and use approved tools. If you need help, ask your admin.',
      trigger: { type: 'manual' },
    },
  ],
};

/**
 * Org Owner Tour - For organization owners
 * Covers creating workspaces and all admin features
 */
export const ORG_OWNER_TOUR: TourDefinition = {
  id: 'org-owner',
  name: 'Organization Owner Tour',
  description: 'Learn to set up your organization, create workspaces, and manage access',
  steps: [
    {
      id: 'welcome',
      title: 'Welcome, Organization Owner',
      description:
        'As an owner, you can create workspaces, manage global policies, and control access across your organization.',
      trigger: { type: 'manual' },
    },
    {
      id: 'create-workspace',
      title: 'Create a Workspace',
      description:
        'Workspaces let you organize teams and resources. Create your first workspace to get started.',
      trigger: { type: 'mutation', mutationPath: 'admin.workspaces.create' },
      highlightElement: 'add-workspace-button',
    },
    {
      id: 'add-server',
      title: 'Add an MCP Server',
      description:
        'MCP servers provide tools for your organization. Add a server to make tools available.',
      trigger: { type: 'mutation', mutationPath: 'admin.mcpServers.create' },
      highlightElement: 'add-mcp-server-button',
    },
    {
      id: 'create-policy',
      title: 'Set Up Policies',
      description:
        'Policies control access to tools. Create policies to allow or deny access for users and roles.',
      trigger: { type: 'mutation', mutationPath: 'admin.policies.create' },
      highlightElement: 'add-policy-button',
    },
    {
      id: 'invite-user',
      title: 'Invite Team Members',
      description: 'Add users to your organization so they can access workspaces and tools.',
      trigger: { type: 'mutation', mutationPath: 'admin.users.create' },
      highlightElement: 'add-user-button',
    },
    {
      id: 'complete',
      title: 'Your Organization is Ready!',
      description:
        'Excellent! Your organization is set up. You can manage everything from the global admin view or restart this tutorial in Settings.',
      trigger: { type: 'manual' },
    },
  ],
};

/** All available tours */
export const TOURS: Record<TourId, TourDefinition> = {
  admin: ADMIN_TOUR,
  user: USER_TOUR,
  'org-owner': ORG_OWNER_TOUR,
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

export interface OnboardingState {
  currentTourId: TourId | null;
  currentStep: number;
  completedTours: TourId[];
  completedSteps: string[];
  dismissed: boolean;
  showAdvanced: boolean;
}

/**
 * Get or create onboarding state for a user
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  let onboarding = await prisma.userOnboarding.findUnique({
    where: { userId },
  });

  if (!onboarding) {
    onboarding = await prisma.userOnboarding.create({
      data: { userId },
    });
  }

  return {
    currentTourId: onboarding.currentTourId as TourId | null,
    currentStep: onboarding.currentStep,
    completedTours: onboarding.completedTours as TourId[],
    completedSteps: onboarding.completedSteps,
    dismissed: onboarding.dismissed,
    showAdvanced: onboarding.showAdvanced,
  };
}

/**
 * Start a tour for a user
 */
export async function startTour(userId: string, tourId: TourId): Promise<OnboardingState> {
  const tour = TOURS[tourId];
  if (!tour) {
    throw new Error(`Tour not found: ${tourId}`);
  }

  const onboarding = await prisma.userOnboarding.upsert({
    where: { userId },
    create: {
      userId,
      currentTourId: tourId,
      currentStep: 0,
      dismissed: false,
    },
    update: {
      currentTourId: tourId,
      currentStep: 0,
      dismissed: false,
    },
  });

  return {
    currentTourId: onboarding.currentTourId as TourId | null,
    currentStep: onboarding.currentStep,
    completedTours: onboarding.completedTours as TourId[],
    completedSteps: onboarding.completedSteps,
    dismissed: onboarding.dismissed,
    showAdvanced: onboarding.showAdvanced,
  };
}

/**
 * Advance to the next step in the current tour
 */
export async function advanceStep(userId: string): Promise<OnboardingState> {
  const state = await getOnboardingState(userId);

  if (!state.currentTourId) {
    return state;
  }

  const tour = TOURS[state.currentTourId];
  const currentStepDef = tour.steps[state.currentStep];

  if (!currentStepDef) {
    return state;
  }

  // Mark current step as completed
  const stepKey = `${state.currentTourId}:${currentStepDef.id}`;
  const newCompletedSteps = state.completedSteps.includes(stepKey)
    ? state.completedSteps
    : [...state.completedSteps, stepKey];

  const nextStep = state.currentStep + 1;
  const isComplete = nextStep >= tour.steps.length;

  const updateData: {
    currentStep: number;
    completedSteps: string[];
    currentTourId?: string | null;
    completedTours?: string[];
  } = {
    currentStep: isComplete ? 0 : nextStep,
    completedSteps: newCompletedSteps,
  };

  if (isComplete) {
    updateData.currentTourId = null;
    updateData.completedTours = state.completedTours.includes(state.currentTourId)
      ? state.completedTours
      : [...state.completedTours, state.currentTourId];
  }

  const onboarding = await prisma.userOnboarding.update({
    where: { userId },
    data: updateData,
  });

  return {
    currentTourId: onboarding.currentTourId as TourId | null,
    currentStep: onboarding.currentStep,
    completedTours: onboarding.completedTours as TourId[],
    completedSteps: onboarding.completedSteps,
    dismissed: onboarding.dismissed,
    showAdvanced: onboarding.showAdvanced,
  };
}

/**
 * Complete the current tour
 */
export async function completeTour(userId: string): Promise<OnboardingState> {
  const state = await getOnboardingState(userId);

  if (!state.currentTourId) {
    return state;
  }

  const newCompletedTours = state.completedTours.includes(state.currentTourId)
    ? state.completedTours
    : [...state.completedTours, state.currentTourId];

  const onboarding = await prisma.userOnboarding.update({
    where: { userId },
    data: {
      currentTourId: null,
      currentStep: 0,
      completedTours: newCompletedTours,
    },
  });

  return {
    currentTourId: onboarding.currentTourId as TourId | null,
    currentStep: onboarding.currentStep,
    completedTours: onboarding.completedTours as TourId[],
    completedSteps: onboarding.completedSteps,
    dismissed: onboarding.dismissed,
    showAdvanced: onboarding.showAdvanced,
  };
}

/**
 * Dismiss onboarding (user opts out)
 */
export async function dismissOnboarding(userId: string): Promise<OnboardingState> {
  const onboarding = await prisma.userOnboarding.upsert({
    where: { userId },
    create: {
      userId,
      dismissed: true,
    },
    update: {
      dismissed: true,
      currentTourId: null,
      currentStep: 0,
    },
  });

  return {
    currentTourId: onboarding.currentTourId as TourId | null,
    currentStep: onboarding.currentStep,
    completedTours: onboarding.completedTours as TourId[],
    completedSteps: onboarding.completedSteps,
    dismissed: onboarding.dismissed,
    showAdvanced: onboarding.showAdvanced,
  };
}

/**
 * Restart a tour (or start recommended tour if no tourId specified)
 */
export async function restartTour(userId: string, tourId?: TourId): Promise<OnboardingState> {
  const tour = tourId ?? 'user'; // Default to user tour

  const onboarding = await prisma.userOnboarding.upsert({
    where: { userId },
    create: {
      userId,
      currentTourId: tour,
      currentStep: 0,
      dismissed: false,
    },
    update: {
      currentTourId: tour,
      currentStep: 0,
      dismissed: false,
    },
  });

  return {
    currentTourId: onboarding.currentTourId as TourId | null,
    currentStep: onboarding.currentStep,
    completedTours: onboarding.completedTours as TourId[],
    completedSteps: onboarding.completedSteps,
    dismissed: onboarding.dismissed,
    showAdvanced: onboarding.showAdvanced,
  };
}

/**
 * Determine which tour a user should see based on their role
 */
export function getRecommendedTour(isOrgOwner: boolean, isAdmin: boolean): TourId {
  if (isOrgOwner) {
    return 'org-owner';
  }
  if (isAdmin) {
    return 'admin';
  }
  return 'user';
}

/**
 * Get available tours for a user based on their role
 */
export function getAvailableTours(isOrgOwner: boolean, isAdmin: boolean): TourId[] {
  const tours: TourId[] = ['user'];

  if (isAdmin) {
    tours.push('admin');
  }

  if (isOrgOwner) {
    tours.push('org-owner');
  }

  return tours;
}
