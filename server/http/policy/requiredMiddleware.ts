import type { RequestHandler } from "express";
import { requireAuth } from "../../auth";
import {
  getEffectiveTenantId,
  requireSuperUser,
} from "../../middleware/tenantContext";
import { UserRole } from "@shared/schema";
import { AppError } from "../../lib/errors";

export type PolicyName = "public" | "authOnly" | "authTenant" | "superUser";

export interface PolicyDefinition {
  name: PolicyName;
  description: string;
  middleware: RequestHandler[];
}

export const requireExplicitTenantContext: RequestHandler = (req, _res, next) => {
  const user = req.user as any;

  if (!user) {
    return next(AppError.unauthorized("Authentication required"));
  }

  if (user.role === UserRole.SUPER_USER) {
    if (!req.tenant?.effectiveTenantId) {
      return next(
        AppError.tenantRequired(
          "Super users must select an effective tenant before accessing tenant-scoped routes"
        )
      );
    }
    return next();
  }

  if (!getEffectiveTenantId(req)) {
    return next(AppError.tenantRequired("User tenant not configured"));
  }

  next();
};

const POLICY_DEFINITIONS: Record<PolicyName, PolicyDefinition> = {
  public: {
    name: "public",
    description: "No auth or tenant required. Global middleware (requestId, logging) applied at app level, not here.",
    middleware: [],
  },
  authOnly: {
    name: "authOnly",
    description: "Authentication required, tenant context optional.",
    middleware: [requireAuth],
  },
  authTenant: {
    name: "authTenant",
    description: "Authentication and explicit tenant context required.",
    middleware: [requireAuth, requireExplicitTenantContext],
  },
  superUser: {
    name: "superUser",
    description: "Authentication required + super user role.",
    middleware: [requireAuth, requireSuperUser],
  },
};

export function getPolicyMiddleware(policy: PolicyName): RequestHandler[] {
  const def = POLICY_DEFINITIONS[policy];
  if (!def) {
    throw new Error(`Unknown policy: ${policy}`);
  }
  return [...def.middleware];
}

export function getPolicyDefinition(policy: PolicyName): PolicyDefinition {
  return POLICY_DEFINITIONS[policy];
}

export function getAllPolicies(): PolicyDefinition[] {
  return Object.values(POLICY_DEFINITIONS);
}
