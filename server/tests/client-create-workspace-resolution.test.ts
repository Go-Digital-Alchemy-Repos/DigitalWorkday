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

  it("lets a super user with their own tenant impersonate another tenant via X-Tenant-Id", async () => {
    const tenantA = await createTestTenant({ name: `Super Tenant A ${Date.now()}` });
    const tenantB = await createTestTenant({ name: `Super Tenant B ${Date.now()}` });
    tenantIds.push(tenantA.id, tenantB.id);

    await createTestWorkspace({
      tenantId: tenantA.id,
      isPrimary: true,
      name: "Tenant A Workspace",
    });
    const workspaceB = await createTestWorkspace({
      tenantId: tenantB.id,
      isPrimary: true,
      name: "Tenant B Workspace",
    });

    const superUser = await createTestUser({
      email: `super-impersonation-${Date.now()}@example.com`,
      role: UserRole.SUPER_USER,
      tenantId: tenantA.id,
    });

    const app = createAuthenticatedApp({
      id: superUser.id,
      tenantId: tenantA.id,
      role: superUser.role,
    });

    const createResponse = await request(app)
      .post("/api/clients")
      .set("X-Tenant-Id", tenantB.id)
      .send({ companyName: "Impersonated Tenant Client" });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.tenantId).toBe(tenantB.id);
    expect(createResponse.body.workspaceId).toBe(workspaceB.id);

    const listResponse = await request(app)
      .get("/api/clients")
      .set("X-Tenant-Id", tenantB.id);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.some((client: { id: string }) => client.id === createResponse.body.id)).toBe(true);
    expect(listResponse.body.every((client: { tenantId: string }) => client.tenantId === tenantB.id)).toBe(true);
  });
});
