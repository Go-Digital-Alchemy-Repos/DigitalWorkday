# Architecture

**Status:** Current  
**Last Updated:** March 2026

This section covers the system architecture, technology choices, and design patterns used in MyWorkDay.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) | High-level system design |
| [TECH_STACK.md](./TECH_STACK.md) | Technology choices and rationale |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | File and folder organization |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Complete schema documentation |
| [DATA_FLOW.md](./DATA_FLOW.md) | How data flows through the system |
| [MULTI_TENANCY.md](./MULTI_TENANCY.md) | Multi-tenant architecture |
| [REAL_TIME.md](./REAL_TIME.md) | Socket.IO real-time architecture |

---

## Quick Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (React)                          │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
│  │ Pages   │  │Components│  │ TanStack  │  │ Socket.IO  │  │
│  │         │  │          │  │  Query    │  │  Client    │  │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  └──────┬─────┘  │
└───────┼────────────┼──────────────┼───────────────┼─────────┘
        │            │              │               │
        └────────────┴──────────────┴───────────────┘
                            │
                    ┌───────▼────────┐
                    │  Express.js    │
                    │   Backend      │
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐ ┌────────▼───────┐ ┌────────▼────────┐
│   PostgreSQL   │ │     S3/R2      │ │    Mailgun      │
│   (Database)   │ │   (Storage)    │ │    (Email)      │
└────────────────┘ └────────────────┘ └─────────────────┘
```

### Key Design Principles

1. **Multi-Tenancy First** - All data scoped by tenant ID
2. **Server is Source of Truth** - Client syncs with server state
3. **Real-Time Updates** - Socket.IO for live collaboration
4. **Progressive Enhancement** - Features work without real-time

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 18 + TypeScript | UI framework |
| Styling | Tailwind CSS + shadcn/ui | Design system |
| State | TanStack Query v5 | Server state management |
| Routing | Wouter | Client-side routing |
| Backend | Express.js + TypeScript | API server |
| ORM | Drizzle | Type-safe database access |
| Database | PostgreSQL | Primary data store |
| Real-time | Socket.IO | Live updates |
| Auth | Passport.js | Session-based authentication |

---

## Project Structure

```
myworkday/
├── client/src/           # React frontend
│   ├── components/       # Reusable components
│   ├── pages/            # Page components
│   ├── hooks/            # Custom React hooks
│   └── lib/              # Utilities and configs
├── server/               # Express backend
│   ├── routes/           # API route handlers
│   ├── middleware/       # Express middleware
│   ├── services/         # Business logic
│   └── scripts/          # Maintenance scripts
├── shared/               # Shared types
│   └── schema.ts         # Database schema & types
└── docs/                 # Documentation
```

---

## Compiler Target Decision

| Setting | Value | Rationale |
|---------|-------|-----------|
| `target` | ES2022 | Supports native iterators (Set, Map), top-level await, class fields, `Error.cause`. Eliminates TS2802 downlevelIteration errors without runtime polyfills. |
| `module` | ESNext | Preserves ES module syntax for bundler (Vite) to handle. |
| `moduleResolution` | bundler | Matches Vite's module resolution strategy. |
| `lib` | esnext, dom, dom.iterable | Full ES library typings plus browser DOM APIs. |
| Runtime | Node.js 20+ | Node 20 fully supports ES2022 features natively. No runtime compatibility risk. |

The ES2022 target was chosen because the runtime environment (Node 20) supports all ES2022 features, and the frontend is processed by Vite which handles further transpilation for browser targets. This eliminates the need for `--downlevelIteration` and avoids unnecessary helper code emission.

---

## Related Sections

- [03-FEATURES](../03-FEATURES/) - Feature documentation
- [04-API](../04-API/) - API reference
- [08-DATABASE](../08-DATABASE/) - Database details
