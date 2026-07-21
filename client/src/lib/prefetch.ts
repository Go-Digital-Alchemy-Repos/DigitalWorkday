type ConnectionInfo = {
  effectiveType?: string;
  saveData?: boolean;
};

const DEFAULT_PREFETCH_BUDGET_KB = 250;
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

type PrefetchRouteModule = {
  name: string;
  estimatedChunkKb: number;
  load: () => Promise<unknown>;
};

const TENANT_ROUTE_MODULES: PrefetchRouteModule[] = [
  { name: "tenant-router", estimatedChunkKb: 110, load: () => import("@/routing/tenantRouter") },
  { name: "home", estimatedChunkKb: 26, load: () => import("@/pages/home") },
  { name: "my-tasks", estimatedChunkKb: 23, load: () => import("@/pages/my-tasks") },
  { name: "projects-dashboard", estimatedChunkKb: 38, load: () => import("@/pages/projects-dashboard") },
  { name: "my-time", estimatedChunkKb: 53, load: () => import("@/pages/my-time") },
  { name: "chat", estimatedChunkKb: 125, load: () => import("@/pages/chat") },
];

export function getTenantPrefetchRouteNames(budgetKb = DEFAULT_PREFETCH_BUDGET_KB): string[] {
  let usedKb = 0;
  const selected: string[] = [];

  for (const module of TENANT_ROUTE_MODULES) {
    if (usedKb + module.estimatedChunkKb > budgetKb) continue;
    selected.push(module.name);
    usedKb += module.estimatedChunkKb;
  }

  return selected;
}

function fireTenantPrefetch(): void {
  const selected = new Set(getTenantPrefetchRouteNames());
  const modules = TENANT_ROUTE_MODULES.filter(module => selected.has(module.name));
  for (const load of modules) {
    load.load().catch(() => {});
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
