export const SPACING = {
  px: "var(--space-px)",
  "0.5": "var(--space-0-5)",
  "1": "var(--space-1)",
  "1.5": "var(--space-1-5)",
  "2": "var(--space-2)",
  "3": "var(--space-3)",
  "4": "var(--space-4)",
  "5": "var(--space-5)",
  "6": "var(--space-6)",
  "8": "var(--space-8)",
  "10": "var(--space-10)",
  "12": "var(--space-12)",
  "16": "var(--space-16)",
  page: "var(--space-page)",
  section: "var(--space-section)",
  card: "var(--space-card)",
  inline: "var(--space-inline)",
} as const;

export const TYPOGRAPHY = {
  display: "text-display",
  h1: "text-h1",
  h2: "text-h2",
  h3: "text-h3",
  h4: "text-h4",
  body: "text-body",
  small: "text-small",
  caption: "text-caption",
  overline: "text-overline",
} as const;

export const RADII = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  full: "var(--radius-full)",
} as const;

export const DURATION = {
  instant: "var(--duration-instant)",
  fast: "var(--duration-fast)",
  normal: "var(--duration-normal)",
  slow: "var(--duration-slow)",
  slower: "var(--duration-slower)",
} as const;

export const Z_INDEX = {
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

export type IntentColor = "success" | "warning" | "info" | "destructive" | "neutral";

export const INTENT_CLASSES: Record<IntentColor, { bg: string; text: string; border: string; badge: string; icon: string }> = {
  success: {
    bg: "bg-success/10 dark:bg-success/15",
    text: "text-success dark:text-success",
    border: "border-success/20 dark:border-success/25",
    badge: "bg-success/10 text-success border-success/20",
    icon: "text-success",
  },
  warning: {
    bg: "bg-warning/10 dark:bg-warning/15",
    text: "text-warning dark:text-warning",
    border: "border-warning/20 dark:border-warning/25",
    badge: "bg-warning/10 text-warning border-warning/20",
    icon: "text-warning",
  },
  info: {
    bg: "bg-info/10 dark:bg-info/15",
    text: "text-info dark:text-info",
    border: "border-info/20 dark:border-info/25",
    badge: "bg-info/10 text-info border-info/20",
    icon: "text-info",
  },
  destructive: {
    bg: "bg-destructive/10 dark:bg-destructive/15",
    text: "text-destructive dark:text-destructive",
    border: "border-destructive/20 dark:border-destructive/25",
    badge: "bg-destructive/10 text-destructive border-destructive/20",
    icon: "text-destructive",
  },
  neutral: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    badge: "bg-muted text-muted-foreground border-border",
    icon: "text-muted-foreground",
  },
};

export type PriorityLevel = "none" | "low" | "medium" | "high" | "urgent";

export const PRIORITY_CLASSES: Record<PriorityLevel, string> = {
  none: "bg-muted text-muted-foreground",
  low: "bg-info/10 text-info dark:bg-info/15",
  medium: "bg-warning/10 text-warning dark:bg-warning/15",
  high: "bg-warning/15 text-warning dark:bg-warning/20",
  urgent: "bg-destructive/10 text-destructive dark:bg-destructive/15",
};

export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "completed";

export const STATUS_CLASSES: Record<TaskStatus, string> = {
  backlog: "bg-muted text-muted-foreground",
  todo: "bg-info/10 text-info dark:bg-info/15",
  blocked: "bg-destructive/10 text-destructive dark:bg-destructive/15",
  in_progress: "bg-info/10 text-info dark:bg-info/15",
  in_review: "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
  done: "bg-success/10 text-success dark:bg-success/15",
  completed: "bg-success/10 text-success dark:bg-success/15",
};

export type DueDateUrgency = "overdue" | "today" | "tomorrow" | "upcoming" | "none";

export const DUE_DATE_CLASSES: Record<DueDateUrgency, string> = {
  overdue: "bg-destructive/10 text-destructive dark:bg-destructive/15",
  today: "bg-warning/10 text-warning dark:bg-warning/15",
  tomorrow: "bg-warning/8 text-warning dark:bg-warning/12",
  upcoming: "bg-info/10 text-info dark:bg-info/15",
  none: "bg-muted text-muted-foreground",
};

export const MODAL_WIDTHS = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  full: "sm:max-w-[90vw]",
} as const;

export const MIN_TOUCH_TARGET = "min-h-10 md:min-h-9" as const;

export const COLOR_REFS = {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  primary: "hsl(var(--primary))",
  primaryForeground: "hsl(var(--primary-foreground))",
  secondary: "hsl(var(--secondary))",
  secondaryForeground: "hsl(var(--secondary-foreground))",
  muted: "hsl(var(--muted))",
  mutedForeground: "hsl(var(--muted-foreground))",
  accent: "hsl(var(--accent))",
  accentForeground: "hsl(var(--accent-foreground))",
  destructive: "hsl(var(--destructive))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  info: "hsl(var(--info))",
  card: "hsl(var(--card))",
  cardForeground: "hsl(var(--card-foreground))",
  border: "hsl(var(--border))",
  ring: "hsl(var(--ring))",
} as const;
