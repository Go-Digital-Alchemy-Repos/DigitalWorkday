import { useEffect, useCallback, useRef } from "react";

export type ShortcutKey = 
  | "mod+s"     // Save
  | "mod+k"     // Command palette
  | "mod+n"     // New
  | "mod+b"     // Bold
  | "mod+i"     // Italic
  | "mod+u"     // Underline
  | "mod+enter" // Submit
  | "escape"    // Cancel/Close
  | "mod+shift+s" // Save and close
  | string;

export interface ShortcutHandler {
  key: ShortcutKey;
  handler: (e: KeyboardEvent) => void;
  description?: string;
  disabled?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutHandler[];
  enabled?: boolean;
  scope?: HTMLElement | null;
}

function parseShortcut(shortcut: string): {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
} {
  const parts = shortcut.toLowerCase().split("+");
  return {
    mod: parts.includes("mod") || parts.includes("cmd") || parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
    key: parts.filter(
      (p) => !["mod", "cmd", "ctrl", "shift", "alt", "option"].includes(p)
    )[0] || "",
  };
}

function matchesShortcut(
  e: KeyboardEvent,
  shortcut: string,
  isMac: boolean
): boolean {
  const parsed = parseShortcut(shortcut);
  const modKey = isMac ? e.metaKey : e.ctrlKey;

  if (parsed.mod && !modKey) return false;
  if (!parsed.mod && modKey) return false;
  if (parsed.shift && !e.shiftKey) return false;
  if (!parsed.shift && e.shiftKey && parsed.key !== e.key.toLowerCase()) return false;
  if (parsed.alt && !e.altKey) return false;

  const eventKey = e.key.toLowerCase();
  if (parsed.key === "enter" && eventKey !== "enter") return false;
  if (parsed.key === "escape" && eventKey !== "escape") return false;
  if (parsed.key !== "enter" && parsed.key !== "escape" && eventKey !== parsed.key) {
    return false;
  }

  return true;
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  scope = null,
}: UseKeyboardShortcutsOptions): void {
  const isMacRef = useRef(
    typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  );
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.disabled) continue;

        if (matchesShortcut(e, shortcut.key, isMacRef.current)) {
          if (shortcut.key === "escape" || !isInput || shortcut.key.includes("mod")) {
            e.preventDefault();
            e.stopPropagation();
            shortcut.handler(e);
            return;
          }
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    const element = scope || document;
    element.addEventListener("keydown", handleKeyDown as EventListener);
    return () => {
      element.removeEventListener("keydown", handleKeyDown as EventListener);
    };
  }, [handleKeyDown, scope]);
}

export function getShortcutDisplay(shortcut: ShortcutKey): string {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const parts = shortcut.split("+");
  const displayParts = parts.map((part) => {
    switch (part.toLowerCase()) {
      case "mod":
      case "cmd":
      case "ctrl":
        return isMac ? "⌘" : "Ctrl";
      case "shift":
        return isMac ? "⇧" : "Shift";
      case "alt":
      case "option":
        return isMac ? "⌥" : "Alt";
      case "enter":
        return "↵";
      case "escape":
        return "Esc";
      default:
        return part.toUpperCase();
    }
  });

  return displayParts.join(isMac ? "" : "+");
}

export default useKeyboardShortcuts;
