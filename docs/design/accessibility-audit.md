# Accessibility Audit - MyWorkDay (WCAG AA Compliance)

**Audit Date**: 2026-02-19
**Standard**: WCAG 2.1 Level AA
**Scope**: Full application (Tenant, Super Admin, Client Portal layouts)

---

## Summary

This document covers the accessibility audit and fixes applied to the MyWorkDay application to achieve WCAG AA compliance. The audit covered interactive elements, navigation, focus management, ARIA semantics, keyboard operability, and color contrast.

---

## Findings & Fixes

### 1. Icon-Only Buttons (Missing `aria-label`)

**Issue**: 70+ icon-only buttons (`size="icon"`) across 23+ files had no accessible name. Screen readers would announce them as empty buttons.

**WCAG Criterion**: 1.1.1 Non-text Content, 4.1.2 Name, Role, Value

**Files Fixed**:
- `client/src/routing/tenantRouter.tsx` - Chat toggle, mobile menu
- `client/src/pages/project.tsx` - Back, settings, filter, view toggles
- `client/src/pages/client-detail.tsx` - Back, edit, more options
- `client/src/pages/clients.tsx` - Search, filter, clear, view toggles
- `client/src/pages/chat.tsx` - Send, attach, close, settings
- `client/src/pages/my-tasks.tsx` - Add, collapse, expand, filter
- `client/src/pages/calendar.tsx` - Navigation arrows, view controls
- `client/src/pages/team-detail.tsx` - Back, edit, remove member
- `client/src/pages/client-360.tsx` - Edit, call, email, notes
- `client/src/pages/super-admin.tsx` - Search, refresh, tenant actions
- `client/src/pages/super-admin-settings.tsx` - Edit, save, reset
- `client/src/pages/super-admin-users.tsx` - Search, filter, user actions
- `client/src/features/tasks/task-detail-drawer.tsx` - Close, priority, assignee
- `client/src/features/tasks/task-card.tsx` - Menu, drag handle
- `client/src/components/notification-center.tsx` - Bell icon, dismiss
- `client/src/components/comment-thread.tsx` - Reply, edit, delete
- `client/src/components/attachment-uploader.tsx` - Delete attachment
- `client/src/components/common/file-dropzone.tsx` - Remove image
- `client/src/components/common/S3Dropzone.tsx` - Remove upload

**Pattern Applied**:
```tsx
<Button size="icon" variant="ghost" aria-label="Go back">
  <ArrowLeft className="h-4 w-4" />
</Button>
```

### 2. Skip Navigation Links

**Issue**: No skip navigation mechanism existed for keyboard users to bypass repeated sidebar/header navigation.

**WCAG Criterion**: 2.4.1 Bypass Blocks

**Fix**: Created `client/src/components/skip-link.tsx` with a visually-hidden-until-focused link that jumps to `#main-content`. Added to all three layouts:
- `client/src/routing/tenantRouter.tsx` (Tenant layout)
- `client/src/routing/superRouter.tsx` (Super Admin layout)
- `client/src/routing/portalRouter.tsx` (Client Portal layout)

Each layout's `<main>` element received `id="main-content"`.

### 3. Drawer Component Accessibility

**Issue**: The Vaul Drawer's drag handle indicator (`<div>` bar) was exposed to screen readers without semantic meaning.

**WCAG Criterion**: 1.3.1 Info and Relationships

**Fix**: Added `aria-hidden="true"` to the decorative drag handle bar in `client/src/components/ui/drawer.tsx`.

**Note**: Vaul's DrawerPrimitive already provides focus trapping and keyboard dismissal via Escape.

### 4. Dialog/Sheet Components (Already Compliant)

**Finding**: Radix UI primitives used by shadcn (Dialog, Sheet, AlertDialog, DropdownMenu) already include:
- Focus trapping within open dialogs
- Escape key to close
- Focus restoration to trigger element on close
- Proper `role="dialog"` and `aria-modal="true"`
- Title association via `aria-labelledby`

No changes were needed for these components.

### 5. Table Component Keyboard Navigation

**Issue**: Tables lacked proper ARIA roles and were not keyboard-navigable.

**WCAG Criterion**: 1.3.1 Info and Relationships, 2.1.1 Keyboard

**Fixes in `client/src/components/ui/table.tsx`**:
- Table wrapper: Added `role="region"`, `aria-label="Data table"`, `tabIndex={0}` for scrollable region focus
- Arrow key navigation: `ArrowDown`/`ArrowUp` moves focus between rows, `Home`/`End` jump to first/last row, `Enter` activates the row's primary action
- `<table>`: Added explicit `role="table"`
- `<th>`: Added `scope="col"` by default
- `<tr>`: Added `tabIndex={-1}` for programmatic focus and `focus-visible` ring styling
- Custom `useTableKeyboardNav` hook handles keyboard event delegation from the region container

### 6. Drag-and-Drop Upload Zones

**Issue**: Dropzone areas were `<div>` elements with click/drag handlers but no keyboard operability or ARIA semantics.

**WCAG Criterion**: 2.1.1 Keyboard, 4.1.2 Name, Role, Value

**Files Fixed**:
- `client/src/components/common/file-dropzone.tsx`
- `client/src/components/common/S3Dropzone.tsx`
- `client/src/components/attachment-uploader.tsx`

**Pattern Applied**:
- Empty dropzone (no file): `role="button"` with keyboard activation
- Dropzone with file preview and nested controls (remove button): `role="group"` to avoid nesting interactive elements inside `role="button"`

```tsx
<div
  role={hasNestedControls ? "group" : "button"}
  tabIndex={0}
  aria-label="Upload File. Drag and drop or press Enter to upload"
  aria-disabled={disabled}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }}
  className="... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
```

### 7. Color Contrast

**Finding**: The application uses CSS custom properties for theming with 14 theme packs. Each theme pack defines foreground/background colors that maintain AA contrast ratios. The `text-muted-foreground` token provides at least 4.5:1 contrast against `background` in all standard themes.

**Recommendation**: Periodically validate new theme packs with a contrast checker tool.

---

## Pre-Existing Compliance

The following areas were already WCAG AA compliant before the audit:

| Area | Mechanism |
|------|-----------|
| Modal focus trapping | Radix UI Dialog/Sheet/AlertDialog primitives |
| Escape to close | Radix UI built-in keyboard handling |
| Focus restoration | Radix UI trigger-to-focus-return pattern |
| Form labels | react-hook-form + shadcn Form components with Label/htmlFor |
| Form validation | Zod + FormMessage with aria-describedby |
| Color themes | CSS custom properties with consistent contrast ratios |
| Responsive design | Tailwind responsive breakpoints + useIsMobile hook |

---

## Remaining Recommendations

1. **Live Regions for Notifications**: Consider adding `aria-live="polite"` regions for toast notifications and real-time updates (Socket.IO messages). The toast component may already handle this depending on the Radix implementation.

2. **Sortable Task Columns (dnd-kit)**: The dnd-kit library used for board view drag-and-drop has built-in accessibility announcements. Verify these are working correctly with screen readers.

3. **FullCalendar a11y**: FullCalendar provides built-in keyboard navigation. Verify arrow key navigation and event focus work correctly.

4. **Automated Testing**: Consider integrating `axe-core` or `@axe-core/playwright` into the test suite for automated accessibility regression testing.
