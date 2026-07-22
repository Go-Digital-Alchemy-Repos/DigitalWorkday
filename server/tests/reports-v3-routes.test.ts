import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@shared/schema";

const mocks = vi.hoisted(() => ({
  getDeliveryOperationsReport: vi.fn(),
  getPeopleCapacityReport: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../db", () => ({ db: { execute: mocks.execute } }));
vi.mock("../reports/reportingV3", () => ({
  getDeliveryOperationsReport: mocks.getDeliveryOperationsReport,
  getPeopleCapacityReport: mocks.getPeopleCapacityReport,
}));

const router = (await import("../http/domains/reports-v3.router")).default;

function appFor(role: string, tenantId = "tenant-1") {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: "user-1", role, tenantId };
    (req as any).tenant = { effectiveTenantId: tenantId };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api/reports/v3", router);
  return app;
}

describe("reports v3 routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDeliveryOperationsReport.mockResolvedValue({ metadata: {}, snapshot: {}, coverage: {}, attentionQueue: [], projects: [] });
    mocks.getPeopleCapacityReport.mockResolvedValue({ metadata: {}, summary: {}, people: [] });
    mocks.execute.mockResolvedValue([{ user_id: "employee-1" }]);
  });

  it("preserves effective tenant scope for delivery and people reports", async () => {
    expect((await request(appFor(UserRole.ADMIN, "tenant-a")).get("/api/reports/v3/delivery?range=30d")).status).toBe(200);
    expect(mocks.getDeliveryOperationsReport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a" }));

    expect((await request(appFor(UserRole.PROJECT_MANAGER, "tenant-b")).get("/api/reports/v3/people?range=ytd")).status).toBe(200);
    expect(mocks.getPeopleCapacityReport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-b" }));
  });

  it("denies employees access to internal reporting", async () => {
    const response = await request(appFor(UserRole.EMPLOYEE)).get("/api/reports/v3/home");
    expect(response.status).toBe(403);
    expect(mocks.getDeliveryOperationsReport).not.toHaveBeenCalled();
  });

  it("builds the report home from the same delivery and people services", async () => {
    mocks.getDeliveryOperationsReport.mockResolvedValueOnce({ metadata: { generatedAt: "now" }, snapshot: { activeProjects: 2 }, coverage: { estimatePct: 60 }, attentionQueue: [{ id: 1 }] });
    mocks.getPeopleCapacityReport.mockResolvedValueOnce({ summary: { estimateCoveragePct: 75 } });
    const response = await request(appFor(UserRole.ADMIN)).get("/api/reports/v3/home?range=30d");
    expect(response.status).toBe(200);
    expect(response.body.delivery.activeProjects).toBe(2);
    expect(response.body.coverage.estimatePct).toBe(75);
  });

  it("validates capacity and updates only the effective tenant workspace", async () => {
    const invalid = await request(appFor(UserRole.ADMIN)).patch("/api/reports/v3/people/employee-1/capacity").send({ weeklyCapacityHours: 0 });
    expect(invalid.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();

    const valid = await request(appFor(UserRole.ADMIN, "tenant-capacity")).patch("/api/reports/v3/people/employee-1/capacity").send({ weeklyCapacityHours: 32 });
    expect(valid.status).toBe(200);
    expect(valid.body.weeklyCapacityHours).toBe(32);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("validates capacity exceptions before writing them", async () => {
    const invalid = await request(appFor(UserRole.ADMIN))
      .put("/api/reports/v3/people/employee-1/capacity-exceptions")
      .send({ date: "07/21/2026", availableHours: 8 });
    expect(invalid.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();

    const valid = await request(appFor(UserRole.ADMIN, "tenant-capacity"))
      .put("/api/reports/v3/people/employee-1/capacity-exceptions")
      .send({ date: "2026-07-21", availableHours: 4, note: "Half day" });
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({ userId: "employee-1", date: "2026-07-21", availableHours: 4 });
  });

  it("persists and lists saved report views for the signed-in user", async () => {
    mocks.execute.mockResolvedValueOnce([{ id: "view-1", name: "At risk", workspace: "delivery", query: "range=30d", isShared: false, userId: "user-1" }]);
    const created = await request(appFor(UserRole.PROJECT_MANAGER, "tenant-views"))
      .post("/api/reports/v3/saved-views")
      .send({ workspace: "delivery", name: "At risk", query: "range=30d", isShared: false });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe("view-1");

    mocks.execute.mockResolvedValueOnce([{ id: "view-1", name: "At risk", workspace: "delivery" }]);
    const listed = await request(appFor(UserRole.PROJECT_MANAGER, "tenant-views"))
      .get("/api/reports/v3/saved-views?workspace=delivery");
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
  });

  it("rejects unknown detail resources", async () => {
    const response = await request(appFor(UserRole.ADMIN)).get("/api/reports/v3/details/comments");
    expect(response.status).toBe(404);
  });
});
