import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  containsAll,
  runProductionReadinessCheck,
} = require("../scripts/production-readiness-check.cjs");

describe("production readiness check", () => {
  it("requires all expected markers to be present", () => {
    expect(containsAll("alpha beta gamma", ["alpha", "gamma"])).toBe(true);
    expect(containsAll("alpha beta gamma", ["alpha", "delta"])).toBe(false);
  });

  it("passes the repository launch gate", () => {
    const result = runProductionReadinessCheck(process.cwd());
    expect(result.ok).toBe(true);
    expect(result.summary.criticalFailures).toBe(0);
    expect(result.checks.find((check: { id: string }) => check.id === "PRD-005")?.ok).toBe(true);
  });
});
