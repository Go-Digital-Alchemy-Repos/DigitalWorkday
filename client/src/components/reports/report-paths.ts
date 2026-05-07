import { buildReportRangeSearchParams, type ReportRangeValue } from "./report-command-center-layout";

const TENANT_REPORTS_BASE = "/reports";
const SUPER_ADMIN_REPORTS_BASE = "/super-admin/reports";

export type EmployeeReportSection =
  | "workload"
  | "time"
  | "assigned-tasks"
  | "capacity"
  | "risk"
  | "trend";

export type ClientReportSection =
  | "workload"
  | "time"
  | "sla"
  | "health-index"
  | "risk"
  | "projects";

export function getReportBasePath(pathname: string): string {
  return pathname.startsWith(SUPER_ADMIN_REPORTS_BASE)
    ? SUPER_ADMIN_REPORTS_BASE
    : TENANT_REPORTS_BASE;
}

export function getEmployeeReportPath(pathname: string, employeeId: string): string {
  return `${getReportBasePath(pathname)}/employees/${employeeId}`;
}

export function getClientReportPath(pathname: string, clientId: string): string {
  return `${getReportBasePath(pathname)}/clients/${clientId}`;
}

function withQuery(path: string, query?: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function getEmployeeReportDrilldownPath(
  pathname: string,
  employeeId: string,
  options?: { range?: string | ReportRangeValue; section?: EmployeeReportSection },
): string {
  return withReportRangeQuery(getEmployeeReportPath(pathname, employeeId), options?.range, options?.section ? `section-${options.section}` : undefined);
}

export function getClientReportDrilldownPath(
  pathname: string,
  clientId: string,
  options?: { range?: string | ReportRangeValue; section?: ClientReportSection },
): string {
  return withReportRangeQuery(getClientReportPath(pathname, clientId), options?.range, options?.section ? `section-${options.section}` : undefined);
}

function withReportRangeQuery(path: string, range?: string | ReportRangeValue, section?: string): string {
  if (range && typeof range === "object") {
    const params = buildReportRangeSearchParams(range);
    if (section) params.set("section", section);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  if (typeof range === "string" && range.includes("_")) {
    const [startDate, endDate] = range.split("_");
    if (startDate && endDate) {
      const params = buildReportRangeSearchParams({ mode: "custom", startDate, endDate });
      if (section) params.set("section", section);
      return `${path}?${params.toString()}`;
    }
  }

  const presetDays = range === "7d" ? 7 : range === "14d" ? 14 : range === "60d" ? 60 : range === "90d" ? 90 : range === "30d" ? 30 : null;
  if (presetDays) {
    const params = new URLSearchParams({ range: `${presetDays}d` });
    if (section) params.set("section", section);
    return `${path}?${params.toString()}`;
  }

  return withQuery(path, {
    range: typeof range === "string" ? range : undefined,
    section,
  });
}
