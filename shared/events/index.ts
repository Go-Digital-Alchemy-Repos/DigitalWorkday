/**
 * Shared Socket.IO Event Contracts
 * 
 * This file defines all real-time event names and their payload types.
 * Both server and client import from this file to ensure type safety.
 * 
 * Event naming convention: {entity}:{action}
 * - entity: project, section, task, subtask, attachment
 * - action: created, updated, deleted, moved, reordered
 */

// =============================================================================
// PROJECT EVENTS
// =============================================================================

export const PROJECT_EVENTS = {
  CREATED: 'project:created',
  UPDATED: 'project:updated',
  DELETED: 'project:deleted',
} as const;

export interface ProjectCreatedPayload {
  project: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string | null;
    workspaceId: string;
    teamId: string | null;
    isArchived: boolean;
    createdAt: Date;
  };
}

export interface ProjectUpdatedPayload {
  projectId: string;
  updates: Partial<ProjectCreatedPayload['project']>;
}

export interface ProjectDeletedPayload {
  projectId: string;
}

// =============================================================================
// SECTION EVENTS
// =============================================================================

export const SECTION_EVENTS = {
  CREATED: 'section:created',
  UPDATED: 'section:updated',
  DELETED: 'section:deleted',
  REORDERED: 'section:reordered',
} as const;

export interface SectionCreatedPayload {
  section: {
    id: string;
    name: string;
    projectId: string;
    position: number;
    createdAt: Date;
  };
}

export interface SectionUpdatedPayload {
  sectionId: string;
  projectId: string;
  updates: Partial<SectionCreatedPayload['section']>;
}

export interface SectionDeletedPayload {
  sectionId: string;
  projectId: string;
}

export interface SectionReorderedPayload {
  projectId: string;
  sections: Array<{ id: string; position: number }>;
}

// =============================================================================
// TASK EVENTS
// =============================================================================

export const TASK_EVENTS = {
  CREATED: 'task:created',
  UPDATED: 'task:updated',
  DELETED: 'task:deleted',
  MOVED: 'task:moved',
  REORDERED: 'task:reordered',
} as const;

export interface TaskPayload {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  startDate: Date | null;
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  position: number;
  createdAt: Date;
  assignees?: Array<{ id: string; name: string; email: string; avatarUrl: string | null }>;
  tags?: Array<{ id: string; name: string; color: string }>;
}

export interface TaskCreatedPayload {
  task: TaskPayload;
  projectId: string;
}

export interface TaskUpdatedPayload {
  taskId: string;
  projectId: string;
  parentTaskId: string | null;
  updates: Partial<TaskPayload>;
}

export interface TaskDeletedPayload {
  taskId: string;
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
}

export interface TaskMovedPayload {
  taskId: string;
  projectId: string;
  fromSectionId: string | null;
  toSectionId: string | null;
  newPosition: number;
}

export interface TaskReorderedPayload {
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  tasks: Array<{ id: string; position: number }>;
}

// =============================================================================
// SUBTASK EVENTS (checklist items, not child tasks)
// =============================================================================

export const SUBTASK_EVENTS = {
  CREATED: 'subtask:created',
  UPDATED: 'subtask:updated',
  DELETED: 'subtask:deleted',
  REORDERED: 'subtask:reordered',
} as const;

export interface SubtaskPayload {
  id: string;
  title: string;
  isCompleted: boolean;
  taskId: string;
  position: number;
  createdAt: Date;
}

export interface SubtaskCreatedPayload {
  subtask: SubtaskPayload;
  taskId: string;
  projectId: string;
}

export interface SubtaskUpdatedPayload {
  subtaskId: string;
  taskId: string;
  projectId: string;
  updates: Partial<SubtaskPayload>;
}

export interface SubtaskDeletedPayload {
  subtaskId: string;
  taskId: string;
  projectId: string;
}

export interface SubtaskReorderedPayload {
  taskId: string;
  projectId: string;
  subtasks: Array<{ id: string; position: number }>;
}

// =============================================================================
// ATTACHMENT EVENTS
// =============================================================================

export const ATTACHMENT_EVENTS = {
  ADDED: 'attachment:added',
  DELETED: 'attachment:deleted',
} as const;

export interface AttachmentPayload {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageKey: string;
  taskId: string | null;
  subtaskId: string | null;
  uploadedBy: string;
  createdAt: Date;
}

export interface AttachmentAddedPayload {
  attachment: AttachmentPayload;
  taskId: string | null;
  subtaskId: string | null;
  projectId: string;
}

export interface AttachmentDeletedPayload {
  attachmentId: string;
  taskId: string | null;
  subtaskId: string | null;
  projectId: string;
}

// =============================================================================
// ROOM EVENTS (for joining/leaving project rooms)
// =============================================================================

export const ROOM_EVENTS = {
  JOIN_PROJECT: 'room:join:project',
  LEAVE_PROJECT: 'room:leave:project',
} as const;

export interface JoinProjectPayload {
  projectId: string;
}

export interface LeaveProjectPayload {
  projectId: string;
}

// =============================================================================
// ALL EVENTS TYPE (for type-safe event handling)
// =============================================================================

export type ServerToClientEvents = {
  [PROJECT_EVENTS.CREATED]: (payload: ProjectCreatedPayload) => void;
  [PROJECT_EVENTS.UPDATED]: (payload: ProjectUpdatedPayload) => void;
  [PROJECT_EVENTS.DELETED]: (payload: ProjectDeletedPayload) => void;
  [SECTION_EVENTS.CREATED]: (payload: SectionCreatedPayload) => void;
  [SECTION_EVENTS.UPDATED]: (payload: SectionUpdatedPayload) => void;
  [SECTION_EVENTS.DELETED]: (payload: SectionDeletedPayload) => void;
  [SECTION_EVENTS.REORDERED]: (payload: SectionReorderedPayload) => void;
  [TASK_EVENTS.CREATED]: (payload: TaskCreatedPayload) => void;
  [TASK_EVENTS.UPDATED]: (payload: TaskUpdatedPayload) => void;
  [TASK_EVENTS.DELETED]: (payload: TaskDeletedPayload) => void;
  [TASK_EVENTS.MOVED]: (payload: TaskMovedPayload) => void;
  [TASK_EVENTS.REORDERED]: (payload: TaskReorderedPayload) => void;
  [SUBTASK_EVENTS.CREATED]: (payload: SubtaskCreatedPayload) => void;
  [SUBTASK_EVENTS.UPDATED]: (payload: SubtaskUpdatedPayload) => void;
  [SUBTASK_EVENTS.DELETED]: (payload: SubtaskDeletedPayload) => void;
  [SUBTASK_EVENTS.REORDERED]: (payload: SubtaskReorderedPayload) => void;
  [ATTACHMENT_EVENTS.ADDED]: (payload: AttachmentAddedPayload) => void;
  [ATTACHMENT_EVENTS.DELETED]: (payload: AttachmentDeletedPayload) => void;
};

export type ClientToServerEvents = {
  [ROOM_EVENTS.JOIN_PROJECT]: (payload: JoinProjectPayload) => void;
  [ROOM_EVENTS.LEAVE_PROJECT]: (payload: LeaveProjectPayload) => void;
};
