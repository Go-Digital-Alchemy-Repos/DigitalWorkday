import { describe, expect, it } from "vitest";

import { getVisibleSections } from "@/features/clients/clientProfileSections";

describe("client profile sections", () => {
  it("keeps Client Intelligence available when optional CRM features are disabled", () => {
    const sections = getVisibleSections(
      { client360: false, approvals: false, clientMessaging: false },
      { assetLibraryV2: false },
    );

    expect(sections.find((section) => section.id === "reports")).toMatchObject({
      label: "Intelligence",
      testId: "tab-intelligence",
    });
  });
});
