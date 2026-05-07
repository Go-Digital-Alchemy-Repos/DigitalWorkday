import { describe, expect, it } from "vitest";

import { getReportViewState } from "@/components/reports/report-view-state";

describe("getReportViewState", () => {
  it("prioritizes loading while a query is still in flight", () => {
    expect(
      getReportViewState({
        isLoading: true,
        isError: true,
        hasData: false,
      }),
    ).toBe("loading");
  });

  it("returns error when loading has finished and the query failed", () => {
    expect(
      getReportViewState({
        isLoading: false,
        isError: true,
        hasData: true,
      }),
    ).toBe("error");
  });

  it("returns empty when the request succeeded but there is no matching data", () => {
    expect(
      getReportViewState({
        isLoading: false,
        isError: false,
        hasData: false,
      }),
    ).toBe("empty");
  });

  it("returns ready when data is present", () => {
    expect(
      getReportViewState({
        isLoading: false,
        isError: false,
        hasData: true,
      }),
    ).toBe("ready");
  });
});
