import { Callout } from '../../../components/Callout';

export default function SetupDeploymentContent() {
  return (
    <>
      <h1 id="deployment-options">Installation</h1>
      <p className="lead text-xl text-muted-foreground">
        Deploy SENTINEL on your own infrastructure in under 10 minutes.
      </p>

      <h2 id="requirements">Requirements</h2>
      <ul>
        <li>
          <strong>Docker Engine 20.10+</strong> and <strong>Docker Compose v2</strong>
        </li>
        <li>
          <strong>Node.js 20+</strong> and <strong>pnpm 9+</strong>
        </li>
        <li>
          <strong>2GB RAM minimum</strong> (4GB recommended)
        </li>
        <li>
          <strong>10GB disk space</strong>
        </li>
      </ul>

      <h2 id="quick-install">Quick Install</h2>

      <h3>Step 1: Download the Release Package</h3>
      <p>
        Download the latest release package from the{' '}
        <a
          href="https://github.com/gong8/sentinel/releases"
          className="text-primary hover:underline"
        >
          GitHub Releases page
        </a>
        . Look for the file named <code>sentinel-vX.X.X.tar.gz</code> (not the source code
        archives).
      </p>

      <h3>Step 2: Extract and Run Setup</h3>
      <p>The setup process is identical on all platforms (Windows, macOS, Linux):</p>
      <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto my-4">
        {`tar -xzf sentinel-v*.tar.gz
cd sentinel-v*
pnpm install
pnpm setup`}
      </pre>

      <Callout type="info" title="Cross-Platform">
        All management scripts are written in TypeScript and work identically on Windows, macOS, and
        Linux. No shell-specific commands required.
      </Callout>

      <h3>Step 3: Follow the Setup Wizard</h3>
      <p>The setup wizard will guide you through:</p>
      <ol>
        <li>
          <strong>Deployment URL</strong> — Where SENTINEL will be accessed (e.g.,{' '}
          <code>http://localhost</code> or <code>https://sentinel.yourcompany.com</code>)
        </li>
        <li>
          <strong>Version Selection</strong> — Choose <code>latest</code> or a specific version
        </li>
      </ol>
      <p>
        The script automatically generates secure encryption keys and pulls the pre-built Docker
        images.
      </p>

      <Callout type="info" title="What gets installed">
        The setup pulls optimized Docker images from GitHub Container Registry. No compilation or
        build step required — installation typically completes in 2-3 minutes depending on your
        internet speed.
      </Callout>

      <h2 id="architecture">Architecture Overview</h2>
      <p>SENTINEL consists of three containers:</p>
      <ul>
        <li>
          <strong>postgres</strong> — PostgreSQL database for persistent storage
        </li>
        <li>
          <strong>api</strong> — tRPC API server with embedded MCP proxy and A2A server
        </li>
        <li>
          <strong>web</strong> — React dashboard served via nginx
        </li>
      </ul>

      <h3 id="service-ports">Default Ports</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Service</th>
            <th className="text-left py-2">Port</th>
            <th className="text-left py-2">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">Dashboard</td>
            <td className="py-2">
              <code>80</code>
            </td>
            <td className="py-2">Web UI</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">API</td>
            <td className="py-2">
              <code>3000</code>
            </td>
            <td className="py-2">tRPC API server</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">MCP Proxy</td>
            <td className="py-2">
              <code>3001</code>
            </td>
            <td className="py-2">Connect AI clients here</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">A2A Server</td>
            <td className="py-2">
              <code>3002</code>
            </td>
            <td className="py-2">Agent-to-Agent protocol</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Admin MCP</td>
            <td className="py-2">
              <code>3003</code>
            </td>
            <td className="py-2">AI agent admin operations</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">PostgreSQL</td>
            <td className="py-2">
              <code>5432</code>
            </td>
            <td className="py-2">Database (internal, not exposed by default)</td>
          </tr>
        </tbody>
      </table>

      <h2 id="production-https">Production Deployment (HTTPS)</h2>
      <p>For production deployments with automatic TLS certificates, use Caddy:</p>

      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        {`# Edit .env and set your domain
DOMAIN=sentinel.yourcompany.com
ACME_EMAIL=admin@yourcompany.com

# Start with Caddy for automatic HTTPS
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d`}
      </pre>

      <p>
        Caddy automatically obtains and renews TLS certificates from Let's Encrypt. Make sure ports
        80 and 443 are accessible and your DNS points to the server.
      </p>

      <h2 id="management-commands">Management Commands</h2>
      <p>
        All management is done via <code>pnpm</code> commands. These work identically on all
        platforms:
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Command</th>
            <th className="text-left py-2">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">
              <code>pnpm setup</code>
            </td>
            <td className="py-2">Initial installation and configuration</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">
              <code>pnpm configure</code>
            </td>
            <td className="py-2">Reconfigure settings after installation</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">
              <code>pnpm logs</code>
            </td>
            <td className="py-2">View container logs</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">
              <code>pnpm backup</code>
            </td>
            <td className="py-2">Backup database to SQL file</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">
              <code>pnpm reset</code>
            </td>
            <td className="py-2">Reset database (destructive)</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">
              <code>pnpm usage</code>
            </td>
            <td className="py-2">Show all available commands</td>
          </tr>
        </tbody>
      </table>

      <h2 id="configuration">Configuration Reference</h2>
      <p>
        All configuration is stored in the <code>.env</code> file. The setup script generates secure
        defaults, but you can customize:
      </p>

      <h3>Required (Auto-Generated)</h3>
      <ul>
        <li>
          <code>ENCRYPTION_KEY</code> — 32-byte key for credential encryption
        </li>
        <li>
          <code>SESSION_SECRET</code> — Secret for session signing
        </li>
        <li>
          <code>PROXY_API_KEY</code> — Internal service authentication
        </li>
      </ul>

      <h3>URLs (Set During Setup)</h3>
      <ul>
        <li>
          <code>API_URL</code> — API server URL (e.g., <code>http://localhost:3000</code>)
        </li>
        <li>
          <code>FRONTEND_URL</code> — Dashboard URL (e.g., <code>http://localhost</code>)
        </li>
      </ul>

      <h3>Optional Features</h3>
      <ul>
        <li>
          <code>RESEND_API_KEY</code> — Enable email notifications
        </li>
      </ul>

      <h2 id="updating">Updating SENTINEL</h2>
      <p>To update to a new version:</p>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        {`# Pull the new images
VERSION=0.2.0 docker compose -f docker-compose.yml -f docker-compose.registry.yml pull

# Restart with new version
docker compose down
VERSION=0.2.0 docker compose -f docker-compose.yml -f docker-compose.registry.yml up -d`}
      </pre>
      <p>
        Or download the new release package and run <code>pnpm setup</code> again — it will detect
        the existing installation and offer to upgrade.
      </p>

      <h2 id="next-steps">Next Steps</h2>
      <p>After installation:</p>
      <ol>
        <li>
          Access the dashboard at your configured URL (default: <code>http://localhost</code>)
        </li>
        <li>Create your admin account</li>
        <li>
          <a href="/docs/admin/mcp-servers" className="text-primary hover:underline">
            Add your first MCP server →
          </a>
        </li>
        <li>
          <a href="/docs/setup/claude-code" className="text-primary hover:underline">
            Connect an AI client →
          </a>
        </li>
      </ol>

      <h2 id="troubleshooting">Troubleshooting</h2>

      <h3>"Cannot connect to Docker daemon"</h3>
      <p>Make sure Docker Desktop is running before starting the setup script.</p>

      <h3>"Permission denied" on Linux</h3>
      <p>
        Add your user to the docker group: <code>sudo usermod -aG docker $USER</code>, then log out
        and back in.
      </p>

      <h3>"Port already in use"</h3>
      <p>
        Another service is using port 80, 3000, 3001, 3002, or 3003. Stop the conflicting service or
        edit <code>.env</code> to use different ports.
      </p>

      <h3>View logs for debugging</h3>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        {`# All services
pnpm logs

# Just the API
docker compose logs -f api`}
      </pre>
    </>
  );
}
