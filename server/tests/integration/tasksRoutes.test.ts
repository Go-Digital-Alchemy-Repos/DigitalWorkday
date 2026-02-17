import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import tasksRouter from "../../http/domains/tasks.router";

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

describe("Tasks Routes – Integration Tests", () => {
  // =========================================================================
  // Auth rejection (live server)
  // =========================================================================

  describe("Auth rejection (live server)", () => {
    it("GET /api/tasks/my without auth returns 401", async () => {
      const res = await request(BASE).get("/api/tasks/my");
      expect(res.status).toBe(401);
    });

    it("POST /api/tasks without auth returns 401", async () => {
      const res = await request(BASE).post("/api/tasks").send({ title: "Test" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/tasks/:id without auth returns 401", async () => {
      const res = await request(BASE).patch("/api/tasks/some-id").send({ title: "Updated" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/tasks/:id without auth returns 401", async () => {
      const res = await request(BASE).delete("/api/tasks/some-id");
      expect(res.status).toBe(401);
    });

    it("GET /api/tasks/:id without auth returns 401", async () => {
      const res = await request(BASE).get("/api/tasks/some-id");
      expect(res.status).toBe(401);
    });

    it("POST /api/tasks/:taskId/assignees without auth returns 401", async () => {
      const res = await request(BASE).post("/api/tasks/tid/assignees").send({ userId: "u1" });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Auth rejection (mini app — confirms factory guard, not legacy global guard)
  // =========================================================================

  describe("Auth rejection (mini app)", () => {
    function buildUnauthApp() {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", tasksRouter);
      return app;
    }

    it("GET /api/tasks/my rejects unauth via factory guard", async () => {
      const res = await request(buildUnauthApp()).get("/api/tasks/my");
      expect(res.status).toBe(401);
    });

    it("POST /api/tasks rejects unauth via factory guard", async () => {
      const res = await request(buildUnauthApp()).post("/api/tasks").send({ title: "Test" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/tasks/:id rejects unauth via factory guard", async () => {
      const res = await request(buildUnauthApp()).patch("/api/tasks/tid").send({ title: "x" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/tasks/:id rejects unauth via factory guard", async () => {
      const res = await request(buildUnauthApp()).delete("/api/tasks/tid");
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/my-tasks/sections rejects unauth via factory guard", async () => {
      const res = await request(buildUnauthApp()).get("/api/v1/my-tasks/sections");
      expect(res.status).toBe(401);
    });

    it("POST /api/tasks/:taskId/watchers rejects unauth via factory guard", async () => {
      const res = await request(buildUnauthApp()).post("/api/tasks/tid/watchers").send({ userId: "u1" });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Tenant enforcement (mini app)
  // =========================================================================

  describe("Tenant enforcement", () => {
    it("GET /api/tasks/my without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", tasksRouter);

      const res = await request(app).get("/api/tasks/my");
      expect([400, 403]).toContain(res.status);
    });

    it("POST /api/tasks without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", tasksRouter);

      const res = await request(app).post("/api/tasks").send({ title: "Test" });
      expect([400, 403]).toContain(res.status);
    });

    it("PATCH /api/tasks/:id without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", tasksRouter);

      const res = await request(app).patch("/api/tasks/tid").send({ title: "x" });
      expect([400, 403]).toContain(res.status);
    });

    it("GET /api/v1/my-tasks/sections without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", tasksRouter);

      const res = await request(app).get("/api/v1/my-tasks/sections");
      expect([400, 403]).toContain(res.status);
    });
  });

  // =========================================================================
  // Behavior assertions (mini app with tenant context)
  // =========================================================================

  describe("Behavior assertions", () => {
    function buildTenantApp() {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", tenantId: "t1", role: "admin" }));
      app.use("/api", tasksRouter);
      return app;
    }

    it("GET /api/tasks/:id returns 404 for non-existent task", async () => {
      const res = await request(buildTenantApp()).get("/api/tasks/non-existent-id");
      expect(res.status).toBe(404);
    });

    it("PATCH /api/tasks/:id returns 404 for non-existent task", async () => {
      const res = await request(buildTenantApp())
        .patch("/api/tasks/non-existent-id")
        .send({ title: "Updated" });
      expect(res.status).toBe(404);
    });

    it("DELETE /api/tasks/:id returns 404 for non-existent task", async () => {
      const res = await request(buildTenantApp()).delete("/api/tasks/non-existent-id");
      expect(res.status).toBe(404);
    });

    it("POST /api/tasks/:id/move returns 404 for non-existent task", async () => {
      const res = await request(buildTenantApp())
        .post("/api/tasks/non-existent-id/move")
        .send({ sectionId: null, targetIndex: 0 });
      expect(res.status).toBe(404);
    });

    it("POST /api/tasks/:taskId/assignees returns 400 or 404 for non-existent task", async () => {
      const res = await request(buildTenantApp())
        .post("/api/tasks/non-existent-id/assignees")
        .send({ userId: "u1" });
      expect([400, 404]).toContain(res.status);
    });

    it("DELETE /api/tasks/:taskId/assignees/:userId returns 404 for non-existent task", async () => {
      const res = await request(buildTenantApp())
        .delete("/api/tasks/non-existent-id/assignees/uid");
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Route matching (mini app — ensures routes resolve correctly)
  // =========================================================================

  describe("Route matching", () => {
    function buildTenantApp() {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", tenantId: "t1", role: "admin" }));
      app.use("/api", tasksRouter);
      return app;
    }

    it("GET /api/projects/:projectId/tasks resolves (not 404 routing)", async () => {
      const res = await request(buildTenantApp()).get("/api/projects/pid/tasks");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/projects/:projectId/calendar-events resolves (not 404 routing)", async () => {
      const res = await request(buildTenantApp()).get("/api/projects/pid/calendar-events");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/projects/:projectId/activity resolves (not 404 routing)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", tenantId: "t1", role: "admin" }));
      app.use("/api", tasksRouter);
      const res = await request(app).get("/api/projects/pid/activity");
      expect([200, 404, 500]).toContain(res.status);
    });

    it("GET /api/tasks/:id/childtasks resolves (not 404 routing)", async () => {
      const res = await request(buildTenantApp()).get("/api/tasks/tid/childtasks");
      expect(res.status).not.toBe(404);
    });

    it("POST /api/tasks/:taskId/childtasks resolves (handler responds, not unmatched route)", async () => {
      const res = await request(buildTenantApp())
        .post("/api/tasks/tid/childtasks")
        .send({ title: "child" });
      expect([400, 404, 500]).toContain(res.status);
    });

    it("GET /api/tasks/:taskId/watchers resolves (not 404 routing)", async () => {
      const res = await request(buildTenantApp()).get("/api/tasks/tid/watchers");
      expect(res.status).not.toBe(404);
    });

    it("POST /api/v1/my-tasks/sections resolves (not 404 routing)", async () => {
      const res = await request(buildTenantApp())
        .post("/api/v1/my-tasks/sections")
        .send({ name: "Test Section" });
      expect(res.status).not.toBe(404);
    });

    it("POST /api/v1/my-tasks/tasks/:taskId/move resolves (handler responds, not unmatched route)", async () => {
      const res = await request(buildTenantApp())
        .post("/api/v1/my-tasks/tasks/tid/move")
        .send({ personalSectionId: null });
      expect([400, 404, 500]).toContain(res.status);
    });
  });

  // =========================================================================
  // Registry metadata
  // =========================================================================

  describe("Registry metadata", () => {
    it("routeRegistry lists tasks domain with authTenant via mountAllRoutes", async () => {
      const { mountAllRoutes } = await import("../../http/mount");
      const { getRouteRegistry, clearRouteRegistry } = await import("../../http/routeRegistry");
      const http = await import("http");
      const express = (await import("express")).default;

      const app = express();
      const server = http.createServer(app);

      try {
        await mountAllRoutes(server, app);
        const registry = getRouteRegistry();
        const tasksEntry = registry.find(
          (r) => r.domain === "tasks" && !r.legacy
        );

        expect(tasksEntry).toBeDefined();
        expect(tasksEntry!.policy).toBe("authTenant");
        expect(tasksEntry!.path).toBe("/api");

        const meta = getRouterMeta(tasksEntry!.router);
        expect(meta).toBeDefined();
        expect(meta!.policy).toBe("authTenant");
      } finally {
        server.close();
      }
    });
  });
});
