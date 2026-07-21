import { describe, expect, it } from "vitest";
import { getDbPoolCapacityConfig } from "../dbPoolConfig";

describe("database pool capacity config", () => {
  it("uses conservative per-replica defaults", () => {
    const config = getDbPoolCapacityConfig({ DATABASE_URL: "postgres://example" });

    expect(config.app).toEqual({ min: 2, max: 10 });
    expect(config.session).toEqual({ min: 0, max: 5 });
    expect(config.totalMaxPerReplica).toBe(15);
  });

  it("allows Railway pool sizing to be explicitly capped", () => {
    const config = getDbPoolCapacityConfig({
      DATABASE_URL: "postgres://example",
      DB_POOL_MAX: "6",
      DB_POOL_MIN: "1",
      SESSION_DB_POOL_MAX: "2",
    });

    expect(config.app).toEqual({ min: 1, max: 6 });
    expect(config.session).toEqual({ min: 0, max: 2 });
    expect(config.totalMaxPerReplica).toBe(8);
  });

  it("falls back when values are invalid and clamps min to max", () => {
    const config = getDbPoolCapacityConfig({
      DATABASE_URL: "postgres://example",
      DB_POOL_MAX: "4",
      DB_POOL_MIN: "9",
      SESSION_DB_POOL_MAX: "nope",
      SESSION_DB_POOL_MIN: "-2",
    });

    expect(config.app).toEqual({ min: 4, max: 4 });
    expect(config.session).toEqual({ min: 0, max: 5 });
    expect(config.totalMaxPerReplica).toBe(9);
  });
});
