import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { clients, users, timeEntries, projects, tasks } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { recordTenantAuditEvent } from '../../superAdmin';

export const exportImportRouter = Router();

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map(row => row.map(escapeCsvField).join(","));
  return [headerLine, ...dataLines].join("\n");
}

exportImportRouter.get("/tenants/:tenantId/export/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
    
    const headers = ["companyName", "displayName", "industry", "website", "phone", "email", "status", "notes", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"];
    const rows = tenantClients.map(c => [
      c.companyName,
      c.displayName,
      c.industry,
      c.website,
      c.phone,
      c.email,
      c.status,
      c.notes,
      c.addressLine1,
      c.addressLine2,
      c.city,
      c.state,
      c.postalCode,
      c.country,
    ]);
    
    const csv = generateCsv(headers, rows);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-clients.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[export] Failed to export clients:", error);
    res.status(500).json({ error: "Failed to export clients" });
  }
});

exportImportRouter.get("/tenants/:tenantId/export/users", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
    
    const headers = ["email", "firstName", "lastName", "name", "role", "isActive"];
    const rows = tenantUsers.map(u => [
      u.email,
      u.firstName,
      u.lastName,
      u.name,
      u.role,
      u.isActive ? "true" : "false",
    ]);
    
    const csv = generateCsv(headers, rows);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-users.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[export] Failed to export users:", error);
    res.status(500).json({ error: "Failed to export users" });
  }
});

exportImportRouter.get("/tenants/:tenantId/export/time-entries", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const entries = await db.select({
      entry: timeEntries,
      userName: users.name,
      userEmail: users.email,
      clientName: clients.companyName,
      projectName: projects.name,
      taskTitle: tasks.title,
    })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .where(eq(timeEntries.tenantId, tenantId))
      .orderBy(desc(timeEntries.startTime));
    
    const headers = ["userEmail", "userName", "clientName", "projectName", "taskTitle", "description", "scope", "startTime", "endTime", "durationSeconds", "isManual"];
    const rows = entries.map(e => [
      e.userEmail,
      e.userName,
      e.clientName,
      e.projectName,
      e.taskTitle,
      e.entry.description,
      e.entry.scope,
      e.entry.startTime?.toISOString(),
      e.entry.endTime?.toISOString(),
      e.entry.durationSeconds,
      e.entry.isManual ? "true" : "false",
    ]);
    
    const csv = generateCsv(headers, rows);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-time-entries.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[export] Failed to export time entries:", error);
    res.status(500).json({ error: "Failed to export time entries" });
  }
});

exportImportRouter.post("/tenants/:tenantId/import/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { rows } = req.body as { rows: Array<Record<string, string>> };
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data to import" });
    }
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
    
    const results: Array<{ name: string; status: "created" | "skipped" | "error"; reason?: string }> = [];
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const row of rows) {
      const companyName = row.companyName?.trim();
      if (!companyName) {
        results.push({ name: "(empty)", status: "skipped", reason: "Missing company name" });
        skipped++;
        continue;
      }
      
      const existing = await db.select().from(clients)
        .where(and(
          eq(clients.tenantId, tenantId),
          eq(clients.companyName, companyName)
        ));
      
      if (existing.length > 0) {
        results.push({ name: companyName, status: "skipped", reason: "Client already exists" });
        skipped++;
        continue;
      }
      
      try {
        await db.insert(clients).values({
          tenantId,
          workspaceId: primaryWorkspaceId,
          companyName,
          displayName: row.displayName?.trim() || null,
          industry: row.industry?.trim() || null,
          website: row.website?.trim() || null,
          phone: row.phone?.trim() || null,
          email: row.email?.trim() || null,
          status: row.status?.trim() || "active",
          notes: row.notes?.trim() || null,
          addressLine1: row.addressLine1?.trim() || null,
          addressLine2: row.addressLine2?.trim() || null,
          city: row.city?.trim() || null,
          state: row.state?.trim() || null,
          postalCode: row.postalCode?.trim() || null,
          country: row.country?.trim() || null,
        });
        results.push({ name: companyName, status: "created" });
        created++;
      } catch (err) {
        console.error(`[import] Failed to create client ${companyName}:`, err);
        results.push({ name: companyName, status: "error", reason: "Database error" });
        errors++;
      }
    }
    
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "clients_imported",
      `Imported ${created} clients (${skipped} skipped, ${errors} errors)`,
      superUser?.id,
      { created, skipped, errors }
    );
    
    res.json({ created, skipped, errors, results });
  } catch (error) {
    console.error("[import] Failed to import clients:", error);
    res.status(500).json({ error: "Failed to import clients" });
  }
});

exportImportRouter.post("/tenants/:tenantId/import/time-entries", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { rows, matchBy } = req.body as { 
      rows: Array<Record<string, string>>; 
      matchBy?: { client?: "name"; project?: "name"; user?: "email" } 
    };
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data to import" });
    }
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
    
    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
    const usersByEmail = new Map(tenantUsers.map(u => [u.email.toLowerCase(), u]));
    
    const tenantClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
    const clientsByName = new Map(tenantClients.map(c => [c.companyName.toLowerCase(), c]));
    
    const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
    const projectsByName = new Map(tenantProjects.map(p => [p.name.toLowerCase(), p]));
    
    const results: Array<{ name: string; status: "created" | "skipped" | "error"; reason?: string }> = [];
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const row of rows) {
      const userEmail = row.userEmail?.trim().toLowerCase();
      const user = userEmail ? usersByEmail.get(userEmail) : null;
      
      if (!user) {
        results.push({ name: `Entry for ${userEmail || "unknown"}`, status: "skipped", reason: "User not found" });
        skipped++;
        continue;
      }
      
      const clientName = row.clientName?.trim().toLowerCase();
      const client = clientName ? clientsByName.get(clientName) : null;
      
      const projectName = row.projectName?.trim().toLowerCase();
      const project = projectName ? projectsByName.get(projectName) : null;
      
      const startTimeStr = row.startTime?.trim();
      const endTimeStr = row.endTime?.trim();
      
      if (!startTimeStr) {
        results.push({ name: `Entry for ${userEmail}`, status: "skipped", reason: "Missing start time" });
        skipped++;
        continue;
      }
      
      const startTime = new Date(startTimeStr);
      const endTime = endTimeStr ? new Date(endTimeStr) : null;
      
      if (isNaN(startTime.getTime())) {
        results.push({ name: `Entry for ${userEmail}`, status: "skipped", reason: "Invalid start time" });
        skipped++;
        continue;
      }
      
      let durationSeconds = parseInt(row.durationSeconds || "0", 10);
      if (isNaN(durationSeconds) && endTime && !isNaN(endTime.getTime())) {
        durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      }
      
      try {
        await db.insert(timeEntries).values({
          tenantId,
          workspaceId: primaryWorkspaceId,
          userId: user.id,
          clientId: client?.id || null,
          projectId: project?.id || null,
          taskId: null,
          description: row.description?.trim() || null,
          scope: row.scope?.trim() || "in_scope",
          startTime,
          endTime,
          durationSeconds: durationSeconds || 0,
          isManual: row.isManual?.toLowerCase() === "true",
        });
        results.push({ name: `${startTimeStr} - ${user.email}`, status: "created" });
        created++;
      } catch (err) {
        console.error(`[import] Failed to create time entry:`, err);
        results.push({ name: `${startTimeStr} - ${user.email}`, status: "error", reason: "Database error" });
        errors++;
      }
    }
    
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "time_entries_imported",
      `Imported ${created} time entries (${skipped} skipped, ${errors} errors)`,
      superUser?.id,
      { created, skipped, errors }
    );
    
    res.json({ created, skipped, errors, results });
  } catch (error) {
    console.error("[import] Failed to import time entries:", error);
    res.status(500).json({ error: "Failed to import time entries" });
  }
});

const userClientSummaryRowSchema = z.object({
  userEmail: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.string().optional(),
  clientName: z.string().min(1),
  parentClientName: z.string().optional(),
  billableHours: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Must be a non-negative number"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().optional(),
  scope: z.string().optional(),
});

const userClientSummaryImportSchema = z.object({
  rows: z.array(z.record(z.string())).min(1, "At least one row is required"),
});

exportImportRouter.post("/tenants/:tenantId/import/user-client-summary", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const parsed = userClientSummaryImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }
    
    const { rows } = parsed.data;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);
    
    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
    const usersByEmail = new Map(tenantUsers.map(u => [u.email.toLowerCase(), u]));
    
    const tenantClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
    const clientsByName = new Map(tenantClients.map(c => [c.companyName.toLowerCase(), c]));
    
    const results: Array<{ name: string; status: "created" | "skipped" | "error"; reason?: string }> = [];
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    const validRoles = ["employee", "admin", "manager", "contractor"];
    
    for (const row of rows) {
      const userEmail = row.userEmail?.trim().toLowerCase();
      const clientName = row.clientName?.trim();
      const parentClientName = row.parentClientName?.trim();
      const billableHoursStr = row.billableHours?.trim();
      
      if (!userEmail || !clientName || !billableHoursStr) {
        results.push({ 
          name: `${userEmail || "unknown"} - ${clientName || "unknown"}`, 
          status: "skipped", 
          reason: "Missing required fields (userEmail, clientName, or billableHours)" 
        });
        skipped++;
        continue;
      }
      
      const billableHours = parseFloat(billableHoursStr);
      if (isNaN(billableHours) || billableHours < 0) {
        results.push({ 
          name: `${userEmail} - ${clientName}`, 
          status: "skipped", 
          reason: "Invalid billable hours value" 
        });
        skipped++;
        continue;
      }
      
      try {
        let user = usersByEmail.get(userEmail);
        if (!user) {
          const firstName = row.firstName?.trim() || userEmail.split("@")[0];
          const lastName = row.lastName?.trim() || "";
          const roleInput = row.role?.trim().toLowerCase() || "employee";
          const role = validRoles.includes(roleInput) ? roleInput : "employee";
          
          const [newUser] = await db.insert(users).values({
            tenantId,
            email: userEmail,
            firstName,
            lastName,
            role,
            status: "pending",
          }).returning();
          
          user = newUser;
          usersByEmail.set(userEmail, user);
        }
        
        let parentClient = null;
        if (parentClientName) {
          parentClient = clientsByName.get(parentClientName.toLowerCase());
          if (!parentClient) {
            const [newParent] = await db.insert(clients).values({
              tenantId,
              workspaceId: primaryWorkspaceId,
              companyName: parentClientName,
              status: "active",
            }).returning();
            parentClient = newParent;
            clientsByName.set(parentClientName.toLowerCase(), parentClient);
          }
        }
        
        let client = clientsByName.get(clientName.toLowerCase());
        if (!client) {
          const [newClient] = await db.insert(clients).values({
            tenantId,
            workspaceId: primaryWorkspaceId,
            companyName: clientName,
            parentClientId: parentClient?.id || null,
            status: "active",
          }).returning();
          client = newClient;
          clientsByName.set(clientName.toLowerCase(), client);
        } else if (parentClient && client.parentClientId !== parentClient.id) {
          const [updatedClient] = await db.update(clients)
            .set({ parentClientId: parentClient.id })
            .where(eq(clients.id, client.id))
            .returning();
          client = updatedClient;
          clientsByName.set(clientName.toLowerCase(), client);
        }
        
        const startTimeStr = row.startTime?.trim();
        const endTimeStr = row.endTime?.trim();
        
        let startTime: Date;
        let endTime: Date;
        let durationSeconds: number;
        
        if (startTimeStr) {
          startTime = new Date(startTimeStr);
          if (isNaN(startTime.getTime())) {
            results.push({ 
              name: `${userEmail} - ${clientName}`, 
              status: "skipped", 
              reason: "Invalid startTime date format" 
            });
            skipped++;
            continue;
          }
        } else {
          startTime = new Date();
        }
        
        if (endTimeStr) {
          endTime = new Date(endTimeStr);
          if (isNaN(endTime.getTime())) {
            results.push({ 
              name: `${userEmail} - ${clientName}`, 
              status: "skipped", 
              reason: "Invalid endTime date format" 
            });
            skipped++;
            continue;
          }
          if (endTime <= startTime) {
            results.push({ 
              name: `${userEmail} - ${clientName}`, 
              status: "skipped", 
              reason: "endTime must be after startTime" 
            });
            skipped++;
            continue;
          }
          durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        } else {
          durationSeconds = Math.round(billableHours * 3600);
          endTime = new Date(startTime.getTime() + durationSeconds * 1000);
        }
        
        const scope = row.scope?.trim().toLowerCase();
        const entryScope = scope === "internal" || scope === "out_of_scope" ? scope : "in_scope";
        
        await db.insert(timeEntries).values({
          tenantId,
          workspaceId: primaryWorkspaceId,
          userId: user.id,
          clientId: client.id,
          projectId: null,
          taskId: null,
          description: row.description?.trim() || `Billable hours for ${clientName}`,
          scope: entryScope,
          startTime,
          endTime,
          durationSeconds,
          isManual: true,
        });
        
        results.push({ 
          name: `${userEmail} - ${clientName} (${billableHours}h)`, 
          status: "created" 
        });
        created++;
      } catch (err) {
        console.error(`[import] Failed to import user-client summary row:`, err);
        results.push({ 
          name: `${userEmail} - ${clientName}`, 
          status: "error", 
          reason: "Database error" 
        });
        errors++;
      }
    }
    
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "user_client_summary_imported",
      `Imported ${created} user-client summary entries (${skipped} skipped, ${errors} errors)`,
      superUser?.id,
      { created, skipped, errors }
    );
    
    res.json({ created, skipped, errors, results });
  } catch (error) {
    console.error("[import] Failed to import user-client summary:", error);
    res.status(500).json({ error: "Failed to import user-client summary" });
  }
});
