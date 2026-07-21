import { afterEach, describe, expect, it, vi } from "vitest";
import { externalFetch } from "../lib/fetchWithTimeout";

describe("externalFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a timeout signal to external requests by default", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    await externalFetch("https://example.com/api", { headers: { Accept: "application/json" } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("preserves an explicit caller-provided signal", async () => {
    const controller = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    await externalFetch("https://example.com/api", { signal: controller.signal });

    expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});
