import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useThemeSync } from "@/hooks/use-theme-sync";

interface TenantSettings {
  displayName?: string;
  appName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  defaultThemeAccent?: string | null;
  loginMessage?: string | null;
  supportEmail?: string | null;
  whiteLabelEnabled?: boolean;
  hideVendorBranding?: boolean;
}

interface TenantSettingsResponse {
  tenantSettings: TenantSettings | null;
}

function hexToHSL(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function darkenHSL(hsl: string, amount: number): string {
  const parts = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!parts) return hsl;
  
  const h = parseInt(parts[1], 10);
  const s = parseInt(parts[2], 10);
  const l = Math.max(0, parseInt(parts[3], 10) - amount);
  
  return `${h} ${s}% ${l}%`;
}

function lightenHSL(hsl: string, amount: number): string {
  const parts = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!parts) return hsl;
  
  const h = parseInt(parts[1], 10);
  const s = parseInt(parts[2], 10);
  const l = Math.min(100, parseInt(parts[3], 10) + amount);
  
  return `${h} ${s}% ${l}%`;
}

export function useTenantTheme() {
  const { isAuthenticated } = useAuth();

  const { data } = useQuery<TenantSettingsResponse>({
    queryKey: ["/api/v1/tenant/branding"],
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    const settings = data?.tenantSettings;
    if (!settings || !settings.whiteLabelEnabled) {
      document.documentElement.style.removeProperty("--tenant-primary");
      document.documentElement.style.removeProperty("--tenant-secondary");
      document.documentElement.style.removeProperty("--tenant-accent");
      return;
    }

    const root = document.documentElement;

    if (settings.primaryColor) {
      const primaryHSL = hexToHSL(settings.primaryColor);
      if (primaryHSL) {
        root.style.setProperty("--primary", primaryHSL);
        root.style.setProperty("--primary-foreground", "0 0% 100%");
        root.style.setProperty("--ring", primaryHSL);
      }
    }

    if (settings.secondaryColor) {
      const secondaryHSL = hexToHSL(settings.secondaryColor);
      if (secondaryHSL) {
        root.style.setProperty("--secondary", secondaryHSL);
        root.style.setProperty("--secondary-foreground", "0 0% 100%");
      }
    }

    if (settings.accentColor) {
      const accentHSL = hexToHSL(settings.accentColor);
      if (accentHSL) {
        root.style.setProperty("--accent", accentHSL);
        root.style.setProperty("--accent-foreground", "0 0% 100%");
      }
    }

    if (settings.faviconUrl) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.faviconUrl;
    }

    if (settings.appName) {
      document.title = settings.appName;
    }

    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-foreground");
      root.style.removeProperty("--secondary");
      root.style.removeProperty("--secondary-foreground");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-foreground");
      root.style.removeProperty("--ring");
    };
  }, [data]);

  return {
    settings: data?.tenantSettings,
    appName: data?.tenantSettings?.appName || "MyWorkDay",
    logoUrl: data?.tenantSettings?.logoUrl,
    hideVendorBranding: data?.tenantSettings?.hideVendorBranding || false,
  };
}

export function TenantThemeProvider({ children }: { children: React.ReactNode }) {
  useTenantTheme();
  useThemeSync();
  return <>{children}</>;
}
