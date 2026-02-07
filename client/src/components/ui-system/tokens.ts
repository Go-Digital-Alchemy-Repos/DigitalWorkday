export const spacing = {
  xs: "var(--space-1)",      // 4px
  sm: "var(--space-2)",      // 8px
  md: "var(--space-4)",      // 16px
  lg: "var(--space-6)",      // 24px
  xl: "var(--space-8)",      // 32px
  "2xl": "var(--space-12)",  // 48px
} as const;

export const radius = {
  sm: "var(--radius-sm)",    // 3px  - badges
  md: "var(--radius-md)",    // 6px  - inputs, buttons
  lg: "var(--radius-lg)",    // 9px  - cards
  xl: "var(--radius-xl)",    // 16px - modals, drawers
  full: "var(--radius-full)",
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  card: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  elevated: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  modal: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
} as const;

export const sectionSpacing = {
  betweenSections: "var(--space-section)",
  withinSection: "var(--space-4)",
  cardPadding: "var(--space-card)",
  pagePadding: "var(--space-page)",
} as const;

export const motion = {
  duration: {
    instant: "var(--duration-instant)",
    fast: "var(--duration-fast)",
    normal: "var(--duration-normal)",
    slow: "var(--duration-slow)",
    slower: "var(--duration-slower)",
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
  base: "var(--z-base)",
  dropdown: "var(--z-dropdown)",
  sticky: "var(--z-sticky)",
  overlay: "var(--z-overlay)",
  modal: "var(--z-modal)",
  popover: "var(--z-popover)",
  toast: "var(--z-toast)",
  tooltip: "var(--z-tooltip)",
  max: "var(--z-max)",
} as const;
