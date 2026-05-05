import { afterEach, describe, expect, it, vi } from "vitest";

import {
  reportRangeSearchParamsFromQuery,
  reportRangeValueFromQuery,
} from "@/components/reports/report-command-center-layout";

describe("report range query state", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a preset range override stale custom date query params", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00Z"));

    const source = new URLSearchParams({
      range: "30d",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-02-28T23:59:59.999Z",
    });

    expect(reportRangeValueFromQuery(source)).toBe(30);

    const next = reportRangeSearchParamsFromQuery(source);
    expect(next.get("range")).toBe("30d");
    expect(next.get("startDate")).not.toContain("2026-02-01");
    expect(next.get("endDate")).not.toContain("2026-02-28");
  });

  it("keeps explicit dates only when the selected range is custom", () => {
    const source = new URLSearchParams({
      range: "custom",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-02-28T23:59:59.999Z",
    });

    const next = reportRangeSearchParamsFromQuery(source);
    expect(next.get("range")).toBe("custom");
    expect(next.get("startDate")).toBe("2026-02-01T00:00:00.000Z");
    expect(next.get("endDate")).toBe("2026-02-28T23:59:59.999Z");
  });
});
