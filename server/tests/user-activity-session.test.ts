import { describe, expect, it } from "vitest";
import {
  ACTIVITY_HEARTBEAT_CAP_SECONDS,
  ACTIVITY_IDLE_SPLIT_MS,
  advanceActivityClock,
  friendlyBrowserDevice,
  friendlyMacDevice,
  opaqueActivitySourceId,
  shouldEndActivitySession,
} from "../features/activity/userActivitySession.service";
import { ACTIVITY_HEARTBEAT_RATE_LIMIT_MAX } from "../middleware/rateLimit";

describe("user activity session policy", () => {
  const started = new Date("2026-08-21T12:00:00.000Z");

  it("credits active time and caps delayed heartbeat gaps", () => {
    expect(advanceActivityClock({ state: "active", lastSeenAt: started, activeSeconds: 10 }, new Date(started.getTime() + 60_000)))
      .toEqual({ shouldSplit: false, creditedSeconds: 60, activeSeconds: 70 });
    expect(advanceActivityClock({ state: "active", lastSeenAt: started, activeSeconds: 10 }, new Date(started.getTime() + 240_000)).creditedSeconds)
      .toBe(ACTIVITY_HEARTBEAT_CAP_SECONDS);
  });

  it("does not credit idle or hidden time", () => {
    for (const state of ["idle", "hidden"]) {
      expect(advanceActivityClock({ state, lastSeenAt: started, activeSeconds: 25 }, new Date(started.getTime() + 60_000)))
        .toEqual({ shouldSplit: false, creditedSeconds: 0, activeSeconds: 25 });
    }
  });

  it("splits a session after five minutes without activity", () => {
    expect(advanceActivityClock({ state: "active", lastSeenAt: started, activeSeconds: 30 }, new Date(started.getTime() + ACTIVITY_IDLE_SPLIT_MS)))
      .toEqual({ shouldSplit: true, creditedSeconds: 0, activeSeconds: 30 });
  });

  it("ends after the client reports its five-minute idle transition", () => {
    expect(shouldEndActivitySession({ state: "active", lastSeenAt: started, lastActiveAt: started, activeSeconds: 30 }, "idle", new Date(started.getTime() + ACTIVITY_IDLE_SPLIT_MS))).toBe(true);
    expect(shouldEndActivitySession({ state: "active", lastSeenAt: started, lastActiveAt: started, activeSeconds: 30 }, "hidden", new Date(started.getTime() + 60_000))).toBe(false);
    expect(shouldEndActivitySession({ state: "hidden", lastSeenAt: new Date(started.getTime() + 60_000), lastActiveAt: started, activeSeconds: 30 }, "hidden", new Date(started.getTime() + ACTIVITY_IDLE_SPLIT_MS))).toBe(true);
  });

  it("stores only coarse friendly device labels", () => {
    const raw = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";
    expect(friendlyBrowserDevice(raw)).toBe("Chrome on macOS");
    expect(friendlyBrowserDevice("Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1")).toBe("Safari on iOS");
    expect(friendlyBrowserDevice(raw)).not.toContain("128.0");
    expect(friendlyMacDevice("Mike's MacBook\nBearer secret")).toBe("Mike's MacBook Bearer secret");
    expect(friendlyMacDevice(null)).toBe("Mac Desktop");
  });

  it("bounds authenticated heartbeat writes while allowing normal transitions", () => {
    expect(ACTIVITY_HEARTBEAT_RATE_LIMIT_MAX).toBe(120);
  });

  it("correlates browser activity without storing the raw session identifier", () => {
    const source = opaqueActivitySourceId("web", "raw-cookie-session-id", "test-secret");
    expect(source).toMatch(/^web:[A-Za-z0-9_-]{43}$/);
    expect(source).not.toContain("raw-cookie-session-id");
    expect(source).toBe(opaqueActivitySourceId("web", "raw-cookie-session-id", "test-secret"));
  });
});
