import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { type User, UserRole } from "@shared/schema";
import { clearActingAsState, setSuperUserFlag, queryClient, markAuthenticated, clearAuthenticated } from "./queryClient";
import { prefetchPostLogin, resetPrefetchState, type PrefetchOptions } from "./prefetch";

interface UserImpersonationData {
  isImpersonating: boolean;
  impersonatedUser: {
    id: string;
    email: string;
    role: string;
  };
  impersonatedTenant: {
    id: string;
    name: string;
  };
  originalSuperUser: {
    id: string;
    email: string;
  };
  startedAt: string;
}

interface AuthContextType {
  user: Omit<User, "passwordHash"> | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  userImpersonation: UserImpersonationData | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: Omit<User, "passwordHash"> }>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchPrefetchFlag(): Promise<boolean> {
  try {
    const res = await fetch("/api/features/flags", { credentials: "include" });
    if (!res.ok) return true;
    const data = await res.json();
    return data.prefetchV1 !== false;
  } catch {
    return true;
  }
}

async function triggerPrefetch(role?: string): Promise<void> {
  const enabled = await fetchPrefetchFlag();
  prefetchPostLogin({ role, prefetchEnabled: enabled });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "passwordHash"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userImpersonation, setUserImpersonation] = useState<UserImpersonationData | null>(null);
  const [, setLocation] = useLocation();

  const fetchUser = useCallback(async (retries = 2) => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        
        if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_AUTH === "true") {
          console.log("[Auth] /api/auth/me response:", {
            userId: data.user?.id,
            email: data.user?.email,
            role: data.user?.role,
            tenantId: data.user?.tenantId,
            hasImpersonation: !!data.impersonation,
          });
        }
        
        setUser(data.user);
        setUserImpersonation(data.impersonation || null);
        setSuperUserFlag(data.user?.role === UserRole.SUPER_USER);
        markAuthenticated();
        triggerPrefetch(data.user?.role);
      } else {
        console.log("[Auth] /api/auth/me failed:", response.status);
        setUser(null);
        setUserImpersonation(null);
        clearActingAsState();
      }
    } catch (err) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return fetchUser(retries - 1);
      }
      console.error("[Auth] /api/auth/me error:", err);
      setUser(null);
      setUserImpersonation(null);
      clearActingAsState();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    try {
      clearActingAsState();
      
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok && data.user) {
        setUser(data.user);
        markAuthenticated();
        
        const meResponse = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (meResponse.ok) {
          const meData = await meResponse.json();
          setUser(meData.user);
          setUserImpersonation(meData.impersonation || null);
          setIsLoading(false);
          setSuperUserFlag(meData.user?.role === UserRole.SUPER_USER);
          triggerPrefetch(meData.user?.role);
        }
        
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || "Login failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      clearActingAsState();
      clearAuthenticated();
      queryClient.clear();
      resetPrefetchState();
      setUser(null);
      setUserImpersonation(null);
      setLocation("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        userImpersonation,
        login,
        logout,
        refetch: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
