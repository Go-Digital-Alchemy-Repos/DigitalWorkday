import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import flagsRouter from "../../http/domains/flags.router";

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

const testUser = {
  id: "test-user-id",
  tenantId: "test-tenant-id",
  role: "admin",
  isSuperUser: false,
};

describe("Flags Domain — Smoke Integration Tests", () => {
  it("should reject unauthenticated GET /crm/flags with 401", async () => {
    const app = express();
    app.use(express.json());
    app.use(injectNoAuth());
    app.use("/api", flagsRouter);

    const res = await request(app).get("/api/crm/flags");
    expect(res.status).toBe(401);
  });

  it("should return expected shape for authenticated GET /crm/flags", async () => {
    const app = express();
    app.use(express.json());
    app.use(injectPassportAuth(testUser));
    app.use("/api", flagsRouter);

    const res = await request(app).get("/api/crm/flags");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("client360");
    expect(res.body).toHaveProperty("contacts");
    expect(res.body).toHaveProperty("timeline");
    expect(res.body).toHaveProperty("portal");
    expect(res.body).toHaveProperty("files");
    expect(res.body).toHaveProperty("approvals");
    expect(res.body).toHaveProperty("clientMessaging");
  });

  it("should reject request without tenant context", async () => {
    const app = express();
    app.use(express.json());

    const authNoTenant: RequestHandler = (req, _res, next) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { id: "user1", role: "employee" };
      (req as any).session = { passport: { user: "user1" } };
      next();
    };

    app.use(authNoTenant);
    app.use("/api", flagsRouter);

    const res = await request(app).get("/api/crm/flags");
    expect([400, 403]).toContain(res.status);
  });

  it("flags router should have authTenant policy in factory metadata", () => {
    const meta = getRouterMeta(flagsRouter);
    expect(meta).toBeDefined();
    expect(meta!.policy).toBe("authTenant");
    expect(meta!.allowlist).toEqual([]);
  });
});
