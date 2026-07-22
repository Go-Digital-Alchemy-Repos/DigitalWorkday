import { describe, expect, it, vi } from "vitest";
import { parsePresetReportRangeDays, parseReportRange } from "../reports/utils";

describe("report range utilities", () => {
  it("parses legacy and named last-N-day presets", () => {
    expect(parsePresetReportRangeDays("30d")).toBe(30);
    expect(parsePresetReportRangeDays("last_90")).toBe(90);
    expect(parsePresetReportRangeDays("last_999")).toBeNull();
    expect(parsePresetReportRangeDays("ytd")).toBeNull();
  });

  it("resolves year-to-date ranges from January 1 through now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));

    const { startDate, endDate } = parseReportRange({ range: "ytd" });

    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(0);
    expect(startDate.getDate()).toBe(1);
    expect(endDate.toISOString()).toBe("2026-07-21T12:00:00.000Z");

    vi.useRealTimers();
  });

  it("resolves lifetime ranges from the canonical reporting floor through now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));

    const { startDate, endDate } = parseReportRange({ range: "lifetime" });

    expect(startDate.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-07-21T12:00:00.000Z");

    vi.useRealTimers();
  });

  it("preserves explicit custom ranges", () => {
    const { startDate, endDate } = parseReportRange({
      startDate: "2026-02-01",
      endDate: "2026-03-01",
    });

    expect(startDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("lets named presets override stale custom dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));

    const { startDate, endDate } = parseReportRange({
      range: "ytd",
      startDate: "2025-01-01T00:00:00.000Z",
      endDate: "2025-02-01T00:00:00.000Z",
    });

    expect(startDate.getFullYear()).toBe(2026);
    expect(endDate.toISOString()).toBe("2026-07-21T12:00:00.000Z");
    vi.useRealTimers();
  });
});
