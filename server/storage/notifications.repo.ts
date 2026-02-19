import {
  type Notification, type InsertNotification,
  type NotificationPreferences, type InsertNotificationPreferences,
  notifications, notificationPreferences,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, isNull, sql } from "drizzle-orm";

export class NotificationsRepository {
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async getNotificationsByUser(userId: string, tenantId: string | null, options?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<Notification[]> {
    const { unreadOnly = false, limit = 50, offset = 0 } = options || {};
    
    try {
      const conditions = [eq(notifications.userId, userId)];
      
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      if (unreadOnly) {
        conditions.push(isNull(notifications.readAt));
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

  async getUnreadNotificationCount(userId: string, tenantId: string | null): Promise<number> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
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
        isNull(notifications.readAt)
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
          emailEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      throw error;
    }
  }
}
