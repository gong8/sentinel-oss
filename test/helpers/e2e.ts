/**
 * E2E Test Helpers
 * Utilities for consistent Playwright e2e testing
 */

import type { Page, Response, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import crypto from 'crypto';

// Dynamic prisma import for ESM compatibility
async function getPrismaClient() {
  const db = await import('@sentinel/db');
  return db.prisma;
}

// ============================================================================
// Encryption Helpers (for test data that needs to match API encryption format)
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || '';
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be set for e2e tests');
  }
  return key;
}

/**
 * Encrypts a string using the same format as the API
 * Use this when creating test data that will be read by the API (e.g., encrypted API keys)
 */
export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(getEncryptionKey(), 'hex');

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (matches API format)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Re-export getPrisma for e2e tests
 */
export async function getPrisma() {
  return getPrismaClient();
}

// ============================================================================
// Authentication Helpers
// ============================================================================

/**
 * Login as an admin user
 * Fetches admin token from database and completes login flow
 * Prefers the seeded admin@acme.com, falls back to oldest admin
 */
export async function loginAsAdmin(page: Page): Promise<{ userId: string; token: string }> {
  const prisma = await getPrismaClient();

  // First try to find the seeded admin (admin@acme.com)
  let admin = await prisma.user.findFirst({
    where: {
      email: 'admin@acme.com',
      userRoles: {
        some: { role: { isAdmin: true } },
      },
      deletedAt: null,
    },
  });

  // Fall back to oldest admin if seeded admin not found
  if (!admin) {
    admin = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: { role: { isAdmin: true } },
        },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!admin) {
    throw new Error('No admin user found in database. Did you run the seed script?');
  }

  console.log(
    `[loginAsAdmin] Found admin: ${admin.email}, token: ${admin.accessToken.slice(0, 10)}...`,
  );

  // Use loginWithToken helper with org owner flag since admin might be org owner
  await loginWithToken(page, admin.accessToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

  return { userId: admin.id, token: admin.accessToken };
}

/**
 * Login as a non-admin user
 * Fetches regular user token from database and completes login flow
 * Prefers the seeded user@acme.com, falls back to oldest non-admin user
 */
export async function loginAsUser(page: Page): Promise<{ userId: string; token: string }> {
  const prisma = await getPrismaClient();

  // First try to find the seeded user (user@acme.com)
  let user = await prisma.user.findFirst({
    where: {
      email: 'user@acme.com',
      userRoles: {
        none: { role: { isAdmin: true } },
      },
      deletedAt: null,
    },
  });

  // Fall back to oldest non-admin user if seeded user not found
  if (!user) {
    user = await prisma.user.findFirst({
      where: {
        userRoles: {
          none: { role: { isAdmin: true } },
        },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!user) {
    throw new Error('No non-admin user found in database. Did you run the seed script?');
  }

  // Use loginWithToken helper - regular users may auto-redirect or need to select workspace
  await loginWithToken(page, user.accessToken, { isOrgOwner: false, expectedPath: /.*\/user/ });

  return { userId: user.id, token: user.accessToken };
}

/**
 * Login with a specific token
 * Use when you need to test with a specific user's token
 *
 * After login, handles workspace selection flow:
 * - Non-org-owners with single workspace: auto-redirect to /admin/{slug} or /user/{slug}
 * - Org-owners: stay on selection, need to click Global View or a workspace
 *
 * @param page - Playwright page
 * @param token - User access token
 * @param options - Login options
 * @param options.isOrgOwner - If true, clicks Global View on workspace selection
 * @param options.expectedPath - Custom regex for expected URL after login (defaults to /admin|user/)
 */
export async function loginWithToken(
  page: Page,
  token: string,
  options: { isOrgOwner?: boolean; expectedPath?: RegExp } = {},
): Promise<void> {
  const { isOrgOwner = false, expectedPath = /.*\/(admin|user)/ } = options;

  await page.goto('/login');
  // Wait for the login input to be visible and interactable
  const tokenInput = page.locator('input#token');
  await expect(tokenInput).toBeVisible({ timeout: 10000 });
  await tokenInput.fill(token);
  await page.click('button[type="submit"]');

  // First wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

  // If we're at workspace selection, handle it
  if (page.url().includes('/select-workspace')) {
    if (isOrgOwner) {
      // Org owners click Global View to go to /global/admin
      const globalViewCard = page.locator('text=Global View').first();
      await globalViewCard.waitFor({ state: 'visible', timeout: 5000 });
      await globalViewCard.click();
    } else {
      // Non-org-owners should auto-redirect if they have exactly one workspace
      // If still on select-workspace after a short wait, click the first workspace
      await page.waitForTimeout(1000); // Wait for potential auto-redirect
      if (page.url().includes('/select-workspace')) {
        // Click on the first workspace card (not Global View)
        const workspaceCard = page
          .locator('[class*="cursor-pointer"]')
          .filter({
            hasNot: page.locator('text=Global View'),
          })
          .first();
        if (await workspaceCard.isVisible()) {
          await workspaceCard.click();
        }
      }
    }
  }

  // Now wait for the expected path
  await page.waitForURL(expectedPath, { timeout: 15000 });
}

/**
 * Logout and clear session
 */
export async function logout(page: Page): Promise<void> {
  // Click logout button (location may vary by layout)
  const logoutButton = page
    .locator('[data-testid="logout-button"]')
    .or(page.locator('button:has-text("Logout")'))
    .or(page.locator('button:has-text("Sign out")'));

  await logoutButton.click();

  await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });
}

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigate to a path within the app.
 *
 * Uses page.goto() for reliable navigation that triggers React Router's route matching.
 * localStorage is preserved during same-origin navigation.
 *
 * @param page - Playwright page
 * @param path - The path to navigate to (e.g., '/admin/agents', '/user/dashboard')
 * @param options - Navigation options
 */
export async function navigateTo(
  page: Page,
  path: string,
  options: { waitForTable?: boolean } = {},
): Promise<void> {
  // Handle workspace-aware routing for admin paths
  // Convert /admin/... paths to the appropriate workspace-aware paths based on current context
  let targetPath = path;
  const currentUrl = page.url();

  // If user is in global admin view (/global/admin/...), convert /admin/... to /global/admin/...
  if (
    currentUrl.includes('/global/admin') &&
    path.startsWith('/admin/') &&
    !path.startsWith('/admin/:')
  ) {
    targetPath = '/global' + path;
  }
  // If user is in a workspace admin view (/admin/{slug}/...), preserve workspace context
  else if (path.startsWith('/admin/') && !path.startsWith('/admin/:')) {
    const workspaceMatch = currentUrl.match(/\/admin\/([^/]+)/);
    if (workspaceMatch && workspaceMatch[1] !== 'admin') {
      const workspaceSlug = workspaceMatch[1];
      // Replace /admin/ with /admin/{workspaceSlug}/
      targetPath = path.replace('/admin/', `/admin/${workspaceSlug}/`);
    } else if (currentUrl.includes('/global/')) {
      // Fallback to global admin if we can't determine workspace
      targetPath = '/global' + path;
    }
  }
  // Similarly handle /user/... paths
  if (path.startsWith('/user/') && !path.startsWith('/user/:')) {
    const userWorkspaceMatch = currentUrl.match(/\/user\/([^/]+)/);
    if (userWorkspaceMatch) {
      const workspaceSlug = userWorkspaceMatch[1];
      targetPath = path.replace('/user/', `/user/${workspaceSlug}/`);
    }
  }

  // Use page.goto() for navigation - this ensures fresh data is fetched from the server.
  // The ProtectedRoute component has been fixed to not clear the token on aborted requests
  // (which can happen when navigating away before token validation completes).
  await page.goto(targetPath);
  await page.waitForLoadState('domcontentloaded');

  // Optionally wait for table to load
  if (options.waitForTable) {
    await waitForTable(page);
  }
}

/**
 * Navigate to an admin page via sidebar
 * Handles sidebar groups and sub-navigation
 */
export async function navigateToAdminPage(page: Page, group: string, link: string): Promise<void> {
  // Expand sidebar group if collapsed
  const groupButton = page.locator(`[data-sidebar-group="${group}"]`);

  const isExpanded = await groupButton.getAttribute('aria-expanded');
  if (isExpanded === 'false') {
    await groupButton.click();
  }

  // Click the link
  await page.locator(`a:has-text("${link}")`).click();

  // Wait for navigation (don't use networkidle as it can hang on background requests)
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Navigate to a user page via sidebar
 */
export async function navigateToUserPage(page: Page, link: string): Promise<void> {
  await page.locator(`a:has-text("${link}")`).click();
  // Wait for navigation (don't use networkidle as it can hang on background requests)
  await page.waitForLoadState('domcontentloaded');
}

// ============================================================================
// Entity Creation Helpers (via UI)
// ============================================================================

/**
 * Create a new user via the admin UI
 * Returns the generated token
 */
export async function createUserViaUI(
  page: Page,
  email: string,
  roleNames: string[],
): Promise<{ userId: string; token: string }> {
  // Navigate to users page
  await page.goto('/admin/users');

  // Click create button
  await page.click('button:has-text("Create User")');

  // Wait for dialog
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });

  // Fill email
  await dialog.locator('input[name="email"]').fill(email);

  // Select roles
  for (const roleName of roleNames) {
    await dialog.locator(`label:has-text("${roleName}")`).click();
  }

  // Submit
  await dialog.locator('button[type="submit"]').click();

  // Wait for token dialog
  await expect(dialog.locator('text=Access Token')).toBeVisible({ timeout: 10000 });

  // Extract token
  const tokenInput = dialog.locator('input[readonly]');
  const token = await tokenInput.inputValue();

  // Close dialog
  await dialog.locator('button:has-text("Close")').click();

  // Get user ID from table
  await waitForTable(page);
  const userRow = page.locator('tr').filter({ hasText: email });
  const userId = (await userRow.getAttribute('data-user-id')) ?? '';

  return { userId, token };
}

/**
 * Create a new policy via the admin UI
 */
export async function createPolicyViaUI(
  page: Page,
  config: {
    matchers: Array<{ type: 'everyone' | 'role' | 'user' | 'agent'; value?: string }>;
    toolPatterns: Array<{ server: string; tool: string }>;
    effect: 'ALLOW' | 'DENY';
    description: string;
  },
): Promise<string> {
  await page.goto('/admin/policies');
  await page.click('button:has-text("Create Policy")');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });

  // Add matchers
  for (const matcher of config.matchers) {
    await dialog.locator('[data-testid="add-matcher"]').click();
    await dialog.locator('[data-testid="matcher-type"]').last().click();
    await page.getByRole('option', { name: matcher.type }).click();

    if (matcher.value) {
      await dialog.locator('[data-testid="matcher-value"]').last().fill(matcher.value);
    }
  }

  // Add tool patterns
  for (const pattern of config.toolPatterns) {
    await dialog.locator('[data-testid="add-tool-pattern"]').click();
    await dialog.locator('[data-testid="server-select"]').last().click();
    await page.getByRole('option', { name: pattern.server }).click();
    await dialog.locator('[data-testid="tool-select"]').last().click();
    await page.getByRole('option', { name: pattern.tool }).click();
  }

  // Set effect
  await dialog.locator('[data-testid="effect-select"]').click();
  await page.getByRole('option', { name: config.effect }).click();

  // Set description
  await dialog.locator('input[name="description"]').fill(config.description);

  // Submit
  await dialog.locator('button[type="submit"]').click();

  // Wait for success
  await expect(page.locator(`text=${config.description}`)).toBeVisible({ timeout: 10000 });

  // Extract policy ID
  const policyRow = page.locator('tr').filter({ hasText: config.description });
  return (await policyRow.getAttribute('data-policy-id')) ?? '';
}

/**
 * Handle the endpoint validation override when creating MCP servers.
 * When using fake URLs in tests, endpoint validation will fail and we need to click Override.
 */
export async function handleEndpointValidationOverride(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');

  // Wait for endpoint validation to complete
  await page.waitForTimeout(2000);

  // Click Override if endpoint validation fails (expected for fake URLs)
  const overrideButton = dialog.getByRole('button', { name: 'Override' });
  if ((await overrideButton.count()) > 0) {
    await overrideButton.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Create a new MCP server via the admin UI
 */
export async function createMcpServerViaUI(
  page: Page,
  config: {
    name: string;
    url: string;
    authType: 'NONE' | 'API_KEY' | 'OAUTH';
    apiKey?: string;
  },
): Promise<string> {
  await page.goto('/admin/mcp-servers');
  await page.click('button:has-text("Add Server")');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });

  // Fill name
  await dialog.locator('input[name="name"]').fill(config.name);

  // Fill URL
  await dialog.locator('input[name="url"]').fill(config.url);

  // Select auth type
  await dialog.locator('[data-testid="auth-type"]').click();
  await page.getByRole('option', { name: config.authType }).click();

  // Add API key if needed
  if (config.authType === 'API_KEY' && config.apiKey) {
    await dialog.locator('input[name="apiKey"]').fill(config.apiKey);
  }

  // Handle endpoint validation override (for fake URLs in tests)
  await handleEndpointValidationOverride(page);

  // Submit
  await dialog.locator('button[type="submit"]').click();

  // Wait for success
  await expect(page.locator(`text=${config.name}`)).toBeVisible({ timeout: 10000 });

  // Extract server ID
  const serverRow = page.locator('tr').filter({ hasText: config.name });
  return (await serverRow.getAttribute('data-server-id')) ?? '';
}

// ============================================================================
// Common UI Interaction Helpers
// ============================================================================

/**
 * Wait for a data table to finish loading
 * Waits for skeleton to disappear, then for either table or empty state
 */
export async function waitForTable(page: Page): Promise<void> {
  // Wait for loading skeleton to disappear
  const skeleton = page.locator('[data-testid="table-skeleton"]');
  const hasSkeletons = (await skeleton.count()) > 0;

  if (hasSkeletons) {
    await expect(skeleton).not.toBeVisible({ timeout: 15000 });
  }

  // Wait for table to be visible OR empty state component
  await expect(page.locator('table').or(page.locator('[data-testid="empty-state"]'))).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Select "All Servers" in the policy form tool selector
 * Opens the tool selector modal, selects "All Servers", and clicks Done
 */
export async function selectAllToolsInPolicyForm(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');

  // Click on the tool selector area to open the modal
  // It shows "No tools selected (click to select tools)" when empty
  const toolSelector = dialog
    .locator('text=No tools selected')
    .or(dialog.locator('text=All Servers'));
  await toolSelector.click();

  // Wait for the tool selector modal to appear (it's a nested dialog)
  const toolModal = page.getByRole('dialog').filter({ hasText: 'Select Tools' });
  await expect(toolModal).toBeVisible({ timeout: 5000 });

  // Click "All Servers" checkbox
  const allServersRow = toolModal.locator('text=All Servers').first();
  await allServersRow.click();

  // Click Done button
  await toolModal.getByRole('button', { name: 'Done' }).click();

  // Wait for the tool modal to close
  await expect(toolModal).not.toBeVisible({ timeout: 5000 });
}

/**
 * Confirm an action in a confirmation dialog
 */
export async function confirmAction(page: Page, buttonText: string = 'Confirm'): Promise<void> {
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(dialog).toBeVisible({ timeout: 5000 });

  await dialog.locator(`button:has-text("${buttonText}")`).click();

  await expect(dialog).not.toBeVisible({ timeout: 5000 });
}

/**
 * Wait for a toast notification with specific message
 */
export async function waitForToast(
  page: Page,
  message: string,
  type: 'success' | 'error' | 'any' = 'any',
): Promise<void> {
  const toastSelector =
    type === 'any'
      ? `[role="status"]:has-text("${message}")`
      : `[role="status"][data-type="${type}"]:has-text("${message}")`;

  await expect(page.locator(toastSelector)).toBeVisible({ timeout: 10000 });
}

/**
 * Fill a form with the given values
 */
export async function fillForm(
  page: Page,
  values: Record<string, string | boolean>,
): Promise<void> {
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator(`[name="${name}"]`);

    if (typeof value === 'boolean') {
      // Checkbox
      if (value) {
        await field.check();
      } else {
        await field.uncheck();
      }
    } else {
      // Text input
      await field.fill(value);
    }
  }
}

/**
 * Select an option from a combobox/dropdown
 */
export async function selectOption(
  page: Page,
  selector: string,
  optionText: string,
): Promise<void> {
  await page.locator(selector).click();
  await page.getByRole('option', { name: optionText }).click();
}

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Get a test user from the database
 */
export async function getTestUser(
  type: 'admin' | 'user' = 'user',
): Promise<{ id: string; email: string; token: string }> {
  const prisma = await getPrismaClient();

  const user = await prisma.user.findFirst({
    where: {
      userRoles:
        type === 'admin'
          ? { some: { role: { isAdmin: true } } }
          : { none: { role: { isAdmin: true } } },
      deletedAt: null,
    },
  });

  if (!user) {
    throw new Error(`No ${type} user found`);
  }

  return {
    id: user.id,
    email: user.email,
    token: user.accessToken,
  };
}

/**
 * Generate a unique name for test data
 * Uses parallel index and timestamp to avoid conflicts
 */
export function generateUniqueName(testInfo: TestInfo, prefix: string): string {
  return `${prefix}-${testInfo.parallelIndex}-${Date.now()}`;
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert tool access status in tools list
 */
export async function expectAccessStatus(
  page: Page,
  toolName: string,
  status: 'ALLOWED' | 'DENIED',
): Promise<void> {
  const toolRow = page.locator('tr').filter({ hasText: toolName });
  await expect(toolRow.locator(`text=${status}`)).toBeVisible();
}

/**
 * Assert audit log entry exists
 */
export async function expectAuditEntry(
  page: Page,
  toolName: string,
  decision: 'ALLOWED' | 'DENIED',
): Promise<void> {
  await page.goto('/admin/audit');

  const entryRow = page.locator('tr').filter({ hasText: toolName });
  await expect(entryRow.locator(`text=${decision}`)).toBeVisible();
}

// ============================================================================
// Wait Helpers
// ============================================================================

/**
 * Wait for a tRPC API response
 */
export async function waitForApiResponse(page: Page, procedureName: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.url().includes('/trpc/') &&
      response.url().includes(procedureName) &&
      response.status() === 200,
  );
}

/**
 * Wait for table to refresh after an action
 */
export async function waitForTableRefresh(page: Page, action: () => Promise<void>): Promise<void> {
  // Start watching for network request
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/trpc/') && response.status() === 200,
  );

  // Perform action
  await action();

  // Wait for response
  await responsePromise;

  // Small delay for React to update
  await page.waitForTimeout(100);
}

// ============================================================================
// Security Testing Helpers
// ============================================================================

/**
 * Verify access is denied to a URL
 */
export async function verifyAccessDenied(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // Should redirect to /user or show error
  await expect(page).not.toHaveURL(url);
}

/**
 * Verify API returns unauthorized
 */
export async function verifyApiUnauthorized(page: Page, endpoint: string): Promise<void> {
  const response = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return { status: res.status };
  }, endpoint);

  expect(response.status).toBe(401);
}

/**
 * Get users from different organizations for isolation testing
 */
export async function getUsersFromDifferentOrgs(): Promise<{
  org1User: { id: string; token: string; orgId: string };
  org2User: { id: string; token: string; orgId: string } | null;
}> {
  const prisma = await getPrismaClient();

  // Get first organization and a user from it
  const org1User = await prisma.user.findFirst({
    where: { deletedAt: null },
    include: { organization: true },
  });

  if (!org1User) {
    throw new Error('No user found in database');
  }

  // Try to find a user from a different organization
  const org2User = await prisma.user.findFirst({
    where: {
      organizationId: { not: org1User.organizationId },
      deletedAt: null,
    },
    include: { organization: true },
  });

  return {
    org1User: {
      id: org1User.id,
      token: org1User.accessToken,
      orgId: org1User.organizationId,
    },
    org2User: org2User
      ? {
          id: org2User.id,
          token: org2User.accessToken,
          orgId: org2User.organizationId,
        }
      : null,
  };
}

/**
 * Dismiss any onboarding tour dialogs that may appear (e.g., "Organization Owner Tour").
 * These tours can block other interactions and cause strict mode violations.
 */
export async function dismissOnboardingTour(page: Page): Promise<void> {
  // Check for tour dialogs and close them
  const tourDialog = page.getByRole('dialog').filter({ hasText: /Tour|Welcome/ });
  if (await tourDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    // Try to close via close button (X button)
    const closeButton = tourDialog.getByRole('button').filter({ hasText: '' }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(300);
    } else {
      // Try pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
}

/**
 * Close the tool discovery dialog that appears after creating an MCP server.
 * The dialog shows tool discovery results and has a "Close" button.
 * Handles the case where other dialogs (like onboarding tours) may also be present.
 */
export async function closeToolDiscoveryDialog(page: Page): Promise<void> {
  // First dismiss any onboarding tours that might be blocking
  await dismissOnboardingTour(page);

  // Find the specific Tools Discovered dialog
  const toolsDialog = page.getByRole('dialog').filter({ hasText: 'Tools Discovered' });

  // Wait for the discovery dialog to complete (shows "Close" button when done)
  const closeButton = toolsDialog.getByRole('button', { name: 'Close' });
  await expect(closeButton).toBeVisible({ timeout: 15000 });
  await closeButton.click();

  // Wait for the Tools Discovered dialog specifically to close
  await expect(toolsDialog).not.toBeVisible({ timeout: 5000 });

  // Also dismiss any remaining tours
  await dismissOnboardingTour(page);
}
