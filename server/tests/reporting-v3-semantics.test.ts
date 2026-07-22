import { describe, expect, it } from "vitest";
import { businessDays } from "../reports/reportingV3";

describe("reporting v3 semantics", () => {
  it("uses weekdays instead of calendar days for working capacity", () => {
    expect(businessDays(new Date("2026-07-20T00:00:00Z"), new Date("2026-07-26T23:59:59Z"))).toBe(5);
    expect(businessDays(new Date("2026-07-18T00:00:00Z"), new Date("2026-07-19T23:59:59Z"))).toBe(0);
  });
});
