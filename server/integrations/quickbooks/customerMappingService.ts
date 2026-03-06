import { db } from "../../db";
import { quickbooksCustomerMappings, quickbooksSyncLogs, clients } from "@shared/schema";
import { eq, and, sql, ilike, desc } from "drizzle-orm";
import { getQuickBooksCustomer } from "./quickbooksCustomerService";

export interface MappingListResult {
  id: string;
  clientId: string;
  clientName: string;
  quickbooksCustomerId: string | null;
  quickbooksDisplayName: string | null;
  mappingStatus: string;
  mappingMethod: string | null;
  mappingConfidence: string | null;
  isLocked: boolean;
  lastSyncedAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function logSyncAction(params: {
  tenantId: string;
  clientId?: string;
  mappingId?: string;
  quickbooksCustomerId?: string;
  action: string;
  status: string;
  message?: string;
  payload?: any;
  userId?: string;
}) {
  await db.insert(quickbooksSyncLogs).values({
    tenantId: params.tenantId,
    entityType: "client_mapping",
    clientId: params.clientId || null,
    mappingId: params.mappingId || null,
    quickbooksCustomerId: params.quickbooksCustomerId || null,
    action: params.action,
    status: params.status,
    message: params.message || null,
    payloadJson: params.payload || null,
    createdByUserId: params.userId || null,
  });
}

export async function getClientMapping(tenantId: string, clientId: string) {
  const [mapping] = await db.select()
    .from(quickbooksCustomerMappings)
    .where(and(
      eq(quickbooksCustomerMappings.tenantId, tenantId),
      eq(quickbooksCustomerMappings.clientId, clientId)
    ))
    .limit(1);

  return mapping || null;
}

export async function listClientMappings(tenantId: string, opts: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ mappings: MappingListResult[]; total: number }> {
  const limit = Math.min(opts.limit || 50, 100);
  const offset = opts.offset || 0;

  const tenantClients = await db.select({
    id: clients.id,
    companyName: clients.companyName,
  })
    .from(clients)
    .where(and(
      eq(clients.tenantId, tenantId),
      eq(clients.status, "active")
    ));

  if (tenantClients.length === 0) {
    return { mappings: [], total: 0 };
  }

  const clientIds = tenantClients.map(c => c.id);
  const clientNameMap = new Map(tenantClients.map(c => [c.id, c.companyName]));

  const allMappings = await db.select()
    .from(quickbooksCustomerMappings)
    .where(eq(quickbooksCustomerMappings.tenantId, tenantId));

  const mappingByClientId = new Map(allMappings.map(m => [m.clientId, m]));

  let results: MappingListResult[] = clientIds.map(clientId => {
    const mapping = mappingByClientId.get(clientId);
    return {
      id: mapping?.id || "",
      clientId,
      clientName: clientNameMap.get(clientId) || "",
      quickbooksCustomerId: mapping?.quickbooksCustomerId || null,
      quickbooksDisplayName: mapping?.quickbooksDisplayName || null,
      mappingStatus: mapping?.mappingStatus || "unmapped",
      mappingMethod: mapping?.mappingMethod || null,
      mappingConfidence: mapping?.mappingConfidence || null,
      isLocked: mapping?.isLocked || false,
      lastSyncedAt: mapping?.lastSyncedAt || null,
      lastSyncStatus: mapping?.lastSyncStatus || null,
      lastSyncError: mapping?.lastSyncError || null,
      createdAt: mapping?.createdAt || new Date(),
      updatedAt: mapping?.updatedAt || new Date(),
    };
  });

  if (opts.status) {
    results = results.filter(r => r.mappingStatus === opts.status);
  }
  if (opts.search) {
    const s = opts.search.toLowerCase();
    results = results.filter(r =>
      r.clientName.toLowerCase().includes(s) ||
      (r.quickbooksDisplayName && r.quickbooksDisplayName.toLowerCase().includes(s))
    );
  }

  const total = results.length;
  const paged = results.slice(offset, offset + limit);

  return { mappings: paged, total };
}

export async function linkClientToQuickBooksCustomer(params: {
  tenantId: string;
  clientId: string;
  quickbooksCustomerId: string;
  quickbooksDisplayName?: string;
  actingUserId: string;
  method?: string;
}): Promise<void> {
  const existingQb = await db.select()
    .from(quickbooksCustomerMappings)
    .where(and(
      eq(quickbooksCustomerMappings.tenantId, params.tenantId),
      eq(quickbooksCustomerMappings.quickbooksCustomerId, params.quickbooksCustomerId),
    ))
    .limit(1);

  if (existingQb.length > 0 && existingQb[0].clientId !== params.clientId && existingQb[0].mappingStatus !== "archived") {
    throw new Error("This QuickBooks customer is already mapped to another client in this tenant");
  }

  const existingMapping = await getClientMapping(params.tenantId, params.clientId);

  if (existingMapping?.isLocked) {
    throw new Error("This mapping is locked. Unlock it before remapping.");
  }

  const method = params.method || "manual";
  const now = new Date();

  if (existingMapping) {
    await db.update(quickbooksCustomerMappings)
      .set({
        quickbooksCustomerId: params.quickbooksCustomerId,
        quickbooksDisplayName: params.quickbooksDisplayName || null,
        mappingStatus: "mapped",
        mappingMethod: method,
        lastSyncedAt: now,
        lastSyncStatus: "success",
        lastSyncError: null,
        updatedByUserId: params.actingUserId,
        updatedAt: now,
      })
      .where(eq(quickbooksCustomerMappings.id, existingMapping.id));

    await logSyncAction({
      tenantId: params.tenantId,
      clientId: params.clientId,
      mappingId: existingMapping.id,
      quickbooksCustomerId: params.quickbooksCustomerId,
      action: "mapped",
      status: "success",
      message: `Linked to QBO customer ${params.quickbooksDisplayName || params.quickbooksCustomerId} via ${method}`,
      userId: params.actingUserId,
    });
  } else {
    const [inserted] = await db.insert(quickbooksCustomerMappings).values({
      tenantId: params.tenantId,
      clientId: params.clientId,
      quickbooksCustomerId: params.quickbooksCustomerId,
      quickbooksDisplayName: params.quickbooksDisplayName || null,
      mappingStatus: "mapped",
      mappingMethod: method,
      createdByUserId: params.actingUserId,
      updatedByUserId: params.actingUserId,
    }).returning();

    await logSyncAction({
      tenantId: params.tenantId,
      clientId: params.clientId,
      mappingId: inserted.id,
      quickbooksCustomerId: params.quickbooksCustomerId,
      action: "mapped",
      status: "success",
      message: `Linked to QBO customer ${params.quickbooksDisplayName || params.quickbooksCustomerId} via ${method}`,
      userId: params.actingUserId,
    });
  }
}

export async function unlinkClientMapping(params: {
  tenantId: string;
  clientId: string;
  actingUserId: string;
}): Promise<void> {
  const mapping = await getClientMapping(params.tenantId, params.clientId);
  if (!mapping) throw new Error("No mapping found for this client");
  if (mapping.isLocked) throw new Error("This mapping is locked. Unlock it before unlinking.");

  const now = new Date();
  await db.update(quickbooksCustomerMappings)
    .set({
      mappingStatus: "unmapped",
      quickbooksCustomerId: null,
      quickbooksDisplayName: null,
      mappingMethod: null,
      mappingConfidence: null,
      lastSyncStatus: null,
      lastSyncError: null,
      updatedByUserId: params.actingUserId,
      updatedAt: now,
    })
    .where(eq(quickbooksCustomerMappings.id, mapping.id));

  await logSyncAction({
    tenantId: params.tenantId,
    clientId: params.clientId,
    mappingId: mapping.id,
    quickbooksCustomerId: mapping.quickbooksCustomerId || undefined,
    action: "unmapped",
    status: "success",
    message: `Unlinked from QBO customer ${mapping.quickbooksDisplayName || mapping.quickbooksCustomerId}`,
    userId: params.actingUserId,
  });
}

export async function lockClientMapping(params: {
  tenantId: string;
  clientId: string;
  locked: boolean;
  actingUserId: string;
}): Promise<void> {
  const mapping = await getClientMapping(params.tenantId, params.clientId);
  if (!mapping) throw new Error("No mapping found for this client");

  await db.update(quickbooksCustomerMappings)
    .set({
      isLocked: params.locked,
      updatedByUserId: params.actingUserId,
      updatedAt: new Date(),
    })
    .where(eq(quickbooksCustomerMappings.id, mapping.id));

  await logSyncAction({
    tenantId: params.tenantId,
    clientId: params.clientId,
    mappingId: mapping.id,
    action: params.locked ? "locked" : "unlocked",
    status: "success",
    message: params.locked ? "Mapping locked" : "Mapping unlocked",
    userId: params.actingUserId,
  });
}

export async function refreshClientMappingStatus(params: {
  tenantId: string;
  clientId: string;
  actingUserId: string;
}): Promise<void> {
  const mapping = await getClientMapping(params.tenantId, params.clientId);
  if (!mapping || !mapping.quickbooksCustomerId) {
    throw new Error("No mapped QuickBooks customer found for this client");
  }

  try {
    const customer = await getQuickBooksCustomer(params.tenantId, mapping.quickbooksCustomerId);
    const now = new Date();

    if (!customer) {
      await db.update(quickbooksCustomerMappings)
        .set({
          mappingStatus: "sync_error",
          lastSyncedAt: now,
          lastSyncStatus: "error",
          lastSyncError: "QuickBooks customer not found or deleted",
          updatedAt: now,
        })
        .where(eq(quickbooksCustomerMappings.id, mapping.id));

      await logSyncAction({
        tenantId: params.tenantId,
        clientId: params.clientId,
        mappingId: mapping.id,
        quickbooksCustomerId: mapping.quickbooksCustomerId,
        action: "sync_failed",
        status: "error",
        message: "QuickBooks customer not found or deleted",
        userId: params.actingUserId,
      });
      return;
    }

    await db.update(quickbooksCustomerMappings)
      .set({
        quickbooksDisplayName: customer.displayName,
        lastSyncedAt: now,
        lastSyncStatus: "success",
        lastSyncError: null,
        mappingStatus: customer.active ? "mapped" : "sync_error",
        updatedAt: now,
      })
      .where(eq(quickbooksCustomerMappings.id, mapping.id));

    await logSyncAction({
      tenantId: params.tenantId,
      clientId: params.clientId,
      mappingId: mapping.id,
      quickbooksCustomerId: mapping.quickbooksCustomerId,
      action: "sync_updated",
      status: "success",
      message: `Synced with QBO customer: ${customer.displayName}`,
      payload: { active: customer.active },
      userId: params.actingUserId,
    });
  } catch (err: any) {
    const now = new Date();
    await db.update(quickbooksCustomerMappings)
      .set({
        mappingStatus: "sync_error",
        lastSyncedAt: now,
        lastSyncStatus: "error",
        lastSyncError: err.message || "Unknown sync error",
        updatedAt: now,
      })
      .where(eq(quickbooksCustomerMappings.id, mapping.id));

    await logSyncAction({
      tenantId: params.tenantId,
      clientId: params.clientId,
      mappingId: mapping.id,
      quickbooksCustomerId: mapping.quickbooksCustomerId || undefined,
      action: "sync_failed",
      status: "error",
      message: err.message || "Unknown sync error",
      userId: params.actingUserId,
    });
  }
}

export async function getMappingSyncLogs(tenantId: string, clientId?: string, limit = 20) {
  const conditions = [eq(quickbooksSyncLogs.tenantId, tenantId)];
  if (clientId) {
    conditions.push(eq(quickbooksSyncLogs.clientId, clientId));
  }

  return db.select()
    .from(quickbooksSyncLogs)
    .where(and(...conditions))
    .orderBy(desc(quickbooksSyncLogs.createdAt))
    .limit(limit);
}
