import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { UserRole } from "@shared/schema";

let selectResults: unknown[][] = [];

function queryChain(rows: unknown[]) {
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

const getClientPortalInternalDirectoryMock = vi.fn();
const getClientUserAccessibleClientsMock = vi.fn();

vi.mock("../db", () => ({
  db: { select: vi.fn(() => queryChain(selectResults.shift() || [])) },
}));
vi.mock("../auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../middleware/clientAccess", () => ({
  getClientUserAccessibleClients: getClientUserAccessibleClientsMock,
}));
vi.mock("../services/clientPortalDirectory", () => ({
  getClientPortalInternalDirectory: getClientPortalInternalDirectoryMock,
}));

const { errorHandler } = await import("../middleware/errorHandler");
const { default: messageRouter } = await import("../routes/modules/crm/message-templates.router");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.user = { id: "portal-1", role: UserRole.CLIENT, tenantId: "tenant-1" };
    req.tenant = { tenantId: "tenant-1", effectiveTenantId: "tenant-1", isSuperUser: false };
    next();
  });
  app.use("/api", messageRouter);
  app.use(errorHandler);
  return app;
}

describe("client portal message directory", () => {
  beforeEach(() => {
    selectResults = [];
    vi.clearAllMocks();
    getClientUserAccessibleClientsMock.mockResolvedValue(["11111111-1111-4111-8111-111111111111"]);
    getClientPortalInternalDirectoryMock.mockResolvedValue([
      { id: "22222222-2222-4222-8222-222222222222", name: "Account Lead", avatarUrl: null },
    ]);
  });

  it("returns only the client-level internal allowlist without internal email addresses", async () => {
    selectResults = [[{
      id: "33333333-3333-4333-8333-333333333333",
      name: "Other Portal User",
      email: "other-client@example.com",
      role: UserRole.CLIENT,
    }]];

    const response = await request(createApp())
      .get("/api/crm/portal/conversation-recipients?clientId=11111111-1111-4111-8111-111111111111");

    expect(response.status).toBe(200);
    expect(response.body.tenantUsers).toEqual([expect.objectContaining({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Account Lead",
      email: "",
    })]);
    expect(response.body.tenantUsers).toHaveLength(1);
  });

  it("rejects a forged internal message recipient outside the client allowlist", async () => {
    selectResults = [[]];

    const response = await request(createApp())
      .post("/api/crm/portal/conversations")
      .field("clientId", "11111111-1111-4111-8111-111111111111")
      .field("subject", "Question")
      .field("initialMessage", "Please help")
      .field("recipientKind", "tenant_user")
      .field("recipientUserId", "99999999-9999-4999-8999-999999999999");

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("That team recipient is not available");
  });
});

