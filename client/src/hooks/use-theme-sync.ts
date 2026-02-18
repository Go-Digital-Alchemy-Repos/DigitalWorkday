import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UiPreferences {
  themeMode: string | null;
  themeAccent: string | null;
}

interface TenantBrandingResponse {
  tenantSettings: {
    defaultThemeAccent?: string | null;
  } | null;
}

export function useThemeSync() {
  const { isAuthenticated } = useAuth();
  const { hydrateFromServer, packId, isSystemMode, accent } = useTheme();
  const hydrated = useRef(false);
  const prevPackId = useRef<string>(packId);
  const prevIsSystem = useRef<boolean>(isSystemMode);
  const prevAccent = useRef<string>(accent);

  const { data: prefs, isFetched: prefsFetched } = useQuery<UiPreferences>({
    queryKey: ["/api/users/me/ui-preferences"],
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const { data: branding, isFetched: brandingFetched } = useQuery<TenantBrandingResponse>({
    queryKey: ["/api/v1/tenant/branding"],
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!prefsFetched || !brandingFetched || hydrated.current) return;

    hydrateFromServer({
      themeMode: prefs?.themeMode ?? null,
      themeAccent: prefs?.themeAccent ?? null,
      tenantDefaultAccent: branding?.tenantSettings?.defaultThemeAccent ?? null,
    });
    hydrated.current = true;
    prevPackId.current = prefs?.themeMode || packId;
    prevIsSystem.current = prefs?.themeMode === "system";
    prevAccent.current = prefs?.themeAccent || accent;
  }, [prefsFetched, brandingFetched, prefs, branding, hydrateFromServer, packId, accent]);

  const saveMutation = useMutation({
    mutationFn: async (body: { themeMode?: string; themeAccent?: string }) =>
      apiRequest("PATCH", "/api/users/me/ui-preferences", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/ui-preferences"] });
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !hydrated.current) return;

    const serverValue = isSystemMode ? "system" : packId;
    const prevServerValue = prevIsSystem.current ? "system" : prevPackId.current;
    const packChanged = serverValue !== prevServerValue;
    const accentChanged = accent !== prevAccent.current;

    if (packChanged || accentChanged) {
      prevPackId.current = packId;
      prevIsSystem.current = isSystemMode;
      prevAccent.current = accent;
      saveMutation.mutate({
        ...(packChanged ? { themeMode: serverValue } : {}),
        ...(accentChanged ? { themeAccent: accent } : {}),
      });
    }
  }, [packId, isSystemMode, accent, isAuthenticated]);
}
