import {
  type Notification, type InsertNotification,
  type NotificationPreferences, type InsertNotificationPreferences,
  notifications, notificationPreferences,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, isNull, sql, lt, ne, inArray, gte } from "drizzle-orm";
import { getGroupPolicy, buildGroupMeta, isGroupingEnabled, type GroupMeta } from "../features/notifications/notificationGrouping";

export interface NotificationQueryOptions {
  unreadOnly?: boolean;
  typeFilter?: string;
  limit?: number;
  cursor?: string;
  offset?: number;
}

export interface PaginatedNotifications {
  items: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class NotificationsRepository {
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async createOrDedupeNotification(
    notification: InsertNotification,
    coalesceMeta?: { actorId?: string; actorName?: string; entityId?: string; messagePreview?: string }
  ): Promise<Notification> {
    if (notification.dedupeKey && notification.tenantId && notification.userId) {
      const policy = getGroupPolicy(notification.type);
      const shouldCoalesce = isGroupingEnabled() && policy.allowCoalesce;

      const windowConditions = [
        eq(notifications.tenantId, notification.tenantId),
        eq(notifications.userId, notification.userId),
        eq(notifications.dedupeKey, notification.dedupeKey),
        eq(notifications.isDismissed, false),
      ];

      if (shouldCoalesce && policy.windowMinutes > 0) {
        const windowStart = new Date(Date.now() - policy.windowMinutes * 60 * 1000);
        windowConditions.push(gte(notifications.lastEventAt, windowStart));
      }

      const [existing] = await db.select()
        .from(notifications)
        .where(and(...windowConditions))
        .orderBy(desc(notifications.lastEventAt))
        .limit(1);

      if (existing && shouldCoalesce) {
        const now = new Date();
        const existingMeta = (existing.groupMeta as GroupMeta) || null;
        const updatedMeta = buildGroupMeta(
          existingMeta,
          coalesceMeta?.actorId,
          coalesceMeta?.actorName,
          coalesceMeta?.entityId,
          coalesceMeta?.messagePreview
        );

        const [updated] = await db.update(notifications)
          .set({
            title: notification.title,
            message: notification.message,
            payloadJson: notification.payloadJson,
            readAt: null,
            lastEventAt: now,
            eventCount: sql`${notifications.eventCount} + 1`,
            groupMeta: updatedMeta as Record<string, unknown>,
          })
          .where(eq(notifications.id, existing.id))
          .returning();
        return updated;
      } else if (existing && !shouldCoalesce) {
        const [updated] = await db.update(notifications)
          .set({
            title: notification.title,
            message: notification.message,
            payloadJson: notification.payloadJson,
            readAt: null,
            createdAt: new Date(),
            lastEventAt: new Date(),
          })
          .where(eq(notifications.id, existing.id))
          .returning();
        return updated;
      }
    }

    const insertData = {
      ...notification,
      eventCount: 1,
      lastEventAt: new Date(),
      groupMeta: coalesceMeta
        ? (buildGroupMeta(null, coalesceMeta.actorId, coalesceMeta.actorName, coalesceMeta.entityId, coalesceMeta.messagePreview) as Record<string, unknown>)
        : null,
    };
    return this.createNotification(insertData);
  }

  async getNotificationsByUser(userId: string, tenantId: string | null, options?: NotificationQueryOptions): Promise<Notification[]> {
    const { unreadOnly = false, limit = 50, offset = 0 } = options || {};
    
    try {
      const conditions = [
        eq(notifications.userId, userId),
        eq(notifications.isDismissed, false),
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      if (unreadOnly) {
        conditions.push(isNull(notifications.readAt));
      }

      if (options?.typeFilter) {
        const types = options.typeFilter.split(",");
        if (types.length === 1) {
          conditions.push(eq(notifications.type, types[0]));
        } else {
          conditions.push(inArray(notifications.type, types));
        }
      }
      
      return db.select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] notifications query failed (schema issue) - returning empty array:", message);
        return [];
      }
      throw error;
    }
  }

  async getNotificationsByUserPaginated(userId: string, tenantId: string | null, options?: NotificationQueryOptions): Promise<PaginatedNotifications> {
    const { unreadOnly = false, limit = 30, cursor, typeFilter } = options || {};
    
    try {
      const conditions = [
        eq(notifications.userId, userId),
        eq(notifications.isDismissed, false),
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      if (unreadOnly) {
        conditions.push(isNull(notifications.readAt));
      }

      if (typeFilter) {
        const types = typeFilter.split(",");
        if (types.length === 1) {
          conditions.push(eq(notifications.type, types[0]));
        } else {
          conditions.push(inArray(notifications.type, types));
        }
      }

      if (cursor) {
        conditions.push(lt(notifications.createdAt, new Date(cursor)));
      }

      const fetchLimit = limit + 1;
      const items = await db.select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(fetchLimit);

      const hasMore = items.length > limit;
      const resultItems = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore && resultItems.length > 0
        ? resultItems[resultItems.length - 1].createdAt.toISOString()
        : null;

      return { items: resultItems, nextCursor, hasMore };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] paginated notifications query failed (schema issue):", message);
        return { items: [], nextCursor: null, hasMore: false };
      }
      throw error;
    }
  }

  async getUnreadNotificationCount(userId: string, tenantId: string | null): Promise<number> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        eq(notifications.isDismissed, false),
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(...conditions));
      return result?.count ?? 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] unread count query failed (schema issue) - returning 0:", message);
        return 0;
      }
      throw error;
    }
  }

  async markNotificationRead(id: string, userId: string, tenantId: string | null): Promise<Notification | undefined> {
    try {
      const conditions = [
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      const [updated] = await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions))
        .returning();
      return updated || undefined;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] markNotificationRead failed (schema issue):", message);
        return undefined;
      }
      throw error;
    }
  }

  async markAllNotificationsRead(userId: string, tenantId: string | null): Promise<void> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        eq(notifications.isDismissed, false),
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] markAllNotificationsRead failed (schema issue):", message);
        return;
      }
      throw error;
    }
  }

  async dismissNotification(id: string, userId: string, tenantId: string | null): Promise<Notification | undefined> {
    try {
      const conditions = [
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      const [updated] = await db.update(notifications)
        .set({ isDismissed: true, readAt: new Date() })
        .where(and(...conditions))
        .returning();
      return updated || undefined;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] dismissNotification failed (schema issue):", message);
        return undefined;
      }
      throw error;
    }
  }

  async dismissAllNotifications(userId: string, tenantId: string | null): Promise<void> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        eq(notifications.isDismissed, false),
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      await db.update(notifications)
        .set({ isDismissed: true, readAt: new Date() })
        .where(and(...conditions));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] dismissAllNotifications failed (schema issue):", message);
        return;
      }
      throw error;
    }
  }

  async markGroupRead(dedupeKey: string, userId: string, tenantId: string | null): Promise<number> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        eq(notifications.dedupeKey, dedupeKey),
        eq(notifications.isDismissed, false),
        isNull(notifications.readAt),
      ];
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      const result = await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions))
        .returning();
      return result.length;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist")) {
        return 0;
      }
      throw error;
    }
  }

  async dismissGroup(dedupeKey: string, userId: string, tenantId: string | null): Promise<number> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        eq(notifications.dedupeKey, dedupeKey),
        eq(notifications.isDismissed, false),
      ];
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      const result = await db.update(notifications)
        .set({ isDismissed: true, readAt: new Date() })
        .where(and(...conditions))
        .returning();
      return result.length;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist")) {
        return 0;
      }
      throw error;
    }
  }

  async deleteNotification(id: string, userId: string, tenantId: string | null): Promise<void> {
    try {
      const conditions = [
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
    
      await db.delete(notifications)
        .where(and(...conditions));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] deleteNotification failed (schema issue):", message);
        return;
      }
      throw error;
    }
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    try {
      const [prefs] = await db.select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));
      return prefs || undefined;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("relation") && message.includes("does not exist")) {
        console.warn("[storage] notification_preferences table does not exist - returning undefined");
        return undefined;
      }
      throw error;
    }
  }

  async upsertNotificationPreferences(userId: string, prefs: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    try {
      const existing = await this.getNotificationPreferences(userId);
      
      if (existing) {
        const [updated] = await db.update(notificationPreferences)
          .set({ ...prefs, updatedAt: new Date() })
          .where(eq(notificationPreferences.userId, userId))
          .returning();
        return updated;
      }
      
      const [created] = await db.insert(notificationPreferences)
        .values({ userId, ...prefs })
        .returning();
      return created;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("relation") && message.includes("does not exist")) {
        console.warn("[storage] notification_preferences table does not exist - returning defaults");
        return {
          id: "default",
          tenantId: prefs.tenantId || null,
          userId,
          taskDeadline: true,
          taskAssigned: true,
          taskCompleted: true,
          commentAdded: true,
          commentMention: true,
          projectUpdate: true,
          projectMemberAdded: true,
          taskStatusChanged: true,
          chatMessage: true,
          clientMessage: true,
          supportTicket: true,
          workOrder: true,
          emailEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      throw error;
    }
  }
}
