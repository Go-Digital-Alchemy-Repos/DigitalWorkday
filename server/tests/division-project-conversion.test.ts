import { describe, expect, it } from "vitest";
import { classifyDivisionConversion, replacementProjectValues } from "../services/divisionProjectConversion";

describe("division to project conversion", () => {
  const division = {
    tenantId: "tenant-1",
    clientId: "client-1",
    workspaceId: "workspace-1",
    name: "Marketing",
    description: "Marketing department",
    color: "#EC4899",
    isActive: true,
  };

  it("converts only divisions with zero projects", () => {
    expect(classifyDivisionConversion(0)).toEqual({ eligible: true, reason: "empty" });
    expect(classifyDivisionConversion(1)).toEqual({ eligible: false, reason: "has_projects" });
    expect(classifyDivisionConversion(12)).toEqual({ eligible: false, reason: "has_projects" });
  });

  it("preserves metadata and member scope for a replacement project", () => {
    expect(replacementProjectValues(division, ["admin-1", "member-1"])).toMatchObject({
      tenantId: "tenant-1",
      clientId: "client-1",
      workspaceId: "workspace-1",
      divisionId: null,
      name: "Marketing",
      description: "Marketing department",
      color: "#EC4899",
      visibility: "private",
      status: "active",
      createdBy: "admin-1",
    });
  });

  it("creates workspace projects for memberless divisions and archives inactive ones", () => {
    expect(replacementProjectValues({ ...division, isActive: false }, [])).toMatchObject({
      visibility: "workspace",
      status: "archived",
      createdBy: null,
    });
  });
});
