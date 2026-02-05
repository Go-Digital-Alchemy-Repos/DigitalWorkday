# Theme Migration Checklist

## Audit Summary

**Audit date:** 2026-02-05
**Scope:** All `.tsx` and `.ts` files under `client/src/`

### Patterns searched
| Pattern | Matches |
|---|---|
| `bg-white`, `bg-gray-*`, `bg-slate-*` | 0 |
| `text-gray-*`, `text-slate-*`, `text-black` | 0 |
| `border-gray-*`, `border-slate-*`, `ring-blue-*`, `ring-gray-*` | 0 |
| `bg-blue-*`, `bg-red-*`, `bg-green-*`, `bg-yellow-*`, etc. | 0 |
| `text-blue-*`, `text-red-*`, `text-green-*`, etc. | 0 |
| Inline hex colors (`#xxx`, `rgb()`, `rgba()`) | 0 |
| All Tailwind literal color utilities (`bg-{color}-{shade}`) | 0 |
| All Tailwind literal text colors (`text-{color}-{shade}`) | 0 |
| All Tailwind literal border colors (`border-{color}-{shade}`) | 0 |

### Result

The client codebase has **zero hard-coded color values**. All color usage already references semantic CSS variable tokens via Tailwind utilities:

- `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-primary`, `bg-secondary`, `bg-accent`, `bg-destructive`
- `text-foreground`, `text-card-foreground`, `text-muted-foreground`, `text-primary-foreground`, etc.
- `border-border`, `border-input`, `ring-ring`
- Sidebar tokens: `bg-sidebar`, `text-sidebar-foreground`, etc.

### Migration Status by Area

| Area | Status | Notes |
|---|---|---|
| Shell / Nav / Sidebar | Already tokenized | Uses shadcn sidebar primitives + semantic tokens |
| Forms / Inputs | Already tokenized | Uses `border-input`, `ring-ring`, `bg-background` |
| Tables | Already tokenized | Uses `bg-card`, `text-foreground`, `border-border` |
| Drawers / Dialogs | Already tokenized | Uses `bg-popover`, `text-popover-foreground` |
| Chat / Comments | Already tokenized | Uses semantic tokens throughout |
| Cards / Surfaces | Already tokenized | Uses `bg-card`, `text-card-foreground` |
| Badges / Status | Already tokenized | Uses semantic tokens + status colors (defined in tailwind config) |

### High Risk Components

None identified — no migration needed.

### Status Color Exception

The `tailwind.config.ts` defines hardcoded `rgb()` values for status indicators:
```ts
status: {
  online: "rgb(34 197 94)",
  away: "rgb(245 158 11)",
  busy: "rgb(239 68 68)",
  offline: "rgb(156 163 175)",
}
```
These are intentionally fixed semantic colors (online=green, away=yellow, busy=red, offline=gray) that should NOT change with theme accent. They are correctly kept outside the token system.
