import { Callout } from '../../../components/Callout';

export default function ArchitectureOverviewContent() {
  return (
    <>
      <h1 id="architecture-overview">Architecture Overview</h1>
      <p className="lead text-xl text-muted-foreground">
        SENTINEL is designed as a secure control plane for AI agents, acting as a governance layer
        between AI clients and their tools.
      </p>

      <h2 id="high-level-design">High Level Design</h2>
      <p>
        The system follows a <strong>Hub-and-Spoke</strong> architecture where the core API acts as
        the central authority for policy enforcement, authentication, and audit logging. Specialized
        proxies (MCP, A2A) handle protocol-specific traffic and delegate decisions to this core.
      </p>

      <div className="my-8 border rounded-lg p-4 bg-muted/50 font-mono text-sm whitespace-pre overflow-x-auto">
        {`
+----------------+      +------------------+      +----------------+
|                |      |                  |      |                |
|   AI Clients   | ---> |    MCP Proxy     | ---> |  Tool Servers  |
| (Claude, etc.) |      | (packages/mcp)   |      | (GitHub, etc.) |
|                |      |                  |      |                |
+----------------+      +--------+---------+      +----------------+
                                 |
                                 | Policy Check
                                 v
                        +------------------+
                        |                  |
                        |   Core API Hub   | <---  Admin Dashboard
                        |  (packages/api)  |      (packages/web)
                        |                  |
                        +--------+---------+
                                 ^
                                 | Policy Check
                                 |
+----------------+      +--------+---------+      +----------------+
|                |      |                  |      |                |
|  Agent Client  | ---> |    A2A Proxy     | ---> | Remote Agents  |
|                |      | (packages/a2a)   |      |                |
+----------------+      +------------------+      +----------------+
                                 |
                        +--------+---------+
                        |                  |
                        |     Database     |
                        | (PostgreSQL/DB)  |
                        |                  |
                        +------------------+
`}
      </div>

      <h2 id="core-components">Core Components</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mt-0">Core API (packages/api)</h3>
          <p className="text-sm text-muted-foreground mt-2">
            The brain of the operation. It hosts the Policy Engine, Identity Management, and Audit
            Services. It exposes a tRPC API used by the frontend and internal proxies.
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mt-0">MCP Proxy (packages/mcp)</h3>
          <p className="text-sm text-muted-foreground mt-2">
            A specialized server that implements the Model Context Protocol. It intercepts every
            tool call from an AI agent, asks the Core API "Can this happen?", and only forwards the
            request if allowed.
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mt-0">A2A Proxy (packages/a2a)</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Implements the Agent-to-Agent (A2A) protocol for secure inter-agent communication. It
            enables agents to delegate tasks to other agents while enforcing the same policy checks
            through the Core API.
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mt-0">Admin UI (packages/web)</h3>
          <p className="text-sm text-muted-foreground mt-2">
            A React-based control panel. Admins use it to configure policies, view audit logs, and
            manage users. It communicates securely with the Core API.
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mt-0">Policy Engine</h3>
          <p className="text-sm text-muted-foreground mt-2">
            A deterministic logic engine that evaluates requests against a set of rules. It follows
            a "Fail-Closed" (Deny by default) philosophy to ensure security.
          </p>
        </div>
      </div>

      <h2 id="key-patterns">Key Architectural Patterns</h2>

      <h3>1. Proxy-Based Enforcement</h3>
      <p>
        SENTINEL does not rely on the AI agent to police itself. Instead, it places a proxy in the
        network path. The agent thinks it is talking directly to a tool server (like a database or
        GitHub), but it is actually talking to SENTINEL. This ensures that policy checks cannot be
        bypassed.
      </p>

      <h3>2. Fail-Closed Security</h3>
      <p>
        If the Policy Engine cannot be reached, or if an internal error occurs, the default action
        is <strong>DENY</strong>. Access is only granted when a specific policy explicitly ALLOWs
        it.
      </p>

      <h3>3. Asynchronous Auditing</h3>
      <p>
        While policy decisions are synchronous (blocking the request), audit logs are written
        asynchronously to ensure high performance without sacrificing accountability. Every
        attempt—whether allowed or denied—is permanently recorded.
      </p>

      <Callout type="info" title="Learn More">
        Dive deeper into the specific subsystems:
        <ul className="mt-2 list-disc list-inside">
          <li>
            <a href="/docs/architecture/policy-engine">Policy Engine Logic</a>
          </li>
          <li>
            <a href="/docs/architecture/mcp-proxy">MCP Proxy Flow</a>
          </li>
          <li>
            <a href="/docs/architecture/audit-logging">Audit Logging</a>
          </li>
        </ul>
      </Callout>
    </>
  );
}
