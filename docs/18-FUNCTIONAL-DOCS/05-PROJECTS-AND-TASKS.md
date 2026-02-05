# Projects & Tasks Model

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

The core work management system consisting of Projects (containers for work) and Tasks (individual work items). Projects can be assigned to Clients and Teams, while Tasks support subtasks, tags, comments, attachments, and time tracking.

---

## Who Uses It

| Role | Capabilities |
|------|--------------|
| **Super Admin** | Full access to all tenant projects/tasks |
| **Admin** | Create/edit/delete all projects and tasks |
| **Manager** | Create projects, manage tasks, assign work |
| **Member** | View assigned projects, create/edit tasks |
| **Viewer** | Read-only access to projects and tasks |

---

## Data Model

### Projects

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope |
| `name` | string | Project name |
| `description` | string | Project description |
| `status` | enum | `active`, `on_hold`, `completed`, `archived` |
| `clientId` | UUID | Associated client (optional) |
| `teamId` | UUID | Assigned team |
| `startDate` | date | Project start date |
| `dueDate` | date | Project due date |
| `budgetHours` | decimal | Estimated hours budget |
| `color` | string | Display color |
| `createdBy` | UUID | Creator user ID |

### Tasks

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope |
| `projectId` | UUID | Parent project |
| `parentTaskId` | UUID | Parent task (for subtasks) |
| `title` | string | Task title |
| `description` | string | Rich text description |
| `status` | enum | `todo`, `in_progress`, `review`, `done` |
| `priority` | enum | `low`, `medium`, `high`, `urgent` |
| `assignees` | UUID[] | Assigned user IDs |
| `dueDate` | date | Task due date |
| `estimatedHours` | decimal | Time estimate |
| `tags` | string[] | Tag labels |
| `order` | integer | Sort order within column |

### Task Relationships

```
Project
  └── Task (parent)
        ├── Task (subtask)
        ├── Comment
        ├── Attachment
        └── TimeEntry
```

---

## Key Flows

### 1. Create Project

```
User fills project form → POST /api/v1/projects
    ↓
Validate: name required, valid client/team
    ↓
Create project record
    ↓
Create activity log: PROJECT_CREATED
    ↓
Emit socket: project-created
```

### 2. Task Status Flow

```
todo → in_progress → review → done
  ↑                            │
  └────────────────────────────┘
       (can move back)
```

### 3. Subtask Creation

```
User creates subtask → POST /api/v1/tasks
    ↓
Set parentTaskId = parent task ID
    ↓
Parent task shows subtask count
Subtask inherits projectId from parent
```

### 4. Task Assignment

```
User assigns task → PATCH /api/v1/tasks/:id
    ↓
Update assignees array
    ↓
Create notification for each new assignee
    ↓
Activity log: TASK_ASSIGNED
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **Delete project with tasks** | Cascade delete tasks or block |
| **Complete task with incomplete subtasks** | Warning shown, can override |
| **Circular subtask reference** | Validation prevents |
| **Duplicate task titles** | Allowed within project |
| **Task without project** | Not allowed, projectId required |
| **Reassign completed task** | Allowed, status unchanged |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **Create Project** | Projects page | New project form |
| **Project Settings** | Project > Settings | Edit project details |
| **Archive Project** | Project > Settings | Soft archive |
| **Bulk Task Edit** | Board/List view | Multi-select and edit |
| **Task Templates** | Settings > Templates | Reusable task templates |
| **Status Customization** | Settings > Workflow | Custom status columns |
| **Priority Settings** | Settings > Workflow | Custom priority levels |

---

## Views

| View | Description |
|------|-------------|
| **Board View** | Kanban-style columns by status |
| **List View** | Table with sortable columns |
| **Calendar View** | Tasks plotted by due date |
| **My Tasks** | Personal task dashboard |
| **Projects Dashboard** | Overview of all projects |

---

## Related Documentation

- [Divisions](../DIVISIONS.md)
- [Workload Forecast](../workloadForecast/)
