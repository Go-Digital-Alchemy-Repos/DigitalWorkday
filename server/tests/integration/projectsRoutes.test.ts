import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../../http/routerFactory";
import projectsRouter from "../../http/domains/projects.router";

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

describe("Projects Routes – Integration Tests", () => {
  // =========================================================================
  // Auth rejection (live server)
  // =========================================================================

  describe("Auth rejection (live server)", () => {
    it("GET /api/projects without auth returns 401", async () => {
      const res = await request(BASE).get("/api/projects");
      expect(res.status).toBe(401);
    });

    it("POST /api/projects without auth returns 401", async () => {
      const res = await request(BASE)
        .post("/api/projects")
        .send({ name: "Test" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/projects/:id without auth returns 401", async () => {
      const res = await request(BASE)
        .patch("/api/projects/some-id")
        .send({ name: "Updated" });
      expect(res.status).toBe(401);
    });

    it("GET /api/projects/:id without auth returns 401", async () => {
      const res = await request(BASE).get("/api/projects/some-id");
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Tenant enforcement (mini app)
  // =========================================================================

  describe("Tenant enforcement", () => {
    it("GET /api/projects without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", projectsRouter);

      const res = await request(app).get("/api/projects");
      expect([400, 403]).toContain(res.status);
    });

    it("POST /api/projects without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", projectsRouter);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Test" });
      expect([400, 403]).toContain(res.status);
    });

    it("PATCH /api/projects/:id without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", projectsRouter);

      const res = await request(app)
        .patch("/api/projects/some-id")
        .send({ name: "Updated" });
      expect([400, 403]).toContain(res.status);
    });

    it("GET /api/projects/:id without tenant context returns 400/403", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectAuthNoTenant());
      app.use("/api", projectsRouter);

      const res = await request(app).get("/api/projects/some-id");
      expect([400, 403]).toContain(res.status);
    });
  });

  // =========================================================================
  // Auth rejection via factory policy (mini app)
  // =========================================================================

  describe("Auth rejection via factory policy (mini app)", () => {
    it("GET /api/projects with injectNoAuth returns 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", projectsRouter);

      const res = await request(app).get("/api/projects");
      expect(res.status).toBe(401);
    });

    it("POST /api/projects with injectNoAuth returns 401", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectNoAuth());
      app.use("/api", projectsRouter);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Test" });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Route matching – project CRUD (live server)
  // =========================================================================

  describe("Route matching – project CRUD", () => {
    it("GET /api/projects/unassigned matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/projects/unassigned");
      expect(res.status).toBe(401);
    });

    it("GET /api/projects/hidden matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/projects/hidden");
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Route matching – project members (live server)
  // =========================================================================

  describe("Route matching – project members", () => {
    it("GET /api/projects/:id/members matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/projects/some-id/members");
      expect(res.status).toBe(401);
    });

    it("POST /api/projects/:id/members matches (401 without auth)", async () => {
      const res = await request(BASE)
        .post("/api/projects/some-id/members")
        .send({ userId: "user1" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/projects/:id/members/:userId matches (401 without auth)", async () => {
      const res = await request(BASE)
        .delete("/api/projects/some-id/members/user1");
      expect(res.status).toBe(401);
    });

    it("PUT /api/projects/:id/members matches (401 without auth)", async () => {
      const res = await request(BASE)
        .put("/api/projects/some-id/members")
        .send({ memberIds: ["user1"] });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Route matching – visibility (live server)
  // =========================================================================

  describe("Route matching – visibility", () => {
    it("POST /api/projects/:id/hide matches (401 without auth)", async () => {
      const res = await request(BASE).post("/api/projects/some-id/hide");
      expect(res.status).toBe(401);
    });

    it("DELETE /api/projects/:id/hide matches (401 without auth)", async () => {
      const res = await request(BASE).delete("/api/projects/some-id/hide");
      expect(res.status).toBe(401);
    });

    it("GET /api/projects/:id/hidden matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/projects/some-id/hidden");
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Route matching – sections & reorder (live server)
  // =========================================================================

  describe("Route matching – sections & reorder", () => {
    it("GET /api/projects/:id/sections matches (401 without auth)", async () => {
      const res = await request(BASE).get("/api/projects/some-id/sections");
      expect(res.status).toBe(401);
    });

    it("POST /api/sections matches (401 without auth)", async () => {
      const res = await request(BASE)
        .post("/api/sections")
        .send({ name: "Section", projectId: "p1" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/sections/:id matches (401 without auth)", async () => {
      const res = await request(BASE)
        .patch("/api/sections/some-id")
        .send({ name: "Updated" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/sections/:id matches (401 without auth)", async () => {
      const res = await request(BASE).delete("/api/sections/some-id");
      expect(res.status).toBe(401);
    });

    it("PATCH /api/projects/:id/tasks/reorder matches (401 without auth)", async () => {
      const res = await request(BASE)
        .patch("/api/projects/some-id/tasks/reorder")
        .send({ moves: [] });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // Behavior assertions (project not found, via mini app with auth+tenant)
  // =========================================================================

  describe("Behavior assertions (project not found)", () => {
    it("GET /api/projects/:id returns 404 for non-existent project", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", tenantId: "t1", role: "admin" }));
      app.use("/api", projectsRouter);

      const res = await request(app).get("/api/projects/nonexistent-id");
      expect(res.status).toBe(404);
    });

    it("PATCH /api/projects/:id returns 404 for non-existent project", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", tenantId: "t1", role: "admin" }));
      app.use("/api", projectsRouter);

      const res = await request(app)
        .patch("/api/projects/nonexistent-id")
        .send({ name: "Updated" });
      expect(res.status).toBe(404);
    });

    it("GET /api/projects/:id/members returns 404 for non-existent project", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", tenantId: "t1", role: "admin" }));
      app.use("/api", projectsRouter);

      const res = await request(app).get("/api/projects/nonexistent-id/members");
      expect(res.status).toBe(404);
    });

    it("POST /api/projects requires clientId (400 when missing)", async () => {
      const app = express();
      app.use(express.json());
      app.use(injectPassportAuth({ id: "user1", tenantId: "t1", role: "admin" }));
      app.use("/api", projectsRouter);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "No Client Project" });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Registry metadata
  // =========================================================================

  describe("Registry metadata", () => {
    it("routeRegistry lists projects domain with authTenant via mountAllRoutes", async () => {
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
      const projectsMount = registry.find((r) => r.domain === "projects");
      expect(projectsMount).toBeDefined();
      expect(projectsMount!.policy).toBe("authTenant");
      expect(projectsMount!.legacy).toBe(false);
      expect(projectsMount!.path).toBe("/api");
      expect(projectsMount!.description).toContain("Projects core");

      httpServer.close();
    });

    it("projects router factory metadata has authTenant policy", async () => {
      const meta = getRouterMeta(projectsRouter);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });
});
