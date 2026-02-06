import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type AccentColor = "blue" | "indigo" | "teal" | "green" | "orange" | "slate";

const ACCENT_OPTIONS: AccentColor[] = ["blue", "indigo", "teal", "green", "orange", "slate"];
const DEFAULT_MODE: ThemeMode = "light";
const DEFAULT_ACCENT: AccentColor = "blue";

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
  hydrateFromServer: (prefs: { themeMode?: string | null; themeAccent?: string | null }) => void;
};

const ThemeProviderContext = createContext<ThemeProviderContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return getSystemTheme();
  return mode;
}

function readLocalStorage<T extends string>(key: string, allowed: T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(key) as T | null;
  if (stored && allowed.includes(stored)) return stored;
  return fallback;
}

function migrateOldKeys(): void {
  if (typeof window === "undefined") return;
  const oldTheme = localStorage.getItem("dasana-theme");
  const oldAccent = localStorage.getItem("dasana-accent");
  if (oldTheme && !localStorage.getItem(LS_MODE_KEY)) {
    localStorage.setItem(LS_MODE_KEY, oldTheme);
    localStorage.removeItem("dasana-theme");
  }
  if (oldAccent && !localStorage.getItem(LS_ACCENT_KEY)) {
    localStorage.setItem(LS_ACCENT_KEY, oldAccent);
    localStorage.removeItem("dasana-accent");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);
  if (!initialized.current) {
    migrateOldKeys();
    initialized.current = true;
  }

  const [mode, setModeState] = useState<ThemeMode>(() =>
    readLocalStorage(LS_MODE_KEY, ["light", "dark", "system"] as ThemeMode[], DEFAULT_MODE)
  );

  const [accent, setAccentState] = useState<AccentColor>(() =>
    readLocalStorage(LS_ACCENT_KEY, ACCENT_OPTIONS, DEFAULT_ACCENT)
  );

  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(mode));

  useEffect(() => {
    const next = resolveTheme(mode);
    setResolved(next);

    if (mode !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(getSystemTheme());
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  }, [resolved]);

  useEffect(() => {
    const root = document.documentElement;
    ACCENT_OPTIONS.forEach((a) => root.classList.remove(`accent-${a}`));
    if (accent !== DEFAULT_ACCENT) {
      root.classList.add(`accent-${accent}`);
    }
  }, [accent]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(LS_MODE_KEY, m);
  }, []);

  const setAccent = useCallback((a: AccentColor) => {
    setAccentState(a);
    localStorage.setItem(LS_ACCENT_KEY, a);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ResolvedTheme = resolved === "light" ? "dark" : "light";
    setMode(next);
  }, [resolved, setMode]);

  const setTheme = useCallback((t: ResolvedTheme) => {
    setMode(t);
  }, [setMode]);

  const hydrateFromServer = useCallback((prefs: {
    themeMode?: string | null;
    themeAccent?: string | null;
    tenantDefaultAccent?: string | null;
  }) => {
    if (prefs.themeMode && ["light", "dark", "system"].includes(prefs.themeMode)) {
      const m = prefs.themeMode as ThemeMode;
      setModeState(m);
      localStorage.setItem(LS_MODE_KEY, m);
    }
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
    resolvedTheme: resolved,
    accent,
    setAccent,
    accentOptions: ACCENT_OPTIONS,
    theme: resolved,
    setTheme,
    toggleTheme,
    hydrateFromServer,
  }), [mode, setMode, resolved, accent, setAccent, setTheme, toggleTheme, hydrateFromServer]);

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
