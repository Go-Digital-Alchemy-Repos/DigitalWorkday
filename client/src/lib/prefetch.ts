type ConnectionInfo = {
  effectiveType?: string;
  saveData?: boolean;
};

const MAX_PREFETCH_OPS = 6;
let prefetchFired = false;

function shouldPrefetch(): boolean {
  if (prefetchFired) return false;

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

export function prefetchPostLogin(role?: string): void {
  if (!shouldPrefetch()) return;
  prefetchFired = true;

  schedulePrefetch(() => {
    const modules =
      role === "client" || role === "super_user"
        ? []
        : TENANT_ROUTE_MODULES.slice(0, MAX_PREFETCH_OPS);

    for (const load of modules) {
      load().catch(() => {});
    }
  });
}

export function resetPrefetchState(): void {
  prefetchFired = false;
}
