import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  createTestTenant,
  createTestWorkspace,
  createTestClient,
  createTestUser,
  cleanupTestData,
} from "./fixtures";
import { UserRole } from "../../shared/schema";
import crmRouter from "../routes/crm.router";

describe("CRM API - Tenant Isolation & RBAC", () => {
  let app: Express;
  let tenant1: any;
  let tenant2: any;
  let workspace1: any;
  let workspace2: any;
  let adminUser1: any;
  let adminUser2: any;
  let employeeUser1: any;
  let client1: any;
  let client2: any;

  beforeAll(async () => {
    tenant1 = await createTestTenant({ name: "CRM Test Tenant 1" });
    tenant2 = await createTestTenant({ name: "CRM Test Tenant 2" });
    workspace1 = await createTestWorkspace({ tenantId: tenant1.id, isPrimary: true });
    workspace2 = await createTestWorkspace({ tenantId: tenant2.id, isPrimary: true });

    adminUser1 = await createTestUser({
      email: `crm-admin1-${Date.now()}@test.com`,
      password: "testpass123",
      role: UserRole.ADMIN,
      tenantId: tenant1.id,
    });
    adminUser2 = await createTestUser({
      email: `crm-admin2-${Date.now()}@test.com`,
      password: "testpass123",
      role: UserRole.ADMIN,
      tenantId: tenant2.id,
    });
    employeeUser1 = await createTestUser({
      email: `crm-emp1-${Date.now()}@test.com`,
      password: "testpass123",
      role: UserRole.EMPLOYEE,
      tenantId: tenant1.id,
    });

    client1 = await createTestClient({
      companyName: "CRM Test Client T1",
      workspaceId: workspace1.id,
      tenantId: tenant1.id,
    });
    client2 = await createTestClient({
      companyName: "CRM Test Client T2",
      workspaceId: workspace2.id,
      tenantId: tenant2.id,
    });

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));

    app.use((req: any, _res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user-id"] as string;
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

    app.use("/api", crmRouter);
  });

  afterAll(async () => {
    await cleanupTestData({ tenantIds: [tenant1.id, tenant2.id] });
  });

  describe("GET /api/crm/clients/:clientId/summary", () => {
    it("returns summary for own tenant client", async () => {
      const res = await request(app)
        .get(`/api/crm/clients/${client1.id}/summary`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(200);
      expect(res.body.client.id).toBe(client1.id);
      expect(res.body.client.companyName).toBe("CRM Test Client T1");
      expect(res.body.counts).toBeDefined();
      expect(res.body.counts.projects).toBe(0);
    });

    it("returns 404 for cross-tenant client", async () => {
      const res = await request(app)
        .get(`/api/crm/clients/${client2.id}/summary`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(404);
    });

    it("returns 401 for unauthenticated", async () => {
      const res = await request(app)
        .get(`/api/crm/clients/${client1.id}/summary`);

      expect(res.status).toBe(401);
    });
  });

  describe("CRM Contacts CRUD", () => {
    let createdContactId: string;

    it("POST creates contact for own tenant client", async () => {
      const res = await request(app)
        .post(`/api/crm/clients/${client1.id}/contacts`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ firstName: "Alice", lastName: "CRM", email: "alice@test.com" });

      expect(res.status).toBe(201);
      expect(res.body.firstName).toBe("Alice");
      expect(res.body.clientId).toBe(client1.id);
      expect(res.body.tenantId).toBe(tenant1.id);
      createdContactId = res.body.id;
    });

    it("POST rejects cross-tenant contact creation", async () => {
      const res = await request(app)
        .post(`/api/crm/clients/${client2.id}/contacts`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ firstName: "Bob" });

      expect(res.status).toBe(404);
    });

    it("GET lists contacts for own tenant client", async () => {
      const res = await request(app)
        .get(`/api/crm/clients/${client1.id}/contacts`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("GET returns 404 for cross-tenant contacts", async () => {
      const res = await request(app)
        .get(`/api/crm/clients/${client2.id}/contacts`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(404);
    });

    it("PATCH updates contact for own tenant", async () => {
      const res = await request(app)
        .patch(`/api/crm/contacts/${createdContactId}`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ title: "CTO" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("CTO");
    });

    it("PATCH rejects contact update from cross-tenant user", async () => {
      const res = await request(app)
        .patch(`/api/crm/contacts/${createdContactId}`)
        .set("X-Test-User-Id", adminUser2.id)
        .send({ title: "CEO" });

      expect([403, 404]).toContain(res.status);
    });

    it("DELETE removes contact for own tenant", async () => {
      const res = await request(app)
        .delete(`/api/crm/contacts/${createdContactId}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("DELETE returns 404 for nonexistent contact", async () => {
      const res = await request(app)
        .delete(`/api/crm/contacts/00000000-0000-0000-0000-000000000000`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/crm/clients/:clientId/crm (RBAC)", () => {
    it("admin can update CRM fields", async () => {
      const res = await request(app)
        .patch(`/api/crm/clients/${client1.id}/crm`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          status: "prospect",
          tags: ["enterprise", "high-value"],
          followUpNotes: "Follow up next week",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("prospect");
      expect(res.body.tags).toEqual(["enterprise", "high-value"]);
      expect(res.body.followUpNotes).toBe("Follow up next week");
    });

    it("employee cannot update CRM fields (admin only)", async () => {
      const res = await request(app)
        .patch(`/api/crm/clients/${client1.id}/crm`)
        .set("X-Test-User-Id", employeeUser1.id)
        .send({ status: "lead" });

      expect(res.status).toBe(403);
    });

    it("admin cannot update cross-tenant CRM fields", async () => {
      const res = await request(app)
        .patch(`/api/crm/clients/${client2.id}/crm`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ status: "lead" });

      expect(res.status).toBe(404);
    });

    it("admin can update existing CRM row (upsert)", async () => {
      const res = await request(app)
        .patch(`/api/crm/clients/${client1.id}/crm`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ status: "active" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("active");
    });

    it("rejects invalid status value", async () => {
      const res = await request(app)
        .patch(`/api/crm/clients/${client1.id}/crm`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ status: "invalid_status" });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe("CRM Notes", () => {
    let createdNoteId: string;

    it("POST creates note for own tenant client", async () => {
      const res = await request(app)
        .post(`/api/crm/clients/${client1.id}/notes`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Test note" }] }] } });

      expect(res.status).toBe(201);
      expect(res.body.clientId).toBe(client1.id);
      expect(res.body.tenantId).toBe(tenant1.id);
      expect(res.body.authorUserId).toBe(adminUser1.id);
      createdNoteId = res.body.id;
    });

    it("POST rejects note for cross-tenant client", async () => {
      const res = await request(app)
        .post(`/api/crm/clients/${client2.id}/notes`)
        .set("X-Test-User-Id", adminUser1.id)
        .send({ body: { type: "doc", content: [] } });

      expect(res.status).toBe(404);
    });

    it("GET lists notes for own tenant client with author info", async () => {
      const res = await request(app)
        .get(`/api/crm/clients/${client1.id}/notes`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].authorName).toBeDefined();
    });

    it("GET returns 404 for cross-tenant notes", async () => {
      const res = await request(app)
        .get(`/api/crm/clients/${client2.id}/notes`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(404);
    });

    it("employee cannot delete note authored by admin", async () => {
      const res = await request(app)
        .delete(`/api/crm/notes/${createdNoteId}`)
        .set("X-Test-User-Id", employeeUser1.id);

      expect(res.status).toBe(403);
    });

    it("admin can delete own note", async () => {
      const res = await request(app)
        .delete(`/api/crm/notes/${createdNoteId}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("DELETE returns 404 for cross-tenant note", async () => {
      const t2Note = await db.execute(sql`
        INSERT INTO client_notes (tenant_id, client_id, author_user_id, body, category)
        VALUES (${tenant2.id}, ${client2.id}, ${adminUser2.id}, '{"test":true}'::jsonb, 'general')
        RETURNING id
      `);
      const t2NoteId = (t2Note.rows[0] as any).id;

      const res = await request(app)
        .delete(`/api/crm/notes/${t2NoteId}`)
        .set("X-Test-User-Id", adminUser1.id);

      expect(res.status).toBe(404);

      await db.execute(sql`DELETE FROM client_notes WHERE id = ${t2NoteId}`);
    });
  });
});
