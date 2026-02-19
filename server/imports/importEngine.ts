import { db } from "../db";
import { storage } from "../storage";
import { clients, projects, tasks, users, timeEntries } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { applyMapping } from "./applyMapping";
import type { ImportJob } from "./jobStore";
import { updateJob } from "./jobStore";
import type { EntityType, ColumnMapping, ValidationError, ValidationWarning, ValidationSummary, ImportSummary, MissingDependency } from "../../shared/imports/fieldCatalog";

interface RowResult {
  action: "create" | "update" | "skip";
  error?: ValidationError;
  warning?: ValidationWarning;
}

interface TenantLookups {
  tenantId: string;
  workspaceId: string;
  usersByEmail: Map<string, { id: string; email: string; role: string; name?: string | null; firstName?: string | null; lastName?: string | null }>;
  usersByName: Map<string, { id: string; email: string; role: string; name?: string | null; firstName?: string | null; lastName?: string | null }>;
  clientsByName: Map<string, { id: string; companyName: string; parentClientId: string | null }>;
  projectsByName: Map<string, { id: string; name: string; clientId: string | null }>;
  tasksByKey: Map<string, { id: string; title: string; projectId: string | null }>;
  tasksByTitle: Map<string, { id: string; title: string; projectId: string | null }>;
  existingTimeEntryKeys: Set<string>;
}

async function buildLookups(tenantId: string): Promise<TenantLookups> {
  const requestId = undefined;
  const workspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

  const tenantUsers = await db.select({
    id: users.id, email: users.email, role: users.role,
    name: users.name, firstName: users.firstName, lastName: users.lastName,
  }).from(users).where(eq(users.tenantId, tenantId));
  const usersByEmail = new Map(tenantUsers.map(u => [u.email.toLowerCase(), u]));

  const usersByName = new Map<string, typeof tenantUsers[0]>();
  for (const u of tenantUsers) {
    const fullName = u.name?.trim() || [u.firstName, u.lastName].filter(Boolean).join(" ");
    if (fullName) {
      usersByName.set(fullName.toLowerCase(), u);
    }
    if (u.firstName && u.lastName) {
      usersByName.set(`${u.firstName} ${u.lastName}`.toLowerCase(), u);
    }
  }

  const tenantClients = await db.select({ id: clients.id, companyName: clients.companyName, parentClientId: clients.parentClientId })
    .from(clients).where(eq(clients.tenantId, tenantId));
  const clientsByName = new Map(tenantClients.map(c => [c.companyName.toLowerCase(), c]));

  const tenantProjects = await db.select({ id: projects.id, name: projects.name, clientId: projects.clientId })
    .from(projects).where(eq(projects.tenantId, tenantId));
  const projectsByName = new Map(tenantProjects.map(p => [p.name.toLowerCase(), p]));

  const tenantTasks = await db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
    .from(tasks).where(eq(tasks.tenantId, tenantId));
  const tasksByKey = new Map(tenantTasks.map(t => [`${(t.projectId || "none")}::${t.title.toLowerCase()}`, t]));

  const tasksByTitle = new Map<string, typeof tenantTasks[0]>();
  for (const t of tenantTasks) {
    const key = t.title.toLowerCase();
    if (!tasksByTitle.has(key)) {
      tasksByTitle.set(key, t);
    }
  }

  const existingEntries = await db.select({
    userId: timeEntries.userId,
    startTime: timeEntries.startTime,
    endTime: timeEntries.endTime,
    durationSeconds: timeEntries.durationSeconds,
  }).from(timeEntries).where(eq(timeEntries.tenantId, tenantId));
  const existingTimeEntryKeys = new Set(
    existingEntries.map(e => {
      const endStr = e.endTime ? e.endTime.toISOString() : "none";
      return `${e.userId}::${e.startTime.toISOString()}::${endStr}::${e.durationSeconds}`;
    })
  );

  return { tenantId, workspaceId, usersByEmail, usersByName, clientsByName, projectsByName, tasksByKey, tasksByTitle, existingTimeEntryKeys };
}

export async function validateJob(job: ImportJob): Promise<ValidationSummary> {
  const lookups = await buildLookups(job.tenantId);
  const summary: ValidationSummary = {
    wouldCreate: 0, wouldUpdate: 0, wouldSkip: 0, wouldFail: 0,
    errors: [], warnings: [],
    missingDependencies: [],
    wouldFailWithoutAutoCreate: 0,
  };

  const missingClientsMap = new Map<string, number[]>();
  const missingUsersMap = new Map<string, number[]>();
  const missingProjectsMap = new Map<string, number[]>();

  for (let i = 0; i < job.rawRows.length; i++) {
    const mapped = applyMapping(job.rawRows[i], job.mapping);
    const rowNum = i + 2;

    collectMissingDeps(job.entityType, mapped, rowNum, lookups, missingClientsMap, missingUsersMap, missingProjectsMap);

    const result = validateRow(job.entityType, mapped, rowNum, lookups);

    if (result.error) {
      const isDepError = ["PROJECT_NOT_FOUND", "USER_NOT_FOUND", "CLIENT_NOT_FOUND", "ASSIGNEE_NOT_FOUND"].includes(result.error.code);
      if (isDepError) {
        summary.wouldFailWithoutAutoCreate++;
        summary.wouldCreate++;
      } else {
        summary.wouldFail++;
        summary.errors.push(result.error);
      }
    } else if (result.action === "skip") {
      summary.wouldSkip++;
    } else if (result.action === "update") {
      summary.wouldUpdate++;
    } else {
      summary.wouldCreate++;
    }

    if (result.warning) {
      summary.warnings.push(result.warning);
    }
  }

  for (const [name, rows] of missingClientsMap) {
    summary.missingDependencies.push({ type: "client", name, referencedByRows: rows });
  }
  for (const [name, rows] of missingUsersMap) {
    summary.missingDependencies.push({ type: "user", name, referencedByRows: rows });
  }
  for (const [name, rows] of missingProjectsMap) {
    summary.missingDependencies.push({ type: "project", name, referencedByRows: rows });
  }

  return summary;
}

function collectMissingDeps(
  entityType: EntityType,
  mapped: Record<string, string>,
  rowNum: number,
  lookups: TenantLookups,
  missingClients: Map<string, number[]>,
  missingUsers: Map<string, number[]>,
  missingProjects: Map<string, number[]>,
) {
  if (entityType === "projects") {
    const clientName = mapped.clientName?.trim();
    if (clientName && !lookups.clientsByName.has(clientName.toLowerCase())) {
      const key = clientName.toLowerCase();
      if (!missingClients.has(key)) missingClients.set(key, []);
      missingClients.get(key)!.push(rowNum);
    }
  }

  if (entityType === "tasks") {
    const projectName = mapped.projectName?.trim();
    if (projectName && !lookups.projectsByName.has(projectName.toLowerCase())) {
      const key = projectName.toLowerCase();
      if (!missingProjects.has(key)) missingProjects.set(key, []);
      missingProjects.get(key)!.push(rowNum);
    }
    const assigneeEmail = mapped.assigneeEmail?.trim();
    if (assigneeEmail && !lookups.usersByEmail.has(assigneeEmail.toLowerCase())) {
      const key = assigneeEmail.toLowerCase();
      if (!missingUsers.has(key)) missingUsers.set(key, []);
      missingUsers.get(key)!.push(rowNum);
    }
  }

  if (entityType === "time_entries") {
    const userEmail = mapped.userEmail?.trim();
    const userName = mapped.userName?.trim();
    const userResolved = (userEmail && lookups.usersByEmail.has(userEmail.toLowerCase()))
      || (userName && lookups.usersByName.has(userName.toLowerCase()));
    if (!userResolved) {
      const key = (userEmail || userName || "unknown").toLowerCase();
      if (!missingUsers.has(key)) missingUsers.set(key, []);
      missingUsers.get(key)!.push(rowNum);
    }
    const clientName = mapped.clientName?.trim();
    if (clientName && !lookups.clientsByName.has(clientName.toLowerCase())) {
      const key = clientName.toLowerCase();
      if (!missingClients.has(key)) missingClients.set(key, []);
      missingClients.get(key)!.push(rowNum);
    }
    const parentName = mapped.parentClientName?.trim();
    if (parentName && !lookups.clientsByName.has(parentName.toLowerCase())) {
      const key = parentName.toLowerCase();
      if (!missingClients.has(key)) missingClients.set(key, []);
      missingClients.get(key)!.push(rowNum);
    }
    const projectName = mapped.projectName?.trim();
    if (projectName && !lookups.projectsByName.has(projectName.toLowerCase())) {
      const key = projectName.toLowerCase();
      if (!missingProjects.has(key)) missingProjects.set(key, []);
      missingProjects.get(key)!.push(rowNum);
    }
  }

  if (entityType === "clients") {
    const parentName = mapped.parentClientName?.trim();
    if (parentName && !lookups.clientsByName.has(parentName.toLowerCase())) {
      const key = parentName.toLowerCase();
      if (!missingClients.has(key)) missingClients.set(key, []);
      missingClients.get(key)!.push(rowNum);
    }
  }
}

function validateRow(entityType: EntityType, mapped: Record<string, string>, rowNum: number, lookups: TenantLookups): RowResult {
  switch (entityType) {
    case "clients": return validateClient(mapped, rowNum, lookups);
    case "projects": return validateProject(mapped, rowNum, lookups);
    case "tasks": return validateTask(mapped, rowNum, lookups);
    case "users":
    case "admins": return validateUser(mapped, rowNum, lookups);
    case "time_entries": return validateTimeEntry(mapped, rowNum, lookups);
    default: return { action: "skip", error: { row: rowNum, code: "UNKNOWN_TYPE", message: `Unknown entity type: ${entityType}` } };
  }
}

function validateClient(m: Record<string, string>, row: number, lookups: TenantLookups): RowResult {
  if (!m.companyName?.trim()) return { action: "skip", error: { row, field: "companyName", code: "REQUIRED", message: "Company name is required" } };
  const existing = lookups.clientsByName.get(m.companyName.trim().toLowerCase());
  if (existing) return { action: "skip" };
  let warning: ValidationWarning | undefined;
  if (m.parentClientName?.trim() && !lookups.clientsByName.has(m.parentClientName.trim().toLowerCase())) {
    warning = { row, field: "parentClientName", code: "PARENT_WILL_CREATE", message: `Parent client "${m.parentClientName}" will be created` };
  }
  return { action: "create", warning };
}

function validateProject(m: Record<string, string>, row: number, lookups: TenantLookups): RowResult {
  if (!m.name?.trim()) return { action: "skip", error: { row, field: "name", code: "REQUIRED", message: "Project name is required" } };
  const existing = lookups.projectsByName.get(m.name.trim().toLowerCase());
  if (existing) return { action: "skip" };
  if (m.clientName?.trim() && !lookups.clientsByName.has(m.clientName.trim().toLowerCase())) {
    return { action: "create", error: { row, field: "clientName", code: "CLIENT_NOT_FOUND", message: `Client "${m.clientName}" not found` } };
  }
  return { action: "create" };
}

function validateTask(m: Record<string, string>, row: number, lookups: TenantLookups): RowResult {
  if (!m.title?.trim()) return { action: "skip", error: { row, field: "title", code: "REQUIRED", message: "Task title is required" } };
  if (m.projectName?.trim()) {
    const proj = lookups.projectsByName.get(m.projectName.trim().toLowerCase());
    if (!proj) return { action: "create", error: { row, field: "projectName", code: "PROJECT_NOT_FOUND", message: `Project "${m.projectName}" not found` } };
    const key = `${proj.id}::${m.title.trim().toLowerCase()}`;
    if (lookups.tasksByKey.has(key)) return { action: "skip" };
  }
  if (m.assigneeEmail?.trim()) {
    if (!lookups.usersByEmail.has(m.assigneeEmail.trim().toLowerCase())) {
      return { action: "create", error: { row, field: "assigneeEmail", code: "ASSIGNEE_NOT_FOUND", message: `User "${m.assigneeEmail}" not found` } };
    }
  }
  return { action: "create" };
}

function validateUser(m: Record<string, string>, row: number, lookups: TenantLookups): RowResult {
  if (!m.email?.trim()) return { action: "skip", error: { row, field: "email", code: "REQUIRED", message: "Email is required" } };
  const email = m.email.trim().toLowerCase();
  if (lookups.usersByEmail.has(email)) return { action: "skip" };
  return { action: "create" };
}

function resolveUserForTimeEntry(m: Record<string, string>, lookups: TenantLookups) {
  const userEmail = m.userEmail?.trim().toLowerCase();
  if (userEmail) {
    const user = lookups.usersByEmail.get(userEmail);
    if (user) return user;
  }
  const userName = m.userName?.trim().toLowerCase();
  if (userName) {
    const user = lookups.usersByName.get(userName);
    if (user) return user;
  }
  return null;
}

function computeDurationSeconds(m: Record<string, string>, startTime: Date, endTime: Date | null): number {
  if (endTime) {
    return Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  }
  if (m.durationMinutes?.trim()) {
    const mins = parseFloat(m.durationMinutes);
    if (!isNaN(mins)) return Math.round(mins * 60);
  }
  if (m.durationHours?.trim()) {
    const hours = parseFloat(m.durationHours);
    if (!isNaN(hours)) return Math.round(hours * 3600);
  }
  return 0;
}

function validateTimeEntry(m: Record<string, string>, row: number, lookups: TenantLookups): RowResult {
  const userEmail = m.userEmail?.trim();
  const userName = m.userName?.trim();
  if (!userEmail && !userName) return { action: "skip", error: { row, field: "userEmail", code: "REQUIRED", message: "User email or user name is required" } };

  const user = resolveUserForTimeEntry(m, lookups);
  if (!user) return { action: "create", error: { row, field: userEmail ? "userEmail" : "userName", code: "USER_NOT_FOUND", message: `User "${userEmail || userName}" not found` } };

  const startRaw = m.startTime?.trim() || m.date?.trim();
  if (!startRaw) return { action: "skip", error: { row, field: "startTime", code: "REQUIRED", message: "Start time or date is required" } };
  const startDate = new Date(startRaw);
  if (isNaN(startDate.getTime())) return { action: "skip", error: { row, field: "startTime", code: "INVALID_DATE", message: `Invalid start time: "${startRaw}"` } };

  let endTime: Date | null = null;
  if (m.endTime?.trim()) {
    endTime = new Date(m.endTime);
    if (isNaN(endTime.getTime())) endTime = null;
  }

  let warning: ValidationWarning | undefined;
  if (endTime && endTime <= startDate) {
    warning = { row, field: "endTime", code: "END_BEFORE_START", message: "End time is before or equal to start time" };
  }

  const durationSeconds = computeDurationSeconds(m, startDate, endTime);
  if (!endTime && durationSeconds > 0) {
    endTime = new Date(startDate.getTime() + durationSeconds * 1000);
  }
  const endStr = endTime ? endTime.toISOString() : "none";
  const dedupKey = `${user.id}::${startDate.toISOString()}::${endStr}::${durationSeconds}`;
  if (lookups.existingTimeEntryKeys.has(dedupKey)) {
    return { action: "skip" };
  }

  return { action: "create", warning };
}

async function autoCreateMissingDeps(job: ImportJob, lookups: TenantLookups): Promise<{ clientsCreated: number; usersCreated: number; projectsCreated: number }> {
  let clientsCreated = 0;
  let usersCreated = 0;
  let projectsCreated = 0;

  const neededClients = new Map<string, { name: string; parentClientName?: string }>();
  const neededUsers = new Map<string, { email: string; firstName?: string; lastName?: string; role?: string }>();
  const neededProjects = new Set<string>();

  for (const rawRow of job.rawRows) {
    const mapped = applyMapping(rawRow, job.mapping);

    if (job.entityType === "projects" || job.entityType === "time_entries" || job.entityType === "clients") {
      const clientName = (job.entityType === "clients" ? mapped.parentClientName : mapped.clientName)?.trim();
      if (clientName && !lookups.clientsByName.has(clientName.toLowerCase())) {
        if (!neededClients.has(clientName.toLowerCase())) {
          const parentClientName = (job.entityType === "time_entries" ? mapped.parentClientName?.trim() : undefined);
          neededClients.set(clientName.toLowerCase(), { name: clientName, parentClientName });
        }
      }
    }

    if (job.entityType === "time_entries") {
      const parentName = mapped.parentClientName?.trim();
      if (parentName && !lookups.clientsByName.has(parentName.toLowerCase())) {
        if (!neededClients.has(parentName.toLowerCase())) {
          neededClients.set(parentName.toLowerCase(), { name: parentName });
        }
      }
    }

    if (job.entityType === "tasks" || job.entityType === "time_entries") {
      const email = (job.entityType === "tasks" ? mapped.assigneeEmail : mapped.userEmail)?.trim();
      if (email && !lookups.usersByEmail.has(email.toLowerCase())) {
        if (!neededUsers.has(email.toLowerCase())) {
          neededUsers.set(email.toLowerCase(), {
            email,
            firstName: mapped.firstName?.trim(),
            lastName: mapped.lastName?.trim(),
            role: mapped.role?.trim(),
          });
        }
      }
    }

    if (job.entityType === "tasks" || job.entityType === "time_entries") {
      const projName = mapped.projectName?.trim();
      if (projName && !lookups.projectsByName.has(projName.toLowerCase())) {
        neededProjects.add(projName);
      }
    }
  }

  const parentClients = new Map<string, { name: string }>();
  for (const [key, info] of neededClients) {
    if (info.parentClientName) {
      const parentKey = info.parentClientName.toLowerCase();
      if (!lookups.clientsByName.has(parentKey) && !neededClients.has(parentKey)) {
        parentClients.set(parentKey, { name: info.parentClientName });
      }
    }
  }
  for (const [key, info] of parentClients) {
    neededClients.set(key, info);
  }

  const clientCreationOrder: { name: string; parentClientName?: string }[] = [];
  const withParent: typeof clientCreationOrder = [];
  for (const info of neededClients.values()) {
    if (info.parentClientName) {
      withParent.push(info);
    } else {
      clientCreationOrder.push(info);
    }
  }
  clientCreationOrder.push(...withParent);

  for (const info of clientCreationOrder) {
    if (lookups.clientsByName.has(info.name.toLowerCase())) continue;
    let parentClientId: string | null = null;
    if (info.parentClientName) {
      const parent = lookups.clientsByName.get(info.parentClientName.toLowerCase());
      if (parent) parentClientId = parent.id;
    }
    const [newClient] = await db.insert(clients).values({
      tenantId: lookups.tenantId,
      workspaceId: lookups.workspaceId,
      companyName: info.name,
      parentClientId,
      status: "active",
    }).returning({ id: clients.id, companyName: clients.companyName, parentClientId: clients.parentClientId });
    lookups.clientsByName.set(info.name.toLowerCase(), newClient);
    clientsCreated++;
  }

  for (const [, info] of neededUsers) {
    if (lookups.usersByEmail.has(info.email.toLowerCase())) continue;
    const firstName = info.firstName || info.email.split("@")[0];
    const lastName = info.lastName || "";
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const role = (info.role === "admin" || info.role === "manager" || info.role === "contractor") ? info.role : "employee";
    try {
      const result = await db.insert(users).values({
        tenantId: lookups.tenantId,
        email: info.email.toLowerCase(),
        name: fullName,
        firstName,
        lastName,
        role,
        isActive: true,
      }).onConflictDoNothing({ target: users.email }).returning({ id: users.id, email: users.email, role: users.role });
      if (result.length > 0) {
        lookups.usersByEmail.set(info.email.toLowerCase(), result[0]);
        usersCreated++;
      } else {
        const [existing] = await db.select({ id: users.id, email: users.email, role: users.role })
          .from(users).where(eq(users.email, info.email.toLowerCase()));
        if (existing) {
          lookups.usersByEmail.set(info.email.toLowerCase(), existing);
        }
      }
    } catch (err: any) {
      if (err?.code === "23505") {
        const [existing] = await db.select({ id: users.id, email: users.email, role: users.role })
          .from(users).where(eq(users.email, info.email.toLowerCase()));
        if (existing) {
          lookups.usersByEmail.set(info.email.toLowerCase(), existing);
        }
      } else {
        throw err;
      }
    }
  }

  for (const projName of neededProjects) {
    if (lookups.projectsByName.has(projName.toLowerCase())) continue;
    const [newProject] = await db.insert(projects).values({
      tenantId: lookups.tenantId,
      workspaceId: lookups.workspaceId,
      name: projName,
      status: "active",
      color: "#3B82F6",
    }).returning({ id: projects.id, name: projects.name, clientId: projects.clientId });
    lookups.projectsByName.set(projName.toLowerCase(), newProject);
    projectsCreated++;
  }

  return { clientsCreated, usersCreated, projectsCreated };
}

export async function executeJob(job: ImportJob): Promise<ImportSummary> {
  const lookups = await buildLookups(job.tenantId);
  const startTime = Date.now();
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, failed: 0, durationMs: 0, errors: [] };
  const errorRows: Array<{ row: number; primaryKey: string; errorCode: string; message: string }> = [];

  if (job.autoCreateMissing) {
    const deps = await autoCreateMissingDeps(job, lookups);
    summary.created += deps.clientsCreated + deps.usersCreated + deps.projectsCreated;
  }

  const BATCH_SIZE = 200;
  const total = job.rawRows.length;

  for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, total);

    for (let i = batchStart; i < batchEnd; i++) {
      const mapped = applyMapping(job.rawRows[i], job.mapping);
      const rowNum = i + 2;

      try {
        const result = await importRow(job.entityType, mapped, rowNum, lookups);
        if (result.error) {
          summary.failed++;
          summary.errors.push(result.error);
          errorRows.push({ row: rowNum, primaryKey: getPrimaryKeyForRow(job.entityType, mapped), errorCode: result.error.code, message: result.error.message });
        } else if (result.action === "skip") {
          summary.skipped++;
        } else if (result.action === "update") {
          summary.updated++;
        } else {
          summary.created++;
        }
      } catch (err: any) {
        summary.failed++;
        const error: ValidationError = { row: rowNum, code: "DB_ERROR", message: err?.message || "Database error" };
        summary.errors.push(error);
        errorRows.push({ row: rowNum, primaryKey: getPrimaryKeyForRow(job.entityType, mapped), errorCode: "DB_ERROR", message: err?.message || "Database error" });
      }
    }

    updateJob(job.id, { progress: { processed: batchEnd, total } });
  }

  summary.durationMs = Date.now() - startTime;
  updateJob(job.id, {
    status: summary.failed > 0 && summary.created === 0 ? "failed" : "completed",
    importSummary: summary,
    errorRows,
    progress: { processed: total, total },
  });

  return summary;
}

function getPrimaryKeyForRow(entityType: EntityType, mapped: Record<string, string>): string {
  switch (entityType) {
    case "clients": return mapped.companyName || "";
    case "projects": return mapped.name || "";
    case "tasks": return mapped.title || "";
    case "users":
    case "admins": return mapped.email || "";
    case "time_entries": return `${mapped.userEmail || mapped.userName || ""}@${mapped.startTime || ""}`;
    default: return "";
  }
}

async function importRow(entityType: EntityType, mapped: Record<string, string>, rowNum: number, lookups: TenantLookups): Promise<RowResult> {
  switch (entityType) {
    case "clients": return importClient(mapped, rowNum, lookups);
    case "projects": return importProject(mapped, rowNum, lookups);
    case "tasks": return importTask(mapped, rowNum, lookups);
    case "users": return importUser(mapped, rowNum, lookups, "employee");
    case "admins": return importUser(mapped, rowNum, lookups, "admin");
    case "time_entries": return importTimeEntry(mapped, rowNum, lookups);
    default: return { action: "skip", error: { row: rowNum, code: "UNKNOWN_TYPE", message: `Unknown entity type` } };
  }
}

async function importClient(m: Record<string, string>, row: number, lookups: TenantLookups): Promise<RowResult> {
  const companyName = m.companyName?.trim();
  if (!companyName) return { action: "skip", error: { row, field: "companyName", code: "REQUIRED", message: "Company name is required" } };

  if (lookups.clientsByName.has(companyName.toLowerCase())) return { action: "skip" };

  let parentClientId: string | null = null;
  if (m.parentClientName?.trim()) {
    let parent = lookups.clientsByName.get(m.parentClientName.trim().toLowerCase());
    if (!parent) {
      const [newParent] = await db.insert(clients).values({
        tenantId: lookups.tenantId,
        workspaceId: lookups.workspaceId,
        companyName: m.parentClientName.trim(),
        status: "active",
      }).returning({ id: clients.id, companyName: clients.companyName, parentClientId: clients.parentClientId });
      parent = newParent;
      lookups.clientsByName.set(m.parentClientName.trim().toLowerCase(), parent);
    }
    parentClientId = parent.id;
  }

  const [newClient] = await db.insert(clients).values({
    tenantId: lookups.tenantId,
    workspaceId: lookups.workspaceId,
    companyName,
    displayName: m.displayName?.trim() || null,
    industry: m.industry?.trim() || null,
    website: m.website?.trim() || null,
    phone: m.phone?.trim() || null,
    email: m.email?.trim() || null,
    status: m.status?.trim() || "active",
    notes: m.notes?.trim() || null,
    parentClientId,
    addressLine1: m.addressLine1?.trim() || null,
    addressLine2: m.addressLine2?.trim() || null,
    city: m.city?.trim() || null,
    state: m.state?.trim() || null,
    postalCode: m.postalCode?.trim() || null,
    country: m.country?.trim() || null,
  }).returning({ id: clients.id, companyName: clients.companyName, parentClientId: clients.parentClientId });
  lookups.clientsByName.set(companyName.toLowerCase(), newClient);
  return { action: "create" };
}

async function importProject(m: Record<string, string>, row: number, lookups: TenantLookups): Promise<RowResult> {
  const name = m.name?.trim();
  if (!name) return { action: "skip", error: { row, field: "name", code: "REQUIRED", message: "Project name is required" } };

  if (lookups.projectsByName.has(name.toLowerCase())) return { action: "skip" };

  let clientId: string | null = null;
  if (m.clientName?.trim()) {
    const client = lookups.clientsByName.get(m.clientName.trim().toLowerCase());
    if (client) clientId = client.id;
  }

  let budgetMinutes: number | null = null;
  if (m.budgetMinutes?.trim()) {
    const parsed = parseInt(m.budgetMinutes, 10);
    if (!isNaN(parsed)) budgetMinutes = parsed;
  }

  const [newProject] = await db.insert(projects).values({
    tenantId: lookups.tenantId,
    workspaceId: lookups.workspaceId,
    name,
    clientId,
    description: m.description?.trim() || null,
    status: m.status?.trim() || "active",
    color: m.color?.trim() || "#3B82F6",
    budgetMinutes,
  }).returning({ id: projects.id, name: projects.name, clientId: projects.clientId });
  lookups.projectsByName.set(name.toLowerCase(), newProject);
  return { action: "create" };
}

async function importTask(m: Record<string, string>, row: number, lookups: TenantLookups): Promise<RowResult> {
  const title = m.title?.trim();
  if (!title) return { action: "skip", error: { row, field: "title", code: "REQUIRED", message: "Task title is required" } };

  let projectId: string | null = null;
  if (m.projectName?.trim()) {
    const proj = lookups.projectsByName.get(m.projectName.trim().toLowerCase());
    if (!proj) return { action: "skip", error: { row, field: "projectName", code: "PROJECT_NOT_FOUND", message: `Project "${m.projectName}" not found` } };
    projectId = proj.id;
  }

  const key = `${projectId || "none"}::${title.toLowerCase()}`;
  if (lookups.tasksByKey.has(key)) return { action: "skip" };

  let dueDate: Date | null = null;
  if (m.dueDate?.trim()) {
    const d = new Date(m.dueDate);
    if (!isNaN(d.getTime())) dueDate = d;
  }

  let startDate: Date | null = null;
  if (m.startDate?.trim()) {
    const d = new Date(m.startDate);
    if (!isNaN(d.getTime())) startDate = d;
  }

  let estimateMinutes: number | null = null;
  if (m.estimateMinutes?.trim()) {
    const parsed = parseInt(m.estimateMinutes, 10);
    if (!isNaN(parsed)) estimateMinutes = parsed;
  }

  let parentTaskId: string | null = null;
  if (m.parentTaskTitle?.trim() && projectId) {
    const parentKey = `${projectId}::${m.parentTaskTitle.trim().toLowerCase()}`;
    const parent = lookups.tasksByKey.get(parentKey);
    if (parent) parentTaskId = parent.id;
  }

  const [newTask] = await db.insert(tasks).values({
    tenantId: lookups.tenantId,
    projectId,
    parentTaskId,
    title,
    description: m.description?.trim() || null,
    status: m.status?.trim() || "todo",
    priority: m.priority?.trim() || "medium",
    dueDate,
    startDate,
    estimateMinutes,
  }).returning({ id: tasks.id, title: tasks.title, projectId: tasks.projectId });
  lookups.tasksByKey.set(key, newTask);

  if (m.assigneeEmail?.trim()) {
    const assignee = lookups.usersByEmail.get(m.assigneeEmail.trim().toLowerCase());
    if (assignee) {
      const { taskAssignees } = await import("@shared/schema");
      await db.insert(taskAssignees).values({
        tenantId: lookups.tenantId,
        taskId: newTask.id,
        userId: assignee.id,
      }).onConflictDoNothing();
    }
  }

  return { action: "create" };
}

async function importUser(m: Record<string, string>, row: number, lookups: TenantLookups, defaultRole: string): Promise<RowResult> {
  const email = m.email?.trim().toLowerCase();
  if (!email) return { action: "skip", error: { row, field: "email", code: "REQUIRED", message: "Email is required" } };

  if (lookups.usersByEmail.has(email)) return { action: "skip" };

  const firstName = m.firstName?.trim() || email.split("@")[0];
  const lastName = m.lastName?.trim() || "";
  const fullName = m.name?.trim() || `${firstName} ${lastName}`.trim();
  const roleInput = m.role?.trim().toLowerCase() || defaultRole;
  const validRoles = ["employee", "admin", "manager", "contractor"];
  const role = validRoles.includes(roleInput) ? roleInput : defaultRole;

  try {
    const result = await db.insert(users).values({
      tenantId: lookups.tenantId,
      email,
      name: fullName,
      firstName,
      lastName,
      role,
      isActive: m.isActive?.trim().toLowerCase() !== "false",
    }).onConflictDoNothing({ target: users.email }).returning({ id: users.id, email: users.email, role: users.role });
    if (result.length > 0) {
      lookups.usersByEmail.set(email, result[0]);
      return { action: "create" };
    } else {
      const [existing] = await db.select({ id: users.id, email: users.email, role: users.role })
        .from(users).where(eq(users.email, email));
      if (existing) {
        lookups.usersByEmail.set(email, existing);
      }
      return { action: "skip" };
    }
  } catch (err: any) {
    if (err?.code === "23505") {
      const [existing] = await db.select({ id: users.id, email: users.email, role: users.role })
        .from(users).where(eq(users.email, email));
      if (existing) {
        lookups.usersByEmail.set(email, existing);
      }
      return { action: "skip" };
    }
    throw err;
  }
}

async function importTimeEntry(m: Record<string, string>, row: number, lookups: TenantLookups): Promise<RowResult> {
  const user = resolveUserForTimeEntry(m, lookups);
  if (!user) {
    const identifier = m.userEmail?.trim() || m.userName?.trim();
    return { action: "skip", error: { row, field: "userEmail", code: "USER_NOT_FOUND", message: `User "${identifier}" not found` } };
  }

  const startRaw = m.startTime?.trim() || m.date?.trim();
  if (!startRaw) return { action: "skip", error: { row, field: "startTime", code: "REQUIRED", message: "Start time or date is required" } };

  const startTime = new Date(startRaw);
  if (isNaN(startTime.getTime())) return { action: "skip", error: { row, field: "startTime", code: "INVALID_DATE", message: `Invalid start time` } };

  let endTime: Date | null = null;

  if (m.endTime?.trim()) {
    endTime = new Date(m.endTime);
    if (isNaN(endTime.getTime())) endTime = null;
    else if (endTime <= startTime) {
      return { action: "skip", error: { row, field: "endTime", code: "END_BEFORE_START", message: "End time before start time" } };
    }
  }

  const durationSeconds = computeDurationSeconds(m, startTime, endTime);

  if (!endTime && durationSeconds > 0) {
    endTime = new Date(startTime.getTime() + durationSeconds * 1000);
  }

  const endStr = endTime ? endTime.toISOString() : "none";
  const dedupKey = `${user.id}::${startTime.toISOString()}::${endStr}::${durationSeconds}`;
  if (lookups.existingTimeEntryKeys.has(dedupKey)) {
    return { action: "skip" };
  }

  let clientId: string | null = null;
  if (m.clientName?.trim()) {
    const client = lookups.clientsByName.get(m.clientName.trim().toLowerCase());
    if (client) {
      clientId = client.id;
      if (m.parentClientName?.trim() && !client.parentClientId) {
        const parentClient = lookups.clientsByName.get(m.parentClientName.trim().toLowerCase());
        if (parentClient) {
          await db.update(clients).set({ parentClientId: parentClient.id }).where(eq(clients.id, client.id));
          client.parentClientId = parentClient.id;
        }
      }
    }
  }

  let projectId: string | null = null;
  if (m.projectName?.trim()) {
    const proj = lookups.projectsByName.get(m.projectName.trim().toLowerCase());
    if (proj) projectId = proj.id;
  }

  let taskId: string | null = null;
  if (m.taskTitle?.trim()) {
    if (projectId) {
      const key = `${projectId}::${m.taskTitle.trim().toLowerCase()}`;
      const task = lookups.tasksByKey.get(key);
      if (task) taskId = task.id;
    }
    if (!taskId) {
      const task = lookups.tasksByTitle.get(m.taskTitle.trim().toLowerCase());
      if (task) taskId = task.id;
    }
  }

  const scope = m.scope?.trim().toLowerCase();
  let entryScope: string;
  if (scope === "internal" || scope === "out_of_scope") {
    entryScope = scope;
  } else if (scope === "true" || scope === "yes") {
    entryScope = "in_scope";
  } else if (scope === "false" || scope === "no") {
    entryScope = "out_of_scope";
  } else {
    entryScope = "in_scope";
  }

  await db.insert(timeEntries).values({
    tenantId: lookups.tenantId,
    workspaceId: lookups.workspaceId,
    userId: user.id,
    clientId,
    projectId,
    taskId,
    description: m.description?.trim() || null,
    scope: entryScope,
    startTime,
    endTime,
    durationSeconds,
    isManual: m.isManual?.trim() ? m.isManual.trim().toLowerCase() === "true" : true,
  });

  lookups.existingTimeEntryKeys.add(dedupKey);

  return { action: "create" };
}
