import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getThemePack } from "@/theme/themePacks";

interface UiPreferences {
  themeMode: string | null;
  themePackId: string | null;
  themeAccent: string | null;
}

interface TenantBrandingResponse {
  tenantSettings: {
    defaultThemeAccent?: string | null;
    defaultThemePack?: string | null;
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
      themePackId: prefs?.themePackId ?? null,
      themeAccent: prefs?.themeAccent ?? null,
      tenantDefaultAccent: branding?.tenantSettings?.defaultThemeAccent ?? null,
      tenantDefaultThemePack: branding?.tenantSettings?.defaultThemePack ?? null,
    });
    hydrated.current = true;
    const effectivePack = prefs?.themePackId ?? prefs?.themeMode ?? packId;
    prevPackId.current = effectivePack;
    prevIsSystem.current = effectivePack === "system";
    prevAccent.current = prefs?.themeAccent || accent;
  }, [prefsFetched, brandingFetched, prefs, branding, hydrateFromServer, packId, accent]);

  const saveMutation = useMutation({
    mutationFn: async (body: { themeMode?: string; themePackId?: string; themeAccent?: string }) =>
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
        ...(packChanged ? { themeMode: isSystemMode ? "system" : getThemePack(packId).kind, themePackId: serverValue } : {}),
        ...(accentChanged ? { themeAccent: accent } : {}),
      });
    }
  }, [packId, isSystemMode, accent, isAuthenticated]);
}
