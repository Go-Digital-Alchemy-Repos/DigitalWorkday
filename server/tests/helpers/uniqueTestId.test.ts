import { afterEach, describe, expect, it, vi } from "vitest";

import { uniqueTestId } from "./uniqueTestId";

describe("uniqueTestId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a monotonic suffix so IDs remain unique within the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_787_000_000_000);

    const first = uniqueTestId("fixture");
    const second = uniqueTestId("fixture");

    expect(first).toMatch(/^fixture-1787000000000-\d+-\d+$/);
    expect(second).toMatch(/^fixture-1787000000000-\d+-\d+$/);
    expect(second).not.toBe(first);
  });
});
