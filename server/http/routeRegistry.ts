import type { Router } from "express";
import type { PolicyName } from "./policy/requiredMiddleware";

export interface RouteMount {
  path: string;
  router: Router;
  policy: PolicyName;
  domain: string;
  description: string;
  legacy: boolean;
}

const registry: RouteMount[] = [];

export function registerRoute(mount: RouteMount): void {
  const duplicate = registry.find(
    (r) => r.path === mount.path && r.domain === mount.domain
  );
  if (duplicate) {
    throw new Error(
      `Route already registered: path=${mount.path} domain=${mount.domain}`
    );
  }
  registry.push(mount);
}

export function getRouteRegistry(): ReadonlyArray<RouteMount> {
  return [...registry];
}

export function clearRouteRegistry(): void {
  registry.length = 0;
}

export const GUARD_EXEMPT_PATHS = [
  "/api/auth/*",
  "/api/v1/auth/*",
  "/api/v1/super/bootstrap",
  "/api/health",
  "/api/v1/webhooks/*",
  "/api/v1/tenant/*",
  "/health",
  "/healthz",
  "/ready",
  "/readyz",
  "/livez",
] as const;

export const AUTH_EXEMPT_PATHS = [
  "/auth",
  "/v1/auth/",
  "/v1/super/bootstrap",
  "/health",
  "/v1/webhooks/",
] as const;

export const TENANT_EXEMPT_PATHS = [
  "/auth",
  "/health",
  "/v1/super/",
  "/v1/tenant/",
  "/v1/webhooks/",
] as const;
