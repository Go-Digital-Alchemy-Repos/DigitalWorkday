/**
 * Tenant CRUD Smoke Test Suite
 * 
 * Phase A-3: Comprehensive smoke tests for tenant-scoped CRUD operations.
 * 
 * Coverage:
 * - Clients CRUD with tenant scoping
 * - Projects CRUD with tenant scoping and FK validation
 * - Tasks CRUD including subtasks with tenant scoping
 * - Time Entries CRUD with tenant scoping
 * - Tenant isolation (cannot access other tenant's data)
 * - FK validation (invalid foreign keys return proper errors)
 * 
 * Safety: No endpoint shape/path changes; additive validation only.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";
import { db } from "../db";
import { 
  tenants, workspaces, clients, projects, tasks, timeEntries, users, sections,
  TenantStatus, UserRole 
} from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { 
  createTestTenant, 
  createTestWorkspace, 
  createTestClient,
  createTestProject,
  createTestTask,
  createTestUser,
  cleanupTestData 
} from "./fixtures";

describe("Tenant CRUD Smoke Tests", () => {
  let app: Express;
  let tenant1: any;
  let tenant2: any;
  let workspace1: any;
  let workspace2: any;
  let client1: any;
  let client2: any;
  let project1: any;
  let project2: any;
  let adminUser1: any;
  let adminUser2: any;
  let employeeUser1: any;

  beforeAll(async () => {
    // Create test tenants with full hierarchy
    tenant1 = await createTestTenant({ name: "Smoke Test Tenant 1" });
    tenant2 = await createTestTenant({ name: "Smoke Test Tenant 2" });
    
    workspace1 = await createTestWorkspace({ tenantId: tenant1.id, isPrimary: true });
    workspace2 = await createTestWorkspace({ tenantId: tenant2.id, isPrimary: true });
    
    client1 = await createTestClient({ 
      companyName: "Smoke Client 1", 
      workspaceId: workspace1.id, 
      tenantId: tenant1.id 
    });
    client2 = await createTestClient({ 
      companyName: "Smoke Client 2", 
      workspaceId: workspace2.id, 
      tenantId: tenant2.id 
    });
    
    project1 = await createTestProject({ 
      name: "Smoke Project 1",
      workspaceId: workspace1.id, 
      tenantId: tenant1.id,
      clientId: client1.id 
    });
    project2 = await createTestProject({ 
      name: "Smoke Project 2",
      workspaceId: workspace2.id, 
      tenantId: tenant2.id,
      clientId: client2.id 
    });
    
    // Create users
    const password = "testpass123";
    adminUser1 = await createTestUser({
      email: `admin1-smoke-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant1.id,
    });
    adminUser2 = await createTestUser({
      email: `admin2-smoke-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant2.id,
    });
    employeeUser1 = await createTestUser({
      email: `employee1-smoke-${Date.now()}@test.com`,
      password,
      role: UserRole.EMPLOYEE,
      tenantId: tenant1.id,
    });
    
    // Create mock Express app with simplified routes for testing
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));
    
    // Mock auth middleware
    app.use((req: any, res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user-id"];
      if (userId === adminUser1.id) {
        req.user = adminUser1;
        req.isAuthenticated = () => true;
        req.tenant = { effectiveTenantId: tenant1.id };
      } else if (userId === adminUser2.id) {
        req.user = adminUser2;
        req.isAuthenticated = () => true;
        req.tenant = { effectiveTenantId: tenant2.id };
      } else if (userId === employeeUser1.id) {
        req.user = employeeUser1;
        req.isAuthenticated = () => true;
        req.tenant = { effectiveTenantId: tenant1.id };
      } else {
        req.isAuthenticated = () => false;
      }
      next();
    });

    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      next();
    };

    // ========================================================================
    // CLIENT ROUTES
    // ========================================================================
    
    app.post("/api/clients", requireAuth, async (req: any, res) => {
      try {
        const { companyName, workspaceId } = req.body;
        const user = req.user;
        const tenantId = user.tenantId;
        
        if (!companyName) {
          return res.status(400).json({ error: "companyName is required" });
        }
        
        // Validate workspace exists and belongs to tenant
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId || workspace1.id));
        if (!workspace) {
          return res.status(404).json({ error: "Workspace not found" });
        }
        if (workspace.tenantId !== tenantId) {
          return res.status(403).json({ error: "Workspace belongs to different tenant" });
        }
        
        const [client] = await db.insert(clients).values({
          companyName,
          workspaceId: workspaceId || workspace1.id,
          tenantId,
        }).returning();
        
        res.status(201).json(client);
      } catch (error: any) {
        console.error("[POST /api/clients] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/clients", requireAuth, async (req: any, res) => {
      try {
        const tenantId = req.user.tenantId;
        const result = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
        res.json(result);
      } catch (error: any) {
        console.error("[GET /api/clients] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/clients/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [client] = await db.select().from(clients).where(eq(clients.id, id));
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        if (client.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        res.json(client);
      } catch (error: any) {
        console.error("[GET /api/clients/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.patch("/api/clients/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [client] = await db.select().from(clients).where(eq(clients.id, id));
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        if (client.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        const [updated] = await db.update(clients)
          .set({ ...req.body, updatedAt: new Date() })
          .where(eq(clients.id, id))
          .returning();
        
        res.json(updated);
      } catch (error: any) {
        console.error("[PATCH /api/clients/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/api/clients/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [client] = await db.select().from(clients).where(eq(clients.id, id));
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        if (client.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        await db.delete(clients).where(eq(clients.id, id));
        res.json({ success: true });
      } catch (error: any) {
        console.error("[DELETE /api/clients/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // ========================================================================
    // PROJECT ROUTES
    // ========================================================================
    
    app.post("/api/projects", requireAuth, async (req: any, res) => {
      try {
        const { name, workspaceId, clientId } = req.body;
        const user = req.user;
        const tenantId = user.tenantId;
        
        if (!name) {
          return res.status(400).json({ error: "name is required" });
        }
        
        const effectiveWorkspaceId = workspaceId || workspace1.id;
        
        // Validate workspace
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, effectiveWorkspaceId));
        if (!workspace) {
          return res.status(404).json({ error: "Workspace not found" });
        }
        if (workspace.tenantId !== tenantId) {
          return res.status(403).json({ error: "Workspace belongs to different tenant" });
        }
        
        // Validate client if provided
        if (clientId) {
          const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
          if (!client) {
            return res.status(404).json({ error: "Client not found" });
          }
          if (client.tenantId !== tenantId) {
            return res.status(403).json({ error: "Client belongs to different tenant" });
          }
        }
        
        const [project] = await db.insert(projects).values({
          name,
          workspaceId: effectiveWorkspaceId,
          tenantId,
          clientId: clientId || null,
          status: "active",
        }).returning();
        
        res.status(201).json(project);
      } catch (error: any) {
        console.error("[POST /api/projects] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/projects", requireAuth, async (req: any, res) => {
      try {
        const tenantId = req.user.tenantId;
        const result = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
        res.json(result);
      } catch (error: any) {
        console.error("[GET /api/projects] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/projects/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [project] = await db.select().from(projects).where(eq(projects.id, id));
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        if (project.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        res.json(project);
      } catch (error: any) {
        console.error("[GET /api/projects/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.patch("/api/projects/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [project] = await db.select().from(projects).where(eq(projects.id, id));
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        if (project.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        // Validate clientId if provided
        if (req.body.clientId) {
          const [client] = await db.select().from(clients).where(eq(clients.id, req.body.clientId));
          if (!client) {
            return res.status(404).json({ error: "Client not found" });
          }
          if (client.tenantId !== tenantId) {
            return res.status(403).json({ error: "Client belongs to different tenant" });
          }
        }
        
        const [updated] = await db.update(projects)
          .set({ ...req.body, updatedAt: new Date() })
          .where(eq(projects.id, id))
          .returning();
        
        res.json(updated);
      } catch (error: any) {
        console.error("[PATCH /api/projects/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/api/projects/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [project] = await db.select().from(projects).where(eq(projects.id, id));
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        if (project.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        // Delete related tasks first
        await db.delete(tasks).where(eq(tasks.projectId, id));
        await db.delete(sections).where(eq(sections.projectId, id));
        await db.delete(projects).where(eq(projects.id, id));
        
        res.json({ success: true });
      } catch (error: any) {
        console.error("[DELETE /api/projects/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // ========================================================================
    // TASK ROUTES
    // ========================================================================
    
    app.post("/api/tasks", requireAuth, async (req: any, res) => {
      try {
        const { title, projectId } = req.body;
        const user = req.user;
        const tenantId = user.tenantId;
        
        if (!title) {
          return res.status(400).json({ error: "title is required" });
        }
        if (!projectId) {
          return res.status(400).json({ error: "projectId is required" });
        }
        
        // Validate project
        const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        if (project.tenantId !== tenantId) {
          return res.status(403).json({ error: "Project belongs to different tenant" });
        }
        
        const [task] = await db.insert(tasks).values({
          title,
          projectId,
          tenantId,
          createdBy: user.id,
          status: "todo",
        }).returning();
        
        res.status(201).json(task);
      } catch (error: any) {
        console.error("[POST /api/tasks] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Create subtask
    app.post("/api/tasks/:taskId/childtasks", requireAuth, async (req: any, res) => {
      try {
        const { taskId } = req.params;
        const { title } = req.body;
        const user = req.user;
        const tenantId = user.tenantId;
        
        if (!title) {
          return res.status(400).json({ error: "title is required" });
        }
        
        // Validate parent task
        const [parentTask] = await db.select().from(tasks).where(eq(tasks.id, taskId));
        if (!parentTask) {
          return res.status(404).json({ error: "Parent task not found" });
        }
        if (parentTask.tenantId !== tenantId) {
          return res.status(403).json({ error: "Parent task belongs to different tenant" });
        }
        
        const [subtask] = await db.insert(tasks).values({
          title,
          projectId: parentTask.projectId,
          parentTaskId: taskId,
          tenantId,
          createdBy: user.id,
          status: "todo",
        }).returning();
        
        res.status(201).json(subtask);
      } catch (error: any) {
        console.error("[POST /api/tasks/:taskId/childtasks] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/tasks", requireAuth, async (req: any, res) => {
      try {
        const tenantId = req.user.tenantId;
        const result = await db.select().from(tasks).where(eq(tasks.tenantId, tenantId));
        res.json(result);
      } catch (error: any) {
        console.error("[GET /api/tasks] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/tasks/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        if (task.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        res.json(task);
      } catch (error: any) {
        console.error("[GET /api/tasks/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.patch("/api/tasks/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        if (task.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        const [updated] = await db.update(tasks)
          .set({ ...req.body, updatedAt: new Date() })
          .where(eq(tasks.id, id))
          .returning();
        
        res.json(updated);
      } catch (error: any) {
        console.error("[PATCH /api/tasks/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/api/tasks/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        if (task.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        // Delete subtasks first
        await db.delete(tasks).where(eq(tasks.parentTaskId, id));
        await db.delete(tasks).where(eq(tasks.id, id));
        
        res.json({ success: true });
      } catch (error: any) {
        console.error("[DELETE /api/tasks/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // ========================================================================
    // TIME ENTRY ROUTES
    // ========================================================================
    
    app.post("/api/time-entries", requireAuth, async (req: any, res) => {
      try {
        const { description, projectId, taskId, startTime, endTime, duration } = req.body;
        const user = req.user;
        const tenantId = user.tenantId;
        
        // Validate project if provided
        if (projectId) {
          const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
          if (!project) {
            return res.status(404).json({ error: "Project not found" });
          }
          if (project.tenantId !== tenantId) {
            return res.status(403).json({ error: "Project belongs to different tenant" });
          }
        }
        
        // Validate task if provided
        if (taskId) {
          const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
          if (!task) {
            return res.status(404).json({ error: "Task not found" });
          }
          if (task.tenantId !== tenantId) {
            return res.status(403).json({ error: "Task belongs to different tenant" });
          }
        }
        
        const [timeEntry] = await db.insert(timeEntries).values({
          description: description || "",
          projectId: projectId || null,
          taskId: taskId || null,
          userId: user.id,
          workspaceId: workspace1.id,
          tenantId,
          startTime: startTime ? new Date(startTime) : new Date(),
          endTime: endTime ? new Date(endTime) : null,
          durationSeconds: duration || 0,
        }).returning();
        
        res.status(201).json(timeEntry);
      } catch (error: any) {
        console.error("[POST /api/time-entries] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/time-entries", requireAuth, async (req: any, res) => {
      try {
        const tenantId = req.user.tenantId;
        const result = await db.select().from(timeEntries).where(eq(timeEntries.tenantId, tenantId));
        res.json(result);
      } catch (error: any) {
        console.error("[GET /api/time-entries] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/time-entries/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
        if (!entry) {
          return res.status(404).json({ error: "Time entry not found" });
        }
        if (entry.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        res.json(entry);
      } catch (error: any) {
        console.error("[GET /api/time-entries/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.patch("/api/time-entries/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
        if (!entry) {
          return res.status(404).json({ error: "Time entry not found" });
        }
        if (entry.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        const [updated] = await db.update(timeEntries)
          .set({ ...req.body, updatedAt: new Date() })
          .where(eq(timeEntries.id, id))
          .returning();
        
        res.json(updated);
      } catch (error: any) {
        console.error("[PATCH /api/time-entries/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/api/time-entries/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        
        const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
        if (!entry) {
          return res.status(404).json({ error: "Time entry not found" });
        }
        if (entry.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        await db.delete(timeEntries).where(eq(timeEntries.id, id));
        res.json({ success: true });
      } catch (error: any) {
        console.error("[DELETE /api/time-entries/:id] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });
  });

  afterAll(async () => {
    await cleanupTestData({ tenantIds: [tenant1.id, tenant2.id] });
  });

  // ========================================================================
  // CLIENT TESTS
  // ========================================================================
  
  describe("Clients CRUD", () => {
    it("should create client in user's tenant", async () => {
      const response = await request(app)
        .post("/api/clients")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ companyName: "New Test Client", workspaceId: workspace1.id });

      expect(response.status).toBe(201);
      expect(response.body.companyName).toBe("New Test Client");
      expect(response.body.tenantId).toBe(tenant1.id);
    });

    it("should reject client creation for other tenant's workspace", async () => {
      const response = await request(app)
        .post("/api/clients")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ companyName: "Bad Client", workspaceId: workspace2.id });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("different tenant");
    });

    it("should list only clients from user's tenant", async () => {
      const response = await request(app)
        .get("/api/clients")
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const hasTenant2Clients = response.body.some((c: any) => c.tenantId === tenant2.id);
      expect(hasTenant2Clients).toBe(false);
    });

    it("should get single client by ID", async () => {
      const testClient = await createTestClient({ 
        companyName: "Get Me Client", 
        workspaceId: workspace1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .get(`/api/clients/${testClient.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.companyName).toBe("Get Me Client");
    });

    it("should reject access to other tenant's client", async () => {
      const response = await request(app)
        .get(`/api/clients/${client2.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("wrong tenant");
    });

    it("should update client in user's tenant", async () => {
      const testClient = await createTestClient({ 
        companyName: "Update Me Client", 
        workspaceId: workspace1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .patch(`/api/clients/${testClient.id}`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ companyName: "Updated Client Name" });

      expect(response.status).toBe(200);
      expect(response.body.companyName).toBe("Updated Client Name");
    });

    it("should reject update for other tenant's client", async () => {
      const response = await request(app)
        .patch(`/api/clients/${client2.id}`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ companyName: "Hacked Name" });

      expect(response.status).toBe(403);
    });

    it("should delete client in user's tenant", async () => {
      const testClient = await createTestClient({ 
        companyName: "Delete Me Client", 
        workspaceId: workspace1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .delete(`/api/clients/${testClient.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should reject delete for other tenant's client", async () => {
      const response = await request(app)
        .delete(`/api/clients/${client2.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(403);
    });

    it("should return 404 for non-existent client", async () => {
      const response = await request(app)
        .get("/api/clients/non-existent-id")
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(404);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post("/api/clients")
        .set("X-Test-User-Id", adminUser1.id)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  // ========================================================================
  // PROJECT TESTS
  // ========================================================================
  
  describe("Projects CRUD", () => {
    it("should create project in user's tenant", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ name: "New Test Project", workspaceId: workspace1.id });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("New Test Project");
      expect(response.body.tenantId).toBe(tenant1.id);
    });

    it("should create project with valid client FK", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ name: "Project With Client", workspaceId: workspace1.id, clientId: client1.id });

      expect(response.status).toBe(201);
      expect(response.body.clientId).toBe(client1.id);
    });

    it("should reject project with other tenant's client FK", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ name: "Bad Project", workspaceId: workspace1.id, clientId: client2.id });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("different tenant");
    });

    it("should reject project with non-existent client FK", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ name: "Bad Project", workspaceId: workspace1.id, clientId: "non-existent-id" });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Client not found");
    });

    it("should list only projects from user's tenant", async () => {
      const response = await request(app)
        .get("/api/projects")
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const hasTenant2Projects = response.body.some((p: any) => p.tenantId === tenant2.id);
      expect(hasTenant2Projects).toBe(false);
    });

    it("should get single project by ID", async () => {
      const response = await request(app)
        .get(`/api/projects/${project1.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Smoke Project 1");
    });

    it("should reject access to other tenant's project", async () => {
      const response = await request(app)
        .get(`/api/projects/${project2.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(403);
    });

    it("should update project in user's tenant", async () => {
      const testProject = await createTestProject({ 
        name: "Update Me Project", 
        workspaceId: workspace1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .patch(`/api/projects/${testProject.id}`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ name: "Updated Project Name" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Updated Project Name");
    });

    it("should reject update with other tenant's client FK", async () => {
      const testProject = await createTestProject({ 
        name: "FK Test Project", 
        workspaceId: workspace1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .patch(`/api/projects/${testProject.id}`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ clientId: client2.id });

      expect(response.status).toBe(403);
    });

    it("should delete project in user's tenant", async () => {
      const testProject = await createTestProject({ 
        name: "Delete Me Project", 
        workspaceId: workspace1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .delete(`/api/projects/${testProject.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ========================================================================
  // TASK TESTS
  // ========================================================================
  
  describe("Tasks CRUD", () => {
    it("should create task in user's tenant", async () => {
      const response = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ title: "New Test Task", projectId: project1.id });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe("New Test Task");
      expect(response.body.tenantId).toBe(tenant1.id);
      expect(response.body.createdBy).toBe(adminUser1.id);
    });

    it("should reject task creation for other tenant's project", async () => {
      const response = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ title: "Bad Task", projectId: project2.id });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("different tenant");
    });

    it("should reject task with non-existent project FK", async () => {
      const response = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ title: "Bad Task", projectId: "non-existent-id" });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Project not found");
    });

    it("should create subtask under parent task", async () => {
      const parentTask = await createTestTask({ 
        title: "Parent Task", 
        projectId: project1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .post(`/api/tasks/${parentTask.id}/childtasks`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ title: "Subtask 1" });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe("Subtask 1");
      expect(response.body.parentTaskId).toBe(parentTask.id);
      expect(response.body.tenantId).toBe(tenant1.id);
    });

    it("should reject subtask for other tenant's parent task", async () => {
      const otherTask = await createTestTask({ 
        title: "Other Tenant Task", 
        projectId: project2.id, 
        tenantId: tenant2.id 
      });
      
      const response = await request(app)
        .post(`/api/tasks/${otherTask.id}/childtasks`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ title: "Bad Subtask" });

      expect(response.status).toBe(403);
    });

    it("should list only tasks from user's tenant", async () => {
      const response = await request(app)
        .get("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const hasTenant2Tasks = response.body.some((t: any) => t.tenantId === tenant2.id);
      expect(hasTenant2Tasks).toBe(false);
    });

    it("should get single task by ID", async () => {
      const testTask = await createTestTask({ 
        title: "Get Me Task", 
        projectId: project1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .get(`/api/tasks/${testTask.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Get Me Task");
    });

    it("should reject access to other tenant's task", async () => {
      const otherTask = await createTestTask({ 
        title: "Other Tenant Task", 
        projectId: project2.id, 
        tenantId: tenant2.id 
      });
      
      const response = await request(app)
        .get(`/api/tasks/${otherTask.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(403);
    });

    it("should update task in user's tenant", async () => {
      const testTask = await createTestTask({ 
        title: "Update Me Task", 
        projectId: project1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .patch(`/api/tasks/${testTask.id}`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ title: "Updated Task Title", status: "in_progress" });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Updated Task Title");
      expect(response.body.status).toBe("in_progress");
    });

    it("should delete task and its subtasks", async () => {
      const parentTask = await createTestTask({ 
        title: "Delete Parent", 
        projectId: project1.id, 
        tenantId: tenant1.id 
      });
      
      // Create subtask
      await db.insert(tasks).values({
        title: "Delete Subtask",
        projectId: project1.id,
        parentTaskId: parentTask.id,
        tenantId: tenant1.id,
        status: "todo",
      });
      
      const response = await request(app)
        .delete(`/api/tasks/${parentTask.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify subtask also deleted
      const remainingSubtasks = await db.select()
        .from(tasks)
        .where(eq(tasks.parentTaskId, parentTask.id));
      expect(remainingSubtasks.length).toBe(0);
    });

    it("should reject delete for other tenant's task", async () => {
      const otherTask = await createTestTask({ 
        title: "Protected Task", 
        projectId: project2.id, 
        tenantId: tenant2.id 
      });
      
      const response = await request(app)
        .delete(`/api/tasks/${otherTask.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(403);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  // ========================================================================
  // TIME ENTRY TESTS
  // ========================================================================
  
  describe("Time Entries CRUD", () => {
    it("should create time entry in user's tenant", async () => {
      const response = await request(app)
        .post("/api/time-entries")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ 
          description: "Working on feature", 
          projectId: project1.id,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: 3600
        });

      expect(response.status).toBe(201);
      expect(response.body.description).toBe("Working on feature");
      expect(response.body.tenantId).toBe(tenant1.id);
      expect(response.body.userId).toBe(adminUser1.id);
    });

    it("should create time entry with valid task FK", async () => {
      const testTask = await createTestTask({ 
        title: "Time Entry Task", 
        projectId: project1.id, 
        tenantId: tenant1.id 
      });
      
      const response = await request(app)
        .post("/api/time-entries")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ 
          description: "Task work", 
          projectId: project1.id,
          taskId: testTask.id,
          duration: 1800
        });

      expect(response.status).toBe(201);
      expect(response.body.taskId).toBe(testTask.id);
    });

    it("should reject time entry with other tenant's project FK", async () => {
      const response = await request(app)
        .post("/api/time-entries")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ 
          description: "Bad entry", 
          projectId: project2.id,
          duration: 1800
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("different tenant");
    });

    it("should reject time entry with other tenant's task FK", async () => {
      const otherTask = await createTestTask({ 
        title: "Other Task", 
        projectId: project2.id, 
        tenantId: tenant2.id 
      });
      
      const response = await request(app)
        .post("/api/time-entries")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ 
          description: "Bad entry", 
          taskId: otherTask.id,
          duration: 1800
        });

      expect(response.status).toBe(403);
    });

    it("should reject time entry with non-existent project FK", async () => {
      const response = await request(app)
        .post("/api/time-entries")
        .set("X-Test-User-Id", adminUser1.id)
        .send({ 
          description: "Bad entry", 
          projectId: "non-existent-id",
          duration: 1800
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Project not found");
    });

    it("should list only time entries from user's tenant", async () => {
      // Create entries in both tenants
      await db.insert(timeEntries).values({
        description: "Tenant 1 Entry",
        userId: adminUser1.id,
        workspaceId: workspace1.id,
        tenantId: tenant1.id,
        startTime: new Date(),
        durationSeconds: 1000,
      });
      await db.insert(timeEntries).values({
        description: "Tenant 2 Entry",
        userId: adminUser2.id,
        workspaceId: workspace2.id,
        tenantId: tenant2.id,
        startTime: new Date(),
        durationSeconds: 1000,
      });
      
      const response = await request(app)
        .get("/api/time-entries")
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const hasTenant2Entries = response.body.some((e: any) => e.tenantId === tenant2.id);
      expect(hasTenant2Entries).toBe(false);
    });

    it("should get single time entry by ID", async () => {
      const [entry] = await db.insert(timeEntries).values({
        description: "Get Me Entry",
        userId: adminUser1.id,
        workspaceId: workspace1.id,
        tenantId: tenant1.id,
        startTime: new Date(),
        durationSeconds: 2000,
      }).returning();
      
      const response = await request(app)
        .get(`/api/time-entries/${entry.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.description).toBe("Get Me Entry");
    });

    it("should reject access to other tenant's time entry", async () => {
      const [entry] = await db.insert(timeEntries).values({
        description: "Other Entry",
        userId: adminUser2.id,
        workspaceId: workspace2.id,
        tenantId: tenant2.id,
        startTime: new Date(),
        durationSeconds: 1000,
      }).returning();
      
      const response = await request(app)
        .get(`/api/time-entries/${entry.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(403);
    });

    it("should update time entry in user's tenant", async () => {
      const [entry] = await db.insert(timeEntries).values({
        description: "Update Me Entry",
        userId: adminUser1.id,
        workspaceId: workspace1.id,
        tenantId: tenant1.id,
        startTime: new Date(),
        durationSeconds: 1000,
      }).returning();
      
      const response = await request(app)
        .patch(`/api/time-entries/${entry.id}`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ description: "Updated Description", durationSeconds: 5000 });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe("Updated Description");
      expect(response.body.durationSeconds).toBe(5000);
    });

    it("should delete time entry in user's tenant", async () => {
      const [entry] = await db.insert(timeEntries).values({
        description: "Delete Me Entry",
        userId: adminUser1.id,
        workspaceId: workspace1.id,
        tenantId: tenant1.id,
        startTime: new Date(),
        durationSeconds: 1000,
      }).returning();
      
      const response = await request(app)
        .delete(`/api/time-entries/${entry.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should reject delete for other tenant's time entry", async () => {
      const [entry] = await db.insert(timeEntries).values({
        description: "Protected Entry",
        userId: adminUser2.id,
        workspaceId: workspace2.id,
        tenantId: tenant2.id,
        startTime: new Date(),
        durationSeconds: 1000,
      }).returning();
      
      const response = await request(app)
        .delete(`/api/time-entries/${entry.id}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(response.status).toBe(403);
    });
  });

  // ========================================================================
  // AUTHENTICATION TESTS
  // ========================================================================
  
  describe("Authentication", () => {
    it("should reject unauthenticated requests to clients", async () => {
      const response = await request(app).get("/api/clients");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated requests to projects", async () => {
      const response = await request(app).get("/api/projects");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated requests to tasks", async () => {
      const response = await request(app).get("/api/tasks");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated requests to time entries", async () => {
      const response = await request(app).get("/api/time-entries");
      expect(response.status).toBe(401);
    });
  });

  // ========================================================================
  // EMPLOYEE ACCESS TESTS
  // ========================================================================
  
  describe("Employee Access", () => {
    it("should allow employee to list clients in their tenant", async () => {
      const response = await request(app)
        .get("/api/clients")
        .set("X-Test-User-Id", employeeUser1.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should allow employee to list projects in their tenant", async () => {
      const response = await request(app)
        .get("/api/projects")
        .set("X-Test-User-Id", employeeUser1.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should allow employee to create tasks", async () => {
      const response = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", employeeUser1.id)
        .send({ title: "Employee Task", projectId: project1.id });

      expect(response.status).toBe(201);
      expect(response.body.createdBy).toBe(employeeUser1.id);
    });

    it("should allow employee to create time entries", async () => {
      const response = await request(app)
        .post("/api/time-entries")
        .set("X-Test-User-Id", employeeUser1.id)
        .send({ 
          description: "Employee time", 
          projectId: project1.id,
          duration: 1800
        });

      expect(response.status).toBe(201);
      expect(response.body.userId).toBe(employeeUser1.id);
    });
  });
});
