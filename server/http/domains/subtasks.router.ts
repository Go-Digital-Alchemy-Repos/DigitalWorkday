import { createApiRouter } from "../routerFactory";
import { z } from "zod";
import { storage } from "../../storage";
import { AppError, handleRouteError, sendError, validateBody } from "../../lib/errors";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId, isSuperUser } from "../../routes/helpers";
import { extractMentionsFromTipTapJson, getPlainTextFromTipTapJson } from "../../utils/mentionUtils";
import {
  insertSubtaskSchema,
  insertCommentSchema,
  updateSubtaskSchema,
  addAssigneeSchema,
} from "@shared/schema";
import {
  emitSubtaskCreated,
  emitSubtaskUpdated,
  emitSubtaskDeleted,
} from "../../realtime/events";
import {
  notifyCommentAdded,
  notifyCommentMention,
} from "../../features/notifications/notification.service";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

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
    
    const subtask = await storage.updateSubtask(req.params.id, updateData);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
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
    await storage.removeSubtaskAssignee(req.params.subtaskId, req.params.userId);
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
    await storage.removeSubtaskTag(req.params.subtaskId, req.params.tagId);
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
    res.json(comments);
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
    
    const data = insertCommentSchema.parse({
      ...req.body,
      subtaskId: req.params.subtaskId,
      userId: currentUserId,
    });
    const comment = await storage.createComment(data);
    const commenter = await storage.getUser(currentUserId);

    const mentionedUserIds = extractMentionsFromTipTapJson(data.body);
    const plainTextBody = getPlainTextFromTipTapJson(data.body);
    const notifiedUserIds = new Set<string>();

    for (const mentionedUserId of mentionedUserIds) {
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
      ).catch(() => {});

      if (mentionedUser.email && tenantId) {
        try {
          const { emailOutboxService } = await import("../../services/emailOutbox");
          await emailOutboxService.sendEmail({
            tenantId,
            messageType: "mention_notification",
            toEmail: mentionedUser.email,
            subject: `${commenter?.name || 'Someone'} mentioned you in a comment`,
            textBody: `${commenter?.name || 'Someone'} mentioned you in a comment on subtask "${subtask.title || 'a subtask'}":\n\n"${plainTextBody}"`,
            metadata: {
              subtaskId: subtask.id,
              subtaskTitle: subtask.title,
              commentId: comment.id,
              mentionedByUserId: currentUserId,
              mentionedByName: commenter?.name,
            },
          });
        } catch (emailError) {
          console.error("Error sending mention notification:", emailError);
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

    const commentWithUser = {
      ...comment,
      user: commenter ? {
        id: commenter.id,
        name: commenter.name,
        email: commenter.email,
        avatarUrl: commenter.avatarUrl,
      } : undefined,
    };

    res.status(201).json(commentWithUser);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/subtasks/:subtaskId/comments", req);
  }
});

export default router;
