import { Request, Response, NextFunction } from "express";

export type TenancyMode = "off" | "soft" | "strict";

export function getTenancyMode(): TenancyMode {
  const mode = process.env.TENANCY_ENFORCEMENT || "off";
  if (mode === "off" || mode === "soft" || mode === "strict") {
    return mode;
  }
  return "off";
}

// Alias for backward compatibility - calls getTenancyMode() to get fresh value
export function tenancyMode(): TenancyMode {
  return getTenancyMode();
}

export function getEffectiveTenantId(req: Request): string | null {
  return req.tenant?.effectiveTenantId || null;
}

export interface TenancyWarnDetails {
  route: string;
  resourceType: string;
  resourceId?: string;
  computedTenantId: string | null;
  actualTenantId: string | null;
  reason: "mismatch" | "missing-tenantId";
}

export function tenancyEnforceOrWarn(
  res: Response,
  details: TenancyWarnDetails
): boolean {
  const mode = getTenancyMode();

  if (mode === "off") {
    return false;
  }

  // Always emit warnings in soft and strict modes
  console.warn("[tenancy-warn]", JSON.stringify({
    mode,
    route: details.route,
    resourceType: details.resourceType,
    resourceId: details.resourceId,
    reason: details.reason,
    computedTenantId: details.computedTenantId,
    actualTenantId: details.actualTenantId,
  }));
  res.setHeader("X-Tenancy-Warn", details.reason);

  // Return true only for strict mode with cross-tenant mismatch (not legacy data)
  if (mode === "strict" && details.reason === "mismatch") {
    return true;
  }

  return false;
}

export function tenancyFilter<T extends { tenantId?: string | null }>(
  where: T,
  tenantId: string | null
): T & { tenantId?: string | null } {
  const mode = tenancyMode();

  if (mode === "off" || !tenantId) {
    return where;
  }

  return { ...where, tenantId };
}

export function validateRequiredId(
  id: string | undefined,
  fieldName: string
): { valid: true; id: string } | { valid: false; error: string } {
  if (!id || typeof id !== "string" || id.trim() === "") {
    return { valid: false, error: `${fieldName} is required and cannot be empty` };
  }
  return { valid: true, id: id.trim() };
}

export function validateOptionalId(
  id: string | undefined | null,
  fieldName: string
): { valid: true; id: string | null } | { valid: false; error: string } {
  if (id === undefined || id === null) {
    return { valid: true, id: null };
  }
  if (typeof id !== "string" || id.trim() === "") {
    return { valid: false, error: `${fieldName} cannot be an empty string` };
  }
  return { valid: true, id: id.trim() };
}

export async function tenancyScopedFetch<T extends { tenantId?: string | null }>(
  req: Request,
  res: Response,
  route: string,
  resourceType: string,
  resourceId: string,
  scopedFetch: () => Promise<T | undefined>,
  unscopedFetch: () => Promise<T | undefined>
): Promise<T | null> {
  const mode = getTenancyMode();
  const effectiveTenantId = getEffectiveTenantId(req);

  // Off mode: no tenant enforcement
  if (mode === "off") {
    const result = await unscopedFetch();
    return result || null;
  }

  // First try scoped fetch
  const scopedResult = await scopedFetch();
  if (scopedResult) {
    return scopedResult;
  }

  // For soft and strict: always do unscoped fetch to check if resource exists
  const unscopedResult = await unscopedFetch();
  if (!unscopedResult) {
    return null; // Resource doesn't exist at all
  }

  // Resource exists but wasn't returned by scoped fetch
  // Check if this is a legacy resource (null tenantId) - allow with warning in both modes
  if (!unscopedResult.tenantId) {
    tenancyEnforceOrWarn(res, {
      route,
      resourceType,
      resourceId,
      computedTenantId: effectiveTenantId,
      actualTenantId: null,
      reason: "missing-tenantId",
    });
    // Allow access to legacy data (null tenantId) even in strict mode
    // This ensures backward compatibility during rollout
    return unscopedResult;
  }

  // Resource has a tenantId that doesn't match - this is a true cross-tenant access
  // Always emit warning/header for observability
  tenancyEnforceOrWarn(res, {
    route,
    resourceType,
    resourceId,
    computedTenantId: effectiveTenantId,
    actualTenantId: unscopedResult.tenantId,
    reason: "mismatch",
  });

  if (mode === "soft") {
    // Soft mode: allow access with warning
    return unscopedResult;
  }

  // Strict mode: block cross-tenant access (but not legacy data)
  return null;
}

export async function tenancyScopedList<T extends { tenantId?: string | null }>(
  req: Request,
  res: Response,
  route: string,
  resourceType: string,
  scopedFetch: () => Promise<T[]>,
  unscopedFetch: () => Promise<T[]>
): Promise<T[]> {
  const mode = getTenancyMode();
  const effectiveTenantId = getEffectiveTenantId(req);

  // Off mode: no tenant enforcement
  if (mode === "off") {
    return unscopedFetch();
  }

  // Get both scoped and unscoped results
  const scopedResults = await scopedFetch();
  const unscopedResults = await unscopedFetch();

  // Find legacy items (null tenantId) that weren't included in scoped results
  const legacyItems = unscopedResults.filter(r => !r.tenantId);
  const scopedIds = new Set(scopedResults.map((r: any) => r.id));
  const missingLegacyItems = legacyItems.filter((r: any) => !scopedIds.has(r.id));

  // Find cross-tenant items (different tenantId) 
  const crossTenantItems = unscopedResults.filter(r => 
    r.tenantId && r.tenantId !== effectiveTenantId
  );

  // Combine scoped results with legacy items (always include legacy data)
  const combinedResults = [...scopedResults, ...missingLegacyItems];

  // Warn about legacy data if present
  if (missingLegacyItems.length > 0) {
    tenancyEnforceOrWarn(res, {
      route,
      resourceType,
      computedTenantId: effectiveTenantId,
      actualTenantId: null,
      reason: "missing-tenantId",
    });
  }

  // Handle cross-tenant items based on mode
  if (crossTenantItems.length > 0) {
    // Always emit warning/header for observability
    tenancyEnforceOrWarn(res, {
      route,
      resourceType,
      computedTenantId: effectiveTenantId,
      actualTenantId: "mixed",
      reason: "mismatch",
    });

    if (mode === "soft") {
      // Soft mode: include all results (including cross-tenant) with warning
      return unscopedResults;
    }
    // Strict mode: explicitly exclude cross-tenant items, return only scoped + legacy
    return combinedResults;
  }

  // No cross-tenant items - return combined results (scoped + legacy)
  return combinedResults;
}

export function tenancyValidateOwnership(
  req: Request,
  res: Response,
  route: string,
  resourceType: string,
  resource: { tenantId?: string | null } | null,
  resourceId: string
): boolean {
  if (!resource) {
    return false;
  }

  const mode = getTenancyMode();
  const effectiveTenantId = getEffectiveTenantId(req);

  if (mode === "off") {
    return true;
  }

  // Legacy data (null tenantId) is allowed in all modes with warnings
  if (!resource.tenantId) {
    tenancyEnforceOrWarn(res, {
      route,
      resourceType,
      resourceId,
      computedTenantId: effectiveTenantId,
      actualTenantId: null,
      reason: "missing-tenantId",
    });
    // Always allow legacy data
    return true;
  }

  // Check for tenant mismatch
  if (resource.tenantId !== effectiveTenantId) {
    const shouldBlock = tenancyEnforceOrWarn(res, {
      route,
      resourceType,
      resourceId,
      computedTenantId: effectiveTenantId,
      actualTenantId: resource.tenantId,
      reason: "mismatch",
    });
    // In strict mode, block cross-tenant access; in soft mode, allow with warning
    return !shouldBlock;
  }

  return true;
}
