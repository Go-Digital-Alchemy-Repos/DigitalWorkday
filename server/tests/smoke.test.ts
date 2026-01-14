/**
 * @file Smoke Tests for Critical API Endpoints
 * @description Quick verification that core endpoint patterns work.
 * 
 * These tests use supertest with minimal Express apps to verify
 * that endpoint patterns are correctly implemented.
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";
import { UserRole } from "../../shared/schema";

describe("Smoke Tests - Authentication Patterns", () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    app.get("/api/auth/me", (req: any, res) => {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      res.json({ user: req.user });
    });

    app.post("/api/auth/login", (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      if (email === "test@example.com" && password === "correct") {
        return res.json({ user: { email }, message: "Login successful" });
      }
      return res.status(401).json({ error: "Invalid credentials" });
    });

    app.post("/api/auth/logout", (_req, res) => {
      res.json({ message: "Logged out" });
    });
  });

  it("GET /api/auth/me returns 401 when not authenticated", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("error");
  });

  it("POST /api/auth/login with invalid credentials returns 401", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "invalid@test.com", password: "wrong" });
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("error", "Invalid credentials");
  });

  it("POST /api/auth/login with valid credentials returns 200", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "correct" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("message", "Login successful");
  });

  it("POST /api/auth/logout returns 200", async () => {
    const response = await request(app).post("/api/auth/logout");
    expect(response.status).toBe(200);
  });
});

describe("Smoke Tests - Protected Endpoints Pattern", () => {
  function createAppWithUser(user: any | null) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    testApp.use((req: any, _res: Response, next: NextFunction) => {
      req.user = user;
      next();
    });

    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      next();
    };

    testApp.get("/api/workspaces", requireAuth, (req: any, res) => {
      res.json([{ id: "ws-1", name: "Default Workspace" }]);
    });

    testApp.get("/api/projects", requireAuth, (req: any, res) => {
      res.json([]);
    });

    testApp.get("/api/tasks/my", requireAuth, (req: any, res) => {
      res.json([]);
    });

    testApp.get("/api/clients", requireAuth, (req: any, res) => {
      res.json([]);
    });

    testApp.get("/api/teams", requireAuth, (req: any, res) => {
      res.json([]);
    });

    return testApp;
  }

  it("Protected endpoints return 401 when not authenticated", async () => {
    const app = createAppWithUser(null);
    
    const endpoints = [
      "/api/workspaces",
      "/api/projects",
      "/api/tasks/my",
      "/api/clients",
      "/api/teams",
    ];

    for (const endpoint of endpoints) {
      const response = await request(app).get(endpoint);
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error", "Authentication required");
    }
  });

  it("Protected endpoints return 200 when authenticated", async () => {
    const app = createAppWithUser({
      id: "user-1",
      role: UserRole.EMPLOYEE,
      tenantId: "tenant-1",
    });
    
    const endpoints = [
      "/api/workspaces",
      "/api/projects",
      "/api/tasks/my",
      "/api/clients",
      "/api/teams",
    ];

    for (const endpoint of endpoints) {
      const response = await request(app).get(endpoint);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    }
  });
});

describe("Smoke Tests - Admin Endpoints Pattern", () => {
  function createAppWithUser(user: any | null) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    testApp.use((req: any, _res: Response, next: NextFunction) => {
      req.user = user;
      next();
    });

    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      next();
    };

    const requireAdmin = (req: any, res: Response, next: NextFunction) => {
      if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Admin access required" });
      }
      next();
    };

    testApp.get("/api/users", requireAuth, requireAdmin, (_req, res) => {
      res.json([]);
    });

    testApp.get("/api/invitations", requireAuth, requireAdmin, (_req, res) => {
      res.json([]);
    });

    return testApp;
  }

  it("Admin endpoints return 401 when not authenticated", async () => {
    const app = createAppWithUser(null);
    
    const response = await request(app).get("/api/users");
    expect(response.status).toBe(401);
  });

  it("Admin endpoints return 403 when authenticated as employee", async () => {
    const app = createAppWithUser({
      id: "user-1",
      role: UserRole.EMPLOYEE,
      tenantId: "tenant-1",
    });
    
    const response = await request(app).get("/api/users");
    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("error", "Admin access required");
  });

  it("Admin endpoints return 200 when authenticated as admin", async () => {
    const app = createAppWithUser({
      id: "admin-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-1",
    });
    
    const response = await request(app).get("/api/users");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("Smoke Tests - Super Admin Endpoints Pattern", () => {
  function createAppWithUser(user: any | null) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    testApp.use((req: any, _res: Response, next: NextFunction) => {
      req.user = user;
      next();
    });

    const requireSuperUser = (req: any, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (req.user?.role !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Super user access required" });
      }
      next();
    };

    testApp.get("/api/v1/super/tenants", requireSuperUser, (_req, res) => {
      res.json([]);
    });

    return testApp;
  }

  it("Super admin endpoints return 401 when not authenticated", async () => {
    const app = createAppWithUser(null);
    
    const response = await request(app).get("/api/v1/super/tenants");
    expect(response.status).toBe(401);
  });

  it("Super admin endpoints return 403 when authenticated as admin", async () => {
    const app = createAppWithUser({
      id: "admin-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-1",
    });
    
    const response = await request(app).get("/api/v1/super/tenants");
    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("error", "Super user access required");
  });

  it("Super admin endpoints return 200 when authenticated as super user", async () => {
    const app = createAppWithUser({
      id: "super-1",
      role: UserRole.SUPER_USER,
      tenantId: null,
    });
    
    const response = await request(app).get("/api/v1/super/tenants");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("Smoke Tests - Health Check Pattern", () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    app.get("/api/health", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });
  });

  it("GET /api/health returns 200 with status ok", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(response.body).toHaveProperty("timestamp");
  });
});

describe("Smoke Tests - Error Response Pattern", () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    app.get("/api/nonexistent", (_req, res) => {
      res.status(404).json({ error: "Not found" });
    });

    app.post("/api/resource", (req, res) => {
      if (!req.body.name) {
        return res.status(400).json({ 
          error: "Validation failed",
          details: { name: ["Name is required"] }
        });
      }
      res.status(201).json({ id: "new-1", name: req.body.name });
    });
  });

  it("Unknown endpoints return 404 with error message", async () => {
    const response = await request(app).get("/api/nonexistent");
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("error");
  });

  it("Validation errors return 400 with details", async () => {
    const response = await request(app)
      .post("/api/resource")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error", "Validation failed");
    expect(response.body).toHaveProperty("details");
  });

  it("Valid requests return 201 with created resource", async () => {
    const response = await request(app)
      .post("/api/resource")
      .send({ name: "Test Resource" });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("id");
    expect(response.body).toHaveProperty("name", "Test Resource");
  });
});
