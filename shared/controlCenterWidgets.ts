export type WidgetSize = "sm" | "md" | "lg";
export type WidgetMinRole = "employee" | "admin";

export interface WidgetDefinition {
  id: string;
  title: string;
  description: string;
  minRole: WidgetMinRole;
  defaultPinned: boolean;
  defaultOrder: number;
  sizeOptions: WidgetSize[];
  defaultSize: WidgetSize;
  category: "tiles" | "stats" | "feed";
}

export interface WidgetLayoutItem {
  id: string;
  order: number;
  size?: WidgetSize;
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  {
    id: "tiles_activity",
    title: "Activity",
    description: "Recent client activity summary",
    minRole: "employee",
    defaultPinned: true,
    defaultOrder: 0,
    sizeOptions: ["sm", "md"],
    defaultSize: "sm",
    category: "tiles",
  },
  {
    id: "tiles_reports",
    title: "Reports",
    description: "Client reporting metrics",
    minRole: "admin",
    defaultPinned: true,
    defaultOrder: 1,
    sizeOptions: ["sm", "md"],
    defaultSize: "sm",
    category: "tiles",
  },
  {
    id: "tiles_portal_users",
    title: "Portal Users",
    description: "Client portal user summary",
    minRole: "admin",
    defaultPinned: true,
    defaultOrder: 2,
    sizeOptions: ["sm", "md"],
    defaultSize: "sm",
    category: "tiles",
  },
  {
    id: "tiles_divisions",
    title: "Divisions",
    description: "Client division breakdown",
    minRole: "employee",
    defaultPinned: true,
    defaultOrder: 3,
    sizeOptions: ["sm", "md"],
    defaultSize: "sm",
    category: "tiles",
  },
  {
    id: "stats_health_snapshot",
    title: "Health Snapshot",
    description: "Client health overview with key indicators",
    minRole: "employee",
    defaultPinned: true,
    defaultOrder: 4,
    sizeOptions: ["md", "lg"],
    defaultSize: "md",
    category: "stats",
  },
  {
    id: "stats_operational_alerts",
    title: "Operational Alerts",
    description: "Open tickets, overdue tasks, and warnings",
    minRole: "employee",
    defaultPinned: true,
    defaultOrder: 5,
    sizeOptions: ["md", "lg"],
    defaultSize: "md",
    category: "stats",
  },
  {
    id: "feed_recent_messages",
    title: "Recent Messages",
    description: "Latest messages and conversations",
    minRole: "employee",
    defaultPinned: false,
    defaultOrder: 7,
    sizeOptions: ["md", "lg"],
    defaultSize: "md",
    category: "feed",
  },
  {
    id: "stats_assets_summary",
    title: "Assets Summary",
    description: "File and asset storage overview",
    minRole: "employee",
    defaultPinned: false,
    defaultOrder: 8,
    sizeOptions: ["sm", "md"],
    defaultSize: "sm",
    category: "stats",
  },
  {
    id: "stats_projects_summary",
    title: "Projects Summary",
    description: "Active projects and completion metrics",
    minRole: "employee",
    defaultPinned: false,
    defaultOrder: 9,
    sizeOptions: ["sm", "md", "lg"],
    defaultSize: "md",
    category: "stats",
  },
];

export const WIDGET_MAP = new Map(WIDGET_CATALOG.map((w) => [w.id, w]));

export const MAX_PINNED_WIDGETS = 12;

export function getDefaultLayout(role: WidgetMinRole): WidgetLayoutItem[] {
  return WIDGET_CATALOG
    .filter((w) => w.defaultPinned && (role === "admin" || w.minRole === "employee"))
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((w, i) => ({ id: w.id, order: i, size: w.defaultSize }));
}

export function filterLayoutByRole(layout: WidgetLayoutItem[], role: WidgetMinRole): WidgetLayoutItem[] {
  return layout.filter((item) => {
    const def = WIDGET_MAP.get(item.id);
    if (!def) return false;
    if (role !== "admin" && def.minRole === "admin") return false;
    return true;
  });
}

export function sanitizeLayout(layout: WidgetLayoutItem[]): WidgetLayoutItem[] {
  const seen = new Set<string>();
  const clean: WidgetLayoutItem[] = [];
  for (const item of layout) {
    if (!WIDGET_MAP.has(item.id)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    clean.push(item);
  }
  return clean
    .slice(0, MAX_PINNED_WIDGETS)
    .map((item, i) => ({ ...item, order: i }));
}
