import {
  type SupportTicket, type InsertSupportTicket,
  type SupportTicketMessage, type InsertSupportTicketMessage,
  type SupportTicketEvent,
  type SupportCannedReply, type InsertSupportCannedReply,
  type SupportMacro, type InsertSupportMacro,
  type SlaPolicy, type InsertSlaPolicy,
  type TicketFormSchema,
  supportTickets, supportTicketMessages, supportTicketEvents,
  supportCannedReplies, supportMacros,
  supportSlaPolicies, supportTicketFormSchemas,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, asc, inArray, isNull, sql, ilike } from "drizzle-orm";

export class SupportRepository {
  async getSupportTicket(id: string): Promise<SupportTicket | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return ticket || undefined;
  }

  async getSupportTicketsByTenant(
    tenantId: string,
    filters?: { status?: string; priority?: string; category?: string; search?: string; clientId?: string; assignedToUserId?: string; limit?: number; offset?: number }
  ): Promise<{ tickets: SupportTicket[]; total: number }> {
    const conditions = [eq(supportTickets.tenantId, tenantId)];
    if (filters?.status) {
      const statuses = filters.status.split(",").map(s => s.trim());
      if (statuses.length === 1) {
        conditions.push(eq(supportTickets.status, statuses[0]));
      } else {
        conditions.push(inArray(supportTickets.status, statuses));
      }
    }
    if (filters?.priority) conditions.push(eq(supportTickets.priority, filters.priority));
    if (filters?.category) conditions.push(eq(supportTickets.category, filters.category));
    if (filters?.clientId) conditions.push(eq(supportTickets.clientId, filters.clientId));
    if (filters?.assignedToUserId) conditions.push(eq(supportTickets.assignedToUserId, filters.assignedToUserId));
    if (filters?.search) {
      conditions.push(ilike(supportTickets.title, `%${filters.search}%`));
    }

    const whereClause = and(...conditions);
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(supportTickets).where(whereClause);
    const total = Number(countResult?.count || 0);

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(whereClause)
      .orderBy(desc(supportTickets.lastActivityAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    return { tickets, total };
  }

  async getSupportTicketsByClient(
    tenantId: string,
    clientId: string,
    filters?: { status?: string; limit?: number; offset?: number }
  ): Promise<{ tickets: SupportTicket[]; total: number }> {
    const conditions = [
      eq(supportTickets.tenantId, tenantId),
      eq(supportTickets.clientId, clientId),
    ];
    if (filters?.status) conditions.push(eq(supportTickets.status, filters.status));

    const whereClause = and(...conditions);
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(supportTickets).where(whereClause);
    const total = Number(countResult?.count || 0);

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(whereClause)
      .orderBy(desc(supportTickets.lastActivityAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    return { tickets, total };
  }

  async createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket> {
    const [created] = await db.insert(supportTickets).values(ticket).returning();
    return created;
  }

  async updateSupportTicket(id: string, tenantId: string, updates: Partial<InsertSupportTicket>): Promise<SupportTicket | undefined> {
    const [updated] = await db
      .update(supportTickets)
      .set({ ...updates, updatedAt: new Date(), lastActivityAt: new Date() })
      .where(and(eq(supportTickets.id, id), eq(supportTickets.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async getSupportTicketMessages(ticketId: string, tenantId: string, includeInternal?: boolean): Promise<SupportTicketMessage[]> {
    const conditions = [
      eq(supportTicketMessages.ticketId, ticketId),
      eq(supportTicketMessages.tenantId, tenantId),
    ];
    if (!includeInternal) {
      conditions.push(eq(supportTicketMessages.visibility, "public"));
    }
    return db
      .select()
      .from(supportTicketMessages)
      .where(and(...conditions))
      .orderBy(asc(supportTicketMessages.createdAt));
  }

  async createSupportTicketMessage(message: InsertSupportTicketMessage): Promise<SupportTicketMessage> {
    const [created] = await db.insert(supportTicketMessages).values(message).returning();
    await db
      .update(supportTickets)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(supportTickets.id, message.ticketId));
    return created;
  }

  async getSupportTicketEvents(ticketId: string, tenantId: string): Promise<SupportTicketEvent[]> {
    return db
      .select()
      .from(supportTicketEvents)
      .where(and(eq(supportTicketEvents.ticketId, ticketId), eq(supportTicketEvents.tenantId, tenantId)))
      .orderBy(asc(supportTicketEvents.createdAt));
  }

  async createSupportTicketEvent(event: {
    tenantId: string;
    ticketId: string;
    actorType: string;
    actorUserId?: string | null;
    actorPortalUserId?: string | null;
    eventType: string;
    payloadJson?: unknown;
  }): Promise<SupportTicketEvent> {
    const [created] = await db.insert(supportTicketEvents).values({
      tenantId: event.tenantId,
      ticketId: event.ticketId,
      actorType: event.actorType,
      actorUserId: event.actorUserId || null,
      actorPortalUserId: event.actorPortalUserId || null,
      eventType: event.eventType,
      payloadJson: event.payloadJson || null,
    }).returning();
    return created;
  }

  async getSupportCannedReplies(tenantId: string, workspaceId?: string | null): Promise<SupportCannedReply[]> {
    const conditions = [eq(supportCannedReplies.tenantId, tenantId)];
    if (workspaceId) {
      conditions.push(eq(supportCannedReplies.workspaceId, workspaceId));
    }
    return db.select().from(supportCannedReplies).where(and(...conditions)).orderBy(desc(supportCannedReplies.updatedAt));
  }

  async getSupportCannedReply(id: string, tenantId: string): Promise<SupportCannedReply | undefined> {
    const [reply] = await db.select().from(supportCannedReplies).where(and(eq(supportCannedReplies.id, id), eq(supportCannedReplies.tenantId, tenantId)));
    return reply || undefined;
  }

  async createSupportCannedReply(reply: InsertSupportCannedReply): Promise<SupportCannedReply> {
    const [created] = await db.insert(supportCannedReplies).values(reply).returning();
    return created;
  }

  async updateSupportCannedReply(id: string, tenantId: string, updates: Partial<InsertSupportCannedReply>): Promise<SupportCannedReply | undefined> {
    const [updated] = await db.update(supportCannedReplies).set({ ...updates, updatedAt: new Date() }).where(and(eq(supportCannedReplies.id, id), eq(supportCannedReplies.tenantId, tenantId))).returning();
    return updated || undefined;
  }

  async deleteSupportCannedReply(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(supportCannedReplies).where(and(eq(supportCannedReplies.id, id), eq(supportCannedReplies.tenantId, tenantId))).returning();
    return result.length > 0;
  }

  async getSupportMacros(tenantId: string, workspaceId?: string | null): Promise<SupportMacro[]> {
    const conditions = [eq(supportMacros.tenantId, tenantId)];
    if (workspaceId) {
      conditions.push(eq(supportMacros.workspaceId, workspaceId));
    }
    return db.select().from(supportMacros).where(and(...conditions)).orderBy(desc(supportMacros.updatedAt));
  }

  async getSupportMacro(id: string, tenantId: string): Promise<SupportMacro | undefined> {
    const [macro] = await db.select().from(supportMacros).where(and(eq(supportMacros.id, id), eq(supportMacros.tenantId, tenantId)));
    return macro || undefined;
  }

  async createSupportMacro(macro: InsertSupportMacro): Promise<SupportMacro> {
    const [created] = await db.insert(supportMacros).values(macro).returning();
    return created;
  }

  async updateSupportMacro(id: string, tenantId: string, updates: Partial<InsertSupportMacro>): Promise<SupportMacro | undefined> {
    const [updated] = await db.update(supportMacros).set({ ...updates, updatedAt: new Date() }).where(and(eq(supportMacros.id, id), eq(supportMacros.tenantId, tenantId))).returning();
    return updated || undefined;
  }

  async deleteSupportMacro(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(supportMacros).where(and(eq(supportMacros.id, id), eq(supportMacros.tenantId, tenantId))).returning();
    return result.length > 0;
  }

  async getSlaPolicies(tenantId: string, workspaceId?: string | null): Promise<SlaPolicy[]> {
    const conditions = [eq(supportSlaPolicies.tenantId, tenantId)];
    if (workspaceId) {
      conditions.push(eq(supportSlaPolicies.workspaceId, workspaceId));
    }
    return db.select().from(supportSlaPolicies).where(and(...conditions)).orderBy(supportSlaPolicies.priority);
  }

  async getSlaPolicy(id: string, tenantId: string): Promise<SlaPolicy | undefined> {
    const [policy] = await db.select().from(supportSlaPolicies).where(and(eq(supportSlaPolicies.id, id), eq(supportSlaPolicies.tenantId, tenantId)));
    return policy || undefined;
  }

  async getApplicableSlaPolicy(tenantId: string, priority: string, category?: string | null, workspaceId?: string | null): Promise<SlaPolicy | undefined> {
    if (workspaceId && category) {
      const [p] = await db.select().from(supportSlaPolicies).where(and(
        eq(supportSlaPolicies.tenantId, tenantId),
        eq(supportSlaPolicies.workspaceId, workspaceId),
        eq(supportSlaPolicies.category, category),
        eq(supportSlaPolicies.priority, priority)
      ));
      if (p) return p;
    }
    if (category) {
      const [p] = await db.select().from(supportSlaPolicies).where(and(
        eq(supportSlaPolicies.tenantId, tenantId),
        isNull(supportSlaPolicies.workspaceId),
        eq(supportSlaPolicies.category, category),
        eq(supportSlaPolicies.priority, priority)
      ));
      if (p) return p;
    }
    const [p] = await db.select().from(supportSlaPolicies).where(and(
      eq(supportSlaPolicies.tenantId, tenantId),
      isNull(supportSlaPolicies.workspaceId),
      isNull(supportSlaPolicies.category),
      eq(supportSlaPolicies.priority, priority)
    ));
    return p || undefined;
  }

  async createSlaPolicy(policy: InsertSlaPolicy): Promise<SlaPolicy> {
    const [created] = await db.insert(supportSlaPolicies).values(policy).returning();
    return created;
  }

  async updateSlaPolicy(id: string, tenantId: string, updates: Partial<InsertSlaPolicy>): Promise<SlaPolicy | undefined> {
    const [updated] = await db.update(supportSlaPolicies).set({ ...updates, updatedAt: new Date() }).where(and(eq(supportSlaPolicies.id, id), eq(supportSlaPolicies.tenantId, tenantId))).returning();
    return updated || undefined;
  }

  async deleteSlaPolicy(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(supportSlaPolicies).where(and(eq(supportSlaPolicies.id, id), eq(supportSlaPolicies.tenantId, tenantId))).returning();
    return result.length > 0;
  }

  async getOpenTicketsForSlaCheck(tenantId?: string): Promise<SupportTicket[]> {
    const conditions = [
      sql`${supportTickets.status} IN ('open', 'in_progress', 'waiting_on_client')`,
    ];
    if (tenantId) {
      conditions.push(eq(supportTickets.tenantId, tenantId));
    }
    return db.select().from(supportTickets).where(and(...conditions));
  }

  async setTicketFirstResponse(ticketId: string, tenantId: string, timestamp: Date): Promise<void> {
    await db.update(supportTickets).set({ firstResponseAt: timestamp, updatedAt: new Date() }).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.tenantId, tenantId)));
  }

  async setTicketSlaBreached(ticketId: string, tenantId: string, field: 'firstResponseBreachedAt' | 'resolutionBreachedAt', timestamp: Date): Promise<void> {
    await db.update(supportTickets).set({ [field]: timestamp, updatedAt: new Date() }).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.tenantId, tenantId)));
  }

  async getTicketFormSchemas(tenantId: string, workspaceId?: string | null): Promise<TicketFormSchema[]> {
    const conditions = [eq(supportTicketFormSchemas.tenantId, tenantId)];
    if (workspaceId) {
      conditions.push(eq(supportTicketFormSchemas.workspaceId, workspaceId));
    }
    return db.select().from(supportTicketFormSchemas).where(and(...conditions)).orderBy(supportTicketFormSchemas.category);
  }

  async getTicketFormSchema(tenantId: string, category: string, workspaceId?: string | null): Promise<TicketFormSchema | undefined> {
    const conditions = [
      eq(supportTicketFormSchemas.tenantId, tenantId),
      eq(supportTicketFormSchemas.category, category),
    ];
    if (workspaceId) {
      conditions.push(eq(supportTicketFormSchemas.workspaceId, workspaceId));
    } else {
      conditions.push(isNull(supportTicketFormSchemas.workspaceId));
    }
    const [schema] = await db.select().from(supportTicketFormSchemas).where(and(...conditions));
    return schema || undefined;
  }

  async upsertTicketFormSchema(tenantId: string, category: string, schemaJson: unknown, workspaceId?: string | null): Promise<TicketFormSchema> {
    const existing = await this.getTicketFormSchema(tenantId, category, workspaceId);
    if (existing) {
      const [updated] = await db.update(supportTicketFormSchemas).set({ schemaJson, updatedAt: new Date() }).where(eq(supportTicketFormSchemas.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(supportTicketFormSchemas).values({
      tenantId,
      category,
      schemaJson,
      workspaceId: workspaceId || null,
    }).returning();
    return created;
  }

  async deleteTicketFormSchema(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(supportTicketFormSchemas).where(and(eq(supportTicketFormSchemas.id, id), eq(supportTicketFormSchemas.tenantId, tenantId))).returning();
    return result.length > 0;
  }
}
