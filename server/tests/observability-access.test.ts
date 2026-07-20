import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { request } from "./httpHarness";
import { requireObservabilityAccess } from "../middleware/observabilityAccess";
import { UserRole } from "@shared/schema";

const originalNodeEnv = process.env.NODE_ENV;

function createApp(role?: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = () => !!role;
    req.user = role ? { id: "test-user", role } as any : undefined;
    next();
  });
  app.get("/internal/observability", requireObservabilityAccess, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("requireObservabilityAccess", () => {
  it("allows unauthenticated access outside production for local diagnostics", async () => {
    process.env.NODE_ENV = "development";

    const res = await request(createApp()).get("/internal/observability");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("requires authentication in production", async () => {
    process.env.NODE_ENV = "production";

    const res = await request(createApp()).get("/internal/observability");

    expect(res.status).toBe(401);
  });

  it("requires super user role in production", async () => {
    process.env.NODE_ENV = "production";

    const res = await request(createApp(UserRole.ADMIN)).get("/internal/observability");

    expect(res.status).toBe(403);
  });

  it("allows super users in production", async () => {
    process.env.NODE_ENV = "production";

    const res = await request(createApp(UserRole.SUPER_USER)).get("/internal/observability");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
