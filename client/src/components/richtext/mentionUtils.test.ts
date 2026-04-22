import { describe, expect, it } from "vitest";
import { getMentionUserLabel, matchesMentionUser, mergeMentionUsers, type MentionableUser } from "./mentionUtils";

const baseUser: MentionableUser = {
  id: "user-1",
  tenantId: "tenant-1",
  email: "alissa@example.com",
  name: "",
  firstName: "Alissa",
  lastName: "King",
  passwordHash: null,
  avatarUrl: null,
  role: "employee",
  isActive: true,
  googleId: null,
  mustChangePasswordOnNextLogin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("mentionUtils", () => {
  it("matches users by first and last name when displayName/name are absent", () => {
    expect(matchesMentionUser(baseUser, "ali")).toBe(true);
    expect(matchesMentionUser(baseUser, "king")).toBe(true);
    expect(matchesMentionUser(baseUser, "alissa king")).toBe(true);
  });

  it("builds a readable label from available name fields", () => {
    expect(getMentionUserLabel(baseUser)).toBe("Alissa King");
    expect(getMentionUserLabel({ ...baseUser, displayName: "Ali K." })).toBe("Ali K.");
    expect(getMentionUserLabel({ ...baseUser, name: "Alissa King" })).toBe("Alissa King");
  });

  it("deduplicates merged mention user lists by id", () => {
    const duplicate = { ...baseUser, email: "different@example.com" };
    expect(mergeMentionUsers([baseUser], [duplicate])).toHaveLength(1);
  });
});
