import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { desktopBootstrapSchema, desktopNotificationPageSchema, desktopProfileUpdateSchema, desktopTodaySchema, desktopUserSchema } from "@shared/desktopContracts";
import { derivePKCEChallenge, hashDesktopToken } from "../features/desktop/desktopAuth.service";
import { validateAvatar } from "../s3";

describe("desktop companion contract", () => {
  it("keeps the checked-in bootstrap fixture Codable-friendly", () => {
    const fixture = JSON.parse(readFileSync("docs/contracts/desktop-bootstrap.v1.json", "utf8"));
    const parsed = desktopBootstrapSchema.parse(fixture);
    expect(parsed.contractVersion).toBe(1);
    expect(parsed.user.firstName).toBe("Alex");
    expect(parsed.tasks.items[0]?.projectName).toBe("Website Launch");
  });

  it("derives RFC 7636 S256 challenges", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(derivePKCEChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("hashes tokens without persisting plaintext", () => {
    expect(hashDesktopToken("secret-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDesktopToken("secret-token")).not.toContain("secret-token");
  });

  it("keeps profile DTOs additive and validates structured names", () => {
    expect(desktopUserSchema.parse({
      id: "user-1", name: "Alex Rivera", firstName: null, lastName: null,
      email: "alex@example.com", role: "employee", avatarUrl: null,
    }).firstName).toBeNull();
    expect(desktopProfileUpdateSchema.parse({ firstName: " Alex ", lastName: " Rivera " })).toEqual({ firstName: "Alex", lastName: "Rivera" });
    expect(desktopProfileUpdateSchema.safeParse({ firstName: " ", lastName: "Rivera" }).success).toBe(false);
    expect(desktopProfileUpdateSchema.safeParse({ firstName: "Alex", lastName: "Rivera", role: "admin" }).success).toBe(false);
  });

  it("enforces desktop avatar MIME and size constraints", () => {
    expect(validateAvatar("image/png", 2 * 1024 * 1024).valid).toBe(true);
    expect(validateAvatar("image/heic", 100).valid).toBe(false);
    expect(validateAvatar("image/jpeg", 2 * 1024 * 1024 + 1).valid).toBe(false);
  });

  it("keeps Today and notification payloads cursor-friendly", () => {
    const fixture = JSON.parse(readFileSync("docs/contracts/desktop-bootstrap.v1.json", "utf8"));
    const task = fixture.tasks.items[0];
    expect(desktopTodaySchema.parse({
      start: "2026-08-19T04:00:00.000Z", end: "2026-08-20T04:00:00.000Z",
      overdue: [], today: [task], agenda: [task], trackedSeconds: 3720,
    }).trackedSeconds).toBe(3720);
    expect(desktopNotificationPageSchema.parse({
      items: [{ id: "n-1", type: "task_assigned", title: "Assigned", message: null, severity: "info",
        entityType: "task", entityId: task.id, payloadJson: null, readAt: null,
        createdAt: "2026-08-19T12:00:00.000Z", lastEventAt: "2026-08-19T12:00:00.000Z", eventCount: 1 }],
      nextCursor: null, unreadCount: 1,
    }).unreadCount).toBe(1);
  });
});
