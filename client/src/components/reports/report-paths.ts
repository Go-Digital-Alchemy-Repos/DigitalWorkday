const TENANT_REPORTS_BASE = "/reports";
const SUPER_ADMIN_REPORTS_BASE = "/super-admin/reports";

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
