/**
 * Task CRUD Integration Tests
 * 
 * Purpose: Verify task create/read/update/delete operations with tenant scoping.
 * 
 * Coverage:
 * - Create task (tenant scoped)
 * - List tasks (tenant scoped)
 * - Update task (authorized/unauthorized)
 * - Delete task (authorized/unauthorized)
 * - Tenant isolation (cannot access other tenant's tasks)
 * - TenantId enforcement (if enabled)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";
import { db } from "../db";
import { 
  tenants, workspaces, projects, tasks, users, 
  TenantStatus, UserRole 
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../auth";
import { 
  createTestTenant, 
  createTestWorkspace, 
  createTestProject, 
  createTestTask,
  createTestUser,
  cleanupTestData 
} from "./fixtures";

describe("Task CRUD - Tenant Scoped", () => {
  let app: Express;
  let tenant1: any;
  let tenant2: any;
  let workspace1: any;
  let workspace2: any;
  let project1: any;
  let project2: any;
  let adminUser1: any;
  let adminUser2: any;
  let employeeUser1: any;
  let adminCookie1: string;
  let adminCookie2: string;
  let employeeCookie1: string;

  beforeAll(async () => {
    // Create test tenants with full hierarchy
    tenant1 = await createTestTenant({ name: "Task Test Tenant 1" });
    tenant2 = await createTestTenant({ name: "Task Test Tenant 2" });
    
    workspace1 = await createTestWorkspace({ tenantId: tenant1.id, isPrimary: true });
    workspace2 = await createTestWorkspace({ tenantId: tenant2.id, isPrimary: true });
    
    project1 = await createTestProject({ workspaceId: workspace1.id, tenantId: tenant1.id });
    project2 = await createTestProject({ workspaceId: workspace2.id, tenantId: tenant2.id });
    
    // Create users
    const password = "testpass123";
    adminUser1 = await createTestUser({
      email: `admin1-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant1.id,
    });
    adminUser2 = await createTestUser({
      email: `admin2-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant2.id,
    });
    employeeUser1 = await createTestUser({
      email: `employee1-${Date.now()}@test.com`,
      password,
      role: UserRole.EMPLOYEE,
      tenantId: tenant1.id,
    });
    
    // Create mock app with auth simulation
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));
    
    // Mock auth middleware based on X-Test-User-Id header
    app.use((req: any, res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user-id"];
      if (userId === adminUser1.id) {
        req.user = adminUser1;
        req.isAuthenticated = () => true;
      } else if (userId === adminUser2.id) {
        req.user = adminUser2;
        req.isAuthenticated = () => true;
      } else if (userId === employeeUser1.id) {
        req.user = employeeUser1;
        req.isAuthenticated = () => true;
      } else {
        req.isAuthenticated = () => false;
      }
      next();
    });

    // Simplified task routes for testing
    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      next();
    };

    // POST /api/tasks - Create task
    app.post("/api/tasks", requireAuth, async (req: any, res) => {
      try {
        const { title, projectId } = req.body;
        const user = req.user;
        
        // Get project to verify tenant match
        const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        
        // Tenant isolation check
        if (project.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        const [task] = await db.insert(tasks).values({
          title,
          projectId,
          tenantId: user.tenantId,
          createdBy: user.id,
          status: "todo",
        }).returning();
        
        res.status(201).json(task);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/tasks - List tasks for user's tenant
    app.get("/api/tasks", requireAuth, async (req: any, res) => {
      try {
        const user = req.user;
        const tenantTasks = await db.select()
          .from(tasks)
          .where(eq(tasks.tenantId, user.tenantId));
        res.json(tenantTasks);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/tasks/:id - Get single task
    app.get("/api/tasks/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const user = req.user;
        
        const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        
        // Tenant isolation check
        if (task.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        res.json(task);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // PATCH /api/tasks/:id - Update task
    app.patch("/api/tasks/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const user = req.user;
        const updates = req.body;
        
        const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        
        // Tenant isolation check
        if (task.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        const [updated] = await db.update(tasks)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(tasks.id, id))
          .returning();
        
        res.json(updated);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/tasks/:id - Delete task
    app.delete("/api/tasks/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const user = req.user;
        
        const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        
        // Tenant isolation check
        if (task.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        await db.delete(tasks).where(eq(tasks.id, id));
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  afterAll(async () => {
    // Clean up in order
    await cleanupTestData({ tenantIds: [tenant1.id, tenant2.id] });
  });

  // Test 1: Create task (tenant scoped)
  it("should create task in user's tenant", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", adminUser1.id)
      .send({ title: "Test Task 1", projectId: project1.id });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe("Test Task 1");
    expect(response.body.tenantId).toBe(tenant1.id);
  });

  // Test 2: Create task fails for wrong tenant's project
  it("should reject task creation for other tenant's project", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", adminUser1.id)
      .send({ title: "Bad Task", projectId: project2.id });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 3: List tasks (tenant scoped)
  it("should list only tasks from user's tenant", async () => {
    // Create tasks in both tenants
    await createTestTask({ title: "Tenant1 Task", projectId: project1.id, tenantId: tenant1.id });
    await createTestTask({ title: "Tenant2 Task", projectId: project2.id, tenantId: tenant2.id });
    
    const response = await request(app)
      .get("/api/tasks")
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    
    // Should only see tenant1's tasks
    const hasTenant2Tasks = response.body.some((t: any) => t.tenantId === tenant2.id);
    expect(hasTenant2Tasks).toBe(false);
  });

  // Test 4: Update task (authorized)
  it("should update task in user's tenant", async () => {
    const task = await createTestTask({ 
      title: "Update Me", 
      projectId: project1.id, 
      tenantId: tenant1.id 
    });
    
    const response = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("X-Test-User-Id", adminUser1.id)
      .send({ title: "Updated Title", status: "in_progress" });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Updated Title");
    expect(response.body.status).toBe("in_progress");
  });

  // Test 5: Update task (unauthorized - wrong tenant)
  it("should reject update for other tenant's task", async () => {
    const task = await createTestTask({ 
      title: "Other Tenant Task", 
      projectId: project2.id, 
      tenantId: tenant2.id 
    });
    
    const response = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("X-Test-User-Id", adminUser1.id)
      .send({ title: "Hacked Title" });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 6: Delete task (authorized)
  it("should delete task in user's tenant", async () => {
    const task = await createTestTask({ 
      title: "Delete Me", 
      projectId: project1.id, 
      tenantId: tenant1.id 
    });
    
    const response = await request(app)
      .delete(`/api/tasks/${task.id}`)
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify deletion
    const [deleted] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(deleted).toBeUndefined();
  });

  // Test 7: Delete task (unauthorized - wrong tenant)
  it("should reject delete for other tenant's task", async () => {
    const task = await createTestTask({ 
      title: "Protected Task", 
      projectId: project2.id, 
      tenantId: tenant2.id 
    });
    
    const response = await request(app)
      .delete(`/api/tasks/${task.id}`)
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 8: Tenant isolation - cannot access other tenant's task by ID
  it("should return 403 when accessing other tenant's task by ID", async () => {
    const task = await createTestTask({ 
      title: "Isolated Task", 
      projectId: project2.id, 
      tenantId: tenant2.id 
    });
    
    const response = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 9: Unauthenticated access rejected
  it("should reject unauthenticated task access", async () => {
    const response = await request(app)
      .get("/api/tasks");

    expect(response.status).toBe(401);
  });

  // Test 10: Employee can create tasks in their tenant
  it("should allow employee to create tasks in their tenant", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set("X-Test-User-Id", employeeUser1.id)
      .send({ title: "Employee Task", projectId: project1.id });

    expect(response.status).toBe(201);
    expect(response.body.tenantId).toBe(tenant1.id);
  });
});
