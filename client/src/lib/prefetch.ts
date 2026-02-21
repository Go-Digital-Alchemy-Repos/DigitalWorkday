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

export interface PrefetchOptions {
  role?: string;
  prefetchEnabled?: boolean;
}

export function prefetchPostLogin(opts: PrefetchOptions): void {
  if (prefetchFired) return;
  if (opts.prefetchEnabled === false) return;
  if (!isNetworkOk()) return;

  if (opts.role === "client") return;
  if (opts.role === "super_user") return;

  prefetchFired = true;
  schedulePrefetch(fireTenantPrefetch);
}

export function prefetchTenantRoutes(prefetchEnabled?: boolean): void {
  if (prefetchFired) return;
  if (prefetchEnabled === false) return;
  if (!isNetworkOk()) return;
  prefetchFired = true;
  schedulePrefetch(fireTenantPrefetch);
}

export function resetPrefetchState(): void {
  prefetchFired = false;
}
