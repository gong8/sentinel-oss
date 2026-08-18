import { Callout } from '../../../components/Callout';

export default function CLICommandsContent() {
  return (
    <>
      <h1 id="cli-commands">CLI Commands</h1>
      <p className="lead text-xl text-muted-foreground">
        Reference for all available pnpm commands to manage your SENTINEL installation.
      </p>

      <h2 id="docker-commands">Docker Commands</h2>
      <p>
        These commands help you manage your Docker-based SENTINEL deployment. All commands are
        available via <code>pnpm</code> from the project root.
      </p>

      <div className="space-y-4 my-6">
        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm setup</h3>
          <p className="text-muted-foreground mt-2">
            Initial setup for a fresh installation. This command:
          </p>
          <ul className="mt-2 text-sm">
            <li>
              Creates <code>.env</code> from template if it doesn't exist
            </li>
            <li>Auto-generates required secrets (ENCRYPTION_KEY, SESSION_SECRET, PROXY_API_KEY)</li>
            <li>Prompts for deployment URL and optional API keys</li>
            <li>Pulls pre-built Docker images from GitHub Container Registry</li>
            <li>Starts Docker containers and runs database migrations</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Alias: <code>pnpm bootstrap</code>
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm preflight</h3>
          <p className="text-muted-foreground mt-2">
            Run pre-deployment checks to verify your system is ready for installation:
          </p>
          <ul className="mt-2 text-sm">
            <li>Checks Docker and Docker Compose versions</li>
            <li>Verifies required ports are available (80, 3000, 3001, 3002, 5432)</li>
            <li>Checks available disk space</li>
            <li>Validates Node.js and pnpm versions</li>
          </ul>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm configure</h3>
          <p className="text-muted-foreground mt-2">
            Interactive configuration menu to modify <code>.env</code> settings. Options include:
          </p>
          <ul className="mt-2 text-sm">
            <li>Configure URLs (Frontend, API)</li>
            <li>Set API keys (Gemini, Anthropic)</li>
            <li>Configure agent model and settings</li>
            <li>View current configuration</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Run this anytime you need to update your configuration after initial setup.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm logs</h3>
          <p className="text-muted-foreground mt-2">
            View Docker container logs in real-time with timestamps.
          </p>
          <pre className="bg-muted p-2 rounded text-xs mt-2">
            {`pnpm logs              # All services, real-time
pnpm logs api          # API logs only
pnpm logs -- -n 50     # Last 50 lines
pnpm logs -- --no-follow  # Show logs and exit`}
          </pre>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-warning">pnpm reset</h3>
          <p className="text-muted-foreground mt-2">
            Complete reset for a fresh installation. This command:
          </p>
          <ul className="mt-2 text-sm">
            <li>Stops all containers</li>
            <li>Removes all volumes (deletes database)</li>
            <li>Removes locally built images</li>
            <li>
              Deletes <code>.env</code> file
            </li>
          </ul>
          <Callout type="warning" title="Destructive Action">
            This permanently deletes all data. Use only when you want a completely fresh start.
          </Callout>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm backup</h3>
          <p className="text-muted-foreground mt-2">
            Create a backup of the PostgreSQL database as a SQL file.
          </p>
          <pre className="bg-muted p-2 rounded text-xs mt-2">
            {`pnpm backup              # Creates backup-YYYYMMDD.sql
pnpm backup my-backup    # Creates my-backup.sql`}
          </pre>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm usage</h3>
          <p className="text-muted-foreground mt-2">
            Display a quick reference of all available commands, Docker tips, and troubleshooting
            guidance.
          </p>
        </div>
      </div>

      <h2 id="development-commands">Development Commands</h2>
      <p>Commands for local development without Docker.</p>

      <div className="space-y-4 my-6">
        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm dev</h3>
          <p className="text-muted-foreground mt-2">
            Start local development servers for both API and Web packages. Automatically kills any
            processes on conflicting ports.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm dev:verbose</h3>
          <p className="text-muted-foreground mt-2">
            Start development servers with verbose logging output for debugging.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm dev:full</h3>
          <p className="text-muted-foreground mt-2">
            Start all development servers including the API, Web, and MCP servers.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm build</h3>
          <p className="text-muted-foreground mt-2">Build all packages for production.</p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm check</h3>
          <p className="text-muted-foreground mt-2">
            Run all quality checks: formatting, linting, type checking, and tests.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm test</h3>
          <p className="text-muted-foreground mt-2">
            Run the full test suite (unit, integration, security, and e2e tests).
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm lint</h3>
          <p className="text-muted-foreground mt-2">Run ESLint across all packages.</p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm format</h3>
          <p className="text-muted-foreground mt-2">Format code with Prettier.</p>
        </div>
      </div>

      <h2 id="database-commands">Database Commands</h2>
      <p>Commands for managing the PostgreSQL database.</p>

      <div className="space-y-4 my-6">
        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm db:studio</h3>
          <p className="text-muted-foreground mt-2">
            Open Prisma Studio, a visual database browser for exploring and editing data.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm db:push</h3>
          <p className="text-muted-foreground mt-2">
            Push Prisma schema changes to the database without creating a migration.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm db:seed</h3>
          <p className="text-muted-foreground mt-2">Seed the database with sample data.</p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-warning">pnpm db:reset</h3>
          <p className="text-muted-foreground mt-2">
            Reset the database schema. This drops all tables and recreates them.
          </p>
          <Callout type="warning" title="Data Loss">
            This deletes all data in the database. Use with caution in production.
          </Callout>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm db:migrate</h3>
          <p className="text-muted-foreground mt-2">
            Run Prisma migrations to apply schema changes to the database.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm db:init</h3>
          <p className="text-muted-foreground mt-2">
            Initialize the database with the Prisma schema. Creates tables if they don't exist.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-warning">pnpm db:clear</h3>
          <p className="text-muted-foreground mt-2">
            Clear all data from the database without dropping tables.
          </p>
          <Callout type="warning" title="Data Loss">
            This deletes all data but keeps the schema intact.
          </Callout>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm seed</h3>
          <p className="text-muted-foreground mt-2">
            Shortcut for <code>pnpm db:reset:seed:creds</code> - full reset, seed, and display
            credentials.
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-mono text-lg font-semibold text-primary">pnpm restore</h3>
          <p className="text-muted-foreground mt-2">Restore the database from a backup SQL file.</p>
          <pre className="bg-muted p-2 rounded text-xs mt-2">
            {`pnpm restore backup.sql    # Restore from backup.sql`}
          </pre>
        </div>
      </div>

      <h2 id="docker-reference">Docker Quick Reference</h2>
      <p>Common Docker Compose commands for manual control.</p>

      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm my-4">
        {`docker compose up -d           # Start containers in background
docker compose down            # Stop containers
docker compose down -v         # Stop + delete volumes (wipes DB)
docker compose restart api     # Restart just the API
docker compose ps              # Show running containers
docker compose exec api bash   # Shell into API container`}
      </pre>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <p>Common issues and their solutions.</p>

      <div className="space-y-4 my-6">
        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-semibold">Container won't start?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Check logs: <code>pnpm logs api</code>
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-semibold">Port already in use?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Kill processes on ports: <code>pnpm kill</code>
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-semibold">Database issues?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Reset database: <code>pnpm db:reset</code>
          </p>
        </div>

        <div className="border p-4 rounded-lg bg-card">
          <h3 className="font-semibold">Need a complete fresh start?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Nuclear option: <code>pnpm reset</code> (destroys everything)
          </p>
        </div>
      </div>

      <h2 id="default-urls">Default URLs</h2>
      <ul>
        <li>
          <strong>Web UI:</strong> <code>http://localhost:5173</code> (dev) or{' '}
          <code>http://localhost</code> (docker)
        </li>
        <li>
          <strong>API:</strong> <code>http://localhost:3000</code>
        </li>
        <li>
          <strong>API Docs:</strong> <code>http://localhost:3000/docs</code>
        </li>
        <li>
          <strong>MCP Proxy:</strong> <code>http://localhost:3001</code>
        </li>
        <li>
          <strong>A2A Server:</strong> <code>http://localhost:3002</code>
        </li>
        <li>
          <strong>Admin MCP:</strong> <code>http://localhost:3003</code>
        </li>
      </ul>
    </>
  );
}
