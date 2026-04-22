import { describe, expect, it } from "vitest";
import { getVisibleSections } from "../../client/src/features/clients/clientProfileSections";
import { normalizeClientProfileSection } from "../../client/src/features/clients/useClientProfileSection";

describe("Client profile section cleanup", () => {
  it("does not expose the retired control center section", () => {
    const sections = getVisibleSections(
      { client360: true, approvals: true, clientMessaging: true },
      { assetLibraryV2: true },
    );

    expect(sections.some((section) => section.id === "control-center")).toBe(false);
  });

  it("falls back invalid sections to overview", () => {
    const validIds = new Set(["overview", "contacts", "projects"]);

    expect(normalizeClientProfileSection("projects", validIds)).toBe("projects");
    expect(normalizeClientProfileSection("control-center", validIds)).toBe("overview");
    expect(normalizeClientProfileSection(null, validIds)).toBe("overview");
  });
});
