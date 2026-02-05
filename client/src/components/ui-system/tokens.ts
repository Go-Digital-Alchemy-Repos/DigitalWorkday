export const spacing = {
  xs: "0.25rem",   // 4px
  sm: "0.5rem",    // 8px
  md: "1rem",      // 16px
  lg: "1.5rem",    // 24px
  xl: "2rem",      // 32px
  "2xl": "3rem",   // 48px
} as const;

export const radius = {
  sm: "0.375rem",  // 6px - buttons, badges
  md: "0.5rem",    // 8px - inputs, small cards
  lg: "1rem",      // 16px - cards, modals
  xl: "1.25rem",   // 20px - large cards, drawers
  full: "9999px",  // pills, avatars
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  card: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  elevated: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  modal: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
} as const;

export const sectionSpacing = {
  betweenSections: "1.5rem",  // 24px between major sections
  withinSection: "1rem",       // 16px within sections
  cardPadding: "1.25rem",      // 20px inside cards
  pagePadding: "1.5rem",       // 24px page margins
} as const;
