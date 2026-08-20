# Digital Workday

A multi-tenant work management application for projects, tasks, client portal collaboration, approvals, support, time tracking, CRM, reporting, and team communication.

## Features

- **Project Management**: Workspaces, teams, projects, tasks with subtasks
- **Multiple Views**: Board, list, and calendar views
- **Multi-Tenancy**: Complete tenant isolation with white-label branding
- **Time Tracking**: Timer-based tracking with reports and CSV export
- **CRM**: Client management with contacts and project linking
- **Real-time Updates**: Live collaboration via WebSocket
- **File Attachments**: Cloudflare R2/S3-compatible file storage with per-tenant configuration
- **Role-Based Access**: Employee, admin, and super user roles

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: Socket.IO
- **Routing**: Wouter (frontend)
- **State**: TanStack Query (React Query v5)
- **Calendar**: FullCalendar

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database
- npm 11.16.0

### Environment Setup

Create `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL=postgres://user:pass@localhost:5432/myworkday
SESSION_SECRET=your-secure-random-string
APP_ENCRYPTION_KEY=<32 bytes base64-encoded>
```

Generate `APP_ENCRYPTION_KEY` with: `openssl rand -base64 32`

### Installation

```bash
npm install
```

### Database Setup

For local development, apply the schema to your local database:

```bash
npm run db:push
```

For shared, staging, and production environments, prefer migrations and run:

```bash
npm run db:migrate
```

### Development

```bash
npm run dev
```

The application runs on `http://localhost:5000`.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/       # Route components
│   │   ├── components/  # Reusable components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities
│   └── README.md
├── server/               # Express backend
│   ├── http/            # Versioned API router factory and domain routers
│   ├── routes/          # Legacy/thin route aggregators and super-admin modules
│   ├── middleware/      # Express middleware
│   ├── services/        # Business logic
│   ├── realtime/        # Socket.IO
│   ├── tests/           # Backend tests
│   └── README.md
├── shared/               # Shared code
│   └── schema.ts        # Database schema & types
├── docs/                 # Documentation
│   ├── 01-GETTING-STARTED/
│   ├── 11-DEVELOPMENT/
│   ├── 12-OPERATIONS/
│   ├── 17-API-REGISTRY/
│   └── review/
```

## Documentation

- [API Endpoints](docs/ENDPOINTS.md) - Complete API reference
- [Feature Inventory](docs/FEATURE_INVENTORY.md) - All features and modules
- [Architecture Overview](docs/ARCHITECTURE_OVERVIEW.md) - Tech stack and flows
- [Environment Variables](docs/ENVIRONMENT_VARIABLES.md) - All env vars reference
- [Deployment Guide](docs/DEPLOYMENT_RAILWAY.md) - Railway deployment
- [Security & Tenancy](docs/SECURITY_TENANCY.md) - Multi-tenant isolation
- [Regression Checklist](docs/REGRESSION_CHECKLIST.md) - Manual test plan
- [Audit Findings](docs/AUDIT_FINDINGS.md) - Latest audit report
- [Mac Desktop App](macos/DigitalWorkday/README.md) - Native client development and packaging
- [Desktop App Handoff](docs/DESKTOP_APP_HANDOFF.md) - Architecture, workstation transfer, signing, notarization, and releases

## Testing

```bash
npm test                 # Run the fast suite (no DB required)
npm run test:watch       # Watch the fast suite
npm run test:http        # Run HTTP/supertest suites
npm run test:db          # Run DB-backed suites
npm run test:all         # Run the full Vitest suite
npm run check            # Run the TypeScript typecheck
npm run supply-chain:check
npm run production:check
npm run publishing:check
npm run test:ci          # Full local release gate: supply chain, typecheck, tests, build
```

The fast suite is intended to be the default local gate. DB-backed suites require a configured `DATABASE_URL` and local Postgres, and HTTP suites may be blocked in restricted sandboxes that do not allow local listeners.

## Key Features

### Multi-Tenancy

- Complete data isolation between tenants
- Per-tenant branding (logo, colors, custom domain)
- Per-tenant integrations (Mailgun, S3)
- Super admin dashboard for tenant management

### Task Management

- Projects with board/list/calendar views
- Drag-and-drop task reordering
- Subtasks with assignees and due dates
- Tags, comments, and activity logging
- Multi-assignee support
- Personal task sections

### Time Tracking

- Start/pause/resume timer
- Manual time entry creation
- Project-based time reports
- CSV export functionality

### Client Management

- Client profiles with contacts
- Project-client linking
- Client portal invitations

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session encryption key (min 32 characters) |
| `APP_ENCRYPTION_KEY` | Tenant secret encryption (32 bytes, base64-encoded) |

### Railway Deployment

For Railway deployments, set these additional variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTO_MIGRATE` | Yes | Set to `true` - runs database migrations on startup |
| `FAIL_ON_SCHEMA_ISSUES` | Yes | Set to `true` - fails fast if schema is incomplete |
| `NODE_ENV` | Auto | Auto-set to `production` by Railway |
| `DATABASE_URL` | Auto | Auto-set by Railway PostgreSQL plugin |

See [Railway Deployment Guide](docs/RAILWAY_DEPLOYMENT_GUIDE.md) for complete setup instructions.

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `TENANCY_ENFORCEMENT` | Tenant isolation | `off` |
| `CF_R2_ACCOUNT_ID` | Cloudflare R2 account ID | - |
| `CF_R2_ACCESS_KEY_ID` | R2 access key | - |
| `CF_R2_SECRET_ACCESS_KEY` | R2 secret key | - |
| `CF_R2_BUCKET_NAME` | R2 bucket name | - |
| `CF_R2_PUBLIC_URL` | Optional public R2 base URL | - |

## Documentation Standard

When adding features, follow these documentation requirements:

1. **Update FEATURE_INVENTORY.md** - Add new features/endpoints when the inventory changes
2. **Update ENVIRONMENT_VARIABLES.md** - Add new env vars
3. **Update the API registry** - Use the super-admin docs sync flow when routes change
4. **Add module header comments** - Annotate key files with purpose and invariants
5. **Update relevant README** - If changing setup or configuration

See `/docs/DOCUMENTATION_POLICY.md` for full guidelines and `/docs/DOCS_CHECKLIST.md` for verification.

## Recovery & Backups

Before major changes, create a recovery point:

```bash
git tag pre-refinement-roadmap-YYYYMMDD
```

For database backups, use Railway/Postgres provider backups or manual `pg_dump`.

See `/docs/RECOVERY.md` for full rollback and restore procedures.

## Contributing

1. Create feature branch
2. Make changes
3. Add tests if applicable
4. Follow documentation checklist
5. Submit pull request

## License

Proprietary - All rights reserved
