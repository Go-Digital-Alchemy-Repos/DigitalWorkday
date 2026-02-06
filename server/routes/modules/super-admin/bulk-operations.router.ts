import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import * as schema from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordTenantAuditEvent } from '../../superAdmin';

export const bulkOperationsRouter = Router();

const bulkTasksImportSchema = z.object({
  rows: z.array(z.object({
    sectionName: z.string().min(1, "Section name is required"),
    taskTitle: z.string().min(1, "Task title is required"),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    dueDate: z.string().optional(),
    assigneeEmails: z.string().optional(),
    tags: z.string().optional(),
    parentTaskTitle: z.string().optional(),
    isSubtask: z.union([z.boolean(), z.string()]).optional(),
  })),
  options: z.object({
    createMissingSections: z.boolean().default(true),
    allowUnknownAssignees: z.boolean().default(false),
  }).optional(),
});

bulkOperationsRouter.post("/tenants/:tenantId/projects/:projectId/tasks/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;
    const user = req.user as Express.User;
    const data = bulkTasksImportSchema.parse(req.body);
    const options = data.options || { createMissingSections: true, allowUnknownAssignees: false };

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [project] = await db.select()
      .from(schema.projects)
      .where(and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.tenantId, tenantId)
      ));

    if (!project) {
      return res.status(404).json({ error: "Project not found or does not belong to tenant" });
    }

    const existingSections = await db.select()
      .from(schema.sections)
      .where(eq(schema.sections.projectId, projectId));
    const sectionsByName = new Map(existingSections.map(s => [s.name.toLowerCase(), s]));
    let sectionOrderIndex = existingSections.length;

    const tenantUsers = await db.select()
      .from(schema.users)
      .where(eq(schema.users.tenantId, tenantId));
    const usersByEmail = new Map(tenantUsers.map(u => [u.email.toLowerCase(), u]));

    const validStatuses = ["todo", "in_progress", "blocked", "completed"];
    const validPriorities = ["low", "medium", "high", "urgent"];

    const results: Array<{
      rowIndex: number;
      status: "created" | "skipped" | "error";
      reason?: string;
      sectionId?: string;
      taskId?: string;
      parentTaskId?: string;
    }> = [];

    let createdSections = 0;
    let createdTasks = 0;
    let createdSubtasks = 0;
    let skipped = 0;
    let errors = 0;

    const createdTasksByTitle = new Map<string, { id: string; sectionId: string }>();

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      
      const isSubtask = row.isSubtask === true || row.isSubtask === "true" || !!row.parentTaskTitle;
      if (isSubtask) continue;

      try {
        if (row.status && !validStatuses.includes(row.status.toLowerCase())) {
          results.push({ rowIndex: i, status: "error", reason: `Invalid status: ${row.status}` });
          errors++;
          continue;
        }
        if (row.priority && !validPriorities.includes(row.priority.toLowerCase())) {
          results.push({ rowIndex: i, status: "error", reason: `Invalid priority: ${row.priority}` });
          errors++;
          continue;
        }

        let section = sectionsByName.get(row.sectionName.toLowerCase());
        if (!section) {
          if (options.createMissingSections) {
            const [newSection] = await db.insert(schema.sections).values({
              projectId,
              name: row.sectionName,
              orderIndex: sectionOrderIndex++,
            }).returning();
            section = newSection;
            sectionsByName.set(row.sectionName.toLowerCase(), section);
            createdSections++;
          } else {
            results.push({ rowIndex: i, status: "error", reason: `Section not found: ${row.sectionName}` });
            errors++;
            continue;
          }
        }

        let assigneeIds: string[] = [];
        if (row.assigneeEmails) {
          const emails = row.assigneeEmails.split(",").map(e => e.trim().toLowerCase());
          for (const email of emails) {
            const foundUser = usersByEmail.get(email);
            if (!foundUser) {
              if (!options.allowUnknownAssignees) {
                results.push({ rowIndex: i, status: "error", reason: `Unknown assignee: ${email}` });
                errors++;
                continue;
              }
            } else {
              assigneeIds.push(foundUser.id);
            }
          }
          if (errors > results.filter(r => r.status === "error").length) continue;
        }

        let dueDate: Date | null = null;
        if (row.dueDate) {
          dueDate = new Date(row.dueDate);
          if (isNaN(dueDate.getTime())) {
            results.push({ rowIndex: i, status: "error", reason: `Invalid date format: ${row.dueDate}` });
            errors++;
            continue;
          }
        }

        const tasksInSection = await db.select()
          .from(schema.tasks)
          .where(eq(schema.tasks.sectionId, section.id));
        const taskOrderIndex = tasksInSection.length;

        const [task] = await db.insert(schema.tasks).values({
          tenantId,
          projectId,
          sectionId: section.id,
          title: row.taskTitle,
          description: row.description,
          status: (row.status?.toLowerCase() as "todo" | "in_progress" | "blocked" | "completed") || "todo",
          priority: (row.priority?.toLowerCase() as "low" | "medium" | "high" | "urgent") || "medium",
          dueDate: dueDate,
          createdBy: user.id,
          orderIndex: taskOrderIndex,
        }).returning();

        for (const assigneeId of assigneeIds) {
          await db.insert(schema.taskAssignees).values({
            tenantId,
            taskId: task.id,
            userId: assigneeId,
          });
        }

        createdTasks++;
        createdTasksByTitle.set(row.taskTitle.toLowerCase(), { id: task.id, sectionId: section.id });
        results.push({ rowIndex: i, status: "created", sectionId: section.id, taskId: task.id });
      } catch (error) {
        results.push({ rowIndex: i, status: "error", reason: "Failed to create task" });
        errors++;
      }
    }

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      
      const isSubtask = row.isSubtask === true || row.isSubtask === "true" || !!row.parentTaskTitle;
      if (!isSubtask) continue;

      try {
        const parentTitle = row.parentTaskTitle?.toLowerCase();
        if (!parentTitle) {
          results.push({ rowIndex: i, status: "error", reason: "Subtask requires parentTaskTitle" });
          errors++;
          continue;
        }

        const parentTask = createdTasksByTitle.get(parentTitle);
        if (!parentTask) {
          const existingTasks = await db.select()
            .from(schema.tasks)
            .where(and(
              eq(schema.tasks.projectId, projectId),
              sql`lower(${schema.tasks.title}) = ${parentTitle}`
            ));

          if (existingTasks.length === 0) {
            results.push({ rowIndex: i, status: "error", reason: `Parent task not found: ${row.parentTaskTitle}` });
            errors++;
            continue;
          }

          const existingSubtasks = await db.select()
            .from(schema.subtasks)
            .where(eq(schema.subtasks.taskId, existingTasks[0].id));

          await db.insert(schema.subtasks).values({
            taskId: existingTasks[0].id,
            title: row.taskTitle,
            completed: false,
            orderIndex: existingSubtasks.length,
          });

          createdSubtasks++;
          results.push({ rowIndex: i, status: "created", parentTaskId: existingTasks[0].id });
        } else {
          const existingSubtasks = await db.select()
            .from(schema.subtasks)
            .where(eq(schema.subtasks.taskId, parentTask.id));

          await db.insert(schema.subtasks).values({
            taskId: parentTask.id,
            title: row.taskTitle,
            completed: false,
            orderIndex: existingSubtasks.length,
          });

          createdSubtasks++;
          results.push({ rowIndex: i, status: "created", parentTaskId: parentTask.id, sectionId: parentTask.sectionId });
        }
      } catch (error) {
        results.push({ rowIndex: i, status: "error", reason: "Failed to create subtask" });
        errors++;
      }
    }

    await db.insert(schema.tenantAuditEvents).values({
      tenantId,
      actorUserId: user.id,
      eventType: "bulk_tasks_imported",
      message: `Bulk tasks imported: ${createdSections} sections, ${createdTasks} tasks, ${createdSubtasks} subtasks, ${errors} errors`,
      metadata: { projectId, createdSections, createdTasks, createdSubtasks, skipped, errors },
    });

    res.json({
      createdSections,
      createdTasks,
      createdSubtasks,
      skipped,
      errors,
      results,
    });
  } catch (error) {
    console.error("[bulk] Bulk tasks import failed:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to import tasks" });
  }
});
