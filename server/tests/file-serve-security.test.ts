import { describe, expect, it } from "vitest";
import express, { type RequestHandler } from "express";
import request from "supertest";
import fileServeRouter from "../http/domains/fileServe.router";

function auth(user: Record<string, any>, effectiveTenantId = user.tenantId): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = user;
    (req as any).tenant = {
      tenantId: user.tenantId || null,
      effectiveTenantId,
      isSuperUser: user.role === "super_user",
    };
    next();
  };
}

function anonymous(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = null;
    (req as any).tenant = {
      tenantId: null,
      effectiveTenantId: null,
      isSuperUser: false,
    };
    next();
  };
}

function desktopAuth(user: Record<string, any>, tenantId = user.tenantId): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = user;
    (req as any).desktopAuth = {
      sessionId: "session-1",
      userId: user.id,
      tenantId,
      workspaceId: "workspace-1",
      accessExpiresAt: new Date(Date.now() + 60_000),
    };
    (req as any).tenant = { tenantId, effectiveTenantId: tenantId, isSuperUser: false };
    next();
  };
}

function buildApp(middleware: RequestHandler) {
  const app = express();
  app.use(middleware);
  app.use("/api/v1/files/serve", fileServeRouter);
  return app;
}

describe("file serving authorization", () => {
  it("rejects anonymous access to private tenant files before storage lookup", async () => {
    const app = buildApp(anonymous());

    const res = await request(app).get("/api/v1/files/serve/tenants/tenant-a/clients/client-1/documents/file.pdf");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authentication required");
  });

  it("rejects authenticated users accessing another tenant's private file key", async () => {
    const app = buildApp(auth({ id: "user-1", tenantId: "tenant-a", role: "admin" }));

    const res = await request(app).get("/api/v1/files/serve/tenants/tenant-b/clients/client-1/documents/file.pdf");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("File access denied");
  });

  it("accepts desktop bearer-authenticated users for their tenant files", async () => {
    const app = buildApp(desktopAuth({ id: "user-1", tenantId: "tenant-a", role: "employee" }));

    const res = await request(app).get("/api/v1/files/serve/tenants/tenant-a/users/user-1/avatar/photo.png");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("allows tenant branding assets to remain public", async () => {
    const app = buildApp(anonymous());

    const res = await request(app).get("/api/v1/files/serve/tenants/tenant-a/branding/logo/logo.png");

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("rejects traversal attempts in file keys", async () => {
    const app = buildApp(auth({ id: "user-1", tenantId: "tenant-a", role: "admin" }));

    const res = await request(app).get("/api/v1/files/serve/tenants/tenant-a/%2e%2e/tenant-b/secret.pdf");

    expect([400, 403]).toContain(res.status);
    expect(["Invalid file key", "File access denied"]).toContain(res.body.error);
  });
});
