import { describe, expect, it } from "vitest";

import {
  getClientReportDrilldownPath,
  getClientReportPath,
  getEmployeeReportDrilldownPath,
  getEmployeeReportPath,
  getReportBasePath,
} from "@/components/reports/report-paths";

describe("report-path helpers", () => {
  it("builds tenant report paths", () => {
    expect(getReportBasePath("/reports")).toBe("/reports");
    expect(getEmployeeReportPath("/reports", "emp_1")).toBe("/reports/employees/emp_1");
    expect(getClientReportPath("/reports", "client_1")).toBe("/reports/clients/client_1");
  });

  it("builds super admin report paths", () => {
    expect(getReportBasePath("/super-admin/reports")).toBe("/super-admin/reports");
    expect(getEmployeeReportPath("/super-admin/reports", "emp_1")).toBe("/super-admin/reports/employees/emp_1");
    expect(getClientReportPath("/super-admin/reports", "client_1")).toBe("/super-admin/reports/clients/client_1");
  });

  it("preserves range and section on employee drilldowns", () => {
    expect(
      getEmployeeReportDrilldownPath("/reports", "emp_1", {
        range: "30d",
        section: "time",
      }),
    ).toBe("/reports/employees/emp_1?range=30d&section=section-time");
  });

  it("preserves range and section on client drilldowns", () => {
    expect(
      getClientReportDrilldownPath("/super-admin/reports", "client_1", {
        range: "90d",
        section: "health-index",
      }),
    ).toBe("/super-admin/reports/clients/client_1?range=90d&section=section-health-index");
  });
});
