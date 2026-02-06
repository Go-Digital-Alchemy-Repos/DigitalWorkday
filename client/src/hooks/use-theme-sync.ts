import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTheme, type ThemeMode, type AccentColor } from "@/lib/theme-provider";
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
  const { hydrateFromServer, mode, accent } = useTheme();
  const hydrated = useRef(false);
  const prevMode = useRef<ThemeMode>(mode);
  const prevAccent = useRef<AccentColor>(accent);

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
    prevMode.current = (prefs?.themeMode as ThemeMode) || mode;
    prevAccent.current = (prefs?.themeAccent as AccentColor) || accent;
  }, [prefsFetched, brandingFetched, prefs, branding, hydrateFromServer, mode, accent]);

  const saveMutation = useMutation({
    mutationFn: async (body: { themeMode?: string; themeAccent?: string }) =>
      apiRequest("PATCH", "/api/users/me/ui-preferences", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/ui-preferences"] });
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !hydrated.current) return;

    const modeChanged = mode !== prevMode.current;
    const accentChanged = accent !== prevAccent.current;

    if (modeChanged || accentChanged) {
      prevMode.current = mode;
      prevAccent.current = accent;
      saveMutation.mutate({
        ...(modeChanged ? { themeMode: mode } : {}),
        ...(accentChanged ? { themeAccent: accent } : {}),
      });
    }
  }, [mode, accent, isAuthenticated]);
}
