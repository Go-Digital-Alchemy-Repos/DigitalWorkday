import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId";

const clients = [
  { id: "client-1", tenantId: "tenant-a", workspaceId: "ws-a", companyName: "Acme Co" },
];

const createdDivisions: Array<{
  id: string;
  tenantId: string;
  clientId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  isActive?: boolean;
}> = [];

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [],
        limit: async () => [],
      }),
    }),
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getClientByIdAndTenant: vi.fn(async (id: string, tenantId: string) =>
      clients.find((client) => client.id === id && client.tenantId === tenantId),
    ),
    getUser: vi.fn(async (id: string) => ({
      id,
      tenantId: "tenant-a",
      role: id,
      email: `${id}@example.com`,
      name: id,
    })),
    createClientDivision: vi.fn(async (data: any) => {
      const division = {
        id: `division-${createdDivisions.length + 1}`,
        ...data,
      };
      createdDivisions.push(division);
      return division;
    }),
    getClientDivisionsByClient: vi.fn(async () => []),
    getUserDivisions: vi.fn(async () => []),
    getDivisionMembers: vi.fn(async () => []),
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

function createAuthenticatedApp(role: string) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.isAuthenticated = () => true;
    req.user = { id: role, tenantId: "tenant-a", role };
    req.session = { passport: { user: role } };
    req.tenant = {
      tenantId: "tenant-a",
      effectiveTenantId: "tenant-a",
      isSuperUser: role === "super_user",
    };
    next();
  });
  app.use("/api", clientsRouter);
  app.use(errorHandler);
  return app;
}

describe("Client division permissions", () => {
  beforeEach(() => {
    createdDivisions.length = 0;
  });

  it("allows project managers to create client divisions", async () => {
    const app = createAuthenticatedApp("project_manager");

    const response = await request(app)
      .post("/api/v1/clients/client-1/divisions")
      .send({ name: "Marketing", color: "#3B82F6", isActive: true });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Marketing",
      clientId: "client-1",
      tenantId: "tenant-a",
    });
    expect(createdDivisions).toHaveLength(1);
  });

  it("rejects client portal users from creating client divisions", async () => {
    const app = createAuthenticatedApp("client");

    const response = await request(app)
      .post("/api/v1/clients/client-1/divisions")
      .send({ name: "Private", color: "#3B82F6", isActive: true });

    expect(response.status).toBe(403);
    expect(createdDivisions).toHaveLength(0);
  });
});
