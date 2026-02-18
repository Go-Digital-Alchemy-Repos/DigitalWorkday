import { db } from "../../db";
import {
  integrationEntityMap,
  asanaImportRuns,
  clients,
  projects,
  sections,
  tasks,
  subtasks,
  taskAssignees,
  users,
  workspaces,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { AsanaClient, type AsanaProject, type AsanaSection, type AsanaTask, type AsanaUser } from "./asanaClient";

const PROVIDER = "asana";

export interface AsanaImportOptions {
  autoCreateClients: boolean;
  autoCreateProjects: boolean;
  autoCreateTasks: boolean;
  autoCreateUsers: boolean;
  fallbackUnassigned: boolean;
  clientMappingStrategy: "single" | "team" | "custom_field";
  singleClientId?: string;
  singleClientName?: string;
  clientCustomFieldName?: string;
}

export interface ImportCounts {
  users: { create: number; update: number; skip: number; error: number };
  clients: { create: number; update: number; skip: number; error: number };
  projects: { create: number; update: number; skip: number; error: number };
  sections: { create: number; update: number; skip: number; error: number };
  tasks: { create: number; update: number; skip: number; error: number };
  subtasks: { create: number; update: number; skip: number; error: number };
}

export interface ImportError {
  entityType: string;
  asanaGid: string;
  name: string;
  message: string;
}

export interface ValidationResult {
  counts: ImportCounts;
  errors: ImportError[];
  autoCreatePreview: {
    clients: string[];
    users: string[];
  };
}

export interface ExecutionResult {
  counts: ImportCounts;
  errors: ImportError[];
}

function emptyCounts(): ImportCounts {
  return {
    users: { create: 0, update: 0, skip: 0, error: 0 },
    clients: { create: 0, update: 0, skip: 0, error: 0 },
    projects: { create: 0, update: 0, skip: 0, error: 0 },
    sections: { create: 0, update: 0, skip: 0, error: 0 },
    tasks: { create: 0, update: 0, skip: 0, error: 0 },
    subtasks: { create: 0, update: 0, skip: 0, error: 0 },
  };
}

async function lookupMapping(tenantId: string, entityType: string, providerEntityId: string): Promise<string | null> {
  const [row] = await db
    .select({ localEntityId: integrationEntityMap.localEntityId })
    .from(integrationEntityMap)
    .where(
      and(
        eq(integrationEntityMap.tenantId, tenantId),
        eq(integrationEntityMap.provider, PROVIDER),
        eq(integrationEntityMap.entityType, entityType),
        eq(integrationEntityMap.providerEntityId, providerEntityId)
      )
    )
    .limit(1);
  return row?.localEntityId ?? null;
}

async function upsertMapping(tenantId: string, entityType: string, providerEntityId: string, localEntityId: string, metadata?: any): Promise<void> {
  await db
    .insert(integrationEntityMap)
    .values({
      tenantId,
      provider: PROVIDER,
      entityType,
      providerEntityId,
      localEntityId,
      metadata: metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [integrationEntityMap.tenantId, integrationEntityMap.provider, integrationEntityMap.entityType, integrationEntityMap.providerEntityId],
      set: {
        localEntityId,
        metadata: metadata ?? null,
        updatedAt: new Date(),
      },
    });
}

function mapAsanaStatus(completed: boolean): string {
  return completed ? "done" : "todo";
}

function mapAsanaPriority(): string {
  return "medium";
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export class AsanaImportPipeline {
  private tenantId: string;
  private workspaceId: string;
  private actorUserId: string;
  private options: AsanaImportOptions;
  private client: AsanaClient;

  private userEmailToId: Map<string, string> = new Map();
  private asanaUserGidToLocalId: Map<string, string> = new Map();

  constructor(
    tenantId: string,
    workspaceId: string,
    actorUserId: string,
    options: AsanaImportOptions,
    client: AsanaClient
  ) {
    this.tenantId = tenantId;
    this.workspaceId = workspaceId;
    this.actorUserId = actorUserId;
    this.options = options;
    this.client = client;
  }

  private async loadLocalUsers(): Promise<void> {
    const localUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.tenantId, this.tenantId));
    for (const u of localUsers) {
      if (u.email) this.userEmailToId.set(u.email.toLowerCase(), u.id);
    }
  }

  async validate(
    asanaWorkspaceGid: string,
    projectGids: string[],
    updatePhase?: (phase: string) => Promise<void>
  ): Promise<ValidationResult> {
    const counts = emptyCounts();
    const errors: ImportError[] = [];
    const autoCreatePreview = { clients: [] as string[], users: [] as string[] };

    await this.loadLocalUsers();

    if (updatePhase) await updatePhase("Fetching Asana users...");
    const asanaUsers = await this.client.getWorkspaceUsers(asanaWorkspaceGid);

    for (const au of asanaUsers) {
      const existing = await lookupMapping(this.tenantId, "user", au.gid);
      if (existing) {
        counts.users.skip++;
        continue;
      }

      if (au.email && this.userEmailToId.has(au.email.toLowerCase())) {
        counts.users.update++;
        continue;
      }

      if (this.options.autoCreateUsers && au.email) {
        counts.users.create++;
        autoCreatePreview.users.push(au.email);
      } else if (this.options.fallbackUnassigned) {
        counts.users.skip++;
      } else {
        counts.users.error++;
        errors.push({ entityType: "user", asanaGid: au.gid, name: au.name, message: `No matching user and auto-create disabled (email: ${au.email || "none"})` });
      }
    }

    for (const pgid of projectGids) {
      if (updatePhase) await updatePhase(`Validating project ${pgid}...`);

      let asanaProject: AsanaProject;
      try {
        const allProjects = await this.client.getProjects(asanaWorkspaceGid, true);
        asanaProject = allProjects.find(p => p.gid === pgid)!;
        if (!asanaProject) throw new Error("Project not found in Asana");
      } catch (err: any) {
        errors.push({ entityType: "project", asanaGid: pgid, name: pgid, message: err.message });
        counts.projects.error++;
        continue;
      }

      const existingProjectId = await lookupMapping(this.tenantId, "project", pgid);
      if (existingProjectId) {
        counts.projects.update++;
      } else {
        counts.projects.create++;
      }

      const clientName = this.resolveClientName(asanaProject);
      if (clientName) {
        const existingClient = await this.findClientByName(clientName);
        if (!existingClient) {
          const existingClientMapping = await lookupMapping(this.tenantId, "client", clientName);
          if (!existingClientMapping) {
            if (this.options.autoCreateClients) {
              if (!autoCreatePreview.clients.includes(clientName)) {
                autoCreatePreview.clients.push(clientName);
              }
              counts.clients.create++;
            } else {
              counts.clients.error++;
              errors.push({ entityType: "client", asanaGid: "n/a", name: clientName, message: "Client not found and auto-create disabled" });
            }
          }
        }
      }

      const asanaSections = await this.client.getSections(pgid);
      for (const sec of asanaSections) {
        const existingSec = await lookupMapping(this.tenantId, "section", sec.gid);
        if (existingSec) {
          counts.sections.update++;
        } else {
          counts.sections.create++;
        }
      }

      const allTasks = await this.client.getTasksForProject(pgid);
      for (const task of allTasks) {
        if (task.parent) {
          const existingSub = await lookupMapping(this.tenantId, "subtask", task.gid);
          if (existingSub) counts.subtasks.update++;
          else counts.subtasks.create++;
        } else {
          const existingTask = await lookupMapping(this.tenantId, "task", task.gid);
          if (existingTask) counts.tasks.update++;
          else counts.tasks.create++;
        }
      }
    }

    return { counts, errors, autoCreatePreview };
  }

  async execute(
    asanaWorkspaceGid: string,
    projectGids: string[],
    updatePhase?: (phase: string) => Promise<void>
  ): Promise<ExecutionResult> {
    const counts = emptyCounts();
    const errors: ImportError[] = [];

    await this.loadLocalUsers();

    if (updatePhase) await updatePhase("Importing users...");
    const asanaUsers = await this.client.getWorkspaceUsers(asanaWorkspaceGid);
    await this.importUsers(asanaUsers, counts, errors);

    for (let i = 0; i < projectGids.length; i++) {
      const pgid = projectGids[i];
      if (updatePhase) await updatePhase(`Importing project ${i + 1}/${projectGids.length}...`);

      try {
        await this.importProject(asanaWorkspaceGid, pgid, counts, errors);
      } catch (err: any) {
        errors.push({ entityType: "project", asanaGid: pgid, name: pgid, message: err.message });
        counts.projects.error++;
      }
    }

    return { counts, errors };
  }

  private async importUsers(asanaUsers: AsanaUser[], counts: ImportCounts, errors: ImportError[]): Promise<void> {
    for (const au of asanaUsers) {
      try {
        const existingLocalId = await lookupMapping(this.tenantId, "user", au.gid);
        if (existingLocalId) {
          this.asanaUserGidToLocalId.set(au.gid, existingLocalId);
          counts.users.skip++;
          continue;
        }

        if (au.email && this.userEmailToId.has(au.email.toLowerCase())) {
          const localId = this.userEmailToId.get(au.email.toLowerCase())!;
          await upsertMapping(this.tenantId, "user", au.gid, localId, { name: au.name, email: au.email });
          this.asanaUserGidToLocalId.set(au.gid, localId);
          counts.users.update++;
          continue;
        }

        if (this.options.autoCreateUsers && au.email) {
          const nameParts = au.name?.split(" ") || [];
          const [newUser] = await db
            .insert(users)
            .values({
              tenantId: this.tenantId,
              email: au.email,
              name: au.name || au.email,
              firstName: nameParts[0] || null,
              lastName: nameParts.slice(1).join(" ") || null,
              role: "employee",
              passwordHash: "",
              isActive: true,
            })
            .returning({ id: users.id });

          await upsertMapping(this.tenantId, "user", au.gid, newUser.id, { name: au.name, email: au.email });
          this.asanaUserGidToLocalId.set(au.gid, newUser.id);
          this.userEmailToId.set(au.email.toLowerCase(), newUser.id);
          counts.users.create++;
        } else if (this.options.fallbackUnassigned) {
          counts.users.skip++;
        } else {
          counts.users.error++;
          errors.push({ entityType: "user", asanaGid: au.gid, name: au.name, message: `Cannot map user (email: ${au.email || "none"})` });
        }
      } catch (err: any) {
        if (err.message?.includes("unique constraint") || err.message?.includes("duplicate key")) {
          const existingByEmail = au.email ? this.userEmailToId.get(au.email.toLowerCase()) : null;
          if (existingByEmail) {
            await upsertMapping(this.tenantId, "user", au.gid, existingByEmail, { name: au.name, email: au.email });
            this.asanaUserGidToLocalId.set(au.gid, existingByEmail);
            counts.users.skip++;
          } else {
            counts.users.error++;
            errors.push({ entityType: "user", asanaGid: au.gid, name: au.name, message: err.message });
          }
        } else {
          counts.users.error++;
          errors.push({ entityType: "user", asanaGid: au.gid, name: au.name, message: err.message });
        }
      }
    }
  }

  private async importProject(
    asanaWorkspaceGid: string,
    projectGid: string,
    counts: ImportCounts,
    errors: ImportError[]
  ): Promise<void> {
    const allProjects = await this.client.getProjects(asanaWorkspaceGid, true);
    const asanaProject = allProjects.find(p => p.gid === projectGid);
    if (!asanaProject) {
      throw new Error("Project not found in Asana workspace");
    }

    let clientId: string | null = null;
    const clientName = this.resolveClientName(asanaProject);
    if (clientName) {
      clientId = await this.resolveClientId(clientName, counts, errors);
    }

    const existingProjectId = await lookupMapping(this.tenantId, "project", projectGid);
    let localProjectId: string;

    if (existingProjectId) {
      await db.update(projects).set({
        name: asanaProject.name,
        description: asanaProject.notes || null,
        clientId,
        updatedAt: new Date(),
      }).where(eq(projects.id, existingProjectId));
      localProjectId = existingProjectId;
      counts.projects.update++;
    } else {
      const [newProject] = await db
        .insert(projects)
        .values({
          tenantId: this.tenantId,
          workspaceId: this.workspaceId,
          clientId,
          name: asanaProject.name,
          description: asanaProject.notes || null,
          status: asanaProject.archived ? "completed" : "active",
          createdBy: this.actorUserId,
        })
        .returning({ id: projects.id });
      localProjectId = newProject.id;
      counts.projects.create++;
    }
    await upsertMapping(this.tenantId, "project", projectGid, localProjectId, { name: asanaProject.name });

    const asanaSections = await this.client.getSections(projectGid);
    const sectionGidToLocalId: Map<string, string> = new Map();

    for (let idx = 0; idx < asanaSections.length; idx++) {
      const sec = asanaSections[idx];
      try {
        const existingSectionId = await lookupMapping(this.tenantId, "section", sec.gid);
        let localSectionId: string;

        if (existingSectionId) {
          await db.update(sections).set({ name: sec.name, orderIndex: idx }).where(eq(sections.id, existingSectionId));
          localSectionId = existingSectionId;
          counts.sections.update++;
        } else {
          const [newSection] = await db
            .insert(sections)
            .values({ projectId: localProjectId, name: sec.name, orderIndex: idx })
            .returning({ id: sections.id });
          localSectionId = newSection.id;
          counts.sections.create++;
        }
        await upsertMapping(this.tenantId, "section", sec.gid, localSectionId, { name: sec.name });
        sectionGidToLocalId.set(sec.gid, localSectionId);
      } catch (err: any) {
        counts.sections.error++;
        errors.push({ entityType: "section", asanaGid: sec.gid, name: sec.name, message: err.message });
      }
    }

    const allTasks = await this.client.getTasksForProject(projectGid);
    const topLevelTasks = allTasks.filter(t => !t.parent);
    const childTasks = allTasks.filter(t => t.parent);

    for (let idx = 0; idx < topLevelTasks.length; idx++) {
      const task = topLevelTasks[idx];
      try {
        await this.importTask(task, localProjectId, null, sectionGidToLocalId, idx, counts, errors);
      } catch (err: any) {
        counts.tasks.error++;
        errors.push({ entityType: "task", asanaGid: task.gid, name: task.name, message: err.message });
      }
    }

    for (let idx = 0; idx < childTasks.length; idx++) {
      const child = childTasks[idx];
      try {
        const parentLocalId = child.parent ? await lookupMapping(this.tenantId, "task", child.parent.gid) : null;
        await this.importSubtask(child, parentLocalId, idx, counts, errors);
      } catch (err: any) {
        counts.subtasks.error++;
        errors.push({ entityType: "subtask", asanaGid: child.gid, name: child.name, message: err.message });
      }
    }

    if (topLevelTasks.some(t => (t.num_subtasks ?? 0) > 0)) {
      for (const task of topLevelTasks) {
        if ((task.num_subtasks ?? 0) > 0) {
          try {
            const asanaSubtasks = await this.client.getSubtasks(task.gid);
            const parentLocalId = await lookupMapping(this.tenantId, "task", task.gid);
            for (let si = 0; si < asanaSubtasks.length; si++) {
              try {
                await this.importSubtask(asanaSubtasks[si], parentLocalId, si, counts, errors);
              } catch (err: any) {
                counts.subtasks.error++;
                errors.push({ entityType: "subtask", asanaGid: asanaSubtasks[si].gid, name: asanaSubtasks[si].name, message: err.message });
              }
            }
          } catch (err: any) {
            errors.push({ entityType: "subtask", asanaGid: task.gid, name: `subtasks of ${task.name}`, message: err.message });
          }
        }
      }
    }
  }

  private async importTask(
    task: AsanaTask,
    localProjectId: string,
    parentTaskId: string | null,
    sectionGidToLocalId: Map<string, string>,
    orderIdx: number,
    counts: ImportCounts,
    errors: ImportError[]
  ): Promise<string | null> {
    const existingTaskId = await lookupMapping(this.tenantId, "task", task.gid);

    let sectionId: string | null = null;
    if (task.memberships?.[0]?.section?.gid) {
      sectionId = sectionGidToLocalId.get(task.memberships[0].section.gid) ?? null;
    }

    const assigneeLocalId = task.assignee?.gid ? this.asanaUserGidToLocalId.get(task.assignee.gid) ?? null : null;

    const taskData = {
      tenantId: this.tenantId,
      projectId: localProjectId,
      sectionId,
      parentTaskId,
      title: task.name,
      description: task.notes || null,
      status: mapAsanaStatus(task.completed),
      priority: mapAsanaPriority(),
      startDate: parseDate(task.start_on),
      dueDate: parseDate(task.due_on),
      createdBy: this.actorUserId,
      orderIndex: orderIdx,
    };

    let localTaskId: string;

    if (existingTaskId) {
      await db.update(tasks).set({
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        sectionId: taskData.sectionId,
        startDate: taskData.startDate,
        dueDate: taskData.dueDate,
        updatedAt: new Date(),
      }).where(eq(tasks.id, existingTaskId));
      localTaskId = existingTaskId;
      counts.tasks.update++;
    } else {
      const [newTask] = await db.insert(tasks).values(taskData).returning({ id: tasks.id });
      localTaskId = newTask.id;
      counts.tasks.create++;
    }

    await upsertMapping(this.tenantId, "task", task.gid, localTaskId, { name: task.name });

    if (assigneeLocalId) {
      await db
        .insert(taskAssignees)
        .values({ tenantId: this.tenantId, taskId: localTaskId, userId: assigneeLocalId })
        .onConflictDoNothing();
    }

    return localTaskId;
  }

  private async importSubtask(
    task: AsanaTask,
    parentLocalId: string | null,
    orderIdx: number,
    counts: ImportCounts,
    errors: ImportError[]
  ): Promise<void> {
    if (!parentLocalId) {
      if (this.options.autoCreateTasks && task.parent) {
        counts.subtasks.error++;
        errors.push({ entityType: "subtask", asanaGid: task.gid, name: task.name, message: "Parent task not imported yet" });
      } else {
        counts.subtasks.error++;
        errors.push({ entityType: "subtask", asanaGid: task.gid, name: task.name, message: "Parent task missing and auto-create disabled" });
      }
      return;
    }

    const existingSubId = await lookupMapping(this.tenantId, "subtask", task.gid);
    const assigneeLocalId = task.assignee?.gid ? this.asanaUserGidToLocalId.get(task.assignee.gid) ?? null : null;

    if (existingSubId) {
      await db.update(subtasks).set({
        title: task.name,
        status: mapAsanaStatus(task.completed),
        completed: task.completed,
        dueDate: parseDate(task.due_on),
        assigneeId: assigneeLocalId,
        updatedAt: new Date(),
      }).where(eq(subtasks.id, existingSubId));
      counts.subtasks.update++;
      await upsertMapping(this.tenantId, "subtask", task.gid, existingSubId, { name: task.name });
    } else {
      const [newSub] = await db.insert(subtasks).values({
        taskId: parentLocalId,
        title: task.name,
        status: mapAsanaStatus(task.completed),
        completed: task.completed,
        priority: mapAsanaPriority(),
        dueDate: parseDate(task.due_on),
        assigneeId: assigneeLocalId,
        orderIndex: orderIdx,
      }).returning({ id: subtasks.id });
      counts.subtasks.create++;
      await upsertMapping(this.tenantId, "subtask", task.gid, newSub.id, { name: task.name });
    }
  }

  private resolveClientName(asanaProject: AsanaProject): string | null {
    switch (this.options.clientMappingStrategy) {
      case "single":
        return this.options.singleClientName || null;
      case "team":
        return asanaProject.team?.name || null;
      case "custom_field":
        return null;
      default:
        return null;
    }
  }

  private async resolveClientId(clientName: string, counts: ImportCounts, errors: ImportError[]): Promise<string | null> {
    if (this.options.clientMappingStrategy === "single" && this.options.singleClientId) {
      return this.options.singleClientId;
    }

    const existing = await this.findClientByName(clientName);
    if (existing) return existing;

    const mappedClientId = await lookupMapping(this.tenantId, "client", clientName);
    if (mappedClientId) return mappedClientId;

    if (!this.options.autoCreateClients) {
      counts.clients.error++;
      errors.push({ entityType: "client", asanaGid: "n/a", name: clientName, message: "Client not found and auto-create disabled" });
      return null;
    }

    const [newClient] = await db
      .insert(clients)
      .values({
        tenantId: this.tenantId,
        workspaceId: this.workspaceId,
        companyName: clientName,
        status: "active",
      })
      .returning({ id: clients.id });

    await upsertMapping(this.tenantId, "client", clientName, newClient.id, { name: clientName });
    counts.clients.create++;
    return newClient.id;
  }

  private async findClientByName(name: string): Promise<string | null> {
    const [row] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.tenantId, this.tenantId), eq(clients.companyName, name)))
      .limit(1);
    return row?.id ?? null;
  }
}
