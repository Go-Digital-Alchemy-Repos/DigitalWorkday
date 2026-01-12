/**
 * Real-time Module Exports
 * 
 * This file re-exports all real-time functionality for easy importing.
 */

export { initializeSocketIO, getIO, emitToProject } from './socket';

export {
  // Project events
  emitProjectCreated,
  emitProjectUpdated,
  emitProjectDeleted,
  // Section events
  emitSectionCreated,
  emitSectionUpdated,
  emitSectionDeleted,
  emitSectionReordered,
  // Task events
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskMoved,
  emitTaskReordered,
  // Subtask events
  emitSubtaskCreated,
  emitSubtaskUpdated,
  emitSubtaskDeleted,
  emitSubtaskReordered,
  // Attachment events
  emitAttachmentAdded,
  emitAttachmentDeleted,
} from './events';
