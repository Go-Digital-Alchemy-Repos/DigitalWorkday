# Testing Guide

This document describes the test suite, how to run tests, and known issues.

## Quick Start

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run server/tests/tenancy_permissions_audit.test.ts

# Run tests in watch mode
npm run test:watch

# Run with verbose output
npx vitest run --reporter=verbose
```

## Test Structure

```
server/tests/
├── fixtures.ts                      # Shared test utilities and data factories
├── tenancy_permissions_audit.test.ts  # Cross-tenant access prevention (22 tests)
├── tenancy_enforcement.test.ts        # Tenant isolation modes
├── workload.test.ts                   # Workload reports
├── tenant-integrations.test.ts        # Per-tenant Mailgun/S3 config
├── bootstrap-registration.test.ts     # First user registration flow
├── bootstrap-endpoints.test.ts        # Bootstrap API endpoints
├── platform-admins.test.ts            # Super admin management
├── purge-guards.test.ts               # Data purge safety guards
└── ...
```

## Test Categories

### 1. Tenancy & Security Tests
These verify multi-tenant isolation and permissions:

```bash
# Permissions audit - cross-tenant access prevention
npx vitest run server/tests/tenancy_permissions_audit.test.ts

# Tenancy enforcement modes (off/soft/strict)
npx vitest run server/tests/tenancy_enforcement.test.ts
```

### 2. Integration Tests
These test API endpoints with authentication:

```bash
# Workload reports
npx vitest run server/tests/workload.test.ts

# Tenant integrations (Mailgun/S3)
npx vitest run server/tests/tenant-integrations.test.ts
```

### 3. Auth & Bootstrap Tests
These test authentication and first-user setup:

```bash
npx vitest run server/tests/bootstrap-registration.test.ts
npx vitest run server/tests/bootstrap-endpoints.test.ts
```

## Test Utilities

### fixtures.ts

The `fixtures.ts` file provides:

```typescript
import {
  createTestTenant,
  createTestUser,
  createTestWorkspace,
  safeDeleteAllUsers,
  loginAsUser,
  createAndLoginSuperUser,
  createAndLoginTenantAdmin,
} from "./fixtures";
```

**Key Functions**:

| Function | Description |
|----------|-------------|
| `createTestTenant(overrides)` | Create a tenant with random name |
| `createTestUser(options)` | Create a user with password hashing |
| `createTestWorkspace(overrides)` | Create a workspace in a tenant |
| `safeDeleteAllUsers()` | Clean up all test data respecting FK order |
| `loginAsUser(app, email, password)` | Get auth cookie for user |
| `createAndLoginSuperUser(app)` | Create super user and get cookie |
| `createAndLoginTenantAdmin(app, tenantId)` | Create admin and get cookie |

### Database Cleanup

The `safeDeleteAllUsers()` function deletes data in FK-safe order:

1. Task-related (subtasks, tasks, sections)
2. Tags
3. Projects
4. Time tracking
5. Workspace/team members
6. Clients
7. User-related
8. Workspaces
9. Tenant-related
10. Platform-level (platform_audit_events, platform_invitations)
11. Sessions
12. Users

## Known Issues

### Port Conflicts

When the development server is running, some tests fail with `EADDRINUSE` because they import modules that try to bind to port 5000.

**Affected Tests**:
- `super-only-integrations.test.ts`
- `platform-admins.test.ts`
- `bootstrap-registration.test.ts`
- `global-integrations-persist.test.ts`
- `seed-endpoints.test.ts`

**Workaround**: Stop the development workflow before running tests.

### Test Isolation

Each test file should:
1. Set up its own test data in `beforeAll` or `beforeEach`
2. Clean up data in `afterAll` or `afterEach`
3. Use unique identifiers (timestamps, UUIDs) to avoid conflicts

## Writing New Tests

### Example Test Structure

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../routes"; // Import test app
import {
  createTestTenant,
  createTestUser,
  safeDeleteAllUsers,
  loginAsUser,
} from "./fixtures";
import { UserRole } from "@shared/schema";

describe("My Feature", () => {
  let tenant: any;
  let user: any;
  let authCookie: string;

  beforeAll(async () => {
    // Create test data
    tenant = await createTestTenant({ name: "Test Tenant" });
    user = await createTestUser({
      email: "test@example.com",
      password: "password123",
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    });
    authCookie = await loginAsUser(app, "test@example.com", "password123");
  });

  afterAll(async () => {
    await safeDeleteAllUsers();
  });

  it("should do something", async () => {
    const response = await request(app)
      .get("/api/my-endpoint")
      .set("Cookie", authCookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("data");
  });
});
```

### Testing Cross-Tenant Access

When testing permissions, create resources in one tenant and verify another tenant cannot access them:

```typescript
it("should prevent cross-tenant access", async () => {
  // Create resource in Tenant A
  const resourceA = await createResourceInTenant(tenantA.id);

  // Try to access from Tenant B
  const response = await request(app)
    .get(`/api/resources/${resourceA.id}`)
    .set("Cookie", tenantBCookie);

  expect(response.status).toBe(404); // Should not find it
});
```

## Coverage

Current test coverage by area:

| Area | Status | Tests |
|------|--------|-------|
| Tenancy enforcement | ✅ Complete | 22 |
| Permissions audit | ✅ Complete | 22 |
| Workload reports | ✅ Complete | 12 |
| Tenant integrations | ✅ Complete | 10 |
| Bootstrap/registration | ✅ Complete | 8 |
| Task CRUD with auth | ❌ Missing | - |
| Project CRUD with auth | ❌ Missing | - |
| Client CRUD with auth | ❌ Missing | - |
| Time tracking flows | ❌ Missing | - |

## CI/CD Notes

For CI/CD pipelines:

1. **Database**: Tests require a PostgreSQL database. Set `DATABASE_URL`.
2. **Isolation**: Run tests in a dedicated test database.
3. **Port**: Ensure port 5000 is available.
4. **Environment**: Set `NODE_ENV=test` and `TENANCY_ENFORCEMENT=strict`.

```yaml
# Example CI configuration
env:
  DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
  NODE_ENV: test
  TENANCY_ENFORCEMENT: strict

steps:
  - run: npm install
  - run: npm run db:push
  - run: npm test
```
