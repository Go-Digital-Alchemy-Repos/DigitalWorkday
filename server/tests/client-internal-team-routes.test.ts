import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { UserRole } from "@shared/schema";

let selectResults: unknown[][] = [];
const insertedValues: unknown[] = [];
const updatedValues: unknown[] = [];

function thenableRows(rows: unknown[]) {
  const chain: Record<string, any> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(async () => rows);
  chain.limit = vi.fn(async () => rows);
  chain.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

const dbMock = {
  select: vi.fn(() => thenableRows(selectResults.shift() || [])),
  insert: vi.fn(() => ({
    values: vi.fn((values: unknown) => {
      insertedValues.push(values);
      return { returning: vi.fn(async () => [{ id: "membership-1", ...(values as object) }]) };
    }),
  })),
  update: vi.fn(() => ({
    set: vi.fn((values: unknown) => {
      updatedValues.push(values);
      const chain = thenableRows([]);
      chain.returning = vi.fn(async () => [{ id: "membership-1", ...(values as object) }]);
      return chain;
    }),
  })),
};

const storageMocks = {
  getClientByIdAndTenant: vi.fn(),
  createActivityLog: vi.fn(),
};

vi.mock("../db", () => ({ db: dbMock }));
vi.mock("../storage", () => ({ storage: storageMocks }));
vi.mock("../services/customerAccessPermissions", () => ({
  getClientDescendantIds: vi.fn(),
  getPortalAccessOptions: vi.fn(),
  getPortalAccessMatrix: vi.fn(),
  filterCommentsForPortalUser: vi.fn(),
  replacePortalAccessScope: vi.fn(),
}));

const { errorHandler } = await import("../middleware/errorHandler");
const { default: portalRouter } = await import("../features/clients/portal.router");

function createApp(role: string = UserRole.ADMIN) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.isAuthenticated = () => true;
    req.user = { id: "admin-1", role, tenantId: "tenant-1" };
    req.tenant = { tenantId: "tenant-1", effectiveTenantId: "tenant-1", isSuperUser: false };
    next();
  });
  app.use("/api/clients", portalRouter);
  app.use(errorHandler);
  return app;
}

describe("client internal team management", () => {
  beforeEach(() => {
    selectResults = [];
    insertedValues.length = 0;
    updatedValues.length = 0;
    vi.clearAllMocks();
    storageMocks.getClientByIdAndTenant.mockResolvedValue({
      id: "client-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
    });
    storageMocks.createActivityLog.mockResolvedValue({ id: "audit-1" });
  });

  it("lists active internal candidates and marks only explicitly selected users", async () => {
    selectResults = [
      [
        { id: "internal-1", name: "Account Lead", email: "lead@example.com", role: UserRole.EMPLOYEE },
        { id: "internal-2", name: "Developer", email: "dev@example.com", role: UserRole.EMPLOYEE },
      ],
      [
        { userId: "internal-1", permissions: { clientPortalDirectory: true } },
        { userId: "internal-2", permissions: { reports: true } },
      ],
    ];

    const response = await request(createApp()).get("/api/clients/client-1/internal-team");

    expect(response.status).toBe(200);
    expect(response.body.users).toEqual([
      expect.objectContaining({ id: "internal-1", selected: true }),
      expect.objectContaining({ id: "internal-2", selected: false }),
    ]);
  });

  it("rejects a user outside the active internal tenant directory", async () => {
    selectResults = [[]];

    const response = await request(createApp())
      .post("/api/clients/client-1/internal-team")
      .send({ userId: "00000000-0000-4000-8000-000000000099" });

    expect(response.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
    expect(storageMocks.createActivityLog).not.toHaveBeenCalled();
  });

  it("does not let regular employees manage the client-facing directory", async () => {
    const response = await request(createApp(UserRole.EMPLOYEE)).get("/api/clients/client-1/internal-team");

    expect(response.status).toBe(403);
    expect(storageMocks.getClientByIdAndTenant).not.toHaveBeenCalled();
  });

  it("adds an internal user with an explicit portal-directory marker and audit event", async () => {
    selectResults = [
      [{ id: "00000000-0000-4000-8000-000000000001" }],
      [],
    ];

    const response = await request(createApp())
      .post("/api/clients/client-1/internal-team")
      .send({ userId: "00000000-0000-4000-8000-000000000001" });

    expect(response.status).toBe(201);
    expect(insertedValues).toEqual([expect.objectContaining({
      tenantId: "tenant-1",
      clientId: "client-1",
      permissions: { clientPortalDirectory: true },
    })]);
    expect(storageMocks.createActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "client_internal_team_member_added",
      entityId: "client-1",
    }));
  });
});
