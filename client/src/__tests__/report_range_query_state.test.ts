import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildReportRangeSearchParams,
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
    expect(next.get("startDate")).toBeNull();
    expect(next.get("endDate")).toBeNull();
  });

  it("keeps preset-only queries stable for initial profile loads", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00Z"));

    const first = reportRangeSearchParamsFromQuery(new URLSearchParams()).toString();
    vi.setSystemTime(new Date("2026-05-05T12:00:05Z"));
    const second = reportRangeSearchParamsFromQuery(new URLSearchParams()).toString();

    expect(first).toBe("range=30d");
    expect(second).toBe(first);
  });

  it("supports 60-day preset report ranges", () => {
    const source = new URLSearchParams({ range: "60d" });

    expect(reportRangeValueFromQuery(source)).toBe(60);
    expect(reportRangeSearchParamsFromQuery(source).toString()).toBe("range=60d");
    expect(buildReportRangeSearchParams(60).toString()).toBe("range=60d");
  });

  it("keeps year-to-date and lifetime ranges stable in URLs", () => {
    for (const range of ["ytd", "lifetime"] as const) {
      const source = new URLSearchParams({ range });
      expect(reportRangeValueFromQuery(source)).toBe(range);
      expect(reportRangeSearchParamsFromQuery(source).toString()).toBe(`range=${range}`);
      expect(buildReportRangeSearchParams(range).toString()).toBe(`range=${range}`);
    }
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

  it("treats date-only report query params as a custom range", () => {
    const source = new URLSearchParams({
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-02-28T23:59:59.999Z",
    });

    expect(reportRangeValueFromQuery(source)).toEqual({
      mode: "custom",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    const next = reportRangeSearchParamsFromQuery(source);
    expect(next.get("range")).toBe("custom");
    expect(next.get("startDate")).toBe("2026-02-01T00:00:00.000Z");
    expect(next.get("endDate")).toBe("2026-02-28T23:59:59.999Z");
  });
});
