import { createApiRouter } from "../routerFactory";
import { z } from "zod";
import { storage } from "../../storage";
import { AppError, handleRouteError, sendError, validateBody } from "../../lib/errors";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId, getCurrentWorkspaceId, isSuperUser } from "../../routes/helpers";
import { extractMentionsFromTipTapJson, getPlainTextFromTipTapJson } from "../../utils/mentionUtils";
import {
  insertSubtaskSchema,
  insertCommentSchema,
  updateSubtaskSchema,
  addAssigneeSchema,
} from "@shared/schema";
import { hasTenantAdminAccess } from "@shared/roles";
import { getTaskStatusLabel, isTaskReviewStatus, normalizeTaskStatus } from "@shared/taskStatus";
import { logEntityActivity, logSubtaskCreated, logSubtaskFieldChanges } from "../../lib/taskActivity";
import {
  embedAttachmentIdsInBody,
  enrichCommentsWithAttachments as enrichComments,
  toAttachmentMeta,
} from "../../utils/commentAttachments";
import {
  emitSubtaskCreated,
  emitSubtaskUpdated,
  emitSubtaskDeleted,
} from "../../realtime/events";
import {
  notifyCommentAdded,
  notifyCommentMention,
  notifyTaskReviewApproved,
  notifyTaskReviewRequested,
  notifyTaskStatusChanged,
} from "../../features/notifications/notification.service";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

function isAssignedToSubtask(assignees: Array<{ userId?: string; id?: string }>, userId: string): boolean {
  return assignees.some((assignee: any) => assignee.userId === userId || assignee.user?.id === userId);
}

router.get("/tasks/:taskId/subtasks", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const task = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.taskId) 
        : null;
    
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    const subtasks = await storage.getSubtasksByTask(req.params.taskId);
    res.json(subtasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/:taskId/subtasks", req);
  }
});

router.post("/tasks/:taskId/subtasks", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const actorUserId = getCurrentUserId(req);
    const data = insertSubtaskSchema.parse({
      ...req.body,
      taskId: req.params.taskId,
    });

    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.taskId) 
        : null;

    const subtask = await storage.createSubtask(data);

    await logSubtaskCreated(
      storage,
      actorUserId,
      parentTask?.projectId ? (await storage.getProject(parentTask.projectId))?.workspaceId || getCurrentWorkspaceId(req) : getCurrentWorkspaceId(req),
      subtask,
    ).catch(() => {});

    if (parentTask && parentTask.projectId) {
      emitSubtaskCreated(
        subtask as any,
        req.params.taskId,
        parentTask.projectId,
      );
    }

    res.status(201).json(subtask);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/tasks/:taskId/subtasks", req);
  }
});

router.patch("/subtasks/:id", async (req, res) => {
  try {
    const data = validateBody(req.body, updateSubtaskSchema, res);
    if (!data) return;
    
    const tenantId = getEffectiveTenantId(req);
    const actorUserId = getCurrentUserId(req);
    const currentUser = await storage.getUser(actorUserId);
    
    const existingSubtask = await storage.getSubtask(req.params.id);
    if (!existingSubtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    
    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(existingSubtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(existingSubtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    const updateData: any = { ...data };
    if (updateData.dueDate !== undefined && typeof updateData.dueDate === 'string') {
      updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    }
    if (updateData.status !== undefined) {
      const normalizedStatus = normalizeTaskStatus(updateData.status);
      if (!normalizedStatus) {
        return sendError(res, AppError.badRequest("Invalid subtask status"), req);
      }
      updateData.status = normalizedStatus;
    }

    const subtaskAssignees = await storage.getSubtaskAssignees(existingSubtask.id);
    const wasInReview = isTaskReviewStatus(existingSubtask.status);
    const isAssigned = isAssignedToSubtask(subtaskAssignees as any, actorUserId);
    const canApprove = hasTenantAdminAccess(currentUser?.role);

    if (updateData.status === "in_review" && !wasInReview && !isAssigned && !canApprove) {
      return sendError(res, AppError.forbidden("Only assignees can send a subtask to review"), req);
    }
    if (wasInReview && updateData.status && updateData.status !== "in_review" && !canApprove) {
      return sendError(res, AppError.forbidden("Only project managers and admins can approve a reviewed subtask"), req);
    }
    
    const subtask = await storage.updateSubtask(req.params.id, updateData);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }

    const project = parentTask.projectId ? await storage.getProject(parentTask.projectId) : null;
    const workspaceId = project?.workspaceId || getCurrentWorkspaceId(req);
    await logSubtaskFieldChanges(
      storage,
      actorUserId,
      workspaceId,
      existingSubtask as any,
      subtask as any,
      parentTask.projectId || null,
    ).catch(() => {});

    const normalizedBeforeStatus = normalizeTaskStatus(existingSubtask.status) || existingSubtask.status;
    const normalizedAfterStatus = normalizeTaskStatus(subtask.status) || subtask.status;
    const currentUserName = currentUser?.name || currentUser?.email || "Someone";
    const notificationContext = { tenantId, excludeUserId: actorUserId };
    const reviewApprovers = tenantId
      ? (await storage.getUsersByTenant(tenantId)).filter((candidate) => candidate.id !== actorUserId && hasTenantAdminAccess(candidate.role))
      : [];

    if (!wasInReview && normalizedAfterStatus === "in_review") {
      for (const approver of reviewApprovers) {
        if (approver.id !== actorUserId) {
          notifyTaskReviewRequested(
            approver.id,
            parentTask.id,
            subtask.title,
            currentUserName,
            notificationContext
          ).catch(() => {});
        }
      }

      await logEntityActivity({
        storage,
        workspaceId,
        actorUserId,
        entityType: "subtask",
        entityId: subtask.id,
        entityTitle: subtask.title,
        action: "review_requested",
        metadata: {
          taskId: subtask.taskId,
          projectId: parentTask.projectId,
        },
      }).catch(() => {});
    } else if (wasInReview && normalizedBeforeStatus !== normalizedAfterStatus) {
      for (const assignee of subtaskAssignees as any[]) {
        if (assignee.userId !== actorUserId) {
          notifyTaskReviewApproved(
            assignee.userId,
            parentTask.id,
            subtask.title,
            currentUserName,
            notificationContext
          ).catch(() => {});
        }
      }

      await logEntityActivity({
        storage,
        workspaceId,
        actorUserId,
        entityType: "subtask",
        entityId: subtask.id,
        entityTitle: subtask.title,
        action: "review_approved",
        metadata: {
          taskId: subtask.taskId,
          projectId: parentTask.projectId,
          returnedStatus: normalizedAfterStatus,
        },
      }).catch(() => {});
    } else if (updateData.status && normalizedBeforeStatus !== normalizedAfterStatus) {
      for (const assignee of subtaskAssignees as any[]) {
        if (assignee.userId !== actorUserId) {
          notifyTaskStatusChanged(
            assignee.userId,
            parentTask.id,
            subtask.title,
            getTaskStatusLabel(normalizedAfterStatus),
            currentUserName,
            notificationContext
          ).catch(() => {});
        }
      }
    }

    if (parentTask && parentTask.projectId) {
      emitSubtaskUpdated(
        subtask.id,
        subtask.taskId,
        parentTask.projectId,
        data,
      );
    }

    res.json(subtask);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/subtasks/:id", req);
  }
});

router.delete("/subtasks/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const subtask = await storage.getSubtask(req.params.id);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }

    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(subtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(subtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    await storage.deleteSubtask(req.params.id);

    if (parentTask && parentTask.projectId) {
      emitSubtaskDeleted(subtask.id, subtask.taskId, parentTask.projectId);
    }

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/subtasks/:id", req);
  }
});

router.post("/subtasks/:id/move", async (req, res) => {
  try {
    const { targetIndex } = req.body;
    await storage.moveSubtask(req.params.id, targetIndex);
    const subtask = await storage.getSubtask(req.params.id);
    res.json(subtask);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/subtasks/:id/move", req);
  }
});

router.get("/subtasks/:id/full", async (req, res) => {
  try {
    const subtask = await storage.getSubtaskWithRelations(req.params.id);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    res.json(subtask);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:id/full", req);
  }
});

router.get("/subtasks/:id/assignees", async (req, res) => {
  try {
    const assignees = await storage.getSubtaskAssignees(req.params.id);
    res.json(assignees);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:id/assignees", req);
  }
});

router.post("/subtasks/:id/assignees", async (req, res) => {
  try {
    const { userId, tenantId } = req.body;
    if (!userId) {
      return sendError(res, AppError.badRequest("userId is required"), req);
    }
    const assignee = await storage.addSubtaskAssignee({
      subtaskId: req.params.id,
      userId,
      tenantId: tenantId || null,
    });
    const subtask = await storage.getSubtask(req.params.id);
    const parentTask = subtask ? await storage.getTask(subtask.taskId) : null;
    const project = parentTask?.projectId ? await storage.getProject(parentTask.projectId) : null;
    if (subtask) {
      await logEntityActivity({
        storage,
        workspaceId: project?.workspaceId || getCurrentWorkspaceId(req),
        actorUserId: getCurrentUserId(req),
        entityType: "subtask",
        entityId: subtask.id,
        entityTitle: subtask.title,
        action: "assigned",
        metadata: {
          taskId: subtask.taskId,
          projectId: parentTask?.projectId || null,
          userId,
        },
      }).catch(() => {});
    }
    res.status(201).json(assignee);
  } catch (error: any) {
    if (error?.code === '23505') {
      throw AppError.conflict("User already assigned to subtask");
    }
    return handleRouteError(res, error, "POST /api/subtasks/:subtaskId/assignees", req);
  }
});

router.delete("/subtasks/:subtaskId/assignees/:userId", async (req, res) => {
  try {
    const subtask = await storage.getSubtask(req.params.subtaskId);
    const parentTask = subtask ? await storage.getTask(subtask.taskId) : null;
    const project = parentTask?.projectId ? await storage.getProject(parentTask.projectId) : null;
    await storage.removeSubtaskAssignee(req.params.subtaskId, req.params.userId);
    if (subtask) {
      await logEntityActivity({
        storage,
        workspaceId: project?.workspaceId || getCurrentWorkspaceId(req),
        actorUserId: getCurrentUserId(req),
        entityType: "subtask",
        entityId: subtask.id,
        entityTitle: subtask.title,
        action: "unassigned",
        metadata: {
          taskId: subtask.taskId,
          projectId: parentTask?.projectId || null,
          userId: req.params.userId,
        },
      }).catch(() => {});
    }
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/subtasks/:subtaskId/assignees/:userId", req);
  }
});

router.get("/subtasks/:id/tags", async (req, res) => {
  try {
    const tags = await storage.getSubtaskTags(req.params.id);
    res.json(tags);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:id/tags", req);
  }
});

router.post("/subtasks/:id/tags", async (req, res) => {
  try {
    const { tagId } = req.body;
    if (!tagId) {
      return sendError(res, AppError.badRequest("tagId is required"), req);
    }
    const subtaskTag = await storage.addSubtaskTag({
      subtaskId: req.params.id,
      tagId,
    });
    const subtask = await storage.getSubtask(req.params.id);
    const parentTask = subtask ? await storage.getTask(subtask.taskId) : null;
    const project = parentTask?.projectId ? await storage.getProject(parentTask.projectId) : null;
    if (subtask) {
      await logEntityActivity({
        storage,
        workspaceId: project?.workspaceId || getCurrentWorkspaceId(req),
        actorUserId: getCurrentUserId(req),
        entityType: "subtask",
        entityId: subtask.id,
        entityTitle: subtask.title,
        action: "updated",
        metadata: {
          field: "tags",
          to: tagId,
          taskId: subtask.taskId,
          projectId: parentTask?.projectId || null,
        },
      }).catch(() => {});
    }
    res.status(201).json(subtaskTag);
  } catch (error: any) {
    if (error?.code === '23505') {
      return sendError(res, AppError.conflict("Tag already added to subtask"), req);
    }
    return handleRouteError(res, error, "POST /api/subtasks/:id/tags", req);
  }
});

router.delete("/subtasks/:subtaskId/tags/:tagId", async (req, res) => {
  try {
    const subtask = await storage.getSubtask(req.params.subtaskId);
    const parentTask = subtask ? await storage.getTask(subtask.taskId) : null;
    const project = parentTask?.projectId ? await storage.getProject(parentTask.projectId) : null;
    await storage.removeSubtaskTag(req.params.subtaskId, req.params.tagId);
    if (subtask) {
      await logEntityActivity({
        storage,
        workspaceId: project?.workspaceId || getCurrentWorkspaceId(req),
        actorUserId: getCurrentUserId(req),
        entityType: "subtask",
        entityId: subtask.id,
        entityTitle: subtask.title,
        action: "updated",
        metadata: {
          field: "tags",
          from: req.params.tagId,
          taskId: subtask.taskId,
          projectId: parentTask?.projectId || null,
        },
      }).catch(() => {});
    }
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/subtasks/:subtaskId/tags/:tagId", req);
  }
});

router.get("/subtasks/:subtaskId/comments", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const subtask = await storage.getSubtask(req.params.subtaskId);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    
    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(subtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(subtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    const comments = await storage.getCommentsBySubtask(req.params.subtaskId);
    const enriched = await enrichComments(comments, storage);
    res.json(enriched);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:subtaskId/comments", req);
  }
});

router.post("/subtasks/:subtaskId/comments", async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    const subtask = await storage.getSubtask(req.params.subtaskId);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    
    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(subtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(subtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    const rawAttachmentIds: string[] = Array.isArray(req.body.attachmentIds)
      ? req.body.attachmentIds.filter((id: unknown) => typeof id === "string" && id.length > 0)
      : [];
    let commentBody = req.body.body || "";
    if (rawAttachmentIds.length > 0) {
      commentBody = embedAttachmentIdsInBody(commentBody, rawAttachmentIds);
    }
    
    const data = insertCommentSchema.parse({
      ...req.body,
      body: commentBody,
      subtaskId: req.params.subtaskId,
      userId: currentUserId,
    });
    const comment = await storage.createComment(data);
    const commenter = await storage.getUser(currentUserId);
    const project = parentTask.projectId ? await storage.getProject(parentTask.projectId) : null;
    await logEntityActivity({
      storage,
      workspaceId: project?.workspaceId || getCurrentWorkspaceId(req),
      actorUserId: currentUserId,
      entityType: "subtask",
      entityId: subtask.id,
      entityTitle: subtask.title,
      action: "comment_added",
      metadata: {
        taskId: subtask.taskId,
        projectId: parentTask.projectId || null,
        commentId: comment.id,
      },
    }).catch(() => {});

    const requestId = (req as any).requestId || "unknown";
    const mentionedUserIds = extractMentionsFromTipTapJson(data.body);
    const plainTextBody = getPlainTextFromTipTapJson(data.body);
    const notifiedUserIds = new Set<string>();

    console.log(`[mentions] requestId=${requestId} subtaskComment commentId=${comment.id} authorId=${currentUserId} tenantId=${tenantId} mentionCount=${mentionedUserIds.length}`);

    for (const mentionedUserId of mentionedUserIds) {
      if (mentionedUserId === currentUserId) continue;
      const mentionedUser = await storage.getUser(mentionedUserId);
      if (!mentionedUser || (tenantId && mentionedUser.tenantId !== tenantId)) {
        continue;
      }

      await storage.createCommentMention({
        commentId: comment.id,
        mentionedUserId: mentionedUserId,
      });
      notifiedUserIds.add(mentionedUserId);

      notifyCommentMention(
        mentionedUserId,
        subtask.taskId,
        subtask.title || "a subtask",
        commenter?.name || commenter?.email || "Someone",
        plainTextBody,
        { tenantId, excludeUserId: currentUserId }
      ).catch((err) => {
        console.error(`[mentions] requestId=${requestId} notification failed userId=${mentionedUserId}`, err);
      });

      if (mentionedUser.email && tenantId) {
        try {
          const { emailOutboxService } = await import("../../services/emailOutbox");
          const { emailTemplateService } = await import("../../services/emailTemplates");
          
          const templateVars: Record<string, string> = {
            userName: mentionedUser.name || mentionedUser.email,
            mentionedByName: commenter?.name || commenter?.email || "Someone",
            itemTitle: subtask.title || "a subtask",
            commentText: plainTextBody,
            appName: "MyWorkDay",
          };
          
          const rendered = await emailTemplateService.renderByKey(tenantId, "mention_notification", templateVars);
          
          await emailOutboxService.sendEmail({
            tenantId,
            messageType: "mention_notification",
            toEmail: mentionedUser.email,
            subject: rendered?.subject || `${commenter?.name || 'Someone'} mentioned you in a comment`,
            textBody: rendered?.textBody || `${commenter?.name || 'Someone'} mentioned you in a comment on subtask "${subtask.title || 'a subtask'}":\n\n"${plainTextBody}"`,
            htmlBody: rendered?.htmlBody,
            metadata: {
              subtaskId: subtask.id,
              subtaskTitle: subtask.title,
              commentId: comment.id,
              mentionedByUserId: currentUserId,
              mentionedByName: commenter?.name,
            },
          });
        } catch (emailError) {
          console.error(`[mentions] requestId=${requestId} email failed userId=${mentionedUserId}`, emailError);
        }
      }
    }

    const subtaskWithRelations = await storage.getSubtaskWithRelations(req.params.subtaskId);
    const assignees = (subtaskWithRelations as any)?.assignees || [];
    for (const assignee of assignees) {
      const assigneeUserId = assignee.userId;
      if (assigneeUserId !== currentUserId && !notifiedUserIds.has(assigneeUserId)) {
        notifyCommentAdded(
          assigneeUserId,
          subtask.taskId,
          subtask.title || "a subtask",
          commenter?.name || commenter?.email || "Someone",
          plainTextBody,
          { tenantId, excludeUserId: currentUserId }
        ).catch(() => {});
      }
    }

    let attachments: ReturnType<typeof toAttachmentMeta>[] = [];
    if (rawAttachmentIds.length > 0) {
      const taskAttachments = await storage.getTaskAttachmentsByIds(rawAttachmentIds);
      attachments = taskAttachments.map(toAttachmentMeta);
    }

    const commentWithUser = {
      ...comment,
      user: commenter ? {
        id: commenter.id,
        name: commenter.name,
        email: commenter.email,
        avatarUrl: commenter.avatarUrl,
      } : undefined,
      attachments,
    };

    res.status(201).json(commentWithUser);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/subtasks/:subtaskId/comments", req);
  }
});

export default router;
