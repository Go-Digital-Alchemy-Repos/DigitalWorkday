import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  containsAll,
  runPublishingReadinessCheck,
} = require("../scripts/publishing-readiness-check.cjs");

describe("publishing readiness check", () => {
  it("requires expected static markers", () => {
    expect(containsAll("draft preview publish", ["draft", "publish"])).toBe(true);
    expect(containsAll("draft preview publish", ["draft", "rollback"])).toBe(false);
  });

  it("passes the current non-CMS publishing boundary", () => {
    const result = runPublishingReadinessCheck(process.cwd());
    expect(result.ok).toBe(true);
    expect(result.summary.criticalFailures).toBe(0);
    expect(result.checks.find((check: { id: string }) => check.id === "PUB-003")?.ok).toBe(true);
    expect(result.checks.find((check: { id: string }) => check.id === "PUB-005")?.ok).toBe(true);
  });
});
