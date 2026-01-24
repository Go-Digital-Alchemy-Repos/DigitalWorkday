# MyWorkDay Documentation

**Status:** Current  
**Last Updated:** January 2026  
**Version:** Sprint 2 Complete

Welcome to the MyWorkDay documentation hub. MyWorkDay is a multi-tenant SaaS project management application with comprehensive features for project tracking, time management, client CRM, and team collaboration.

---

## Documentation Categories

### 1. Architecture & Tenancy
Core system design and multi-tenancy fundamentals.

| Document | Description |
|----------|-------------|
| [System Overview](./architecture/SYSTEM_OVERVIEW.md) | Tech stack, high-level architecture, component relationships |
| [Tenancy Model](./architecture/TENANCY_MODEL.md) | tenant_id invariants, tenant-wide visibility, workspace role |
| [Effective Tenant Context](./architecture/EFFECTIVE_TENANT_CONTEXT.md) | "Tenant Context Loaded" gate, context propagation |
| [Database Schema](./architecture/DATABASE_SCHEMA.md) | Entity relationships, tenant-owned tables |

### 2. Authentication & Authorization
User authentication flows and permission models.

| Document | Description |
|----------|-------------|
| [Authentication](./auth/AUTHENTICATION.md) | Cookie-based auth, session management, login flows |
| [Google OAuth Setup](./auth/GOOGLE_OAUTH_SETUP.md) | Google OAuth integration configuration |
| [Role Permissions](./auth/ROLE_PERMISSIONS.md) | Role hierarchy (super, tenant admin, employee, client) |
| [Super Admin Act-As-Tenant](./auth/SUPER_ADMIN_ACT_AS.md) | Impersonation behavior and safeguards |

### 3. Security & Data Isolation
Security policies and tenant isolation enforcement.

| Document | Description |
|----------|-------------|
| [Multi-Tenancy Security](./security/MULTI_TENANCY.md) | Enforcement modes, runtime guards |
| [Tenant Data Visibility](./security/TENANT_DATA_VISIBILITY.md) | Visibility rules, what is tenant-wide vs user-scoped |
| [Rate Limiting](./security/RATE_LIMITS.md) | API rate limiting, brute-force protection |
| [Security Checklist](./security/SECURITY_CHECKLIST.md) | Audit checklist for new features |

### 4. Storage & File Handling
File upload, storage providers, and asset management.

| Document | Description |
|----------|-------------|
| [Storage Overview](./storage/STORAGE_OVERVIEW.md) | Cloudflare R2 as primary, storage resolver hierarchy |
| [Upload Paths](./storage/UPLOAD_PATHS.md) | Avatar, branding, task attachments, chat attachments |
| [Signed URLs](./storage/SIGNED_URLS.md) | Signed vs public URLs, security considerations |

### 5. Chat & Communication
Real-time messaging system architecture.

| Document | Description |
|----------|-------------|
| [Chat Architecture](./chat/CHAT_ARCHITECTURE.md) | Channels, DMs, tenant-scoped rooms |
| [Chat Debugging](./chat/CHAT_DEBUGGING.md) | Debug mode, Socket.IO diagnostics |
| [Membership Rules](./chat/MEMBERSHIP_RULES.md) | Channel/DM membership enforcement |

### 6. Provisioning & Onboarding
Tenant and user creation workflows.

| Document | Description |
|----------|-------------|
| [Tenant Lifecycle](./provisioning/TENANT_LIFECYCLE.md) | Tenant creation, onboarding wizard, activation |
| [User Provisioning](./provisioning/USER_PROVISIONING.md) | User creation, invitations, bulk import |
| [Primary Workspace](./provisioning/PRIMARY_WORKSPACE.md) | Primary workspace logic, getPrimaryWorkspaceIdOrFail |

### 7. Integrations
External service integrations.

| Document | Description |
|----------|-------------|
| [Integrations Overview](./integrations/INTEGRATIONS_OVERVIEW.md) | Available integrations and configuration |
| [Mailgun Email](./integrations/MAILGUN.md) | Email sending configuration |
| [Stripe Payments](./integrations/STRIPE.md) | Payment processing setup |

### 8. Performance & Scaling
Performance optimization and monitoring.

| Document | Description |
|----------|-------------|
| [Performance Notes](./performance/PERFORMANCE_NOTES.md) | N+1 fixes, query optimization |
| [Indexing Strategy](./performance/INDEXING_STRATEGY.md) | Database indexes for tenant-scoped queries |

### 9. Super Admin / Tenant Admin Operations
Administrative functionality guides.

| Document | Description |
|----------|-------------|
| [Super Admin Guide](./admin/SUPER_ADMIN_GUIDE.md) | Platform administration, tenant management |
| [Tenant Admin Guide](./admin/TENANT_ADMIN_GUIDE.md) | Tenant-level administration |
| [System Health](./admin/SYSTEM_HEALTH.md) | Health checks, diagnostics |
| [Tenancy Remediation](./admin/TENANCY_REMEDIATION.md) | Data health tools, backfill operations |

### 10. Development & Contribution Guide
Developer onboarding and coding standards.

| Document | Description |
|----------|-------------|
| [Quick Start](./dev/QUICK_START.md) | Get running in 5 minutes |
| [Environment Variables](./dev/ENVIRONMENT_VARIABLES.md) | Required configuration |
| [Adding Features](./dev/ADDING_FEATURES.md) | Feature development workflow |
| [Modular Architecture](./dev/MODULAR_ARCHITECTURE.md) | Feature-based code organization |
| [Error Handling](./dev/ERROR_HANDLING.md) | Error logging, request correlation |
| [Testing Guide](./dev/TESTING.md) | Unit, integration, E2E testing |
| [Development Checklist](./dev/DEVELOPMENT_CHECKLIST.md) | Verification checklist for new features |

---

## Quick Start Paths

### For New Developers
1. [Quick Start](./dev/QUICK_START.md) - Get running in 5 minutes
2. [Environment Variables](./dev/ENVIRONMENT_VARIABLES.md) - Required configuration
3. [System Overview](./architecture/SYSTEM_OVERVIEW.md) - Understand the architecture
4. [Tenant Data Visibility](./security/TENANT_DATA_VISIBILITY.md) - **Required reading** for all developers

### For Feature Development
1. [Modular Architecture](./dev/MODULAR_ARCHITECTURE.md) - Code organization
2. [Adding Features](./dev/ADDING_FEATURES.md) - Development workflow
3. [Development Checklist](./dev/DEVELOPMENT_CHECKLIST.md) - **Use this for every PR**
4. [Security Checklist](./security/SECURITY_CHECKLIST.md) - Security verification

### For Deployment
1. [Deployment Guide](./deployment/DEPLOYMENT.md) - Production deployment
2. [Environment Setup](./deployment/ENVIRONMENT_SETUP.md) - Production configuration

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | Express.js, TypeScript, Drizzle ORM |
| Database | PostgreSQL (Neon) |
| Real-time | Socket.IO |
| Storage | Cloudflare R2 (S3-compatible) |
| Deployment | Railway |

---

## Core Architectural Principles

### 1. Tenant Isolation is Absolute
- Every tenant-owned entity **must** have a `tenant_id` column
- Every query **must** filter by `effectiveTenantId`
- Workspace is organizational only, **never** a visibility boundary

### 2. Storage Uses Unified Resolver
- All file operations go through `getStorageConfig(tenantId)`
- Priority: Tenant R2 → System R2 → Error
- Never bypass the resolver for uploads

### 3. Real-time is Tenant-Scoped
- Socket.IO rooms are namespaced by tenant
- Membership validation happens on every join/send
- No cross-tenant message visibility possible

### 4. Provisioning Uses Primary Workspace
- All entity creation uses `getPrimaryWorkspaceIdOrFail(tenantId)`
- Explicit errors if primary workspace missing
- Audit logging on all provisioning operations

---

## Documentation Standards

- **Status Labels**: Current, Outdated, Draft
- **Last Updated**: Date of last significant update
- **Related Docs**: Links to related documents
- **Code Examples**: Practical, copy-paste-ready examples

---

## Contributing to Documentation

1. Follow the category structure above
2. Include practical code examples
3. Update the "Last Updated" date
4. Link to related documentation
5. Test all code examples before committing

---

*For questions or issues, contact the development team.*
