import { registerHandler, type JobContext } from "./queue";
import { AsanaClient } from "../services/asana/asanaClient";
import { AsanaImportPipeline, type AsanaImportOptions } from "../services/asana/importPipeline";
import { db } from "../db";
import { asanaImportRuns } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getJob as getImportJob, updateJob as updateImportJob } from "../imports/jobStore";
import { validateJob as validateImportJob, executeJob as executeImportJob } from "../imports/importEngine";
import type { ImportJob } from "../imports/jobStore";
import {
  suggestTaskBreakdown,
  suggestProjectPlan,
  generateTaskDescription,
} from "../services/ai/aiService";
import { runSoftArchive } from "../retention/softArchiveRunner";
import { storage } from "../storage";
import * as schema from "@shared/schema";
import { and, sql } from "drizzle-orm";
import { z } from "zod";

async function handleDataRetention(ctx: JobContext): Promise<void> {
  const { tenantId } = ctx.payload;
  if (!tenantId) {
    throw new Error("Missing tenantId in data_retention job payload");
  }

  await ctx.updateProgress({ current: 0, total: 100, phase: "Starting retention job..." });
  const result = await runSoftArchive(tenantId);
  await ctx.setResult(result);
  await ctx.updateProgress({ current: 100, total: 100, phase: "Retention job complete" });
}

async function handleAsanaImport(ctx: JobContext): Promise<void> {
  const {
    tenantId,
    asanaWorkspaceGid,
    asanaWorkspaceName,
    projectGids,
    targetWorkspaceId,
    options,
    asanaRunId,
  } = ctx.payload;

  const client = await AsanaClient.fromTenant(tenantId);
  const pipeline = new AsanaImportPipeline(
    tenantId,
    targetWorkspaceId,
    ctx.userId,
    options as AsanaImportOptions,
    client
  );

  const totalProjects = projectGids.length;

  try {
    const result = await pipeline.execute(
      asanaWorkspaceGid,
      projectGids,
      async (phase: string) => {
        await ctx.updateProgress({ current: 0, total: totalProjects, phase });
        if (asanaRunId) {
          await db.update(asanaImportRuns).set({ phase }).where(eq(asanaImportRuns.id, asanaRunId));
        }
      }
    );

    await ctx.setResult(result);

    if (asanaRunId) {
      await db.update(asanaImportRuns).set({
        status: result.errors.length > 0 ? "completed_with_errors" : "completed",
        phase: "Done",
        executionSummary: result.counts,
        errorLog: result.errors.length > 0 ? result.errors : null,
        completedAt: new Date(),
      }).where(eq(asanaImportRuns.id, asanaRunId));
    }
  } catch (err: any) {
    if (asanaRunId) {
      await db.update(asanaImportRuns).set({
        status: "failed",
        phase: "Error",
        errorLog: [{ entityType: "system", asanaGid: "", name: "", message: err.message }],
        completedAt: new Date(),
      }).where(eq(asanaImportRuns.id, asanaRunId));
    }
    throw err;
  }
}

async function handleCsvImport(ctx: JobContext): Promise<void> {
  const { importJobId } = ctx.payload;

  const job = getImportJob(importJobId) as ImportJob | undefined;
  if (!job) {
    throw new Error(`Import job ${importJobId} not found in job store`);
  }

  await ctx.updateProgress({ current: 0, total: job.rawRows.length, phase: "Validating..." });

  updateImportJob(importJobId, { status: "running" });
  const summary = await executeImportJob(job);

  await ctx.setResult({
    importJobId,
    summary,
  });
}

async function handleBulkTasksImport(ctx: JobContext): Promise<void> {
  const { tenantId, projectId, rows, options: bulkOptions } = ctx.payload;
  const options = bulkOptions || { createMissingSections: true, allowUnknownAssignees: false };

  const [project] = await db.select()
    .from(schema.projects)
    .where(and(
      eq(schema.projects.id, projectId),
      eq(schema.projects.tenantId, tenantId)
    ));

  if (!project) throw new Error("Project not found or does not belong to tenant");

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
    taskId?: string;
  }> = [];

  let createdSections = 0;
  let createdTasks = 0;
  let createdSubtasks = 0;
  let errors = 0;
  const total = rows.length;
  const createdTasksByTitle = new Map<string, { id: string; sectionId: string }>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isSubtask = row.isSubtask === true || row.isSubtask === "true" || !!row.parentTaskTitle;
    if (isSubtask) continue;

    if (i % 50 === 0) {
      await ctx.updateProgress({ current: i, total, phase: "Importing tasks..." });
      if (await ctx.isCancelled()) return;
    }

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
        const emails = row.assigneeEmails.split(",").map((e: string) => e.trim().toLowerCase());
        for (const email of emails) {
          const foundUser = usersByEmail.get(email);
          if (foundUser) assigneeIds.push(foundUser.id);
        }
      }

      let dueDate: Date | null = null;
      if (row.dueDate) {
        dueDate = new Date(row.dueDate);
        if (isNaN(dueDate.getTime())) dueDate = null;
      }

      const tasksInSection = await db.select()
        .from(schema.tasks)
        .where(eq(schema.tasks.sectionId, section.id));

      const [task] = await db.insert(schema.tasks).values({
        tenantId,
        projectId,
        sectionId: section.id,
        title: row.taskTitle,
        description: row.description,
        status: (row.status?.toLowerCase() as any) || "todo",
        priority: (row.priority?.toLowerCase() as any) || "medium",
        dueDate,
        createdBy: ctx.userId,
        orderIndex: tasksInSection.length,
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
      results.push({ rowIndex: i, status: "created", taskId: task.id });
    } catch {
      results.push({ rowIndex: i, status: "error", reason: "Failed to create task" });
      errors++;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isSubtask = row.isSubtask === true || row.isSubtask === "true" || !!row.parentTaskTitle;
    if (!isSubtask) continue;

    if (i % 50 === 0) {
      await ctx.updateProgress({ current: i, total, phase: "Importing subtasks..." });
    }

    try {
      const parentTitle = row.parentTaskTitle?.toLowerCase();
      if (!parentTitle) {
        results.push({ rowIndex: i, status: "error", reason: "Subtask requires parentTaskTitle" });
        errors++;
        continue;
      }

      let parentTaskId: string | null = null;
      const created = createdTasksByTitle.get(parentTitle);
      if (created) {
        parentTaskId = created.id;
      } else {
        const [existing] = await db.select()
          .from(schema.tasks)
          .where(and(
            eq(schema.tasks.projectId, projectId),
            sql`lower(${schema.tasks.title}) = ${parentTitle}`
          ));
        if (existing) parentTaskId = existing.id;
      }

      if (!parentTaskId) {
        results.push({ rowIndex: i, status: "error", reason: `Parent task not found: ${row.parentTaskTitle}` });
        errors++;
        continue;
      }

      const existingSubtasks = await db.select()
        .from(schema.subtasks)
        .where(eq(schema.subtasks.taskId, parentTaskId));

      await db.insert(schema.subtasks).values({
        taskId: parentTaskId,
        title: row.taskTitle,
        completed: false,
        orderIndex: existingSubtasks.length,
      });

      createdSubtasks++;
      results.push({ rowIndex: i, status: "created" });
    } catch {
      results.push({ rowIndex: i, status: "error", reason: "Failed to create subtask" });
      errors++;
    }
  }

  await ctx.setResult({ createdSections, createdTasks, createdSubtasks, errors, results });
}

async function handleAiGeneration(ctx: JobContext): Promise<void> {
  const { action, taskTitle, taskDescription, projectContext, projectName, projectDescription, clientName, teamSize } = ctx.payload;

  await ctx.updateProgress({ current: 0, total: 1, phase: `Running AI ${action}...` });

  switch (action) {
    case "task-breakdown": {
      const result = await suggestTaskBreakdown(taskTitle, taskDescription, projectContext);
      if (!result) throw new Error("AI returned no result");
      await ctx.setResult(result);
      break;
    }
    case "project-plan": {
      const result = await suggestProjectPlan(projectName, projectDescription, clientName, teamSize);
      if (!result) throw new Error("AI returned no result");
      await ctx.setResult(result);
      break;
    }
    case "task-description": {
      const description = await generateTaskDescription(taskTitle, projectContext);
      if (!description) throw new Error("AI returned no result");
      await ctx.setResult({ description });
      break;
    }
    default:
      throw new Error(`Unknown AI action: ${action}`);
  }

  await ctx.updateProgress({ current: 1, total: 1, phase: "Done" });
}

export function registerAllHandlers(): void {
  registerHandler("asana_import", handleAsanaImport, 1);
  registerHandler("csv_import", handleCsvImport, 1);
  registerHandler("bulk_tasks_import", handleBulkTasksImport, 2);
  registerHandler("ai_generation", handleAiGeneration, 3);
  registerHandler("data_retention", handleDataRetention, 1);

  console.log("[jobs] All job handlers registered");
}
