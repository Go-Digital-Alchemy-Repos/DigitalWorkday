import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import subtasksRouter from "../../http/domains/subtasks.router";

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

describe("Subtasks Routes – Integration Tests", () => {
  describe("Auth rejection (live server)", () => {
    it("GET /api/tasks/:taskId/subtasks without auth returns 401", async () => {
      const res = await request(BASE).get("/api/tasks/tid/subtasks");
      expect(res.status).toBe(401);
    });

    it("POST /api/tasks/:taskId/subtasks without auth returns 401", async () => {
      const res = await request(BASE).post("/api/tasks/tid/subtasks").send({ title: "Sub" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/subtasks/:id without auth returns 401", async () => {
      const res = await request(BASE).patch("/api/subtasks/sid").send({ title: "Upd" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/subtasks/:id without auth returns 401", async () => {
      const res = await request(BASE).delete("/api/subtasks/sid");
      expect(res.status).toBe(401);
    });

    it("GET /api/subtasks/:id/full without auth returns 401", async () => {
      const res = await request(BASE).get("/api/subtasks/sid/full");
      expect(res.status).toBe(401);
    });

    it("GET /api/subtasks/:id/assignees without auth returns 401", async () => {
      const res = await request(BASE).get("/api/subtasks/sid/assignees");
      expect(res.status).toBe(401);
    });

    it("GET /api/subtasks/:id/tags without auth returns 401", async () => {
      const res = await request(BASE).get("/api/subtasks/sid/tags");
      expect(res.status).toBe(401);
    });

    it("GET /api/subtasks/:subtaskId/comments without auth returns 401", async () => {
      const res = await request(BASE).get("/api/subtasks/sid/comments");
      expect(res.status).toBe(401);
    });
  });

  describe("Auth rejection (mini app)", () => {
    function buildNoAuthApp() {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", subtasksRouter);
      return app;
    }

    it("POST /api/subtasks/:id/move rejects unauthenticated with 401", async () => {
      const res = await request(buildNoAuthApp()).post("/api/subtasks/sid/move").send({ targetIndex: 0 });
      expect(res.status).toBe(401);
    });

    it("POST /api/subtasks/:id/assignees rejects unauthenticated with 401", async () => {
      const res = await request(buildNoAuthApp()).post("/api/subtasks/sid/assignees").send({ userId: "u1" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/subtasks/:subtaskId/assignees/:userId rejects with 401", async () => {
      const res = await request(buildNoAuthApp()).delete("/api/subtasks/sid/assignees/uid");
      expect(res.status).toBe(401);
    });

    it("POST /api/subtasks/:id/tags rejects unauthenticated with 401", async () => {
      const res = await request(buildNoAuthApp()).post("/api/subtasks/sid/tags").send({ tagId: "t1" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/subtasks/:subtaskId/tags/:tagId rejects with 401", async () => {
      const res = await request(buildNoAuthApp()).delete("/api/subtasks/sid/tags/tid");
      expect(res.status).toBe(401);
    });

    it("POST /api/subtasks/:subtaskId/comments rejects unauthenticated with 401", async () => {
      const res = await request(buildNoAuthApp()).post("/api/subtasks/sid/comments").send({ body: "test" });
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant enforcement (mini app)", () => {
    function buildAuthNoTenantApp() {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", subtasksRouter);
      return app;
    }

    it("GET /api/tasks/:taskId/subtasks without tenant returns 400 or 403", async () => {
      const res = await request(buildAuthNoTenantApp()).get("/api/tasks/tid/subtasks");
      expect([400, 403]).toContain(res.status);
    });

    it("POST /api/tasks/:taskId/subtasks without tenant returns 400 or 403", async () => {
      const res = await request(buildAuthNoTenantApp()).post("/api/tasks/tid/subtasks").send({ title: "Sub" });
      expect([400, 403]).toContain(res.status);
    });

    it("PATCH /api/subtasks/:id without tenant returns 400 or 403", async () => {
      const res = await request(buildAuthNoTenantApp()).patch("/api/subtasks/sid").send({ title: "Upd" });
      expect([400, 403]).toContain(res.status);
    });

    it("DELETE /api/subtasks/:id without tenant returns 400 or 403", async () => {
      const res = await request(buildAuthNoTenantApp()).delete("/api/subtasks/sid");
      expect([400, 403]).toContain(res.status);
    });
  });

  describe("Behavior assertions (mini app)", () => {
    function buildAuthApp() {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", role: "admin", tenantId: "tenant1" }));
      app.use("/api", subtasksRouter);
      return app;
    }

    it("GET /api/tasks/:taskId/subtasks with non-existent task returns 404", async () => {
      const res = await request(buildAuthApp()).get("/api/tasks/nonexistent-task-id/subtasks");
      expect(res.status).toBe(404);
    });

    it("PATCH /api/subtasks/:id with non-existent subtask returns 404", async () => {
      const res = await request(buildAuthApp()).patch("/api/subtasks/nonexistent-subtask-id").send({ title: "Upd" });
      expect(res.status).toBe(404);
    });

    it("DELETE /api/subtasks/:id with non-existent subtask returns 404", async () => {
      const res = await request(buildAuthApp()).delete("/api/subtasks/nonexistent-subtask-id");
      expect(res.status).toBe(404);
    });

    it("GET /api/subtasks/:id/full with non-existent subtask returns 404", async () => {
      const res = await request(buildAuthApp()).get("/api/subtasks/nonexistent-subtask-id/full");
      expect(res.status).toBe(404);
    });

    it("GET /api/subtasks/:subtaskId/comments with non-existent subtask returns 404", async () => {
      const res = await request(buildAuthApp()).get("/api/subtasks/nonexistent-subtask-id/comments");
      expect(res.status).toBe(404);
    });

    it("POST /api/subtasks/:id/assignees without userId returns 400", async () => {
      const res = await request(buildAuthApp()).post("/api/subtasks/sid/assignees").send({});
      expect(res.status).toBe(400);
    });

    it("POST /api/subtasks/:id/tags without tagId returns 400", async () => {
      const res = await request(buildAuthApp()).post("/api/subtasks/sid/tags").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("Route matching (live server)", () => {
    it("POST /api/subtasks/:id/move responds (not 404)", async () => {
      const res = await request(BASE).post("/api/subtasks/sid/move").send({ targetIndex: 0 });
      expect(res.status).not.toBe(404);
    });

    it("GET /api/subtasks/:id/full responds (not 404)", async () => {
      const res = await request(BASE).get("/api/subtasks/sid/full");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/subtasks/:id/assignees responds (not 404)", async () => {
      const res = await request(BASE).get("/api/subtasks/sid/assignees");
      expect(res.status).not.toBe(404);
    });

    it("GET /api/subtasks/:id/tags responds (not 404)", async () => {
      const res = await request(BASE).get("/api/subtasks/sid/tags");
      expect(res.status).not.toBe(404);
    });

    it("DELETE /api/subtasks/:subtaskId/assignees/:userId responds (not 404)", async () => {
      const res = await request(BASE).delete("/api/subtasks/sid/assignees/uid");
      expect(res.status).not.toBe(404);
    });

    it("DELETE /api/subtasks/:subtaskId/tags/:tagId responds (not 404)", async () => {
      const res = await request(BASE).delete("/api/subtasks/sid/tags/tid");
      expect(res.status).not.toBe(404);
    });
  });

  describe("Registry metadata", () => {
    it("routeRegistry lists subtasks domain with authTenant via mountAllRoutes", async () => {
      const { mountAllRoutes } = await import("../../http/mount");
      const { getRouteRegistry, clearRouteRegistry } = await import("../../http/routeRegistry");
      const http = await import("http");
      const expressModule = await import("express");

      const app = expressModule.default();
      const server = http.createServer(app);

      try {
        await mountAllRoutes(server, app);
        const registry = getRouteRegistry();
        const subtasksEntry = registry.find((r) => r.domain === "subtasks");
        expect(subtasksEntry).toBeDefined();
        expect(subtasksEntry!.policy).toBe("authTenant");
        expect(subtasksEntry!.legacy).toBe(false);
      } finally {
        clearRouteRegistry();
        server.close();
      }
    });
  });
});
