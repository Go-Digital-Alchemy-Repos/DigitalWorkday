import { Request, Response, NextFunction } from "express";

export type TenancyMode = "off" | "soft" | "strict";

export function tenancyMode(): TenancyMode {
  const mode = process.env.TENANCY_ENFORCEMENT || "soft";
  if (mode === "off" || mode === "soft" || mode === "strict") {
    return mode;
  }
  return "soft";
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
  const mode = tenancyMode();

  if (mode === "off") {
    return false;
  }

  if (mode === "soft") {
    console.warn("[tenancy-warn]", JSON.stringify({
      mode: "soft",
      route: details.route,
      resourceType: details.resourceType,
      resourceId: details.resourceId,
      reason: details.reason,
      computedTenantId: details.computedTenantId,
      actualTenantId: details.actualTenantId,
    }));
    res.setHeader("X-Tenancy-Warn", details.reason);
    return false;
  }

  return true;
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
  const mode = tenancyMode();
  const effectiveTenantId = getEffectiveTenantId(req);

  if (mode === "off") {
    const result = await unscopedFetch();
    return result || null;
  }

  const scopedResult = await scopedFetch();
  if (scopedResult) {
    return scopedResult;
  }

  if (mode === "soft") {
    const unscopedResult = await unscopedFetch();
    if (unscopedResult) {
      const reason = !unscopedResult.tenantId ? "missing-tenantId" : "mismatch";
      tenancyEnforceOrWarn(res, {
        route,
        resourceType,
        resourceId,
        computedTenantId: effectiveTenantId,
        actualTenantId: unscopedResult.tenantId || null,
        reason,
      });
      return unscopedResult;
    }
  }

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
  const mode = tenancyMode();
  const effectiveTenantId = getEffectiveTenantId(req);

  if (mode === "off") {
    return unscopedFetch();
  }

  const scopedResults = await scopedFetch();

  if (mode === "soft" && scopedResults.length === 0) {
    const unscopedResults = await unscopedFetch();
    if (unscopedResults.length > 0) {
      const hasNullTenants = unscopedResults.some(r => !r.tenantId);
      const hasMismatch = unscopedResults.some(r => r.tenantId && r.tenantId !== effectiveTenantId);
      
      if (hasNullTenants || hasMismatch) {
        tenancyEnforceOrWarn(res, {
          route,
          resourceType,
          computedTenantId: effectiveTenantId,
          actualTenantId: "mixed",
          reason: hasNullTenants ? "missing-tenantId" : "mismatch",
        });
      }
      return unscopedResults;
    }
  }

  return scopedResults;
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

  const mode = tenancyMode();
  const effectiveTenantId = getEffectiveTenantId(req);

  if (mode === "off") {
    return true;
  }

  if (!resource.tenantId) {
    if (mode === "soft") {
      tenancyEnforceOrWarn(res, {
        route,
        resourceType,
        resourceId,
        computedTenantId: effectiveTenantId,
        actualTenantId: null,
        reason: "missing-tenantId",
      });
      return true;
    }
    return false;
  }

  if (resource.tenantId !== effectiveTenantId) {
    if (mode === "soft") {
      tenancyEnforceOrWarn(res, {
        route,
        resourceType,
        resourceId,
        computedTenantId: effectiveTenantId,
        actualTenantId: resource.tenantId,
        reason: "mismatch",
      });
      return true;
    }
    return false;
  }

  return true;
}
