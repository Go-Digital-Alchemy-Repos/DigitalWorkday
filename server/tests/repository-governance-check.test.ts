import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  containsAll,
  runRepositoryGovernanceCheck,
} = require("../../script/repository-governance-check.cjs");

describe("repository governance check", () => {
  it("requires all expected markers", () => {
    expect(containsAll("branch review release", ["branch", "release"])).toBe(true);
    expect(containsAll("branch review release", ["branch", "owners"])).toBe(false);
  });

  it("passes the repository governance gate", () => {
    const result = runRepositoryGovernanceCheck(process.cwd());
    expect(result.ok).toBe(true);
    expect(result.summary.criticalFailures).toBe(0);
    expect(result.checks.find((check: { id: string }) => check.id === "GOV-002")?.ok).toBe(true);
    expect(result.checks.find((check: { id: string }) => check.id === "GOV-004")?.ok).toBe(true);
  });
});

