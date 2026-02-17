import { eq } from 'drizzle-orm';
import {
  users,
  taskAssignees,
  taskWatchers,
  workspaceMembers,
  teamMembers,
  projectMembers,
  divisionMembers,
  hiddenProjects,
  personalTaskSections,
  subtaskAssignees,
  clientUserAccess,
  notifications,
  notificationPreferences,
  activeTimers,
  passwordResetTokens,
  timeEntries,
  userUiPreferences,
  chatMentions,
  chatReads,
  chatChannelMembers,
  chatDmMembers,
  chatMessages,
  chatExportJobs,
  chatChannels,
  commentMentions,
  comments,
  activityLog,
  taskAttachments,
  clientNoteAttachments,
  clientNoteVersions,
  clientNotes,
  clientDocuments,
  clientFiles,
  clientMessages,
  clientConversations,
  clientCrm,
  approvalRequests,
  tenantAgreementAcceptances,
  tasks,
  subtasks,
  projects,
  sections,
  invitations,
  appSettings,
  workspaces,
  tenantAgreements,
  errorLogs,
  platformAuditEvents,
  platformInvitations,
  projectTemplates,
} from '@shared/schema';

type TxOrDb = {
  delete: (table: any) => any;
  update: (table: any) => any;
};

export async function cleanupUserReferences(tx: TxOrDb, userId: string, actorId: string) {
  await tx.delete(taskAssignees).where(eq(taskAssignees.userId, userId));
  await tx.delete(taskWatchers).where(eq(taskWatchers.userId, userId));
  await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  await tx.delete(teamMembers).where(eq(teamMembers.userId, userId));
  await tx.delete(projectMembers).where(eq(projectMembers.userId, userId));
  await tx.delete(divisionMembers).where(eq(divisionMembers.userId, userId));
  await tx.delete(hiddenProjects).where(eq(hiddenProjects.userId, userId));
  await tx.delete(personalTaskSections).where(eq(personalTaskSections.userId, userId));
  await tx.delete(subtaskAssignees).where(eq(subtaskAssignees.userId, userId));
  await tx.delete(clientUserAccess).where(eq(clientUserAccess.userId, userId));

  await tx.delete(notifications).where(eq(notifications.userId, userId));
  await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  await tx.delete(activeTimers).where(eq(activeTimers.userId, userId));
  await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await tx.delete(timeEntries).where(eq(timeEntries.userId, userId));
  await tx.delete(userUiPreferences).where(eq(userUiPreferences.userId, userId));

  await tx.delete(chatMentions).where(eq(chatMentions.mentionedUserId, userId));
  await tx.delete(chatReads).where(eq(chatReads.userId, userId));
  await tx.delete(chatChannelMembers).where(eq(chatChannelMembers.userId, userId));
  await tx.delete(chatDmMembers).where(eq(chatDmMembers.userId, userId));
  await tx.delete(chatMessages).where(eq(chatMessages.authorUserId, userId));
  await tx.delete(chatExportJobs).where(eq(chatExportJobs.requestedByUserId, userId));

  await tx.update(chatChannels).set({ createdBy: actorId }).where(eq(chatChannels.createdBy, userId));

  await tx.delete(commentMentions).where(eq(commentMentions.mentionedUserId, userId));
  await tx.delete(comments).where(eq(comments.userId, userId));

  await tx.delete(activityLog).where(eq(activityLog.actorUserId, userId));

  await tx.delete(taskAttachments).where(eq(taskAttachments.uploadedByUserId, userId));
  await tx.delete(clientNoteAttachments).where(eq(clientNoteAttachments.uploadedByUserId, userId));
  await tx.delete(clientNoteVersions).where(eq(clientNoteVersions.editorUserId, userId));
  await tx.delete(clientNotes).where(eq(clientNotes.authorUserId, userId));
  await tx.delete(clientDocuments).where(eq(clientDocuments.uploadedByUserId, userId));
  await tx.delete(clientFiles).where(eq(clientFiles.uploadedByUserId, userId));

  await tx.delete(clientMessages).where(eq(clientMessages.authorUserId, userId));
  await tx.delete(clientConversations).where(eq(clientConversations.createdByUserId, userId));

  await tx.update(clientCrm).set({ ownerUserId: null }).where(eq(clientCrm.ownerUserId, userId));

  await tx.delete(approvalRequests).where(eq(approvalRequests.requestedByUserId, userId));

  await tx.delete(tenantAgreementAcceptances).where(eq(tenantAgreementAcceptances.userId, userId));

  await tx.update(platformInvitations).set({ targetUserId: null }).where(eq(platformInvitations.targetUserId, userId));
  await tx.update(platformInvitations).set({ createdByUserId: actorId }).where(eq(platformInvitations.createdByUserId, userId));

  await tx.update(tasks).set({ assigneeId: null }).where(eq(tasks.assigneeId, userId));
  await tx.update(tasks).set({ createdBy: null }).where(eq(tasks.createdBy, userId));
  await tx.update(subtasks).set({ assigneeId: null }).where(eq(subtasks.assigneeId, userId));
  await tx.update(projects).set({ createdBy: null }).where(eq(projects.createdBy, userId));
  await tx.update(sections).set({ createdBy: null }).where(eq(sections.createdBy, userId));
  await tx.update(invitations).set({ createdByUserId: null }).where(eq(invitations.createdByUserId, userId));
  await tx.update(appSettings).set({ updatedByUserId: null }).where(eq(appSettings.updatedByUserId, userId));
  await tx.update(comments).set({ resolvedByUserId: null }).where(eq(comments.resolvedByUserId, userId));
  await tx.update(clientNotes).set({ lastEditedByUserId: null }).where(eq(clientNotes.lastEditedByUserId, userId));
  await tx.update(workspaces).set({ createdBy: null }).where(eq(workspaces.createdBy, userId));
  await tx.update(projectTemplates).set({ createdBy: null }).where(eq(projectTemplates.createdBy, userId));
  await tx.update(tenantAgreements).set({ createdByUserId: null }).where(eq(tenantAgreements.createdByUserId, userId));
  await tx.update(errorLogs).set({ userId: null }).where(eq(errorLogs.userId, userId));
  await tx.update(platformAuditEvents).set({ actorUserId: null }).where(eq(platformAuditEvents.actorUserId, userId));
  await tx.update(platformAuditEvents).set({ targetUserId: null }).where(eq(platformAuditEvents.targetUserId, userId));
  await tx.update(passwordResetTokens).set({ createdByUserId: null }).where(eq(passwordResetTokens.createdByUserId, userId));
}
