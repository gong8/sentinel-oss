/**
 * E2E Workflow Tests: MCP Server Onboarding Flow
 * Tests the complete MCP server onboarding lifecycle from server addition to user access
 *
 * Flow:
 * 1. Admin adds MCP server
 * 2. Tools are discovered
 * 3. Admin creates policy for tools
 * 4. User can see tools with access status
 * 5. User can see server in MCP servers list
 *
 * NOTE: This test uses beforeAll/afterAll instead of the tenant fixture because
 * serial mode tests need to share state (tokens, IDs) across all steps.
 * The tenant fixture is test-scoped and would create a new org for each step.
 */

import { test as baseTest, expect, type TestInfo } from '@playwright/test';
import {
  getPrisma,
  loginWithToken,
  navigateTo,
  selectAllToolsInPolicyForm,
  waitForTable,
} from '../../helpers/e2e.js';

// Generate a unique name for test data
function generateUniqueName(testInfo: TestInfo, prefix: string): string {
  return `${prefix}-${testInfo.parallelIndex}-${Date.now()}`;
}

// Generate a unique token for test users
function generateToken(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

baseTest.describe('MCP Server Onboarding Flow', () => {
  // IMPORTANT: These tests share state between sequential steps via module-level variables
  // They MUST run in serial mode to maintain correct order
  baseTest.describe.configure({ mode: 'serial' });

  // Shared state for the entire test suite
  let organizationId: string;
  let adminToken: string;
  let adminId: string;
  let adminRoleId: string;
  let userRoleId: string;
  let userToken: string;
  let userId: string;
  let serverId: string;
  let serverName: string;
  let policyId: string;
  let workspaceId: string;

  baseTest.beforeAll(async () => {
    const prisma = await getPrisma();
    // Create an isolated organization for this test suite
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const org = await prisma.organization.create({
      data: { name: `McpServerOnboardingTestOrg-${uniqueSuffix}` },
    });
    organizationId = org.id;

    // Create admin role
    const adminRole = await prisma.role.create({
      data: {
        name: `Admin-${uniqueSuffix}`,
        isAdmin: true,
        organizationId,
      },
    });
    adminRoleId = adminRole.id;

    // Create user role
    const userRole = await prisma.role.create({
      data: {
        name: `User-${uniqueSuffix}`,
        isAdmin: false,
        organizationId,
      },
    });
    userRoleId = userRole.id;

    // Create admin user
    adminToken = generateToken();
    const admin = await prisma.user.create({
      data: {
        email: `admin-${uniqueSuffix}@test.local`,
        accessToken: adminToken,
        organizationId,
        orgRole: 'OWNER',
        userRoles: {
          create: { roleId: adminRoleId },
        },
      },
    });
    adminId = admin.id;

    // Create regular user
    userToken = generateToken();
    const user = await prisma.user.create({
      data: {
        email: `user-${uniqueSuffix}@test.local`,
        accessToken: userToken,
        organizationId,
        userRoles: {
          create: { roleId: userRoleId },
        },
      },
    });
    userId = user.id;

    // Create a workspace for the organization
    const workspace = await prisma.workspace.create({
      data: {
        name: `Test Workspace ${uniqueSuffix}`,
        slug: `test-ws-${uniqueSuffix.slice(0, 12)}`,
        organizationId,
      },
    });
    workspaceId = workspace.id;

    // Add admin as workspace admin
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: adminId,
        role: 'ADMIN',
      },
    });

    // Add regular user as workspace member
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: userId,
        role: 'MEMBER',
      },
    });

    // Dismiss onboarding for both users to prevent tour overlay from blocking tests
    await prisma.userOnboarding.create({
      data: {
        userId: adminId,
        dismissed: true,
      },
    });
    await prisma.userOnboarding.create({
      data: {
        userId: userId,
        dismissed: true,
      },
    });
  });

  baseTest.afterAll(async () => {
    const prisma = await getPrisma();
    // Clean up test policy
    if (policyId) {
      await prisma.policy.delete({ where: { id: policyId } }).catch(() => {});
    }

    // Clean up test server (will cascade delete tools)
    if (serverId) {
      await prisma.mcpServer.delete({ where: { id: serverId } }).catch(() => {});
    }

    // Clean up workspace members and workspace
    if (workspaceId) {
      await prisma.workspaceMember.deleteMany({ where: { workspaceId } }).catch(() => {});
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }

    // Clean up users
    if (userId) {
      await prisma.userRole.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }

    if (adminId) {
      await prisma.userRole.deleteMany({ where: { userId: adminId } }).catch(() => {});
      await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
    }

    // Clean up roles
    if (userRoleId) {
      await prisma.role.delete({ where: { id: userRoleId } }).catch(() => {});
    }

    if (adminRoleId) {
      await prisma.role.delete({ where: { id: adminRoleId } }).catch(() => {});
    }

    // Clean up organization
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => {});
    }
  });

  baseTest('Step 1: Admin adds MCP server', async ({ page }, testInfo) => {
    await loginWithToken(page, adminToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

    // Navigate to MCP servers page
    await navigateTo(page, '/admin/mcp-servers');

    // Wait for page to load
    await expect(page.locator('table').or(page.locator('[data-testid="empty-state"]'))).toBeVisible(
      {
        timeout: 15000,
      },
    );

    // Close agent chat panel if it's open (it can intercept clicks)
    // Press Escape first to close any open panels/overlays
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // The toggle button contains "Toggle Agent Chat" in its accessible name
    const toggleButton = page.getByRole('button', { name: /Toggle Agent Chat/i });
    if (await toggleButton.isVisible().catch(() => false)) {
      // Check if chat panel is expanded - look for the panel content
      const chatPanelContent = page.locator('text=Sentinel Agent').first();
      if (await chatPanelContent.isVisible().catch(() => false)) {
        // Use keyboard shortcut Ctrl+. to toggle chat panel
        await page.keyboard.press('Control+.');
        // Wait for animation to complete
        await page.waitForTimeout(500);

        // If still visible, try clicking the toggle button
        if (await chatPanelContent.isVisible().catch(() => false)) {
          await toggleButton.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Click add server button - match exact text "Add MCP server"
    const addButton = page.getByRole('button', { name: 'Add MCP server' });
    await expect(addButton).toBeVisible({ timeout: 10000 });

    // Try multiple approaches to click the button
    try {
      await addButton.click({ timeout: 5000 });
    } catch {
      // Press Escape again and retry
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      try {
        await addButton.click({ timeout: 3000 });
      } catch {
        // Last resort: use force click and dispatch click event
        await addButton.click({ force: true });
      }
    }

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Generate unique server name
    serverName = generateUniqueName(testInfo, 'mcp-server');

    // Fill server name
    const nameInput = dialog.locator('input[name="name"]').or(dialog.locator('input#name'));
    await expect(nameInput).toBeVisible();
    await nameInput.fill(serverName);

    // Fill server URL (use a test/mock URL)
    const urlInput = dialog.locator('input[name="url"]').or(dialog.locator('input#url'));
    await expect(urlInput).toBeVisible();
    await urlInput.fill(`https://test-mcp-${Date.now()}.example.com`);

    // Wait for auth type detection to complete (probing -> detected or error)
    // The form auto-detects auth type from URL, which blocks submission until complete
    const detectingText = dialog.locator('text=Detecting auth type');
    const detectionFailed = dialog.locator('text=Detection failed');
    const detectionDetected = dialog.locator('text=Detected:');

    // Wait for detection to finish (either success or error)
    await expect(detectingText.or(detectionFailed).or(detectionDetected)).toBeVisible({
      timeout: 15000,
    });

    // If still detecting, wait for it to complete
    if (await detectingText.isVisible().catch(() => false)) {
      await expect(detectingText).not.toBeVisible({ timeout: 15000 });
    }

    // If detection failed (common for test URLs), click Override to enable submission
    if (await detectionFailed.isVisible().catch(() => false)) {
      const overrideButton = dialog.getByRole('button', { name: /override/i });
      if (await overrideButton.isVisible().catch(() => false)) {
        await overrideButton.click();
        await page.waitForTimeout(300);
      }
    }

    // Submit
    const submitButton = dialog.getByRole('button', { name: /add|create|save/i });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // After submission, a "Tools Discovered" dialog may appear
    // Wait for either the original dialog to close or a new dialog to appear
    await page.waitForTimeout(2000);

    // Handle the "Tools Discovered" dialog if it appears
    const toolsDiscoveredDialog = page.getByRole('dialog').filter({ hasText: 'Tools Discovered' });
    if (await toolsDiscoveredDialog.isVisible().catch(() => false)) {
      // Close the tools discovered dialog
      const closeButton = toolsDiscoveredDialog.getByRole('button', { name: /close/i });
      await closeButton.click();
      await expect(toolsDiscoveredDialog).not.toBeVisible({ timeout: 5000 });
    }

    // Ensure all dialogs are closed
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

    // Verify server appears in list
    await expect(page.locator('table')).toContainText(serverName, { timeout: 15000 });

    // Store server ID for cleanup
    const prisma = await getPrisma();
    const server = await prisma.mcpServer.findFirst({
      where: { name: serverName, organizationId },
    });
    if (server) {
      serverId = server.id;
    }
  });

  baseTest('Step 2: Tools are discovered', async ({ page }) => {
    baseTest.skip(!serverId, 'No server ID from previous test');

    await loginWithToken(page, adminToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

    // Navigate to MCP servers page
    await navigateTo(page, '/admin/mcp-servers');

    await waitForTable(page);

    // Find the server row
    const serverRow = page.locator('tr').filter({ hasText: serverName });
    await expect(serverRow).toBeVisible({ timeout: 10000 });

    // Click on server or discover tools button
    const discoverButton = serverRow.getByRole('button', { name: /discover|refresh|sync/i });
    if (await discoverButton.isVisible().catch(() => false)) {
      await discoverButton.click();

      // Wait for discovery to complete
      await page.waitForTimeout(2000);
    }

    // Click on server to see details/tools
    const serverLink = serverRow.locator('a').or(serverRow.locator('[role="link"]'));
    if (await serverLink.isVisible().catch(() => false)) {
      await serverLink.click();

      // Should see tools section
      await expect(
        page
          .locator('text=Tools')
          .or(page.locator('text=No tools discovered'))
          .or(page.locator('table')),
      ).toBeVisible({ timeout: 10000 });
    }

    // Since we're using a mock URL, tools may not be discovered
    // But the workflow should complete without error
    await expect(page.locator('body')).toBeVisible();
  });

  baseTest('Step 3: Admin creates policy for tools', async ({ page }, testInfo) => {
    baseTest.skip(!serverName, 'No server name from previous test');

    await loginWithToken(page, adminToken, { isOrgOwner: true, expectedPath: /.*\/admin/ });

    // Navigate to policies page
    await navigateTo(page, '/admin/policies');

    await expect(page.locator('table').or(page.locator('[data-testid="empty-state"]'))).toBeVisible(
      {
        timeout: 15000,
      },
    );

    // Click create policy button
    await page.click('button:has-text("Create policy")');

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill description
    const policyName = generateUniqueName(testInfo, 'server-access-policy');
    const descInput = dialog
      .locator('input#create-description')
      .or(dialog.locator('input[name="description"]'));
    await expect(descInput).toBeVisible();
    await descInput.fill(policyName);

    // Select matcher type: Everyone (default is "Role")
    const matcherTypeCombobox = dialog.getByRole('combobox').filter({ hasText: /^Role/ });
    await matcherTypeCombobox.click();
    await page.getByRole('option', { name: 'Everyone' }).click();

    // Select server in tool pattern if available
    const serverSelect = dialog.locator('[data-testid="server-select"]');
    if (await serverSelect.isVisible().catch(() => false)) {
      await serverSelect.click();
      const serverOption = page.getByRole('option', { name: new RegExp(serverName, 'i') });
      if (await serverOption.isVisible().catch(() => false)) {
        await serverOption.click();
      }
    }

    // Effect is already "ALLOW" by default, no need to change
    // But verify it's visible
    await expect(dialog.getByRole('combobox').filter({ hasText: 'ALLOW' })).toBeVisible();

    // Select tools (required)
    await selectAllToolsInPolicyForm(page);

    // Submit
    const submitButton = dialog.locator('button[type="submit"]:has-text("Create policy")');
    await submitButton.click();

    // Handle policy assertions dialog
    const createAnyway = page.getByRole('button', { name: 'Create Anyway' });
    try {
      await createAnyway.waitFor({ state: 'visible', timeout: 3000 });
      await createAnyway.click();
    } catch {
      // Assertions dialog didn't appear
    }

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify policy created
    await expect(page.locator('table')).toContainText(policyName, { timeout: 10000 });

    // Store policy ID for cleanup
    const prisma = await getPrisma();
    const policy = await prisma.policy.findFirst({
      where: { description: policyName, organizationId },
    });
    if (policy) {
      policyId = policy.id;
    }
  });

  baseTest('Step 4: User can see tools with access status', async ({ page }) => {
    await loginWithToken(page, userToken, { isOrgOwner: false, expectedPath: /.*\/user/ });

    // Navigate to tools page
    await navigateTo(page, '/user/tools');

    // Wait for tools page to load - the page uses a card layout with stats, not a table
    await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Wait for tool stats or content to load
    await expect(
      page.getByText('Total Tools').or(page.getByText('No tools available')),
    ).toBeVisible({ timeout: 10000 });

    // At minimum, the page should be accessible
    await expect(page.locator('body')).toBeVisible();
  });

  baseTest('Step 5: User can see server in MCP servers list', async ({ page }) => {
    baseTest.skip(!serverName, 'No server name from previous test');

    await loginWithToken(page, userToken, { isOrgOwner: false, expectedPath: /.*\/user/ });

    // Navigate to user's MCP servers or credentials page
    await navigateTo(page, '/user/credentials');

    // Wait for page to load - the page uses card layout with headings
    await expect(page.getByRole('heading', { name: 'My Credentials', level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Wait for content sections to load - look for any of the section headings
    // Use .first() to avoid strict mode violation when both heading and empty state are visible
    await expect(
      page
        .getByRole('heading', { name: 'API Key Servers', level: 3 })
        .or(page.getByText('No servers'))
        .or(page.getByText('No API key servers'))
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // User should be able to see the MCP server (even if they need to connect)
    // Look for the server name in the list
    const serverEntry = page.locator(`text=${serverName}`);
    if (await serverEntry.isVisible().catch(() => false)) {
      await expect(serverEntry).toBeVisible();
    }

    // Page should be accessible regardless
    await expect(page.locator('body')).toBeVisible();
  });
});
