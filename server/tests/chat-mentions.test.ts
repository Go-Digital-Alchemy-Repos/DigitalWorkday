import { describe, expect, it } from "vitest";
import { extractMentionedUserIds } from "../http/domains/chat/shared";

describe("chat mention parsing", () => {
  it("extracts unique mentioned user ids from chat markup", () => {
    expect(
      extractMentionedUserIds("Hi @[Ada Lovelace](u1), meet @[Grace Hopper](u2) and @[Ada](u1)")
    ).toEqual(["u1", "u2"]);
  });

  it("ignores plain at-sign text", () => {
    expect(extractMentionedUserIds("email me at hello@example.com or ping @notMarkup")).toEqual([]);
  });
});
