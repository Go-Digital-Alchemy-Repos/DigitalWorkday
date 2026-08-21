import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPackTokens } from "@/lib/theme-provider";
import {
  PRIMARY_THEME_PACKS,
  getThemePack,
  normalizeThemePackId,
} from "@/theme/themePacks";

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hsl: string) => {
    const [h, s, l] = hsl.replaceAll("%", "").split(/\s+/).map(Number);
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - chroma / 2;
    const [r, g, b] = h < 60 ? [chroma, x, 0]
      : h < 120 ? [x, chroma, 0]
        : h < 180 ? [0, chroma, x]
          : h < 240 ? [0, x, chroma]
            : h < 300 ? [x, 0, chroma]
              : [chroma, 0, x];
    const channel = (value: number) => {
      const srgb = value + m;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function fakeDocumentRoot() {
  const properties = new Map<string, string>();
  const classes = new Set<string>();
  return {
    properties,
    classes,
    root: {
      style: {
        setProperty: (key: string, value: string) => properties.set(key, value),
        removeProperty: (key: string) => properties.delete(key),
      },
      classList: {
        add: (...values: string[]) => values.forEach((value) => classes.add(value)),
        remove: (...values: string[]) => values.forEach((value) => classes.delete(value)),
      },
      dataset: {} as Record<string, string>,
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Huly theme pack", () => {
  it("is a selectable dark primary theme", () => {
    expect(PRIMARY_THEME_PACKS.map(({ id }) => id)).toContain("huly");
    expect(normalizeThemePackId("huly")).toBe("huly");
    expect(getThemePack("huly").name).toBe("Huly");
    expect(getThemePack("huly").kind).toBe("dark");
  });

  it("preserves accessible contrast for text, actions, and focus", () => {
    const tokens = getThemePack("huly").tokens;
    expect(contrastRatio(tokens["--foreground"], tokens["--background"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens["--muted-foreground"], tokens["--background"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens["--action-primary-foreground"], tokens["--action-primary"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens["--sidebar-accent-foreground"], tokens["--sidebar-accent"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens["--ring"], tokens["--background"])).toBeGreaterThanOrEqual(3);
  });

  it("clears Huly-only tokens and classes when switching themes", () => {
    const { root, properties, classes } = fakeDocumentRoot();
    vi.stubGlobal("document", { documentElement: root });

    applyPackTokens(getThemePack("huly"));
    expect(properties.get("--font-display")).toContain("Space Grotesk");
    expect(properties.get("--theme-control-radius")).toBe("999px");
    expect(classes.has("dark")).toBe(true);
    expect(classes.has("theme-huly")).toBe(true);
    expect(root.dataset.themePack).toBe("huly");

    applyPackTokens(getThemePack("light"));
    expect(properties.has("--font-display")).toBe(false);
    expect(classes.has("theme-huly")).toBe(false);
    expect(classes.has("theme-light")).toBe(true);
    expect(root.dataset.themePack).toBe("light");
  });
});
