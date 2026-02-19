type ConnectionInfo = {
  effectiveType?: string;
  saveData?: boolean;
};

const MAX_PREFETCH_OPS = 6;
let prefetchFired = false;

function isNetworkOk(): boolean {
  const nav = navigator as Navigator & { connection?: ConnectionInfo };
  if (nav.connection?.saveData) return false;

  const ect = nav.connection?.effectiveType;
  if (ect === "2g" || ect === "slow-2g") return false;

  return true;
}

function schedulePrefetch(fn: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn, { timeout: 3000 });
  } else {
    setTimeout(fn, 300);
  }
}

const TENANT_ROUTE_MODULES = [
  () => import("@/routing/tenantRouter"),
  () => import("@/pages/home"),
  () => import("@/pages/my-tasks"),
  () => import("@/pages/projects-dashboard"),
  () => import("@/pages/chat"),
  () => import("@/pages/my-time"),
];

function fireTenantPrefetch(): void {
  const modules = TENANT_ROUTE_MODULES.slice(0, MAX_PREFETCH_OPS);
  for (const load of modules) {
    load().catch(() => {});
  }
}

export function prefetchPostLogin(role?: string): void {
  if (prefetchFired || !isNetworkOk()) return;

  if (role === "client") return;

  if (role === "super_user") return;

  prefetchFired = true;
  schedulePrefetch(fireTenantPrefetch);
}

export function prefetchTenantRoutes(): void {
  if (prefetchFired || !isNetworkOk()) return;
  prefetchFired = true;
  schedulePrefetch(fireTenantPrefetch);
}

export function resetPrefetchState(): void {
  prefetchFired = false;
}
