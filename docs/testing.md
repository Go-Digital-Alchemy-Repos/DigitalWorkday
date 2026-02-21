# Testing Architecture

**Last updated:** 2026-02-21

---

## Overview

Tests use [Vitest](https://vitest.dev/) as the test runner and [supertest](https://github.com/ladekjaansen/supertest) for HTTP assertions. The key architectural principle is **no port binding in tests** — all tests use `supertest(app)` against an in-memory Express instance.

---

## App Factory (`server/appFactory.ts`)

The app factory centralizes Express app creation for both production and test use:

```ts
import { createApp, createAppWithRoutes } from "./appFactory";

// Minimal app (middleware only, no routes)
const { app, httpServer } = createApp({ testMode: true });

// Full app with all routes registered (no port binding)
const { app } = await createAppWithRoutes({ testMode: true });

// App with mock authenticated user
const { app } = createApp({
  testMode: true,
  mockUser: { id: "user1", tenantId: "tenant1", role: "employee" },
});
```

### Options

| Option | Type | Description |
|---|---|---|
| `testMode` | `boolean` | Skips tenant context middleware, agreement enforcement |
| `withAuth` | `boolean` | Reserved for future use with real auth in tests |
| `mockUser` | `object` | Injects a mock authenticated user into all requests |
| `mockUser.id` | `string` | User ID |
| `mockUser.tenantId` | `string?` | Tenant ID (null = no tenant) |
| `mockUser.role` | `string?` | User role (default: "employee") |

### Production vs Test

- **Production** (`server/index.ts`): Creates app, binds port, runs startup phases, connects Socket.IO
- **Tests**: Use `createApp()` or `createAppWithRoutes()` — no port binding, no Socket.IO, optional mock auth

---

## Test Harness (`server/tests/server-harness.ts`)

The test harness provides convenience wrappers around the app factory:

```ts
import { createTestApp, buildFullTestApp } from "./server-harness";

// Minimal app
const app = createTestApp({ mockUserId: "u1", mockTenantId: "t1" });

// Full app with routes
const app = await buildFullTestApp({ mockUserId: "u1", mockTenantId: "t1" });
```

---

## Test Patterns

### 1. Unit Route Tests (mini app)

Mount a single router on a fresh Express instance to test its guards and behavior in isolation:

```ts
import request from "supertest";
import express from "express";
import tasksRouter from "../../http/domains/tasks.router";

function buildUnauthApp() {
  const app = express();
  app.use(express.json());
  app.use(injectNoAuth());
  app.use("/api", tasksRouter);
  return app;
}

it("rejects unauthenticated requests", async () => {
  const res = await request(buildUnauthApp()).get("/api/tasks/my");
  expect(res.status).toBe(401);
});
```

### 2. Integration Tests (live server)

Test against the running dev server using `supertest(BASE_URL)`:

```ts
const BASE = "http://localhost:5000";

it("GET /api/tasks/my without auth returns 401", async () => {
  const res = await request(BASE).get("/api/tasks/my");
  expect(res.status).toBe(401);
});
```

### 3. CRUD Integration Tests

Full create/read/update/delete lifecycle tests using mock auth:

```ts
it("creates, reads, updates, and deletes a task", async () => {
  const app = express();
  app.use(express.json());
  app.use(injectPassportAuth({ id: "u1", tenantId: "t1", role: "admin" }));
  app.use("/api", tasksRouter);

  // Create
  const createRes = await request(app)
    .post("/api/tasks")
    .send({ title: "Test Task", projectId: "p1" });
  expect(createRes.status).toBe(201);

  // Read
  const readRes = await request(app).get(`/api/tasks/${createRes.body.id}`);
  expect(readRes.status).toBe(200);

  // Update
  const updateRes = await request(app)
    .patch(`/api/tasks/${createRes.body.id}`)
    .send({ title: "Updated Task" });
  expect(updateRes.status).toBe(200);

  // Delete
  const deleteRes = await request(app).delete(`/api/tasks/${createRes.body.id}`);
  expect(deleteRes.status).toBe(200);
});
```

### 4. Auth Injection Helpers

Common test helpers for simulating auth states:

```ts
function injectPassportAuth(user: Record<string, any>): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = user;
    (req as any).session = { passport: { user: user.id } };
    (req as any).tenant = { effectiveTenantId: user.tenantId };
    next();
  };
}

function injectNoAuth(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = null;
    next();
  };
}

function injectAuthNoTenant(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: "user1", role: "employee" };
    (req as any).session = { passport: { user: "user1" } };
    next();
  };
}
```

---

## Test File Organization

```
server/tests/
├── setup.ts                          — global test setup
├── fixtures.ts                       — shared test data
├── server-harness.ts                 — app factory wrappers
│
├── integration/                      — route integration tests
│   ├── tasksRoutes.test.ts           — tasks CRUD + auth + tenant
│   ├── projectsRoutes.test.ts        — projects CRUD + auth + tenant
│   ├── timeRoutes.test.ts            — time entries CRUD + auth + tenant
│   ├── teamsRoutes.test.ts           — teams routes
│   ├── presenceRoutes.test.ts        — presence/typing routes
│   └── subtasksRoutes.test.ts        — subtasks routes
│
├── policy/                           — route policy enforcement
│   └── routePolicyDrift.test.ts      — ensures no rogue mounts
│
├── *-router-policy.test.ts           — per-domain policy tests
├── tenantScope.test.ts               — tenant scope hardening
├── apiErrorEnvelope.test.ts          — error envelope format
└── ...                               — domain-specific tests
```

---

## Running Tests

```bash
# Run all tests
npx vitest run

# Run a specific test file
npx vitest run server/tests/integration/tasksRoutes.test.ts

# Run tests matching a pattern
npx vitest run --grep "CRUD"

# Watch mode
npx vitest

# Run with coverage
npx vitest run --coverage
```

---

## Key Principles

1. **No port binding** — Tests never call `app.listen()` or `httpServer.listen()`
2. **Isolated state** — Each test creates its own Express app instance
3. **Factory pattern** — `createApp()` / `createAppWithRoutes()` ensure consistent middleware setup
4. **Guard testing** — Both mini-app (isolated guard) and live-server (full stack) approaches
5. **Tenant scoping** — Tests verify tenant isolation via `injectAuthNoTenant()` helpers
