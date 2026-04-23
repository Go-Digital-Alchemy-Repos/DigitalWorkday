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
  options?: { range?: string; section?: EmployeeReportSection },
): string {
  return withQuery(getEmployeeReportPath(pathname, employeeId), {
    range: options?.range,
    section: options?.section ? `section-${options.section}` : undefined,
  });
}

export function getClientReportDrilldownPath(
  pathname: string,
  clientId: string,
  options?: { range?: string; section?: ClientReportSection },
): string {
  return withQuery(getClientReportPath(pathname, clientId), {
    range: options?.range,
    section: options?.section ? `section-${options.section}` : undefined,
  });
}
