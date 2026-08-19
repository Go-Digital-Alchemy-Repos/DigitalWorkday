import { describe, expect, it } from "vitest";
import { getPortalCapabilities, normalizePortalAccessLevel } from "../services/portalAuthorization";

describe("two-role portal capabilities", () => {
  it("temporarily treats legacy viewer assignments as collaborators", () => {
    expect(normalizePortalAccessLevel("viewer")).toBe("collaborator");
  });

  it("gives collaborators operational access without administration", () => {
    const capabilities = getPortalCapabilities("collaborator");
    expect(capabilities.manageTasks).toBe(true);
    expect(capabilities.manageClientVisibleAssets).toBe(true);
    expect(capabilities.manageProjects).toBe(false);
    expect(capabilities.viewActivity).toBe(false);
    expect(capabilities.managePortalUsers).toBe(false);
  });

  it("adds Client Admin capabilities without adding deletion", () => {
    const capabilities = getPortalCapabilities("client_admin");
    expect(capabilities.manageProjects).toBe(true);
    expect(capabilities.editOverview).toBe(true);
    expect(capabilities.editContacts).toBe(true);
    expect(capabilities.managePortalUsers).toBe(true);
    expect(capabilities).not.toHaveProperty("delete");
  });
});
