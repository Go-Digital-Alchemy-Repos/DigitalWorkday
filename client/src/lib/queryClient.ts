import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Storage keys for super user acting-as-tenant functionality
const ACTING_TENANT_ID_KEY = "actingTenantId";
const IS_SUPER_USER_KEY = "isSuperUser";

// Helper to get the acting tenant ID for super users
export function getActingTenantId(): string | null {
  // Only return the tenant ID if user is verified as super user
  const isSuperUser = localStorage.getItem(IS_SUPER_USER_KEY) === "true";
  if (!isSuperUser) {
    // Clear stale data if user is not super user
    localStorage.removeItem(ACTING_TENANT_ID_KEY);
    return null;
  }
  return localStorage.getItem(ACTING_TENANT_ID_KEY);
}

// Helper to set the acting tenant ID for super users (only works for verified super users)
export function setActingTenantId(tenantId: string | null): void {
  if (tenantId) {
    localStorage.setItem(ACTING_TENANT_ID_KEY, tenantId);
  } else {
    localStorage.removeItem(ACTING_TENANT_ID_KEY);
  }
}

// Helper to set super user flag (called by auth when user logs in)
export function setSuperUserFlag(isSuperUser: boolean): void {
  if (isSuperUser) {
    localStorage.setItem(IS_SUPER_USER_KEY, "true");
  } else {
    // Clear both flags when user is not super user
    localStorage.removeItem(IS_SUPER_USER_KEY);
    localStorage.removeItem(ACTING_TENANT_ID_KEY);
  }
}

// Helper to clear all acting-as state (called on logout/login)
export function clearActingAsState(): void {
  localStorage.removeItem(ACTING_TENANT_ID_KEY);
  localStorage.removeItem(IS_SUPER_USER_KEY);
}

// Build headers including X-Tenant-Id if acting as tenant (with super user verification)
function buildHeaders(data?: unknown): HeadersInit {
  const headers: HeadersInit = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Only add X-Tenant-Id header if user is verified as super user
  const actingTenantId = getActingTenantId();
  if (actingTenantId) {
    headers["X-Tenant-Id"] = actingTenantId;
  }
  
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: buildHeaders(data),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: buildHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
