import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId";

const workspaceIds = new Map<string, string>();
const createdClients: Array<{
  id: string;
  companyName: string;
  tenantId: string | null;
  workspaceId: string;
  status: string;
  createdAt: Date;
}> = [];

vi.mock("../lib/workspaceCache", () => ({
  warmWorkspaceCache: vi.fn(async () => {}),
  getWorkspaceFromCache: vi.fn((tenantId: string) => workspaceIds.get(tenantId) ?? null),
}));

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [{ id: "tenant-from-mock" }],
        limit: async () => [{ id: "tenant-from-mock" }],
      }),
    }),
  },
}));

vi.mock("../storage", () => ({
  storage: {
    createClientWithTenant: vi.fn(async (data: { companyName: string; workspaceId: string }, tenantId: string) => {
      const client = {
        id: `client-${createdClients.length + 1}`,
        companyName: data.companyName,
        displayName: null,
        status: "active",
        workspaceId: data.workspaceId,
        tenantId,
        createdAt: new Date(),
      };
      createdClients.push(client);
      return client;
    }),
    createClient: vi.fn(async (data: { companyName: string; workspaceId: string; tenantId?: string | null }) => {
      const client = {
        id: `client-${createdClients.length + 1}`,
        companyName: data.companyName,
        displayName: null,
        status: "active",
        workspaceId: data.workspaceId,
        tenantId: data.tenantId ?? null,
        createdAt: new Date(),
      };
      createdClients.push(client);
      return client;
    }),
    getClientsByTenantBatched: vi.fn(async (tenantId: string) =>
      createdClients.filter((client) => client.tenantId === tenantId).map((client) => ({
        ...client,
        contacts: [],
        projects: [],
      })),
    ),
    getClientsByTenant: vi.fn(async (tenantId: string) =>
      createdClients.filter((client) => client.tenantId === tenantId).map((client) => ({
        ...client,
        contacts: [],
        projects: [],
      })),
    ),
    getClientsByWorkspace: vi.fn(async (workspaceId: string) =>
      createdClients.filter((client) => client.workspaceId === workspaceId).map((client) => ({
        ...client,
        contacts: [],
        projects: [],
      })),
    ),
  },
}));

vi.mock("../realtime/events", () => ({
  emitClientCreated: vi.fn(),
  emitClientUpdated: vi.fn(),
  emitClientDeleted: vi.fn(),
  emitClientContactCreated: vi.fn(),
  emitClientContactUpdated: vi.fn(),
  emitClientContactDeleted: vi.fn(),
  emitClientInviteSent: vi.fn(),
  emitClientInviteRevoked: vi.fn(),
  emitProjectCreated: vi.fn(),
  emitProjectClientAssigned: vi.fn(),
}));

const { tenantContextMiddleware } = await import("../middleware/tenantContext");
const { errorHandler } = await import("../middleware/errorHandler");
const { default: clientsRouter } = await import("../routes/clients.router");

function createAuthenticatedApp(user: { id: string; tenantId: string | null; role: string }) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.isAuthenticated = () => true;
    req.user = user;
    req.session = { passport: { user: user.id } };
    next();
  });
  app.use(tenantContextMiddleware);
  app.use("/api", clientsRouter);
  app.use(errorHandler);
  return app;
}

describe("Client creation workspace resolution", () => {
  beforeEach(() => {
    workspaceIds.clear();
    createdClients.length = 0;
  });

  it("creates a client on the first request using the tenant's real workspace", async () => {
    workspaceIds.set("tenant-admin", "workspace-admin");

    const app = createAuthenticatedApp({
      id: "admin-1",
      tenantId: "tenant-admin",
      role: "admin",
    });

    const response = await request(app)
      .post("/api/clients")
      .send({ companyName: "Cold Cache Client" });

    expect(response.status).toBe(201);
    expect(response.body.companyName).toBe("Cold Cache Client");
    expect(response.body.workspaceId).toBe("workspace-admin");
    expect(response.body.workspaceId).not.toBe("demo-workspace-id");
    expect(response.body.tenantId).toBe("tenant-admin");
  });

  it("returns a clear error when the tenant has no workspace", async () => {
    const app = createAuthenticatedApp({
      id: "admin-2",
      tenantId: "tenant-missing-workspace",
      role: "admin",
    });

    const response = await request(app)
      .post("/api/clients")
      .send({ companyName: "Should Fail" });

    expect(response.status).toBe(500);
    expect(response.body.ok).toBe(false);
    expect(response.body.error?.message).toContain("No workspace found for tenant");
    expect(response.body.error?.code).toBe("INTERNAL_ERROR");
  });

  it("lets a super user with their own tenant impersonate another tenant via X-Tenant-Id", async () => {
    workspaceIds.set("tenant-own", "workspace-own");
    workspaceIds.set("tenant-impersonated", "workspace-impersonated");

    const app = createAuthenticatedApp({
      id: "super-1",
      tenantId: "tenant-own",
      role: "super_user",
    });

    const createResponse = await request(app)
      .post("/api/clients")
      .set("X-Tenant-Id", "tenant-impersonated")
      .send({ companyName: "Impersonated Tenant Client" });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.tenantId).toBe("tenant-impersonated");
    expect(createResponse.body.workspaceId).toBe("workspace-impersonated");

    const listResponse = await request(app)
      .get("/api/clients")
      .set("X-Tenant-Id", "tenant-impersonated");

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.some((client: { id: string }) => client.id === createResponse.body.id)).toBe(true);
    expect(listResponse.body.every((client: { tenantId: string }) => client.tenantId === "tenant-impersonated")).toBe(true);
  });
});
