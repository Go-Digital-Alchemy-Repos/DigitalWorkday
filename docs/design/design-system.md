# MyWorkDay Design System

## Semantic Color Tokens

All UI components must use **semantic color tokens** rather than literal Tailwind color classes (e.g., `bg-green-500`, `text-red-600`). Semantic tokens adapt automatically to the active theme pack.

### Token source

`client/src/design/tokens.ts` exports typed class-name maps for:

| Map | Keys | Usage |
|---|---|---|
| `INTENT_CLASSES` | `success`, `warning`, `info`, `destructive`, `neutral` | Banners, alerts, toast backgrounds |
| `PRIORITY_CLASSES` | `none`, `low`, `medium`, `high`, `urgent` | Task priority badges |
| `STATUS_CLASSES` | `backlog`, `todo`, `in_progress`, `blocked`, `done` | Task status badges |
| `DUE_DATE_CLASSES` | `overdue`, `today`, `tomorrow`, `upcoming`, `none` | Due-date badges |

### CSS custom properties (from `tokens.css`)

| Category | Variables |
|---|---|
| Spacing | `--space-1` through `--space-16`, `--space-page`, `--space-section`, `--space-card`, `--space-inline` |
| Typography | `--text-display` through `--text-overline` |
| Radii | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-full` |
| Motion | `--duration-instant`, `--duration-fast`, `--duration-normal`, `--duration-slow`, `--duration-slower` |
| Z-index | `--z-base` through `--z-max` |

### Semantic color variables (from theme packs)

| Variable | Purpose |
|---|---|
| `--success` / `--success-foreground` | Positive outcomes, completion |
| `--warning` / `--warning-foreground` | Caution, attention needed |
| `--info` / `--info-foreground` | Informational, in-progress |
| `--destructive` / `--destructive-foreground` | Errors, danger, critical |
| `--primary` / `--primary-foreground` | Brand, primary actions |
| `--secondary` / `--secondary-foreground` | Secondary actions |
| `--muted` / `--muted-foreground` | Neutral, inactive |
| `--accent` / `--accent-foreground` | Highlight, accent |

## Button Usage

### Required: Use `<Button>` component

All clickable action elements must use the shared `<Button>` component from `@/components/ui/button`.

**Exceptions** (raw `<button>` is acceptable):
- List option items in popovers/dropdowns (mention lists, watcher selectors)
- Inline remove buttons inside Badge/Tag components
- `CollapsibleTrigger asChild` compositions
- Color swatch pickers (circular visual selectors)

### Button variants

| Variant | When to use |
|---|---|
| `default` | Primary actions (Save, Submit, Create) |
| `secondary` | Secondary actions |
| `outline` | Tertiary actions, cancel buttons |
| `ghost` | Inline actions, toolbar buttons, load-more |
| `destructive` | Delete, remove, dangerous actions |
| `link` | Text-style navigation links |

### Toggle pattern

Use `toggle-elevate` + `toggle-elevated` classes for toggleable buttons:
```tsx
<Button className="toggle-elevate toggle-elevated" />
```

Or use variant switching for binary toggles:
```tsx
<Button variant={isActive ? "default" : "outline"} className="toggle-elevate" />
```

## Badge Usage

### Semantic badges

Use the pre-built badge components:
- `<PriorityBadge priority="high" />` — Maps to `PRIORITY_CLASSES`
- `<StatusBadge status="in_progress" />` — Maps to `STATUS_CLASSES`
- `<DueDateBadge date={task.dueDate} />` — Maps to `DUE_DATE_CLASSES`
- `<TagBadge name="Design" color="#..." />` — User-defined colors (acceptable exception)

### Status indicator colors in data tables

For inline status indicators (email logs, pipeline stages, etc.), use the semantic token maps:
```tsx
const STATUS_COLORS = {
  sent: "bg-success/10 text-success dark:bg-success/15",
  failed: "bg-destructive/10 text-destructive dark:bg-destructive/15",
  queued: "bg-warning/10 text-warning dark:bg-warning/15",
};
```

## Banner Patterns

| Banner type | Background | Text | Border |
|---|---|---|---|
| Warning/Feature | `bg-warning/10` | `text-warning` | `border-warning/20` |
| System alert (tenant impersonation) | `bg-warning` | `text-warning-foreground` | — |
| Critical alert (user impersonation) | `bg-destructive` | `text-destructive-foreground` | — |

## Interaction Patterns

- Use `hover-elevate` for hover feedback on non-Button/Badge elements
- Use `active-elevate-2` for press-down feedback
- Never add custom `hover:bg-*` classes to `<Button>` or `<Badge>` components
- Use `no-default-hover-elevate` to opt out of built-in elevation

## Theme Packs

14 curated themes defined in `client/src/theme/themePacks.ts`. Each pack sets all semantic CSS variables. Resolution chain:

```
themePackId ?? themeMode ?? tenantDefaultThemePack ?? "light"
```

## File Organization

```
client/src/
  design/
    tokens.ts          # Semantic class maps and token references
  styles/
    tokens.css         # CSS custom properties (spacing, typography, motion, z-index)
  theme/
    themePacks.ts      # 14 theme pack definitions
  components/ui/
    button.tsx         # Shared Button component
    badge.tsx          # Shared Badge component
  components/
    priority-badge.tsx # Priority badge using PRIORITY_CLASSES
    status-badge.tsx   # Status badge using STATUS_CLASSES
    due-date-badge.tsx # Due date badge using DUE_DATE_CLASSES
```
