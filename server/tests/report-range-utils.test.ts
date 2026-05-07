import { afterEach, describe, expect, it, vi } from "vitest";

import { parsePresetReportRangeDays, parseReportRange } from "../reports/utils";

describe("report range utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses supported preset range query values", () => {
    expect(parsePresetReportRangeDays("7d")).toBe(7);
    expect(parsePresetReportRangeDays("30d")).toBe(30);
    expect(parsePresetReportRangeDays("60d")).toBe(60);
    expect(parsePresetReportRangeDays("90d")).toBe(90);
  });

  it("uses preset ranges when only range is provided", () => {
    const now = new Date("2026-05-05T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const { startDate, endDate } = parseReportRange({ range: "60d" });

    expect(startDate.toISOString()).toBe(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString());
    expect(endDate.toISOString()).toBe(now.toISOString());
  });

  it("lets preset range override stale custom dates", () => {
    const now = new Date("2026-05-05T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const { startDate, endDate } = parseReportRange({
      range: "30d",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-02-28T23:59:59.999Z",
    });

    expect(startDate.toISOString()).toBe(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
    expect(endDate.toISOString()).toBe(now.toISOString());
  });

  it("keeps explicit dates for custom ranges", () => {
    const { startDate, endDate } = parseReportRange({
      range: "custom",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-02-28T23:59:59.999Z",
    });

    expect(startDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-02-28T23:59:59.999Z");
  });
});
