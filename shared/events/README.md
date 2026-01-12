# Shared Events

This directory contains the Socket.IO event contracts shared between the server and client.

## Purpose

The event contracts define:
- Event names (constants)
- Event payload types (TypeScript interfaces)
- Type-safe event maps for Socket.IO

## Event Naming Convention

Events follow the pattern: `{entity}:{action}`

### Entities
- `project` - Project CRUD operations
- `section` - Section/column operations
- `task` - Task operations (including child tasks)
- `subtask` - Checklist subtask operations
- `attachment` - File attachment operations
- `room` - Room join/leave operations

### Actions
- `created` - New entity created
- `updated` - Entity modified
- `deleted` - Entity removed
- `moved` - Entity moved to different parent/section
- `reordered` - Entity position changed
- `added` - For attachments
- `join` / `leave` - For room management

## Room Strategy

Clients join project rooms using: `project:{projectId}`

When a client joins a project room, they receive all real-time updates for:
- The project itself
- All sections in the project
- All tasks in the project
- All subtasks for tasks in the project
- All attachments for tasks/subtasks in the project

## Usage

### Server-side (event emission)
```typescript
import { TASK_EVENTS, TaskCreatedPayload } from '@shared/events';

// Events are emitted through the centralized events.ts module
emitTaskCreated(projectId, task);
```

### Client-side (event subscription)
```typescript
import { TASK_EVENTS } from '@shared/events';
import { useSocketEvent } from '@/lib/socket';

// Subscribe to task created events
useSocketEvent(TASK_EVENTS.CREATED, (payload) => {
  // Handle the event
});
```

## Important Rules

1. **Emit after DB commit**: Events should only be emitted after the database operation succeeds.
2. **Sufficient payloads**: Payloads should contain enough data to update the UI without requiring a refetch.
3. **Room targeting**: Events are emitted to project rooms, so clients only receive relevant updates.
4. **Type safety**: Both server and client use the same type definitions for compile-time safety.
