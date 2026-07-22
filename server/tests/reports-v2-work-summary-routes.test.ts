import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@shared/schema";

const mocks = vi.hoisted(() => ({
  getPmPortfolioReport: vi.fn(),
  getClientWorkSummaryReport: vi.fn(),
  getProjectWorkSummaryReport: vi.fn(),
  getClientWorkSummaryCsv: vi.fn(),
}));

vi.mock("../db", () => ({ db: { execute: vi.fn() } }));
vi.mock("../reports/workSummary", () => ({
  ...mocks,
  toClientSafeWorkSummary: (report: unknown) => report,
}));

const router = (await import("../http/domains/reports-v2-client.router")).default;

function appFor(role: string, tenantId = "tenant-1") {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: "user-1", role, tenantId };
    (req as any).tenant = { effectiveTenantId: tenantId };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api/reports/v2", router);
  return app;
}

describe("reports v2 work-summary routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPmPortfolioReport.mockResolvedValue({ totals: {}, projects: [], clients: [] });
    mocks.getClientWorkSummaryReport.mockResolvedValue({ client: { id: "client-1" }, totals: {} });
    mocks.getProjectWorkSummaryReport.mockResolvedValue({ project: { id: "project-1" }, totals: {} });
    mocks.getClientWorkSummaryCsv.mockResolvedValue('"Date"\n"2026-01-01"');
  });

  it("allows project managers and preserves tenant scope for PM portfolio", async () => {
    const response = await request(appFor(UserRole.PROJECT_MANAGER)).get("/api/reports/v2/pm/portfolio?range=ytd");
    expect(response.status).toBe(200);
    expect(mocks.getPmPortfolioReport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1" }));
  });

  it("denies employees access to internal portfolio reporting", async () => {
    const response = await request(appFor(UserRole.EMPLOYEE)).get("/api/reports/v2/pm/portfolio");
    expect(response.status).toBe(403);
    expect(mocks.getPmPortfolioReport).not.toHaveBeenCalled();
  });

  it("returns tenant-scoped client and project summaries", async () => {
    expect((await request(appFor(UserRole.ADMIN, "tenant-a")).get("/api/reports/v2/clients/client-1/work-summary")).status).toBe(200);
    expect(mocks.getClientWorkSummaryReport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", clientId: "client-1" }));

    expect((await request(appFor(UserRole.ADMIN, "tenant-b")).get("/api/reports/v2/projects/project-1/work-summary")).status).toBe(200);
    expect(mocks.getProjectWorkSummaryReport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-b", projectId: "project-1" }));
  });

  it("exports the complete selected range as CSV", async () => {
    const response = await request(appFor(UserRole.ADMIN)).get("/api/reports/v2/clients/client-1/work-summary.csv?range=lifetime");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("client-work-summary-client-1.csv");
    expect(mocks.getClientWorkSummaryCsv).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", clientId: "client-1" }));
  });

  it("returns 404 when a client is outside the tenant", async () => {
    mocks.getClientWorkSummaryReport.mockResolvedValueOnce(null);
    const response = await request(appFor(UserRole.ADMIN)).get("/api/reports/v2/clients/other-client/work-summary");
    expect(response.status).toBe(404);
  });
});
