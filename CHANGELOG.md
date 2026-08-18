# Changelog

All notable changes to Sentinel are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.1.0-alpha.1] - 2025-01-25

First public alpha release of Sentinel — an enterprise-grade MCP gateway and policy engine for securing AI agent infrastructure.

### Platform Overview

- **340,000+ lines** of TypeScript across **667 source files**
- **9-package monorepo** architecture (api, web, db, mcp, a2a, shared, mcp-admin, docs, and more)
- **35 database models** with full relational integrity
- **153 React components** powering 20+ admin pages and 7 user pages
- **206 test files** covering unit, integration, e2e, and security scenarios
- **114 documentation files** with specs, patterns, and guides

### Added

#### Core Infrastructure
- Complete tRPC API server with 30+ services and full type safety
- PostgreSQL database layer with Prisma ORM and encrypted credential storage
- Multi-tenant architecture with organization-scoped data isolation
- Session management with automatic cleanup and context tracking
- Rate limiting middleware with sliding window algorithm

#### MCP Gateway
- Full MCP (Model Context Protocol) proxy implementation
- Real-time policy enforcement on all tool calls
- Support for stdio, HTTP, and SSE transports
- Credential injection for seamless authentication passthrough
- Tool discovery and schema validation

#### Policy Engine
- Declarative policy language with ALLOW, DENY, and DEFER actions
- DENY-first, fail-closed security architecture
- Wildcard matching for tools, resources, and parameters
- Parameter-based conditions with JSONPath support
- Semantic policies powered by LLM evaluation (Gemini integration)
- Policy testing framework with assertions and conflict detection
- Policy playground for real-time rule experimentation

#### A2A Protocol Support
- Full Agent-to-Agent (A2A) protocol proxy
- Agent Identity Attestation via JWKS/JWS verification
- Publisher registry for trusted agent sources
- A2A-specific policy matchers: `a2a-agent:*`, `a2a-provider:*`, `a2a-skill:*`
- Skill-level access control and credential injection

#### Admin Dashboard
- Organization management and multi-tenancy controls
- MCP server configuration with OAuth and credential management
- Policy editor with syntax highlighting and validation
- Real-time analytics and usage metrics
- Comprehensive audit log viewer with filtering
- Role-based access control (RBAC) administration
- Agent management and attestation verification
- Webhook configuration (Discord, Slack, email, custom HTTP)
- Sensitive tool flagging with approval workflows
- Global variables for cross-server secret management
- Deleted items recovery and soft-delete support

#### User Portal
- Personal dashboard with tool usage overview
- Self-service MCP server access requests
- Approval queue for sensitive operations
- Individual audit trail
- Credential management for personal tool access

#### Authentication & Authorization
- OAuth 2.1 authentication flows with PKCE
- Dynamic OAuth client registration
- Role-based access control with granular permissions
- Agent identity verification and attestation
- Session-based context tracking

#### Operational Features
- Sensitive tool flags with rate limits and approval requirements
- Webhook system for real-time event notifications
- Admin MCP server for AI-powered administration
- Comprehensive audit logging for compliance

#### Deployment
- Docker Compose production configuration
- Railway deployment templates
- Fly.io deployment configuration
- One-command setup scripts (bash and PowerShell)
- Environment configuration management

#### Documentation
- Complete technical specification
- Implementation pattern guides
- Operator installation guides
- LLM client integration documentation
- Architecture decision records

### Security

- End-to-end credential encryption using AES-256-GCM
- Organization-scoped queries enforced at the service layer
- DENY policies cannot be bypassed under any circumstances
- All inputs validated with Zod schemas
- Audit logging for all sensitive operations
- Secret detection with automatic key-name redaction
- RBAC with principle of least privilege
