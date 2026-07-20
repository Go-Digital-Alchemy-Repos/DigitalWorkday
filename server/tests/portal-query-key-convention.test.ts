import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";

describe("portal query key convention", () => {
  it("uses centralized portal query key builders for portal API caches", () => {
    const result = spawnSync(
      "rg",
      [
        "-n",
        'queryKey: \\["/api/(client-portal|crm/portal|v1/portal)|invalidateQueries\\(\\{ queryKey: \\["/api/(client-portal|crm/portal|v1/portal)',
        "client/src/pages",
        "client/src/components",
        "client/src/lib",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe("");
  });
});
