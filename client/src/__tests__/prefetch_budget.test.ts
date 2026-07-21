import { describe, expect, it } from "vitest";

import { getTenantPrefetchRouteNames } from "@/lib/prefetch";

describe("tenant route prefetch budget", () => {
  it("keeps routine tenant routes warm without prefetching chat by default", () => {
    expect(getTenantPrefetchRouteNames()).toEqual([
      "tenant-router",
      "home",
      "my-tasks",
      "projects-dashboard",
      "my-time",
    ]);
  });

  it("can include chat when the budget is explicitly higher", () => {
    expect(getTenantPrefetchRouteNames(400)).toContain("chat");
  });
});
