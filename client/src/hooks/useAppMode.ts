import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { getActingTenantId, setActingTenantId, queryClient } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

export type AppMode = "super" | "tenant";

interface ImpersonationState {
  tenantId: string;
  tenantName: string;
}

interface AppModeHook {
  appMode: AppMode;
  isSuper: boolean;
  isImpersonating: boolean;
  effectiveTenantId: string | null;
  effectiveTenantName: string | null;
  startImpersonation: (tenantId: string, tenantName: string) => void;
  stopImpersonation: () => void;
}

const ACTING_TENANT_NAME_KEY = "actingTenantName";

export function useAppMode(): AppModeHook {
  const { user } = useAuth();
  const isSuperUser = user?.role === UserRole.SUPER_USER;
  
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(() => {
    if (typeof window === "undefined") return null;
    const tenantId = getActingTenantId();
    const tenantName = localStorage.getItem(ACTING_TENANT_NAME_KEY);
    if (tenantId && tenantName) {
      return { tenantId, tenantName };
    }
    return null;
  });

  useEffect(() => {
    const tenantId = getActingTenantId();
    const tenantName = localStorage.getItem(ACTING_TENANT_NAME_KEY);
    if (tenantId && tenantName) {
      setImpersonation({ tenantId, tenantName });
    } else {
      setImpersonation(null);
    }
  }, [user]);

  const startImpersonation = useCallback((tenantId: string, tenantName: string) => {
    setActingTenantId(tenantId);
    localStorage.setItem(ACTING_TENANT_NAME_KEY, tenantName);
    setImpersonation({ tenantId, tenantName });
    queryClient.clear();
  }, []);

  const stopImpersonation = useCallback(() => {
    setActingTenantId(null);
    localStorage.removeItem(ACTING_TENANT_NAME_KEY);
    setImpersonation(null);
    queryClient.clear();
  }, []);

  const isImpersonating = isSuperUser && impersonation !== null;
  const appMode: AppMode = (isSuperUser && !isImpersonating) ? "super" : "tenant";

  return {
    appMode,
    isSuper: isSuperUser,
    isImpersonating,
    effectiveTenantId: impersonation?.tenantId || null,
    effectiveTenantName: impersonation?.tenantName || null,
    startImpersonation,
    stopImpersonation,
  };
}
