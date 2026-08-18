import { Eye, Shield, UserCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WelcomeContent() {
  return (
    <>
      <h1 id="welcome">Welcome to SENTINEL</h1>
      <p className="lead text-xl text-muted-foreground">
        The Enterprise Control Plane for AI Agents. SENTINEL governs, secures, and audits the
        interactions between your AI workforce and your critical infrastructure.
      </p>

      <h2 id="why-sentinel">Why SENTINEL?</h2>
      <p>
        As AI agents like Claude Code, Cursor, and Windsurf become more capable, they need access to
        more tools—databases, cloud infrastructure, and internal APIs. Giving them direct access is
        a security risk. Blocking them entirely stifles productivity.
      </p>

      <p>
        SENTINEL solves this paradox by introducing a programmable <strong>Governance Layer</strong>
        .
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
        <div className="border p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h3 className="text-lg font-semibold m-0">Prevent Accidents</h3>
          </div>
          <p className="text-sm text-muted-foreground m-0">
            Stop AI from accidentally dropping production tables or deleting critical files with
            granular, context-aware policies.
          </p>
        </div>
        <div className="border p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h3 className="text-lg font-semibold m-0">Complete Visibility</h3>
          </div>
          <p className="text-sm text-muted-foreground m-0">
            See exactly what every agent is doing in real-time. Every tool call, argument, and
            outcome is logged immutably.
          </p>
        </div>
        <div className="border p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h3 className="text-lg font-semibold m-0">Human-in-the-Loop</h3>
          </div>
          <p className="text-sm text-muted-foreground m-0">
            Flag sensitive operations (like "Deploy to Prod") to require human approval via a slick
            dashboard or Slack.
          </p>
        </div>
        <div className="border p-4 rounded-lg bg-card hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h3 className="text-lg font-semibold m-0">Universal Compatibility</h3>
          </div>
          <p className="text-sm text-muted-foreground m-0">
            Built on the Model Context Protocol (MCP), SENTINEL works out-of-the-box with any
            MCP-compliant agent.
          </p>
        </div>
      </div>

      <h2 id="getting-started">Where to Start</h2>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">For Developers</h3>
          <p>
            Connect your favorite IDE to SENTINEL and start coding safely.
            <br />
            <Link to="/docs/getting-started/quick-tour" className="text-primary hover:underline">
              Take the Quick Tour →
            </Link>
          </p>
        </div>

        <div>
          <h3 className="text-lg font-medium">For Platform Engineers</h3>
          <p>
            Deploy SENTINEL and configure your organization's security posture.
            <br />
            <Link to="/docs/setup/deployment" className="text-primary hover:underline">
              Deployment Guide →
            </Link>
          </p>
        </div>

        <div>
          <h3 className="text-lg font-medium">For Security Architects</h3>
          <p>
            Understand how SENTINEL enforces zero-trust principles for AI.
            <br />
            <Link to="/docs/architecture/overview" className="text-primary hover:underline">
              Architecture Deep Dive →
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
