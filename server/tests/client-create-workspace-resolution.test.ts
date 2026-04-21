import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import clientsRouter from "../routes/clients.router";
import { requestIdMiddleware } from "../middleware/requestId";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { errorHandler } from "../middleware/errorHandler";
import {
  cleanupTestData,
  createTestTenant,
  createTestUser,
  createTestWorkspace,
} from "./fixtures";
import { UserRole } from "../../shared/schema";

function createAuthenticatedApp(user: { id: string; tenantId: string | null; role: string }) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.isAuthenticated = () => true;
    req.user = user;
    req.session = { passport: { user: user.id } };
    next();
  });
  app.use(tenantContextMiddleware);
  app.use("/api", clientsRouter);
  app.use(errorHandler);
  return app;
}

describe("Client creation workspace resolution", () => {
  const tenantIds: string[] = [];

  beforeEach(() => {
    tenantIds.length = 0;
  });

  afterEach(async () => {
    if (tenantIds.length > 0) {
      await cleanupTestData({ tenantIds: [...tenantIds] });
    }
  });

  it("creates a client on the first request using the tenant's real workspace", async () => {
    const tenant = await createTestTenant({ name: `Client Workspace Test ${Date.now()}` });
    tenantIds.push(tenant.id);
    const workspace = await createTestWorkspace({
      tenantId: tenant.id,
      isPrimary: true,
      name: "Primary Workspace",
    });
    const admin = await createTestUser({
      email: `client-create-${Date.now()}@example.com`,
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    });

    const app = createAuthenticatedApp({
      id: admin.id,
      tenantId: tenant.id,
      role: admin.role,
    });

    const response = await request(app)
      .post("/api/clients")
      .send({ companyName: "Cold Cache Client" });

    expect(response.status).toBe(201);
    expect(response.body.companyName).toBe("Cold Cache Client");
    expect(response.body.workspaceId).toBe(workspace.id);
    expect(response.body.workspaceId).not.toBe("demo-workspace-id");
    expect(response.body.tenantId).toBe(tenant.id);
  });

  it("returns a clear error when the tenant has no workspace", async () => {
    const tenant = await createTestTenant({ name: `Missing Workspace Tenant ${Date.now()}` });
    tenantIds.push(tenant.id);
    const admin = await createTestUser({
      email: `client-create-missing-workspace-${Date.now()}@example.com`,
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    });

    const app = createAuthenticatedApp({
      id: admin.id,
      tenantId: tenant.id,
      role: admin.role,
    });

    const response = await request(app)
      .post("/api/clients")
      .send({ companyName: "Should Fail" });

    expect(response.status).toBe(500);
    expect(response.body.ok).toBe(false);
    expect(response.body.error?.message).toContain("No workspace found for tenant");
    expect(response.body.error?.code).toBe("INTERNAL_ERROR");
  });
});
