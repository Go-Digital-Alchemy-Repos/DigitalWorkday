import { UserRole } from "./schema";

export type AppUserRole = typeof UserRole[keyof typeof UserRole] | string | null | undefined;

export function isSuperUserRole(role: AppUserRole): boolean {
  return role === UserRole.SUPER_USER;
}

export function isProjectManagerRole(role: AppUserRole): boolean {
  return role === UserRole.PROJECT_MANAGER;
}

export function isTenantAdminRole(role: AppUserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.PROJECT_MANAGER;
}

export function hasTenantAdminAccess(role: AppUserRole): boolean {
  return isSuperUserRole(role) || isTenantAdminRole(role);
}

export function hasProjectManagerDashboardAccess(role: AppUserRole): boolean {
  return hasTenantAdminAccess(role);
}

export function getWorkspaceMembershipRoleForUserRole(role: AppUserRole): "admin" | "member" {
  return isTenantAdminRole(role) ? "admin" : "member";
}

export function getUserRoleLabel(role: AppUserRole): string {
  switch (role) {
    case UserRole.ADMIN:
      return "Administrator";
    case UserRole.PROJECT_MANAGER:
      return "Project Manager";
    case UserRole.SUPER_USER:
      return "Super Admin";
    case UserRole.CLIENT:
      return "Client";
    default:
      return "Employee";
  }
}
