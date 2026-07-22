import { describe, expect, it } from "vitest";
import { reportWorkspaceFromValue } from "@/pages/reports";

describe("report workspace routing", () => {
  it("maps legacy report tabs into the consolidated workspaces", () => {
    expect(reportWorkspaceFromValue("task-analytics")).toBe("delivery");
    expect(reportWorkspaceFromValue("time")).toBe("delivery");
    expect(reportWorkspaceFromValue("employee-cc")).toBe("people");
    expect(reportWorkspaceFromValue("workload")).toBe("people");
    expect(reportWorkspaceFromValue("client-analytics")).toBe("clients");
    expect(reportWorkspaceFromValue("client-cc")).toBe("clients");
  });

  it("falls back to the operational overview", () => {
    expect(reportWorkspaceFromValue(null)).toBe("home");
    expect(reportWorkspaceFromValue("unknown")).toBe("home");
  });
});
