# Loading Patterns

## Overview

This document defines the standard loading patterns used across the application. Skeleton loading provides a better user experience than spinners by showing the shape of content before it loads.

## Core Principles

1. **Shape Preservation**: Skeletons match the layout of the loaded content
2. **Subtle Animation**: Gentle pulse animation indicates loading
3. **Immediate Feedback**: Show skeleton instantly, no delay
4. **Progressive Loading**: Content appears as it becomes available

---

## Installation

```tsx
import {
  LoadingSkeleton,
  ChatMessageSkeleton,
  DashboardSkeleton,
  TaskListSkeleton,
  ProjectListSkeleton,
  ClientListSkeleton,
  DrawerSkeleton,
  KanbanSkeleton,
} from "@/components/ui-system";
```

Or use the existing specialized skeletons:

```tsx
import {
  TaskDrawerSkeleton,
  ProjectDrawerSkeleton,
  ClientDrawerSkeleton,
  TaskListSkeleton,
  ProjectListSkeleton,
  ClientListSkeleton,
  CalendarSkeleton,
} from "@/components/skeletons";
```

---

## Skeleton Variants

### LoadingSkeleton Component

The unified `LoadingSkeleton` component supports multiple variants:

| Variant | Use Case | Example |
|---------|----------|---------|
| `card` | Card grid layouts | Dashboard cards, client cards |
| `list` | Vertical list items | Settings lists, user lists |
| `table` | Table with rows | Data tables, logs |
| `metric` | Metric/stat cards | Dashboard KPIs |
| `detail` / `drawer` | Detail panels | Side drawers, detail views |
| `chat` | Chat messages | Chat timeline, comments |
| `dashboard` | Full dashboard | Reports, analytics pages |
| `kanban` | Kanban board | Project boards |
| `task-row` | Task list items | Task list view |
| `project-row` | Project list items | Projects dashboard |
| `client-card` | Client cards | Clients page grid |

---

## Usage Examples

### Basic Card Grid

```tsx
function ProjectsPage() {
  const { data: projects, isLoading } = useQuery({ queryKey: ["/api/projects"] });

  if (isLoading) {
    return <LoadingSkeleton variant="card" count={6} />;
  }

  return <ProjectGrid projects={projects} />;
}
```

### Task List

```tsx
function TasksView() {
  const { data: tasks, isLoading } = useQuery({ queryKey: ["/api/tasks"] });

  if (isLoading) {
    return <TaskListSkeleton rows={10} />;
  }

  return <TaskList tasks={tasks} />;
}
```

### Projects Table

```tsx
function ProjectsDashboard() {
  const { data: projects, isLoading } = useQuery({ queryKey: ["/api/projects"] });

  if (isLoading) {
    return <ProjectListSkeleton rows={8} />;
  }

  return <ProjectsTable projects={projects} />;
}
```

### Clients Grid

```tsx
function ClientsPage() {
  const { data: clients, isLoading } = useQuery({ queryKey: ["/api/clients"] });

  if (isLoading) {
    return <ClientListSkeleton count={9} />;
  }

  return <ClientsGrid clients={clients} />;
}
```

### Chat Messages

```tsx
function ChatTimeline() {
  const { data: messages, isLoading } = useQuery({ queryKey: ["/api/messages"] });

  if (isLoading) {
    return <ChatMessageSkeleton count={8} />;
  }

  return <MessageList messages={messages} />;
}
```

### Reports Dashboard

```tsx
function ReportsDashboard() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["/api/reports"] });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return <ReportsView stats={stats} />;
}
```

### Drawer Content

```tsx
function TaskDetailDrawer({ taskId, open }) {
  const { data: task, isLoading } = useQuery({
    queryKey: ["/api/tasks", taskId],
    enabled: open && !!taskId,
  });

  return (
    <DetailDrawer open={open} title={task?.title || "Loading..."}>
      {isLoading ? <DrawerSkeleton /> : <TaskDetails task={task} />}
    </DetailDrawer>
  );
}
```

### Kanban Board

```tsx
function ProjectBoard() {
  const { data: columns, isLoading } = useQuery({ queryKey: ["/api/board"] });

  if (isLoading) {
    return <KanbanSkeleton columns={4} cardsPerColumn={3} />;
  }

  return <KanbanBoard columns={columns} />;
}
```

---

## Specialized Skeletons

For more specific use cases, use the pre-built skeletons in `@/components/skeletons`:

### TaskDrawerSkeleton
Full task drawer layout with form fields and subtask list.

```tsx
import { TaskDrawerSkeleton } from "@/components/skeletons";

{isLoading ? <TaskDrawerSkeleton /> : <TaskContent task={task} />}
```

### ProjectDrawerSkeleton
Project detail layout with tabs and team members.

```tsx
import { ProjectDrawerSkeleton } from "@/components/skeletons";
```

### ClientDrawerSkeleton
Client form layout with contact fields.

```tsx
import { ClientDrawerSkeleton } from "@/components/skeletons";
```

### CalendarSkeleton
Calendar grid with event placeholders.

```tsx
import { CalendarSkeleton } from "@/components/skeletons";
```

---

## Pattern: Loading with Data Query

Standard pattern for React Query integration:

```tsx
function DataView() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/data"],
  });

  if (isLoading) {
    return <LoadingSkeleton variant="list" count={5} />;
  }

  if (isError) {
    return <ErrorMessage error={error} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState title="No data found" />;
  }

  return <DataList items={data} />;
}
```

---

## Pattern: Inline Loading

For content that updates inline:

```tsx
function InlineContent() {
  const { data, isFetching } = useQuery({ queryKey: ["/api/data"] });

  return (
    <div className="relative">
      {isFetching && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <ContentView data={data} />
    </div>
  );
}
```

---

## Pattern: Progressive Loading

Load and display content progressively:

```tsx
function ProgressiveView() {
  const { data: header } = useQuery({ queryKey: ["/api/header"] });
  const { data: content, isLoading } = useQuery({ queryKey: ["/api/content"] });

  return (
    <div>
      {header ? <Header data={header} /> : <Skeleton className="h-12 w-48" />}
      {isLoading ? (
        <LoadingSkeleton variant="card" count={6} />
      ) : (
        <ContentGrid items={content} />
      )}
    </div>
  );
}
```

---

## When to Use Skeletons vs Spinners

### Use Skeletons
- Initial page loads
- Content lists and grids
- Drawer/panel content
- Dashboard sections
- Any content with predictable layout

### Use Spinners
- Button loading states
- Form submission
- Background operations
- Small inline updates
- Overlay loading states

---

## Application Coverage

| Page/Feature | Skeleton Component | Status |
|--------------|-------------------|--------|
| Tasks list | `TaskListSkeleton` | ✅ Available |
| Projects list | `ProjectListSkeleton` | ✅ Available |
| Clients list | `ClientListSkeleton` | ✅ Available |
| Reports dashboard | `DashboardSkeleton` | ✅ Available |
| Chat timeline | `ChatMessageSkeleton` | ✅ Available |
| Task drawer | `TaskDrawerSkeleton` | ✅ Available |
| Project drawer | `ProjectDrawerSkeleton` | ✅ Available |
| Client drawer | `ClientDrawerSkeleton` | ✅ Available |
| Calendar | `CalendarSkeleton` | ✅ Available |
| Kanban board | `KanbanSkeleton` | ✅ Available |

---

## Best Practices

### DO
- Match skeleton layout to actual content
- Use appropriate `count` for list lengths
- Show skeletons immediately (no artificial delay)
- Combine with error and empty states

### DON'T
- Use spinners for content that has a predictable shape
- Show skeleton longer than necessary
- Forget to handle error states
- Use different skeleton than the loaded content shape
