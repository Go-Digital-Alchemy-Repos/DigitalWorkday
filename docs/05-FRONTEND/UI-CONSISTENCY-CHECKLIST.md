# UI Consistency Checklist

Quick-reference rules for keeping the MyWorkDay UI consistent. Every new page and component should pass these checks.

---

## 1. Layout

| Rule | How | Token / Class |
|------|-----|---------------|
| Page wrapper | Use `PageShell` (layout/) or `AppShell` (ui-system/) | `p-page` padding |
| Page header | Use `PageHeader` from either module | `mb-section` bottom margin |
| Section spacing | Vertical gap between major sections | `gap-section` or `space-y-section` |
| Card padding | Consistent inner padding on Cards | `p-card-pad` |
| Inline spacing | Small gaps between inline elements | `gap-inline` |

## 2. Typography

Use token-based font-size classes instead of raw Tailwind sizes:

| Intent | Class | Resolves to |
|--------|-------|-------------|
| Hero / display | `text-display` | 36px, bold, tight tracking |
| Page title | `text-h2` | 24px, semibold, tight tracking |
| Section heading | `text-h3` | 20px, semibold |
| Sub-heading | `text-h4` | 18px, medium |
| Body copy | `text-body` | 14px |
| Small / helper | `text-small` | 13px |
| Caption / timestamp | `text-caption` | 12px |
| Overline label | `text-overline` | 11px, medium, wide tracking |

Or use the Typography components from ui-system:

```tsx
import { PageTitle, SectionTitle, BodyText, MutedText, LabelText } from "@/components/ui-system";
```

## 3. Colors & Surfaces

- Use semantic color tokens: `bg-background`, `bg-card`, `bg-muted`, `bg-accent`
- Semantic status colors: `text-success`, `text-warning`, `text-info`, `text-destructive`
- Surface aliases in tokens.css: `--surface-page`, `--surface-raised`, `--surface-overlay`, `--surface-sunken`
- Text hierarchy: `text-foreground` (primary), `text-muted-foreground` (secondary), keep at most 3 levels

## 4. Motion

| Token | Duration | Use for |
|-------|----------|---------|
| `duration-instant` | 75ms | Micro-interactions (checkbox, toggle) |
| `duration-fast` | 150ms | Hover effects, tooltips |
| `duration-normal` | 200ms | Standard transitions, accordion |
| `duration-slow` | 300ms | Drawer open/close, panel slides |
| `duration-slower` | 500ms | Page transitions, complex animations |

Easing functions: `ease-standard`, `ease-in`, `ease-out`, `ease-bounce`, `ease-spring`

## 5. Z-Index Scale

| Token | Value | Use for |
|-------|-------|---------|
| `z-dropdown` | 50 | Dropdowns, select menus |
| `z-sticky` | 100 | Sticky headers, toolbars |
| `z-overlay` | 200 | Backdrop overlays |
| `z-modal` | 300 | Modal dialogs |
| `z-popover` | 400 | Popovers, tooltips |
| `z-toast` | 500 | Toast notifications |
| `z-tooltip` | 600 | Tooltips on top of everything |
| `z-max` | 9999 | Emergency override only |

## 6. Interactions

- Use `hover-elevate` and `active-elevate-2` utility classes for hover/active states
- Never add custom `hover:bg-*` to Buttons or Badges (they have built-in elevation)
- Use `toggle-elevate` + `toggle-elevated` for toggle states
- Remove default elevation with `no-default-hover-elevate` or `no-default-active-elevate` when needed

## 7. Component Usage

- Always use shadcn `<Button>`, `<Card>`, `<Badge>` — never recreate
- Icon-only buttons: `<Button size="icon">` — never add custom h/w classes
- Sidebar: always use `@/components/ui/sidebar` primitives
- Avatars: always use shadcn Avatar with AvatarFallback
- Forms: `useForm` + `Form` from shadcn, with `zodResolver`
- Data display: use `LoadingState` / `ErrorState` / `EmptyState` from layout or ui-system

## 8. Data Test IDs

Every interactive or meaningful element needs a `data-testid`:

| Pattern | Example |
|---------|---------|
| Interactive | `button-submit`, `input-email`, `link-profile` |
| Display | `text-username`, `status-payment` |
| Dynamic list | `card-project-${id}`, `row-user-${index}` |

## 9. Dark Mode

- All color variables are defined in `:root` and `.dark` blocks in index.css
- Always use semantic tokens (`bg-card`, `text-foreground`) instead of raw colors
- If using literal colors, always include `dark:` variant
- Hero images: use dark wash overlay so text reads in both modes

## 10. Import Paths

| Module | Path | Contains |
|--------|------|----------|
| Layout primitives | `@/components/layout` | PageShell, PageHeader, EmptyState, LoadingState, ErrorState, DataToolbar, ConfirmDialog |
| UI system | `@/components/ui-system` | AppShell, PageHeader, Typography, MetricCard, EmptyState, LoadingSkeleton, DetailDrawer, DataToolbar, AvatarWithStatus, Motion, tokens |
| UI components | `@/components/ui/*` | All shadcn components |

New code should prefer importing from `@/components/ui-system` when available.
