import { Callout } from '../../../components/Callout';

export default function UserOnboardingContent() {
  return (
    <>
      <h1 id="onboarding-tours">Onboarding Tours</h1>
      <p className="lead text-xl text-muted-foreground">
        Interactive guided tours to help you learn SENTINEL's features quickly.
      </p>

      <h2 id="overview">What are Onboarding Tours?</h2>
      <p>
        SENTINEL provides interactive onboarding tours that walk you through the key features step
        by step. Tours are tailored to your role, ensuring you learn the features most relevant to
        you.
      </p>

      <Callout type="tip" title="New to SENTINEL?">
        If you just joined, the recommended tour for your role will start automatically. Follow
        along to get up to speed quickly.
      </Callout>

      <h2 id="available-tours">Available Tours</h2>
      <p>Different tours are available based on your role in the organization:</p>

      <h3>User Tour</h3>
      <p>
        <strong>For:</strong> All users
      </p>
      <p>Learn the basics of using SENTINEL:</p>
      <ul>
        <li>Meet the Sentinel Agent chatbot</li>
        <li>Configure your AI model and API key</li>
        <li>Explore available tools in your workspace</li>
      </ul>

      <h3>Admin Tour</h3>
      <p>
        <strong>For:</strong> Workspace administrators
      </p>
      <p>Learn to manage your workspace:</p>
      <ul>
        <li>Add and configure MCP servers</li>
        <li>Create access policies for tools</li>
        <li>Monitor activity through audit logs</li>
      </ul>

      <h3>Organization Owner Tour</h3>
      <p>
        <strong>For:</strong> Organization owners
      </p>
      <p>Learn to set up and manage your entire organization:</p>
      <ul>
        <li>Create workspaces for your teams</li>
        <li>Configure organization-wide MCP servers</li>
        <li>Set up global policies</li>
        <li>Invite and manage team members</li>
      </ul>

      <h2 id="how-tours-work">How Tours Work</h2>

      <h3>Step Types</h3>
      <p>Tours consist of different types of steps:</p>

      <ul>
        <li>
          <strong>Manual steps</strong> - Read the information and click "Next" or "Got it" to
          continue
        </li>
        <li>
          <strong>Action steps</strong> - Complete an action (like creating a server) to
          automatically advance
        </li>
        <li>
          <strong>Navigation steps</strong> - Visit a specific page to automatically advance
        </li>
      </ul>

      <h3>Progress Tracking</h3>
      <p>SENTINEL tracks your progress through each tour:</p>
      <ul>
        <li>Steps you've completed are remembered even if you leave and return</li>
        <li>Completed tours are marked so you know what you've finished</li>
        <li>You can restart any tour at any time</li>
      </ul>

      <h3>Visual Highlights</h3>
      <p>
        During tours, relevant UI elements may be highlighted to help you find them. Look for visual
        indicators pointing to buttons, menus, or sections mentioned in the current step.
      </p>

      <h2 id="starting-a-tour">Starting a Tour</h2>
      <p>Tours can start in several ways:</p>

      <ul>
        <li>
          <strong>Automatically</strong> - When you first log in, your recommended tour starts
        </li>
        <li>
          <strong>From Settings</strong> - Start or restart tours from your account settings
        </li>
        <li>
          <strong>From prompts</strong> - UI prompts may suggest starting a tour for certain
          features
        </li>
      </ul>

      <h2 id="controlling-tours">Controlling Tours</h2>

      <h3>Advancing Steps</h3>
      <p>Depending on the step type:</p>
      <ul>
        <li>
          Click <strong>Next</strong> or <strong>Got it</strong> for manual steps
        </li>
        <li>Complete the required action for action steps (e.g., create a policy)</li>
        <li>Navigate to the indicated page for navigation steps</li>
      </ul>

      <h3>Completing a Tour</h3>
      <p>
        When you reach the final step, click <strong>Finish</strong> to mark the tour as complete.
        The tour will be added to your list of completed tours.
      </p>

      <h3>Dismissing Tours</h3>
      <p>
        If you prefer to explore on your own, you can dismiss the onboarding at any time. Click the{' '}
        <strong>Skip</strong> or <strong>Dismiss</strong> button to stop the current tour.
      </p>

      <Callout type="info" title="You can always come back">
        Dismissing a tour doesn't prevent you from restarting it later. You can always restart tours
        from your settings.
      </Callout>

      <h3>Restarting Tours</h3>
      <p>To restart a tour you've dismissed or completed:</p>
      <ol>
        <li>Open your account settings</li>
        <li>Find the Onboarding section</li>
        <li>Select the tour you want to restart</li>
        <li>
          Click <strong>Restart Tour</strong>
        </li>
      </ol>

      <p>
        The tour will start from the beginning, regardless of how far you previously progressed.
      </p>

      <h2 id="tour-features">Tour Features</h2>

      <h3>Recommended Tour</h3>
      <p>
        SENTINEL automatically selects the most relevant tour based on your role. Organization
        owners see the org owner tour, workspace admins see the admin tour, and regular members see
        the user tour.
      </p>

      <h3>Multiple Tours</h3>
      <p>
        If your role grants you access to multiple tours (e.g., you're both a user and an admin),
        you can complete all available tours. This helps you learn all aspects of SENTINEL relevant
        to your responsibilities.
      </p>

      <h3>Auto-Advancing Steps</h3>
      <p>
        Some steps automatically advance when you complete the required action. For example, if the
        step asks you to "Add an MCP Server," the tour will automatically move to the next step once
        you successfully create a server.
      </p>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>Tour not appearing</h3>
      <ul>
        <li>Check if you've previously dismissed onboarding</li>
        <li>Restart the tour from your account settings</li>
        <li>Ensure you have the appropriate role for the tour you want to see</li>
      </ul>

      <h3>Step not advancing</h3>
      <ul>
        <li>For action steps, ensure the action completed successfully</li>
        <li>For navigation steps, make sure you're on the exact page indicated</li>
        <li>
          Try clicking <strong>Next</strong> manually if available
        </li>
      </ul>

      <h3>Tour progress lost</h3>
      <ul>
        <li>Progress is saved automatically - try refreshing the page</li>
        <li>If issues persist, restart the tour from settings</li>
      </ul>

      <Callout type="tip" title="Need more help?">
        If you're stuck on a specific feature, check the detailed documentation in this guide or
        reach out to your administrator.
      </Callout>
    </>
  );
}
