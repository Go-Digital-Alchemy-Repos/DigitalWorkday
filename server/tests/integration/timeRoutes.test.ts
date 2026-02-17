import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import timeRouter from "../../http/domains/time.router";

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

const BASE = "http://localhost:5000";

describe("Time Routes – Integration Tests", () => {
  // =========================================================================
  // Auth rejection (unauthenticated) — via live server
  // =========================================================================

  describe("Auth rejection", () => {
    it("GET /api/time-entries without auth returns 401", async () => {
      const res = await request(BASE).get("/api/time-entries");
      expect(res.status).toBe(401);
    });

    it("POST /api/timer/start without auth returns 401", async () => {
      const res = await request(BASE)
        .post("/api/timer/start")
        .send({});
      expect(res.status).toBe(401);
    });

    it("POST /api/timer/stop without auth returns 401", async () => {
      const res = await request(BASE)
        .post("/api/timer/stop")
        .send({});
      expect(res.status).toBe(401);
    });

    it("POST /api/time-entries without auth returns 401", async () => {
      const res = await request(BASE)
        .post("/api/time-entries")
        .send({ startTime: new Date().toISOString(), durationSeconds: 3600 });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Tenant enforcement — via mini Express app
  // =========================================================================

  describe("Tenant enforcement", () => {
    it("GET /api/timer/current without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", timeRouter);

      const res = await request(app).get("/api/timer/current");
      expect([400, 403]).toContain(res.status);
    });

    it("POST /api/timer/start without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", timeRouter);

      const res = await request(app)
        .post("/api/timer/start")
        .send({});
      expect([400, 403]).toContain(res.status);
    });

    it("GET /api/time-entries without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", timeRouter);

      const res = await request(app).get("/api/time-entries");
      expect([400, 403]).toContain(res.status);
    });

    it("POST /api/time-entries without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", timeRouter);

      const res = await request(app)
        .post("/api/time-entries")
        .send({ startTime: new Date().toISOString(), durationSeconds: 3600 });
      expect([400, 403]).toContain(res.status);
    });
  });

  // =========================================================================
  // Auth rejection via mini Express app (no auth)
  // =========================================================================

  describe("Auth rejection via factory policy (mini app)", () => {
    it("GET /api/timer/current with injectNoAuth returns 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", timeRouter);

      const res = await request(app).get("/api/timer/current");
      expect(res.status).toBe(401);
    });

    it("POST /api/timer/stop with injectNoAuth returns 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", timeRouter);

      const res = await request(app)
        .post("/api/timer/stop")
        .send({});
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Route matching – timer endpoints (live server)
  // =========================================================================

  describe("Route matching – timer endpoints", () => {
    it("GET /api/timer/current matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/timer/current");
      expect(res.status).toBe(401);
    });

    it("POST /api/timer/pause matches (401 without auth)", async () => {
      const res = await request(BASE).post("/api/timer/pause");
      expect(res.status).toBe(401);
    });

    it("POST /api/timer/resume matches (401 without auth)", async () => {
      const res = await request(BASE).post("/api/timer/resume");
      expect(res.status).toBe(401);
    });

    it("PATCH /api/timer/current matches (401 without auth)", async () => {
      const res = await request(BASE)
        .patch("/api/timer/current")
        .send({ description: "test" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/timer/current matches (401 without auth)", async () => {
      const res = await request(BASE).delete("/api/timer/current");
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Route matching – time entry endpoints (live server)
  // =========================================================================

  describe("Route matching – time entry endpoints", () => {
    it("GET /api/time-entries/my matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/time-entries/my");
      expect(res.status).toBe(401);
    });

    it("GET /api/time-entries/my/stats matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/time-entries/my/stats");
      expect(res.status).toBe(401);
    });

    it("GET /api/time-entries/:id matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/time-entries/some-uuid");
      expect(res.status).toBe(401);
    });

    it("PATCH /api/time-entries/:id matches (401 without auth)", async () => {
      const res = await request(BASE)
        .patch("/api/time-entries/some-uuid")
        .send({ description: "updated" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/time-entries/:id matches (401 without auth)", async () => {
      const res = await request(BASE).delete("/api/time-entries/some-uuid");
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Route matching – reporting & calendar endpoints (live server)
  // =========================================================================

  describe("Route matching – reporting & calendar", () => {
    it("GET /api/time-entries/report/summary matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/time-entries/report/summary");
      expect(res.status).toBe(401);
    });

    it("GET /api/time-entries/export/csv matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/time-entries/export/csv");
      expect(res.status).toBe(401);
    });

    it("GET /api/calendar/events matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/calendar/events");
      expect(res.status).toBe(401);
    });

    it("GET /api/my-calendar/events matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/my-calendar/events");
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Active timer invariants (single active timer rule, via mini app)
  // =========================================================================

  describe("Active timer invariants (behavior assertions)", () => {
    it("POST /api/timer/stop returns 404 when no timer active", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "no-timer-user", tenantId: "t1", role: "employee" }));
      app.use("/api", timeRouter);

      const res = await request(app)
        .post("/api/timer/stop")
        .send({});
      expect(res.status).toBe(404);
    });

    it("POST /api/timer/pause returns 404 when no timer active", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "no-timer-user-2", tenantId: "t1", role: "employee" }));
      app.use("/api", timeRouter);

      const res = await request(app).post("/api/timer/pause");
      expect(res.status).toBe(404);
    });

    it("POST /api/timer/resume returns 404 when no timer active", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "no-timer-user-3", tenantId: "t1", role: "employee" }));
      app.use("/api", timeRouter);

      const res = await request(app).post("/api/timer/resume");
      expect(res.status).toBe(404);
    });

    it("DELETE /api/timer/current returns 404 when no timer active", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "no-timer-user-4", tenantId: "t1", role: "employee" }));
      app.use("/api", timeRouter);

      const res = await request(app).delete("/api/timer/current");
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Registry metadata
  // =========================================================================

  describe("Registry metadata", () => {
    it("routeRegistry lists time domain with authTenant via mountAllRoutes", async () => {
      const { getRouteRegistry, clearRouteRegistry } = await import("../../http/routeRegistry");
      const { mountAllRoutes } = await import("../../http/mount");
      const expressModule = await import("express");
      const { createServer } = await import("http");

      clearRouteRegistry();
      const app = expressModule.default();
      app.use(expressModule.default.json());
      const httpServer = createServer(app);
      await mountAllRoutes(httpServer, app);

      const registry = getRouteRegistry();
      const timeMount = registry.find((r) => r.domain === "time");
      expect(timeMount).toBeDefined();
      expect(timeMount!.policy).toBe("authTenant");
      expect(timeMount!.legacy).toBe(false);
      expect(timeMount!.path).toBe("/api");
      expect(timeMount!.description).toContain("Time tracking");

      httpServer.close();
    });

    it("time router factory metadata has authTenant policy", async () => {
      const meta = getRouterMeta(timeRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
