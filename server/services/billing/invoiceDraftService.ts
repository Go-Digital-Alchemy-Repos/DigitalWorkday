import { db } from "../../db";
import { invoiceDrafts, invoiceDraftItems, timeEntries, users, tasks, projects, clients } from "@shared/schema";
import { eq, and, gte, lte, sql, isNull, ne } from "drizzle-orm";
import { AppError } from "../../lib/errors";

export interface GenerateDraftOptions {
  tenantId: string;
  clientId: string;
  projectId?: string | null;
  startDate: Date;
  endDate: Date;
  createdByUserId: string;
  defaultRate?: number;
  notes?: string;
}

export interface InvoiceDraftWithItems {
  id: string;
  tenantId: string;
  clientId: string | null;
  projectId: string | null;
  createdByUserId: string | null;
  status: string;
  totalHours: string;
  totalAmount: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  clientName?: string | null;
  projectName?: string | null;
  creatorName?: string | null;
  items: InvoiceDraftItemRow[];
}

export interface InvoiceDraftItemRow {
  id: string;
  invoiceDraftId: string;
  timeEntryId: string | null;
  taskId: string | null;
  description: string;
  hours: string;
  rate: string;
  amount: string;
}

export async function generateInvoiceDraft(opts: GenerateDraftOptions): Promise<InvoiceDraftWithItems> {
  const { tenantId, clientId, projectId, startDate, endDate, createdByUserId, defaultRate = 0, notes } = opts;

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const conditions = [
    eq(timeEntries.tenantId, tenantId),
    eq(timeEntries.clientId, clientId),
    eq(timeEntries.billingStatus, "approved"),
    gte(timeEntries.startTime, startDate),
    lte(timeEntries.startTime, endOfDay),
  ];

  if (projectId) {
    conditions.push(eq(timeEntries.projectId, projectId));
  }

  const entries = await db
    .select({
      id: timeEntries.id,
      taskId: timeEntries.taskId,
      title: timeEntries.title,
      description: timeEntries.description,
      durationSeconds: timeEntries.durationSeconds,
      taskTitle: tasks.title,
    })
    .from(timeEntries)
    .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .where(and(...conditions));

  if (entries.length === 0) {
    throw new AppError(404, "No approved billable time entries found for the specified criteria");
  }

  let totalSeconds = 0;
  for (const e of entries) {
    totalSeconds += e.durationSeconds;
  }
  const totalHours = totalSeconds / 3600;
  const totalAmount = totalHours * defaultRate;

  const [draft] = await db
    .insert(invoiceDrafts)
    .values({
      tenantId,
      clientId,
      projectId: projectId || null,
      createdByUserId,
      status: "draft",
      totalHours: totalHours.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      notes: notes || null,
    })
    .returning();

  const itemValues = entries.map((e) => {
    const hours = e.durationSeconds / 3600;
    const amount = hours * defaultRate;
    const description = e.description || e.taskTitle || e.title || "Time entry";
    return {
      invoiceDraftId: draft.id,
      timeEntryId: e.id,
      taskId: e.taskId,
      description,
      hours: hours.toFixed(2),
      rate: defaultRate.toFixed(2),
      amount: amount.toFixed(2),
    };
  });

  const items = await db.insert(invoiceDraftItems).values(itemValues).returning();

  return {
    ...draft,
    items,
  };
}

export async function getInvoiceDrafts(tenantId: string): Promise<InvoiceDraftWithItems[]> {
  const drafts = await db
    .select({
      id: invoiceDrafts.id,
      tenantId: invoiceDrafts.tenantId,
      clientId: invoiceDrafts.clientId,
      projectId: invoiceDrafts.projectId,
      createdByUserId: invoiceDrafts.createdByUserId,
      status: invoiceDrafts.status,
      totalHours: invoiceDrafts.totalHours,
      totalAmount: invoiceDrafts.totalAmount,
      notes: invoiceDrafts.notes,
      createdAt: invoiceDrafts.createdAt,
      updatedAt: invoiceDrafts.updatedAt,
      clientName: clients.name,
      projectName: projects.name,
      creatorName: sql<string | null>`concat(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(invoiceDrafts)
    .leftJoin(clients, eq(invoiceDrafts.clientId, clients.id))
    .leftJoin(projects, eq(invoiceDrafts.projectId, projects.id))
    .leftJoin(users, eq(invoiceDrafts.createdByUserId, users.id))
    .where(eq(invoiceDrafts.tenantId, tenantId))
    .orderBy(sql`${invoiceDrafts.createdAt} DESC`);

  const result: InvoiceDraftWithItems[] = [];
  for (const draft of drafts) {
    const items = await db
      .select()
      .from(invoiceDraftItems)
      .where(eq(invoiceDraftItems.invoiceDraftId, draft.id));
    result.push({ ...draft, items });
  }

  return result;
}

export async function getInvoiceDraftById(id: string, tenantId: string): Promise<InvoiceDraftWithItems | null> {
  const [draft] = await db
    .select({
      id: invoiceDrafts.id,
      tenantId: invoiceDrafts.tenantId,
      clientId: invoiceDrafts.clientId,
      projectId: invoiceDrafts.projectId,
      createdByUserId: invoiceDrafts.createdByUserId,
      status: invoiceDrafts.status,
      totalHours: invoiceDrafts.totalHours,
      totalAmount: invoiceDrafts.totalAmount,
      notes: invoiceDrafts.notes,
      createdAt: invoiceDrafts.createdAt,
      updatedAt: invoiceDrafts.updatedAt,
      clientName: clients.name,
      projectName: projects.name,
      creatorName: sql<string | null>`concat(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(invoiceDrafts)
    .leftJoin(clients, eq(invoiceDrafts.clientId, clients.id))
    .leftJoin(projects, eq(invoiceDrafts.projectId, projects.id))
    .leftJoin(users, eq(invoiceDrafts.createdByUserId, users.id))
    .where(and(eq(invoiceDrafts.id, id), eq(invoiceDrafts.tenantId, tenantId)));

  if (!draft) return null;

  const items = await db
    .select()
    .from(invoiceDraftItems)
    .where(eq(invoiceDraftItems.invoiceDraftId, draft.id));

  return { ...draft, items };
}

export async function exportInvoiceDraft(
  draftId: string,
  tenantId: string
): Promise<{ updated: number }> {
  const draft = await getInvoiceDraftById(draftId, tenantId);
  if (!draft) throw new AppError(404, "Invoice draft not found");
  if (draft.status !== "draft") {
    throw new AppError(400, `Cannot export a draft with status "${draft.status}"`);
  }

  await db
    .update(invoiceDrafts)
    .set({ status: "exported", updatedAt: new Date() })
    .where(and(eq(invoiceDrafts.id, draftId), eq(invoiceDrafts.tenantId, tenantId)));

  const timeEntryIds = draft.items
    .map((i) => i.timeEntryId)
    .filter((id): id is string => !!id);

  let updatedCount = 0;
  if (timeEntryIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const result = await db
      .update(timeEntries)
      .set({ billingStatus: "invoiced", updatedAt: new Date() })
      .where(
        and(
          inArray(timeEntries.id, timeEntryIds),
          eq(timeEntries.tenantId, tenantId)
        )
      );
    updatedCount = (result as any).rowCount ?? timeEntryIds.length;
  }

  return { updated: updatedCount };
}

export async function cancelInvoiceDraft(
  draftId: string,
  tenantId: string
): Promise<void> {
  const [draft] = await db
    .select({ status: invoiceDrafts.status })
    .from(invoiceDrafts)
    .where(and(eq(invoiceDrafts.id, draftId), eq(invoiceDrafts.tenantId, tenantId)));

  if (!draft) throw new AppError(404, "Invoice draft not found");
  if (draft.status !== "draft") {
    throw new AppError(400, `Cannot cancel a draft with status "${draft.status}"`);
  }

  await db
    .update(invoiceDrafts)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(invoiceDrafts.id, draftId), eq(invoiceDrafts.tenantId, tenantId)));
}
