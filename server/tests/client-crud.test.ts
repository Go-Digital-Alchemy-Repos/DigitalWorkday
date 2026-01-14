/**
 * Client (CRM) CRUD Integration Tests
 * 
 * Purpose: Verify client create/read/update/delete operations with tenant scoping.
 * 
 * Coverage:
 * - Create client (tenant scoped)
 * - List clients (tenant scoped)
 * - Update client (authorized/unauthorized)
 * - Delete client (if supported)
 * - Tenant isolation (cannot access other tenant's clients)
 * - Authorization checks
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";
import { db } from "../db";
import { 
  tenants, workspaces, clients, users, 
  TenantStatus, UserRole 
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { 
  createTestTenant, 
  createTestWorkspace, 
  createTestClient,
  createTestUser,
  cleanupTestData 
} from "./fixtures";

describe("Client CRUD - Tenant Scoped", () => {
  let app: Express;
  let tenant1: any;
  let tenant2: any;
  let workspace1: any;
  let workspace2: any;
  let adminUser1: any;
  let adminUser2: any;
  let employeeUser1: any;

  beforeAll(async () => {
    // Create test tenants with workspaces
    tenant1 = await createTestTenant({ name: "Client Test Tenant 1" });
    tenant2 = await createTestTenant({ name: "Client Test Tenant 2" });
    
    workspace1 = await createTestWorkspace({ tenantId: tenant1.id, isPrimary: true });
    workspace2 = await createTestWorkspace({ tenantId: tenant2.id, isPrimary: true });
    
    // Create users
    const password = "testpass123";
    adminUser1 = await createTestUser({
      email: `admin1-client-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant1.id,
    });
    adminUser2 = await createTestUser({
      email: `admin2-client-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant2.id,
    });
    employeeUser1 = await createTestUser({
      email: `employee1-client-${Date.now()}@test.com`,
      password,
      role: UserRole.EMPLOYEE,
      tenantId: tenant1.id,
    });
    
    // Create mock app
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

    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      next();
    };

    // POST /api/clients - Create client
    app.post("/api/clients", requireAuth, async (req: any, res) => {
      try {
        const { companyName, workspaceId } = req.body;
        const user = req.user;
        
        // Get workspace to verify tenant match
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
        if (!workspace) {
          return res.status(404).json({ error: "Workspace not found" });
        }
        
        // Tenant isolation check
        if (workspace.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        const [client] = await db.insert(clients).values({
          companyName,
          workspaceId,
          tenantId: user.tenantId,
        }).returning();
        
        res.status(201).json(client);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/clients - List clients for user's tenant
    app.get("/api/clients", requireAuth, async (req: any, res) => {
      try {
        const user = req.user;
        const tenantClients = await db.select()
          .from(clients)
          .where(eq(clients.tenantId, user.tenantId));
        res.json(tenantClients);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/clients/:id - Get single client
    app.get("/api/clients/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const user = req.user;
        
        const [client] = await db.select().from(clients).where(eq(clients.id, id));
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        
        // Tenant isolation check
        if (client.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        res.json(client);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // PATCH /api/clients/:id - Update client
    app.patch("/api/clients/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const user = req.user;
        const updates = req.body;
        
        const [client] = await db.select().from(clients).where(eq(clients.id, id));
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        
        // Tenant isolation check
        if (client.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        const [updated] = await db.update(clients)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(clients.id, id))
          .returning();
        
        res.json(updated);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/clients/:id - Delete client
    app.delete("/api/clients/:id", requireAuth, async (req: any, res) => {
      try {
        const { id } = req.params;
        const user = req.user;
        
        const [client] = await db.select().from(clients).where(eq(clients.id, id));
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        
        // Tenant isolation check
        if (client.tenantId !== user.tenantId) {
          return res.status(403).json({ error: "Access denied - wrong tenant" });
        }
        
        await db.delete(clients).where(eq(clients.id, id));
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  afterAll(async () => {
    await cleanupTestData({ tenantIds: [tenant1.id, tenant2.id] });
  });

  // Test 1: Create client (tenant scoped)
  it("should create client in user's tenant", async () => {
    const response = await request(app)
      .post("/api/clients")
      .set("X-Test-User-Id", adminUser1.id)
      .send({ companyName: "Test Company 1", workspaceId: workspace1.id });

    expect(response.status).toBe(201);
    expect(response.body.companyName).toBe("Test Company 1");
    expect(response.body.tenantId).toBe(tenant1.id);
  });

  // Test 2: Create client fails for wrong tenant's workspace
  it("should reject client creation for other tenant's workspace", async () => {
    const response = await request(app)
      .post("/api/clients")
      .set("X-Test-User-Id", adminUser1.id)
      .send({ companyName: "Bad Company", workspaceId: workspace2.id });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 3: List clients (tenant scoped)
  it("should list only clients from user's tenant", async () => {
    // Create clients in both tenants
    await createTestClient({ companyName: "Tenant1 Client", workspaceId: workspace1.id, tenantId: tenant1.id });
    await createTestClient({ companyName: "Tenant2 Client", workspaceId: workspace2.id, tenantId: tenant2.id });
    
    const response = await request(app)
      .get("/api/clients")
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    
    // Should only see tenant1's clients
    const hasTenant2Clients = response.body.some((c: any) => c.tenantId === tenant2.id);
    expect(hasTenant2Clients).toBe(false);
  });

  // Test 4: Update client (authorized)
  it("should update client in user's tenant", async () => {
    const client = await createTestClient({ 
      companyName: "Update Me Corp", 
      workspaceId: workspace1.id, 
      tenantId: tenant1.id 
    });
    
    const response = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("X-Test-User-Id", adminUser1.id)
      .send({ companyName: "Updated Corp" });

    expect(response.status).toBe(200);
    expect(response.body.companyName).toBe("Updated Corp");
  });

  // Test 5: Update client (unauthorized - wrong tenant)
  it("should reject update for other tenant's client", async () => {
    const client = await createTestClient({ 
      companyName: "Other Tenant Corp", 
      workspaceId: workspace2.id, 
      tenantId: tenant2.id 
    });
    
    const response = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("X-Test-User-Id", adminUser1.id)
      .send({ companyName: "Hacked Corp" });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 6: Tenant isolation - cannot access other tenant's client by ID
  it("should return 403 when accessing other tenant's client by ID", async () => {
    const client = await createTestClient({ 
      companyName: "Isolated Corp", 
      workspaceId: workspace2.id, 
      tenantId: tenant2.id 
    });
    
    const response = await request(app)
      .get(`/api/clients/${client.id}`)
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 7: Delete client (authorized)
  it("should delete client in user's tenant", async () => {
    const client = await createTestClient({ 
      companyName: "Delete Me Corp", 
      workspaceId: workspace1.id, 
      tenantId: tenant1.id 
    });
    
    const response = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify deletion
    const [deleted] = await db.select().from(clients).where(eq(clients.id, client.id));
    expect(deleted).toBeUndefined();
  });

  // Test 8: Delete client (unauthorized - wrong tenant)
  it("should reject delete for other tenant's client", async () => {
    const client = await createTestClient({ 
      companyName: "Protected Corp", 
      workspaceId: workspace2.id, 
      tenantId: tenant2.id 
    });
    
    const response = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("X-Test-User-Id", adminUser1.id);

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Access denied");
  });

  // Test 9: Unauthenticated access rejected
  it("should reject unauthenticated client access", async () => {
    const response = await request(app)
      .get("/api/clients");

    expect(response.status).toBe(401);
  });

  // Test 10: Employee can list clients in their tenant
  it("should allow employee to list clients in their tenant", async () => {
    const response = await request(app)
      .get("/api/clients")
      .set("X-Test-User-Id", employeeUser1.id);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
