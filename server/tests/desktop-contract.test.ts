import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { desktopBootstrapSchema, desktopCommandCenterSchema, desktopNotificationPageSchema, desktopProfileUpdateSchema, desktopTodaySchema, desktopUserSchema } from "@shared/desktopContracts";
import { derivePKCEChallenge, hashDesktopToken } from "../features/desktop/desktopAuth.service";
import { trailingDateKeys, zonedDayRange } from "../features/desktop/desktopCommandCenter";
import { toDesktopMembers } from "../features/desktop/desktop.router";
import { validateAvatar } from "../s3";

describe("desktop companion contract", () => {
  it("keeps the checked-in bootstrap fixture Codable-friendly", () => {
    const fixture = JSON.parse(readFileSync("docs/contracts/desktop-bootstrap.v1.json", "utf8"));
    const parsed = desktopBootstrapSchema.parse(fixture);
    expect(parsed.contractVersion).toBe(1);
    expect(parsed.user.firstName).toBe("Alex");
    expect(parsed.tasks.items[0]?.projectName).toBe("Website Launch");
  });

  it("uses active tenant users for the desktop assignee directory", () => {
    const members = toDesktopMembers([
      { id: "active", name: "Active User", email: "active@example.com", role: "employee", avatarUrl: null, isActive: true },
      { id: "inactive", name: "Inactive User", email: "inactive@example.com", role: "employee", avatarUrl: null, isActive: false },
    ]);

    expect(members).toEqual([{
      id: "active",
      name: "Active User",
      email: "active@example.com",
      role: "employee",
      avatarUrl: null,
    }]);
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

  it("validates the command-center workload, trend, and agenda contract", () => {
    const days = trailingDateKeys("2026-08-20", 7).map((date, index) => ({ date, seconds: index * 600 }));
    const parsed = desktopCommandCenterSchema.parse({
      date: "2026-08-20",
      timeZone: "America/New_York",
      workload: { overdue: 3, today: 7, upcoming: 12 },
      trackedTodaySeconds: 3600,
      trackedWeekSeconds: days.reduce((total, day) => total + day.seconds, 0),
      trackedDays: days,
      agenda: [
        { id: "task:1", kind: "task", taskId: "1", title: "Plan release", subtitle: "Digital Workday",
          start: "2026-08-20T14:00:00.000Z", end: null, allDay: false, durationSeconds: 3600 },
        { id: "task:2", kind: "personal_task", taskId: "2", title: "Plan errands", subtitle: "Personal",
          start: "2026-08-20T18:00:00.000Z", end: null, allDay: false, durationSeconds: null },
      ],
    });
    expect(parsed.trackedDays).toHaveLength(7);
    expect(parsed.agenda[0]?.taskId).toBe("1");
    expect(parsed.agenda[1]?.kind).toBe("personal_task");
  });

  it("uses calendar-day boundaries across daylight-saving transitions", () => {
    const spring = zonedDayRange("2026-03-08", "America/New_York");
    const fall = zonedDayRange("2026-11-01", "America/New_York");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
  });
});
