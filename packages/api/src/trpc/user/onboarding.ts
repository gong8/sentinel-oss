/**
 * User Onboarding Router
 * Handles user onboarding state and tour progress
 */

import { z } from 'zod';
import {
  advanceStep,
  completeTour,
  dismissOnboarding,
  getAvailableTours,
  getOnboardingState,
  getRecommendedTour,
  restartTour,
  startTour,
  TOURS,
} from '../../services/onboarding.js';
import { protectedProcedure, router } from '../init.js';

const TourIdSchema = z.enum(['admin', 'user', 'org-owner']);

export const userOnboardingRouter = router({
  /**
   * Get current onboarding state with tour definitions
   */
  getState: protectedProcedure.query(async ({ ctx }) => {
    const state = await getOnboardingState(ctx.auth.user.id);
    const isAdmin = ctx.auth.isAdmin;
    const isOrgOwner = ctx.auth.isOrgOwner;

    const recommendedTour = getRecommendedTour(isOrgOwner, isAdmin);
    const availableTours = getAvailableTours(isOrgOwner, isAdmin);

    // Get current tour definition if active
    const currentTour = state.currentTourId ? TOURS[state.currentTourId] : null;
    const currentStepDef = currentTour?.steps[state.currentStep] ?? null;

    return {
      ...state,
      recommendedTour,
      availableTours,
      currentTour,
      currentStepDef,
      tours: TOURS,
    };
  }),

  /**
   * Start a specific tour
   */
  startTour: protectedProcedure
    .input(z.object({ tourId: TourIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const availableTours = getAvailableTours(ctx.auth.isOrgOwner, ctx.auth.isAdmin);

      if (!availableTours.includes(input.tourId)) {
        throw new Error(`Tour not available: ${input.tourId}`);
      }

      return startTour(ctx.auth.user.id, input.tourId);
    }),

  /**
   * Advance to the next step in the current tour
   * Call this when user completes a manual step or when auto-trigger fires
   */
  advanceStep: protectedProcedure.mutation(async ({ ctx }) => {
    return advanceStep(ctx.auth.user.id);
  }),

  /**
   * Complete the current tour
   */
  completeTour: protectedProcedure.mutation(async ({ ctx }) => {
    return completeTour(ctx.auth.user.id);
  }),

  /**
   * Dismiss onboarding (user opts out)
   */
  dismiss: protectedProcedure.mutation(async ({ ctx }) => {
    return dismissOnboarding(ctx.auth.user.id);
  }),

  /**
   * Restart a tour (or start recommended tour if no tourId specified)
   */
  restart: protectedProcedure
    .input(z.object({ tourId: TourIdSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const availableTours = getAvailableTours(ctx.auth.isOrgOwner, ctx.auth.isAdmin);
      const tourToStart = input.tourId ?? getRecommendedTour(ctx.auth.isOrgOwner, ctx.auth.isAdmin);

      if (!availableTours.includes(tourToStart)) {
        throw new Error(`Tour not available: ${tourToStart}`);
      }

      return restartTour(ctx.auth.user.id, tourToStart);
    }),

  /**
   * Trigger step completion for auto-complete triggers
   * Called by frontend when a trigger condition is met (navigation or mutation success)
   */
  triggerStepCompletion: protectedProcedure
    .input(
      z.object({
        triggerType: z.enum(['mutation', 'navigation']),
        triggerValue: z.string(), // mutation path or navigation pattern
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const state = await getOnboardingState(ctx.auth.user.id);

      if (!state.currentTourId) {
        return state;
      }

      const tour = TOURS[state.currentTourId];
      const currentStepDef = tour.steps[state.currentStep];

      if (!currentStepDef) {
        return state;
      }

      // Check if the trigger matches the current step
      const trigger = currentStepDef.trigger;

      if (trigger.type !== input.triggerType) {
        return state;
      }

      // For mutations, check if the path matches
      if (trigger.type === 'mutation' && trigger.mutationPath === input.triggerValue) {
        return advanceStep(ctx.auth.user.id);
      }

      // For navigation, check if the pattern matches
      if (trigger.type === 'navigation') {
        // Simple pattern matching - replace :slug with actual value for comparison
        const patternRegex = trigger.navigationPattern
          ?.replace(/:slug/g, '[^/]+')
          .replace(/\//g, '\\/');
        if (patternRegex && new RegExp(`^${patternRegex}$`).test(input.triggerValue)) {
          return advanceStep(ctx.auth.user.id);
        }
      }

      return state;
    }),
});
