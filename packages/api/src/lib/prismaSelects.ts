/**
 * Prisma Select Patterns
 *
 * Commonly used select patterns for consistent user data fetching across services.
 */

// User select patterns
export const USER_SELECT = {
  id: true,
  email: true,
} as const;

export const USER_WITH_NAME_SELECT = {
  id: true,
  email: true,
  name: true,
} as const;

// For admin user references
export const ADMIN_USER_SELECT = {
  id: true,
  email: true,
} as const;
