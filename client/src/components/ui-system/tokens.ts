import { DURATION, RADII, SPACING, Z_INDEX } from "@/design/tokens";

export const spacing = {
  xs: SPACING["1"],      // 4px
  sm: SPACING["2"],      // 8px
  md: SPACING["4"],      // 16px
  lg: SPACING["6"],      // 24px
  xl: SPACING["8"],      // 32px
  "2xl": SPACING["12"],  // 48px
} as const;

export const radius = {
  sm: RADII.sm,    // 3px  - badges
  md: RADII.md,    // 6px  - inputs, buttons
  lg: RADII.lg,    // 9px  - cards
  xl: RADII.xl,    // 16px - modals, drawers
  full: RADII.full,
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  card: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  elevated: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  modal: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
} as const;

export const sectionSpacing = {
  betweenSections: SPACING.section,
  withinSection: SPACING["4"],
  cardPadding: SPACING.card,
  pagePadding: SPACING.page,
} as const;

export const motion = {
  duration: {
    instant: DURATION.instant,
    fast: DURATION.fast,
    normal: DURATION.normal,
    slow: DURATION.slow,
    slower: DURATION.slower,
  },
  easing: {
    standard: "var(--ease-standard)",
    in: "var(--ease-in)",
    out: "var(--ease-out)",
    bounce: "var(--ease-bounce)",
    spring: "var(--ease-spring)",
  },
} as const;

export const zIndex = {
  base: Z_INDEX.base,
  dropdown: Z_INDEX.dropdown,
  sticky: Z_INDEX.sticky,
  overlay: Z_INDEX.overlay,
  modal: Z_INDEX.modal,
  popover: Z_INDEX.popover,
  toast: Z_INDEX.toast,
  tooltip: Z_INDEX.tooltip,
  max: Z_INDEX.max,
} as const;
