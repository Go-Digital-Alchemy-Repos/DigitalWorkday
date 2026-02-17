import type { RequestHandler } from "express";
import { requireAuth } from "../../auth";
import { requireTenantContext, requireSuperUser } from "../../middleware/tenantContext";

export type PolicyName = "public" | "authOnly" | "authTenant" | "superUser";

export interface PolicyDefinition {
  name: PolicyName;
  description: string;
  middleware: RequestHandler[];
}

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
    description: "Authentication and tenant context required.",
    middleware: [requireAuth, requireTenantContext],
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
