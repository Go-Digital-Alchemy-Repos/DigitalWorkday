import { getTenancyEnforcementMode } from "../middleware/tenancyEnforcement";
import { AppError } from "../lib/errors";

export abstract class BaseTenantRepository {
  protected requireTenantId(tenantId: string | null | undefined, operation: string): string {
    if (!tenantId) {
      const mode = getTenancyEnforcementMode();
      if (mode === "strict") {
        throw AppError.tenantRequired(`TENANT_SCOPE_REQUIRED: ${operation} requires tenantId`);
      }
      console.warn(`[BaseTenantRepository] ${operation} called without tenantId (mode=${mode})`);
      return "";
    }
    return tenantId;
  }

  protected assertTenantMatch(resourceTenantId: string | null | undefined, expectedTenantId: string, resourceType: string, resourceId: string): void {
    if (resourceTenantId && resourceTenantId !== expectedTenantId) {
      throw AppError.tenancyViolation(
        `Cross-tenant access denied: ${resourceType}:${resourceId} belongs to tenant ${resourceTenantId}, not ${expectedTenantId}`
      );
    }
    if (!resourceTenantId) {
      const mode = getTenancyEnforcementMode();
      if (mode === "strict") {
        throw AppError.tenantRequired(`${resourceType}:${resourceId} has NULL tenantId — blocked in strict mode`);
      }
    }
  }
}
