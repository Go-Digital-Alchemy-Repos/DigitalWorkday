import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: { execute: vi.fn() } }));

const {
  calculateCompletionPercent,
  calculateWorkVariance,
  toClientSafeWorkSummary,
} = await import("../reports/workSummary");

describe("work summary metric contracts", () => {
  it("compares cumulative hours with cumulative estimates and budgets", () => {
    expect(calculateWorkVariance({
      lifetimeSeconds: 100 * 3600,
      estimatedMinutes: 80 * 60,
      budgetMinutes: 90 * 60,
    })).toEqual({
      lifetimeHours: 100,
      estimatedTotalHours: 80,
      budgetHours: 90,
      varianceHours: 20,
      budgetVarianceHours: 10,
    });
  });

  it("does not claim budget variance when no budget exists", () => {
    expect(calculateWorkVariance({
      lifetimeSeconds: 3600,
      estimatedMinutes: 0,
      budgetMinutes: null,
    }).budgetVarianceHours).toBeNull();
  });

  it("handles empty and populated completion denominators", () => {
    expect(calculateCompletionPercent(0, 0)).toBe(0);
    expect(calculateCompletionPercent(3, 4)).toBe(75);
  });

  it("removes internal-only fields in client-safe mode", () => {
    const safe = toClientSafeWorkSummary({
      totals: { rangeHours: 5, billableHours: 3, nonBillableHours: 2, varianceHours: 1 },
      projects: [{ projectId: "p1", budgetVarianceHours: 2, riskReasons: ["stale"] }],
      contributors: [{ userId: "u1", name: "Alex", email: "alex@example.com" }],
      recentEntries: [{ id: "te1", scope: "out_of_scope", title: "Work" }],
      visibility: { hiddenFromClient: ["varianceHours"] },
    });

    expect(safe.visibility.mode).toBe("client_safe");
    expect(safe.totals).toEqual({ rangeHours: 5 });
    expect(safe.projects[0]).toEqual({ projectId: "p1" });
    expect(safe.contributors[0]).toEqual({ userId: "u1", name: "Alex" });
    expect(safe.recentEntries[0]).toEqual({ id: "te1", title: "Work" });
  });
});
