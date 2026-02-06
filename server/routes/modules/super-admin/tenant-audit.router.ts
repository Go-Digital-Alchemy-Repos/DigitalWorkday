import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { tenantAuditEvents, users } from '@shared/schema';
import { eq, desc, inArray } from 'drizzle-orm';

export const tenantAuditRouter = Router();

tenantAuditRouter.get("/tenants/:tenantId/audit", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const events = await db.select()
      .from(tenantAuditEvents)
      .where(eq(tenantAuditEvents.tenantId, tenantId))
      .orderBy(desc(tenantAuditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const actorIds = Array.from(new Set(events.filter(e => e.actorUserId).map(e => e.actorUserId!)));
    const actorUsers = actorIds.length > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, actorIds))
      : [];
    const actorMap = new Map(actorUsers.map(u => [u.id, u]));

    const enrichedEvents = events.map(event => ({
      ...event,
      actor: event.actorUserId ? actorMap.get(event.actorUserId) || null : null,
    }));

    res.json({
      events: enrichedEvents,
      pagination: {
        limit,
        offset,
        hasMore: events.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching tenant audit events:", error);
    res.status(500).json({ error: "Failed to fetch audit events" });
  }
});
