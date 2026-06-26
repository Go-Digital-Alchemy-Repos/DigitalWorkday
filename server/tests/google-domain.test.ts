import { describe, expect, it } from "vitest";

import { getConfiguredGoogleAllowedDomains, isGoogleEmailAllowed } from "../auth/googleDomain";

describe("Google OAuth domain allowlist", () => {
  it("normalizes configured domains", () => {
    expect(getConfiguredGoogleAllowedDomains(" @example.com, Example.org ")).toEqual([
      "example.com",
      "example.org",
    ]);
  });

  it("allows any email when no domains are configured", () => {
    expect(isGoogleEmailAllowed("person@outside.test", [])).toBe(true);
  });

  it("allows matching domains case-insensitively", () => {
    expect(isGoogleEmailAllowed("Person@Example.com", ["example.com"])).toBe(true);
  });

  it("rejects non-matching domains", () => {
    expect(isGoogleEmailAllowed("person@outside.test", ["example.com"])).toBe(false);
  });
});
