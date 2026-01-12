# Real-time System (Socket.IO)

This directory contains the Socket.IO server implementation for real-time updates.

## Architecture

```
/server/realtime/
├── socket.ts    # Socket.IO server initialization and room management
├── events.ts    # Centralized event emitters (ALL emissions go through here)
└── README.md    # This file
```

## Key Principles

### 1. Centralized Event Emission

**ALL socket event emissions MUST go through `events.ts`.**

Never emit events directly from route handlers. This ensures:
- Consistent event naming and payloads
- Single point of control for real-time updates
- Easy debugging and logging
- Type safety with shared event contracts

### 2. Room Strategy

Clients join project rooms to receive updates relevant to that project.

- Room name format: `project:{projectId}`
- Clients join using the `room:join:project` event
- All entity updates are broadcast to the relevant project room

### 3. Event Timing

Events should ONLY be emitted after the database operation succeeds.

```typescript
// CORRECT: Emit after DB success
const task = await storage.createTask(data);
emitTaskCreated(projectId, task);

// INCORRECT: Emit before or without DB confirmation
emitTaskCreated(projectId, data);  // Don't do this!
await storage.createTask(data);    // Too late if this fails
```

## Socket Lifecycle

1. **Server Startup**: `initializeSocketIO(httpServer)` is called in `server/index.ts`
2. **Client Connection**: Client connects and receives a socket ID
3. **Room Join**: Client emits `room:join:project` with projectId to join a room
4. **Updates**: Server emits events to rooms when data changes
5. **Room Leave**: Client emits `room:leave:project` when navigating away
6. **Disconnect**: Client disconnects, automatically leaves all rooms

## Event Categories

### Project Events
- `project:created` - New project created
- `project:updated` - Project metadata updated
- `project:deleted` - Project deleted

### Section Events
- `section:created` - New section added
- `section:updated` - Section renamed or modified
- `section:deleted` - Section removed
- `section:reordered` - Sections reordered within project

### Task Events
- `task:created` - New task or child task created
- `task:updated` - Task data updated
- `task:deleted` - Task removed
- `task:moved` - Task moved between sections
- `task:reordered` - Tasks reordered within section

### Subtask Events (checklist items)
- `subtask:created` - New checklist item added
- `subtask:updated` - Subtask toggled or renamed
- `subtask:deleted` - Subtask removed
- `subtask:reordered` - Subtasks reordered

### Attachment Events
- `attachment:added` - File attached to task/subtask
- `attachment:deleted` - File removed from task/subtask

## Usage in Route Handlers

```typescript
import { emitTaskCreated, emitTaskUpdated } from './realtime/events';

// In your route handler:
app.post('/api/tasks', async (req, res) => {
  try {
    // 1. Perform DB operation
    const task = await storage.createTask(data);
    
    // 2. Emit event AFTER success
    emitTaskCreated(task.projectId, task);
    
    // 3. Return response
    res.status(201).json(task);
  } catch (error) {
    // Event is never emitted if DB fails
    res.status(500).json({ error: 'Failed to create task' });
  }
});
```

## Debugging

All event emissions are logged with the 'events' source:

```
10:30:45 AM [events] Emitted task:created for task abc123 in project xyz789
```

Socket connections/disconnections are logged with 'socket.io' source:

```
10:30:40 AM [socket.io] Client connected: socket-id-here
10:30:41 AM [socket.io] Client socket-id-here joined room: project:xyz789
```
