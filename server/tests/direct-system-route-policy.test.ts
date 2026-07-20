import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const source = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");

describe("direct system route policy coverage", () => {
  it("keeps sensitive observability endpoints behind explicit access middleware", () => {
    expect(source).toMatch(
      /app\.get\("\/api\/v1\/system\/perf\/stats",\s*requireObservabilityAccess,/,
    );
    expect(source).toMatch(
      /app\.get\("\/api\/v1\/system\/observability",\s*requireObservabilityAccess,/,
    );
  });

  it("documents every direct API route in server/index.ts as public telemetry or explicitly guarded", () => {
    const directApiRoutes = [...source.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)]
      .map(([, method, path]) => `${method.toUpperCase()} ${path}`)
      .filter((route) => route.includes(" /api"));

    expect(directApiRoutes.sort()).toEqual([
      "GET /api/health",
      "GET /api/v1/system/features",
      "GET /api/v1/system/health/db",
      "GET /api/v1/system/observability",
      "GET /api/v1/system/perf/stats",
      "POST /api/v1/system/errors/frontend",
      "POST /api/v1/system/perf",
    ].sort());
  });
});
