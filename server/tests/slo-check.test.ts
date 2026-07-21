import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { classifyProbe, normalizeBaseUrl } = require("../scripts/slo-check.cjs");

describe("slo-check helpers", () => {
  it("normalizes base URLs by trimming trailing slashes", () => {
    expect(normalizeBaseUrl("https://digitalworkday.ai///")).toBe("https://digitalworkday.ai");
  });

  it("requires a base URL", () => {
    expect(() => normalizeBaseUrl("")).toThrow("SLO_BASE_URL is required");
  });

  it("passes a healthy probe inside the latency threshold", () => {
    const result = classifyProbe({
      name: "health",
      status: 200,
      durationMs: 120,
      thresholdMs: 1000,
      body: { ok: true, ready: true, version: "abc1234" },
      expectedVersion: "abc1234",
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails probes with user-impacting symptoms", () => {
    const result = classifyProbe({
      name: "readiness",
      status: 503,
      durationMs: 1750,
      thresholdMs: 1500,
      body: { ok: false, ready: false },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("readiness returned HTTP 503");
    expect(result.failures).toContain("readiness latency 1750ms exceeded 1500ms");
    expect(result.failures).toContain("readiness reported ok=false");
    expect(result.failures).toContain("readiness reported ready=false");
  });

  it("flags version drift when an expected version is provided", () => {
    const result = classifyProbe({
      name: "health",
      status: 200,
      durationMs: 90,
      thresholdMs: 1000,
      body: { ok: true, ready: true, version: "abc1234" },
      expectedVersion: "def5678",
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("health version abc1234 did not match expected def5678");
  });
});
