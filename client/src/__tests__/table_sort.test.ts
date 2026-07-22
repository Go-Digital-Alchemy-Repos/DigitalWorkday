import { describe, expect, it } from "vitest";

import {
  compareTableValues,
  nextTableSortState,
  sortTableRows,
  type TableSortState,
} from "@/lib/table-sort";

describe("table sorting", () => {
  it("sorts text naturally without mutating the source", () => {
    const source = [{ name: "Client 10" }, { name: "client 2" }, { name: "Alpha" }];
    const sorted = sortTableRows(source, (row) => row.name, "asc");

    expect(sorted.map((row) => row.name)).toEqual(["Alpha", "client 2", "Client 10"]);
    expect(source.map((row) => row.name)).toEqual(["Client 10", "client 2", "Alpha"]);
  });

  it("sorts numeric and date values in both directions", () => {
    const rows = [
      { hours: 12.5, activity: new Date("2026-07-01") },
      { hours: 3, activity: new Date("2026-07-20") },
    ];

    expect(sortTableRows(rows, (row) => row.hours, "desc")[0]?.hours).toBe(12.5);
    expect(sortTableRows(rows, (row) => row.activity, "desc")[0]?.hours).toBe(3);
  });

  it("keeps missing values at the bottom", () => {
    expect(compareTableValues(null, 4, "asc")).toBeGreaterThan(0);
    expect(compareTableValues(null, 4, "desc")).toBeGreaterThan(0);
  });

  it("uses the requested first direction then toggles", () => {
    const initial: TableSortState<"name" | "hours"> = { key: null, direction: "asc" };
    const hours = nextTableSortState(initial, "hours", "desc");
    expect(hours).toEqual({ key: "hours", direction: "desc" });
    expect(nextTableSortState(hours, "hours", "desc")).toEqual({ key: "hours", direction: "asc" });
    expect(nextTableSortState(hours, "name", "asc")).toEqual({ key: "name", direction: "asc" });
  });
});
