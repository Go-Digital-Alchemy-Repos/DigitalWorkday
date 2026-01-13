import { Request, Response, NextFunction } from "express";

export type TenancyEnforcementMode = "off" | "soft" | "strict";

export function getTenancyEnforcementMode(): TenancyEnforcementMode {
  const mode = process.env.TENANCY_ENFORCEMENT?.toLowerCase();
  if (mode === "strict") return "strict";
  if (mode === "soft") return "soft";
  return "off";
}

export function isStrictMode(): boolean {
  return getTenancyEnforcementMode() === "strict";
}

export function isSoftMode(): boolean {
  return getTenancyEnforcementMode() === "soft";
}

export function isEnforcementEnabled(): boolean {
  const mode = getTenancyEnforcementMode();
  return mode === "soft" || mode === "strict";
}

export function addTenancyWarningHeader(res: Response, message: string): void {
  const existing = res.getHeader("X-Tenancy-Warn") as string | undefined;
  if (existing) {
    res.setHeader("X-Tenancy-Warn", `${existing}; ${message}`);
  } else {
    res.setHeader("X-Tenancy-Warn", message);
  }
}

export function logTenancyWarning(context: string, message: string, userId?: string): void {
  console.warn(`[TENANCY:${getTenancyEnforcementMode().toUpperCase()}] ${context}: ${message}${userId ? ` (user: ${userId})` : ""}`);
}

export interface TenancyValidationResult {
  valid: boolean;
  warning?: string;
  shouldFallback: boolean;
}

export function validateTenantOwnership(
  resourceTenantId: string | null,
  effectiveTenantId: string | null,
  resourceType: string,
  resourceId: string
): TenancyValidationResult {
  const mode = getTenancyEnforcementMode();
  
  if (mode === "off") {
    return { valid: true, shouldFallback: true };
  }
  
  if (!effectiveTenantId) {
    if (mode === "strict") {
      return { 
        valid: false, 
        warning: `No tenant context for ${resourceType} access`,
        shouldFallback: false 
      };
    }
    return { 
      valid: true, 
      warning: `No tenant context for ${resourceType}:${resourceId}`,
      shouldFallback: true 
    };
  }
  
  if (resourceTenantId === null) {
    if (mode === "strict") {
      return { 
        valid: false, 
        warning: `${resourceType}:${resourceId} has no tenantId (strict mode)`,
        shouldFallback: false 
      };
    }
    return { 
      valid: true, 
      warning: `${resourceType}:${resourceId} has legacy null tenantId`,
      shouldFallback: true 
    };
  }
  
  if (resourceTenantId !== effectiveTenantId) {
    return { 
      valid: false, 
      warning: `Cross-tenant access denied for ${resourceType}:${resourceId}`,
      shouldFallback: false 
    };
  }
  
  return { valid: true, shouldFallback: false };
}

export function handleTenancyViolation(
  res: Response,
  result: TenancyValidationResult,
  context: string
): boolean {
  if (!result.valid) {
    logTenancyWarning(context, result.warning || "Access denied");
    res.status(403).json({ error: "Access denied: tenant isolation violation" });
    return true;
  }
  
  if (result.warning) {
    logTenancyWarning(context, result.warning);
    addTenancyWarningHeader(res, result.warning);
  }
  
  return false;
}
