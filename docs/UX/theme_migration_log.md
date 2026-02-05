# Theme Migration Log

## Canonical Mappings

Standard replacements for migrating hard-coded Tailwind colors to semantic tokens:

### Background / Text
| Hard-coded | Token replacement |
|---|---|
| `bg-white`, `bg-slate-50`, `bg-gray-50` | `bg-background` |
| `bg-gray-100`, `bg-slate-100` | `bg-muted` |
| `text-black`, `text-gray-900`, `text-slate-900` | `text-foreground` |
| `text-gray-600`, `text-gray-500`, `text-slate-500` | `text-muted-foreground` |

### Surfaces
| Hard-coded | Token replacement |
|---|---|
| Card backgrounds (`bg-white` in cards) | `bg-card text-card-foreground` |
| Popover/menu backgrounds | `bg-popover text-popover-foreground` |
| Sidebar backgrounds | `bg-sidebar text-sidebar-foreground` |

### Borders / Inputs
| Hard-coded | Token replacement |
|---|---|
| `border-gray-200`, `border-slate-200` | `border-border` |
| `border-gray-300` (on inputs) | `border-input` |
| `ring-blue-*`, `ring-gray-*` | `ring-ring` |
| `divide-gray-200` | `divide-border` |

### Primary / Accent
| Hard-coded | Token replacement |
|---|---|
| `bg-blue-600 text-white` | `bg-primary text-primary-foreground` |
| `text-blue-600`, `text-blue-500` | `text-primary` |
| `hover:bg-blue-700` | (handled by elevation system) |
| `bg-blue-50` (light accent bg) | `bg-accent text-accent-foreground` |

### Destructive
| Hard-coded | Token replacement |
|---|---|
| `bg-red-600 text-white` | `bg-destructive text-destructive-foreground` |
| `text-red-600`, `text-red-500` | `text-destructive` |
| `border-red-*` | `border-destructive` |

### Muted / Secondary
| Hard-coded | Token replacement |
|---|---|
| `bg-gray-100`, `bg-slate-100` | `bg-muted text-muted-foreground` |
| `bg-gray-200` (secondary buttons) | `bg-secondary text-secondary-foreground` |

---

## Migration Log

### 2026-02-05 — Initial Audit

**Result:** No migration needed.

Full audit of `client/src/` found zero hard-coded color patterns. The codebase already uses semantic CSS variable tokens exclusively. All Tailwind color utilities reference `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, etc.

**Files changed:** 0

**Theme foundation established:**
- CSS accent presets added to `client/src/index.css` (green, blue, indigo, teal, orange, slate)
- `ThemeProvider` extended with accent support in `client/src/lib/theme-provider.tsx`
- Documentation created at `docs/UX/theme_tokens.md`
