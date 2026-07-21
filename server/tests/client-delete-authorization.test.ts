import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId";
import { clientCrm, tenants } from "@shared/schema";

const clients = [
  { id: "client-1", tenantId: "tenant-a", workspaceId: "ws-a", companyName: "Acme Co" },
  { id: "client-2", tenantId: "tenant-b", workspaceId: "ws-b", companyName: "Beta Co" },
];

const tenantOwners = new Map<string, string | null>();
const clientOwners = new Map<string, string | null>();

vi.mock("../db", () => ({
  db: {
    select: (_shape?: unknown) => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === tenants) {
              return [{ ownerUserId: tenantOwners.get("tenant-a") ?? null }];
            }
            if (table === clientCrm) {
              return [{ ownerUserId: clientOwners.get("client-1") ?? null }];
            }
            return [];
          },
        }),
      }),
    }),
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getClientByIdAndTenant: vi.fn(async (id: string, tenantId: string) =>
      clients.find((client) => client.id === id && client.tenantId === tenantId),
    ),
    deleteClientWithTenant: vi.fn(async (id: string, tenantId: string) =>
      clients.some((client) => client.id === id && client.tenantId === tenantId),
    ),
    getClient: vi.fn(async (id: string) => clients.find((client) => client.id === id)),
    deleteClient: vi.fn(async () => {}),
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
    req.tenant = {
      tenantId: user.tenantId,
      effectiveTenantId: user.tenantId,
      isSuperUser: user.role === "super_user",
    };
    next();
  });
  app.use("/api", clientsRouter);
  app.use(errorHandler);
  return app;
}

describe("Client delete authorization", () => {
  beforeEach(() => {
    tenantOwners.clear();
    clientOwners.clear();
  });

  it("allows admins to delete clients in their tenant", async () => {
    const app = createAuthenticatedApp({ id: "admin-1", tenantId: "tenant-a", role: "admin" });

    const response = await request(app).delete("/api/clients/client-1");

    expect(response.status).toBe(204);
  });

  it("allows project managers to delete clients in their tenant", async () => {
    const app = createAuthenticatedApp({ id: "pm-role-1", tenantId: "tenant-a", role: "project_manager" });

    const response = await request(app).delete("/api/clients/client-1");

    expect(response.status).toBe(204);
  });

  it("allows tenant owners to delete clients in their tenant", async () => {
    tenantOwners.set("tenant-a", "owner-1");
    const app = createAuthenticatedApp({ id: "owner-1", tenantId: "tenant-a", role: "employee" });

    const response = await request(app).delete("/api/clients/client-1");

    expect(response.status).toBe(204);
  });

  it("allows client project managers to delete their client", async () => {
    clientOwners.set("client-1", "pm-1");
    const app = createAuthenticatedApp({ id: "pm-1", tenantId: "tenant-a", role: "employee" });

    const response = await request(app).delete("/api/clients/client-1");

    expect(response.status).toBe(204);
  });

  it("returns 403 for ordinary employees", async () => {
    const app = createAuthenticatedApp({ id: "employee-1", tenantId: "tenant-a", role: "employee" });

    const response = await request(app).delete("/api/clients/client-1");

    expect(response.status).toBe(403);
  });

  it("returns 404 for clients outside the user's tenant", async () => {
    tenantOwners.set("tenant-a", "owner-1");
    const app = createAuthenticatedApp({ id: "owner-1", tenantId: "tenant-a", role: "employee" });

    const response = await request(app).delete("/api/clients/client-2");

    expect(response.status).toBe(404);
  });

  it("requires super users to select an effective tenant before deleting clients", async () => {
    const app = createAuthenticatedApp({ id: "super-1", tenantId: null, role: "super_user" });

    const response = await request(app).delete("/api/clients/client-1");

    expect(response.status).toBe(400);
    expect(response.body.code || response.body.error?.code).toBe("TENANT_REQUIRED");
  });
});
