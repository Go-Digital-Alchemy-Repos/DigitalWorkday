# UX Micropolish Guide

## Loading States

### PageSkeleton Component

Location: `client/src/components/skeletons/page-skeleton.tsx`

A unified loading skeleton used across all route-level and page-level loading states. Replaces individual `Loader2` spinners with content-representative skeletons.

**Variants:**
- `standard` (default) - Header + cards grid + content area. Used for most pages.
- `compact` - Smaller layout for settings/account pages and nested views.
- `dashboard` - Full-width cards grid optimized for dashboard/admin views.

**Usage:**
```tsx
import { PageSkeleton } from "@/components/skeletons/page-skeleton";

// Route-level fallback (in router Suspense boundaries)
<Suspense fallback={<PageSkeleton />}>

// Dashboard pages
<PageSkeleton variant="dashboard" />

// Settings/compact pages
<PageSkeleton variant="compact" />
```

**Applied in:**
- `tenantRouter.tsx` - All lazy-loaded tenant routes
- `superRouter.tsx` - All lazy-loaded super-admin routes
- `portalRouter.tsx` - All lazy-loaded portal routes
- `App.tsx` - Top-level router Suspense fallback
- `user-manager.tsx`, `account.tsx`, `super-admin.tsx`, `super-admin-docs.tsx` - Page-level loading states

### Inline Skeletons
Individual pages use `<Skeleton />` from shadcn for inline loading states within cards and data sections (e.g., metric values, lists).

## Animations

### Drawer/Sheet Animation
Location: `client/src/components/ui/sheet.tsx`

Animation durations tuned for a snappier feel:
- Overlay fade: 150ms in, 150ms out (was 300ms/300ms)
- Content slide: 200ms in, 150ms out (was 500ms/300ms)

Uses `data-[state=open]` and `data-[state=closed]` CSS animation attributes.

## Empty States

### EmptyState Component
Location: `client/src/components/layout/index.ts` (exported from layout barrel)

Provides consistent empty state messaging with icon, title, description, and optional action button. Has preset configurations for common scenarios.

Used across: `projects-dashboard`, `crm-followups`, `client-360`, `crm-pipeline`, `my-tasks`, and more.

### Inline Empty States
For card-level empty sections (e.g., home page widgets), inline empty states with contextual icons and messages are used directly within `CardContent` for a more compact presentation.

## Hover States

The application uses the `hover-elevate` utility class (defined in `index.css`) consistently across interactive elements:
- Stat cards on the home dashboard
- Project cards and list items
- Client cards and pipeline stages
- Navigation items via shadcn sidebar primitives
- Buttons and badges have built-in hover/active states

## Design Decisions

1. **Skeletons over spinners**: Content-representative skeletons reduce perceived loading time and prevent layout shift.
2. **Fast animations**: 150-200ms drawer animations feel instant while maintaining visual continuity.
3. **Consistent empty states**: The `EmptyState` component with action buttons encourages users to take the next logical step.
4. **Hover elevation**: The `hover-elevate` utility provides theme-aware hover feedback that works in both light and dark modes.
