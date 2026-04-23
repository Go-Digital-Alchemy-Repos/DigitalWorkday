import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PRIMARY_THEME_PACKS, getThemePack, normalizeThemePackId, type ThemePack } from "@/theme/themePacks";

export type ThemeMode = "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type AccentColor = "blue" | "indigo" | "teal" | "green" | "orange" | "slate";

const ACCENT_OPTIONS: AccentColor[] = ["blue", "indigo", "teal", "green", "orange", "slate"];
const DEFAULT_PACK_ID = "light";

const LS_PACK_KEY = "myworkday.theme.pack";
const LS_MODE_KEY = "myworkday.theme.mode";
const LS_ACCENT_KEY = "myworkday.theme.accent";
type ThemeProviderContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedTheme: ResolvedTheme;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  accentOptions: AccentColor[];
  theme: ResolvedTheme;
  setTheme: (theme: ResolvedTheme) => void;
  toggleTheme: () => void;
  hydrateFromServer: (prefs: { themeMode?: string | null; themePackId?: string | null; themeAccent?: string | null; tenantDefaultAccent?: string | null; tenantDefaultThemePack?: string | null }) => void;
  packId: string;
  setPackId: (id: string) => void;
  activePack: ThemePack;
  availablePacks: ThemePack[];
};

const ThemeProviderContext = createContext<ThemeProviderContextType | undefined>(undefined);

function readStoredPack(): string {
  if (typeof window === "undefined") return DEFAULT_PACK_ID;
  const stored = localStorage.getItem(LS_PACK_KEY);
  if (stored) return normalizeThemePackId(stored);

  const oldMode = localStorage.getItem(LS_MODE_KEY);
  if (oldMode === "dark") return "dark";
  return DEFAULT_PACK_ID;
}

function applyPackTokens(pack: ThemePack) {
  const root = document.documentElement;
  Object.entries(pack.tokens).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  root.classList.remove("light", "dark");
  root.classList.add(pack.kind);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [packId, setPackIdState] = useState<string>(readStoredPack);
  const [accent, setAccentState] = useState<AccentColor>(() => {
    if (typeof window === "undefined") return "blue";
    const stored = localStorage.getItem(LS_ACCENT_KEY) as AccentColor | null;
    if (stored && ACCENT_OPTIONS.includes(stored)) return stored;
    return "blue";
  });

  const activePack = useMemo(() => getThemePack(packId), [packId]);

  useEffect(() => {
    applyPackTokens(activePack);
  }, [activePack]);

  useEffect(() => {
    const root = document.documentElement;
    ACCENT_OPTIONS.forEach((a) => root.classList.remove(`accent-${a}`));
    if (accent !== "blue") {
      root.classList.add(`accent-${accent}`);
    }
  }, [accent]);

  const setPackId = useCallback((id: string) => {
    const pack = getThemePack(id);
    setPackIdState(pack.id);
    localStorage.setItem(LS_PACK_KEY, pack.id);
  }, []);

  const setAccent = useCallback((a: AccentColor) => {
    setAccentState(a);
    localStorage.setItem(LS_ACCENT_KEY, a);
  }, []);

  const resolvedTheme: ResolvedTheme = activePack.kind;

  const mode: ThemeMode = activePack.kind;

  const setMode = useCallback((m: ThemeMode) => {
    if (m === "dark" && activePack.kind !== "dark") {
      setPackId("dark");
    } else if (m === "light" && activePack.kind !== "light") {
      setPackId("light");
    }
  }, [activePack.kind, setPackId]);

  const toggleTheme = useCallback(() => {
    if (activePack.kind === "light") {
      setPackId("dark");
    } else {
      setPackId("light");
    }
  }, [activePack.kind, setPackId]);

  const setTheme = useCallback((t: ResolvedTheme) => {
    setMode(t);
  }, [setMode]);

  const hydrateFromServer = useCallback((prefs: {
    themeMode?: string | null;
    themePackId?: string | null;
    themeAccent?: string | null;
    tenantDefaultAccent?: string | null;
    tenantDefaultThemePack?: string | null;
  }) => {
    const resolvedPackId = normalizeThemePackId(
      prefs.themePackId ?? prefs.themeMode ?? prefs.tenantDefaultThemePack ?? DEFAULT_PACK_ID
    );
    setPackIdState(resolvedPackId);
    localStorage.setItem(LS_PACK_KEY, resolvedPackId);

    const accentValue = prefs.themeAccent || prefs.tenantDefaultAccent;
    if (accentValue && ACCENT_OPTIONS.includes(accentValue as AccentColor)) {
      const a = accentValue as AccentColor;
      setAccentState(a);
      localStorage.setItem(LS_ACCENT_KEY, a);
    }
  }, []);

  const value = useMemo<ThemeProviderContextType>(() => ({
    mode,
    setMode,
    resolvedTheme,
    accent,
    setAccent,
    accentOptions: ACCENT_OPTIONS,
    theme: resolvedTheme,
    setTheme,
    toggleTheme,
    hydrateFromServer,
    packId,
    setPackId,
    activePack,
    availablePacks: PRIMARY_THEME_PACKS,
  }), [mode, setMode, resolvedTheme, accent, setAccent, setTheme, toggleTheme, hydrateFromServer, packId, setPackId, activePack]);

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
