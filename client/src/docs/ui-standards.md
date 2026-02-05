# UI Standards Guide

This document defines the visual and interaction standards for the MyWorkDay application to ensure consistency across all screens.

## Spacing Scale

We use a consistent spacing scale based on Tailwind's default scale:

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 0.5rem (8px) | Dense lists, badges |
| `sm` | 0.75rem (12px) | Card padding, icon gaps |
| `md` | 1rem (16px) | Default component spacing |
| `lg` | 1.5rem (24px) | Section gaps, card margins |
| `xl` | 2rem (32px) | Page sections |
| `2xl` | 3rem (48px) | Major page divisions |

### Standard Patterns
- Page padding: `p-6` on main content areas
- Card spacing: `space-y-4` between cards
- Form field gaps: `space-y-4` between fields
- Button groups: `gap-2` between buttons
- Header to content: `mb-6`

## Page Layout

### PageShell
Wrap all page content in `<PageShell>` for consistent padding and max-width:
```tsx
<PageShell>
  <PageHeader title="Page Title" />
  {/* Page content */}
</PageShell>
```

### PageHeader
Standard page header layout:
- Title on the left (h1, text-2xl font-bold)
- Optional subtitle below title (text-muted-foreground)
- Actions area on the right
- Breadcrumbs above title when applicable

```tsx
<PageHeader 
  title="Projects"
  subtitle="Manage your team's projects"
  actions={<Button>Create Project</Button>}
/>
```

## Button Placement

### Primary Actions
- Primary buttons (`variant="default"`) on the right
- One primary action per context maximum
- Use for: Create, Save, Submit, Confirm

### Secondary Actions
- Secondary buttons (`variant="outline"` or `variant="ghost"`) to the left of primary
- Use for: Cancel, Back, Reset

### Destructive Actions
- Use `variant="destructive"` sparingly
- Always require confirmation via ConfirmDialog
- Place to the left of other actions or in a separate group

### Button Groups
```tsx
<div className="flex items-center gap-2">
  <Button variant="outline">Cancel</Button>
  <Button>Save Changes</Button>
</div>
```

## Form Patterns

### Field Layout
- Labels above inputs
- Required fields marked with asterisk
- Help text below field in muted color
- Error messages in destructive color below field

```tsx
<FormField
  label="Project Name"
  required
  error={errors.name?.message}
  helperText="Choose a descriptive name"
>
  <Input {...field} />
</FormField>
```

### Form Actions
- Submit button primary, aligned right
- Cancel/Reset secondary, to the left
- Show loading state during submission
- Disable form during submission

## Table Patterns

### Table Layout
- Use `<Table>` component from shadcn/ui
- Sticky header for long tables
- Row hover state for clickable rows
- Actions column on the right (icon buttons)

### Table Features
- DataToolbar above table for search/filter/sort
- Empty state when no data matches filters
- Loading skeletons during data fetch
- Pagination at bottom when needed

## Empty State Patterns

Use `<EmptyState>` component when:
- List has no items
- Search/filter returns no results
- User hasn't created content yet

```tsx
<EmptyState
  icon={<FolderKanban className="h-12 w-12" />}
  title="No projects yet"
  description="Create your first project to get started"
  action={<Button>Create Project</Button>}
/>
```

## Loading State Patterns

Use `<LoadingState>` for:
- Initial page load
- Data fetching
- Long-running operations

```tsx
<LoadingState 
  type="table" 
  rows={5} 
/>
```

## Error State Patterns

Use `<ErrorState>` when:
- API request fails
- Resource not found
- Permission denied

```tsx
<ErrorState
  error={error}
  onRetry={() => refetch()}
/>
```

## Toast Usage

### Success
- Brief confirmation of action
- Auto-dismiss after 3 seconds
- No action required

### Error
- Describe what went wrong
- Include requestId for debugging (admin only)
- Persist until dismissed

### Warning
- User can continue but should be aware
- Auto-dismiss after 5 seconds

## Data Toolbar Pattern

Standard toolbar above data lists:
```tsx
<DataToolbar
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="Search projects..."
  filters={[
    { key: "status", label: "Status", options: [...] },
    { key: "client", label: "Client", options: [...] },
  ]}
  filterValues={filters}
  onFilterChange={setFilters}
  sortOptions={[
    { value: "name", label: "Name" },
    { value: "updated", label: "Last Updated" },
  ]}
  sortValue={sort}
  onSortChange={setSort}
/>
```

## Confirmation Dialogs

Use `<ConfirmDialog>` for destructive actions:
```tsx
<ConfirmDialog
  open={deleteDialogOpen}
  onOpenChange={setDeleteDialogOpen}
  title="Delete Project"
  description="This action cannot be undone. All tasks and time entries will be permanently deleted."
  confirmLabel="Delete"
  cancelLabel="Cancel"
  variant="destructive"
  onConfirm={handleDelete}
/>
```

## Component Import Standards

Import reusable layout components from:
```tsx
import { 
  PageShell, 
  PageHeader, 
  EmptyState, 
  LoadingState, 
  ErrorState,
  DataToolbar,
  ConfirmDialog,
} from "@/components/layout";
```
