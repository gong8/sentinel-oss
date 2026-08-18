# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do **not** open a public issue.

Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, which routes the report directly to the maintainers.

Please include:

- What the issue is and how to reproduce it
- Which component is affected (policy engine, proxy, API, web)
- What an attacker could achieve

This is a hobby-scale project maintained in spare time, so there is no guaranteed response window.
Reports will be looked at as soon as reasonably possible.

## Scope

Sentinel is a governance layer, so the interesting classes of bug are:

- **Policy bypass** — any way to get a tool call through that a DENY policy should have blocked
- **Tenant isolation** — reading or writing across `organizationId` or workspace boundaries
- **Credential exposure** — leaking stored upstream credentials, which are AES-256-GCM encrypted at rest
- **Authentication and authorization** — privilege escalation, admin operations from non-admin accounts
- **Audit integrity** — performing an auditable action without it being logged

## Out of scope

- Vulnerabilities in a deployment's own infrastructure (your Postgres, your reverse proxy, your network)
- Issues that require an already-compromised admin account
- Anything depending on a configuration the documentation explicitly warns against

## Deploying safely

Sentinel ships with development defaults. Before running it anywhere real:

- Generate fresh `ENCRYPTION_KEY`, `SESSION_SECRET`, and `PROXY_API_KEY` values
- Never reuse the seeded demo accounts or their access tokens
- Put it behind TLS
- Restrict network access to Postgres
- Set `NODE_ENV=production` and configure `FRONTEND_URL` and `API_URL` for your domain
