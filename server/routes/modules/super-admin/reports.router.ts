import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { tenants, TenantStatus, UserRole, users, projects, tasks, timeEntries, tenantAgreements, tenantSettings, invitations, taskAssignees } from '@shared/schema';
import { eq, count, gte, lt, isNotNull, ne, desc, and, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';

export const reportsRouter = Router();

reportsRouter.get("/reports/tenants-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const totalResult = await db.select({ count: count() }).from(tenants);
    const total = totalResult[0]?.count || 0;
    
    const activeResult = await db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.ACTIVE));
    const active = activeResult[0]?.count || 0;
    
    const inactiveResult = await db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.INACTIVE));
    const inactive = inactiveResult[0]?.count || 0;
    
    const suspendedResult = await db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.SUSPENDED));
    const suspended = suspendedResult[0]?.count || 0;
    
    const recentResult = await db.select({ count: count() })
      .from(tenants)
      .where(gte(tenants.createdAt, sevenDaysAgo));
    const recentlyCreated = recentResult[0]?.count || 0;
    
    const allTenantIds = await db.select({ id: tenants.id }).from(tenants);
    const tenantsWithAgreements = await db.select({ tenantId: tenantAgreements.tenantId })
      .from(tenantAgreements)
      .where(eq(tenantAgreements.status, "active"));
    const tenantIdsWithAgreements = new Set(tenantsWithAgreements.map(t => t.tenantId));
    const missingAgreement = allTenantIds.filter(t => !tenantIdsWithAgreements.has(t.id)).length;
    
    const tenantsWithBranding = await db.select({ tenantId: tenantSettings.tenantId })
      .from(tenantSettings)
      .where(isNotNull(tenantSettings.logoUrl));
    const tenantIdsWithBranding = new Set(tenantsWithBranding.map(t => t.tenantId));
    const missingBranding = allTenantIds.filter(t => !tenantIdsWithBranding.has(t.id)).length;
    
    const tenantsWithAdmin = await db.select({ tenantId: users.tenantId })
      .from(users)
      .where(and(
        eq(users.role, UserRole.ADMIN),
        isNotNull(users.tenantId)
      ));
    const tenantIdsWithAdmin = new Set(tenantsWithAdmin.map(t => t.tenantId));
    const missingAdminUser = allTenantIds.filter(t => !tenantIdsWithAdmin.has(t.id)).length;
    
    res.json({
      total,
      active,
      inactive,
      suspended,
      missingAgreement,
      missingBranding,
      missingAdminUser,
      recentlyCreated,
    });
  } catch (error) {
    console.error("[reports] Failed to get tenants summary:", error);
    res.status(500).json({ error: "Failed to get tenants summary" });
  }
});

reportsRouter.get("/reports/projects-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    
    const totalResult = await db.select({ count: count() }).from(projects);
    const total = totalResult[0]?.count || 0;
    
    const activeResult = await db.select({ count: count() })
      .from(projects)
      .where(eq(projects.status, "active"));
    const active = activeResult[0]?.count || 0;
    
    const archivedResult = await db.select({ count: count() })
      .from(projects)
      .where(eq(projects.status, "archived"));
    const archived = archivedResult[0]?.count || 0;
    
    const projectsWithOverdue = await db.select({ projectId: tasks.projectId })
      .from(tasks)
      .where(and(
        isNotNull(tasks.projectId),
        lt(tasks.dueDate, now),
        ne(tasks.status, "done")
      ))
      .groupBy(tasks.projectId);
    const withOverdueTasks = projectsWithOverdue.length;
    
    const topTenants = await db.select({
      tenantId: projects.tenantId,
      projectCount: count(),
    })
      .from(projects)
      .where(isNotNull(projects.tenantId))
      .groupBy(projects.tenantId)
      .orderBy(desc(count()))
      .limit(5);
    
    const topTenantsWithNames = await Promise.all(topTenants.map(async (t) => {
      const [tenant] = await db.select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, t.tenantId!))
        .limit(1);
      return {
        tenantId: t.tenantId,
        tenantName: tenant?.name || "Unknown",
        projectCount: t.projectCount,
      };
    }));
    
    res.json({
      total,
      active,
      archived,
      withOverdueTasks,
      topTenantsByProjects: topTenantsWithNames,
    });
  } catch (error) {
    console.error("[reports] Failed to get projects summary:", error);
    res.status(500).json({ error: "Failed to get projects summary" });
  }
});

reportsRouter.get("/reports/users-summary", requireSuperUser, async (req, res) => {
  try {
    const totalResult = await db.select({ count: count() }).from(users);
    const total = totalResult[0]?.count || 0;
    
    const activeResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.isActive, true));
    const activeUsers = activeResult[0]?.count || 0;
    
    const superUserResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.SUPER_USER));
    const superUserCount = superUserResult[0]?.count || 0;
    
    const adminResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.ADMIN));
    const adminCount = adminResult[0]?.count || 0;
    
    const employeeResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.EMPLOYEE));
    const employeeCount = employeeResult[0]?.count || 0;
    
    const clientResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.CLIENT));
    const clientCount = clientResult[0]?.count || 0;
    
    const pendingInvitesResult = await db.select({ count: count() })
      .from(invitations)
      .where(eq(invitations.status, "pending"));
    const pendingInvites = pendingInvitesResult[0]?.count || 0;
    
    res.json({
      total,
      byRole: {
        super_user: superUserCount,
        admin: adminCount,
        employee: employeeCount,
        client: clientCount,
      },
      activeUsers,
      pendingInvites,
    });
  } catch (error) {
    console.error("[reports] Failed to get users summary:", error);
    res.status(500).json({ error: "Failed to get users summary" });
  }
});

reportsRouter.get("/reports/tasks-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const totalResult = await db.select({ count: count() }).from(tasks);
    const total = totalResult[0]?.count || 0;
    
    const todoResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "todo"));
    const todoCount = todoResult[0]?.count || 0;
    
    const inProgressResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "in_progress"));
    const inProgressCount = inProgressResult[0]?.count || 0;
    
    const blockedResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "blocked"));
    const blockedCount = blockedResult[0]?.count || 0;
    
    const doneResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "done"));
    const doneCount = doneResult[0]?.count || 0;
    
    const overdueResult = await db.select({ count: count() })
      .from(tasks)
      .where(and(
        lt(tasks.dueDate, now),
        ne(tasks.status, "done")
      ));
    const overdue = overdueResult[0]?.count || 0;
    
    const dueTodayResult = await db.select({ count: count() })
      .from(tasks)
      .where(and(
        gte(tasks.dueDate, startOfToday),
        lt(tasks.dueDate, endOfToday),
        ne(tasks.status, "done")
      ));
    const dueToday = dueTodayResult[0]?.count || 0;
    
    const upcomingResult = await db.select({ count: count() })
      .from(tasks)
      .where(and(
        gte(tasks.dueDate, endOfToday),
        lt(tasks.dueDate, in7Days),
        ne(tasks.status, "done")
      ));
    const upcoming = upcomingResult[0]?.count || 0;
    
    const tasksWithAssignees = await db.select({ taskId: schema.taskAssignees.taskId })
      .from(schema.taskAssignees)
      .groupBy(schema.taskAssignees.taskId);
    const taskIdsWithAssignees = new Set(tasksWithAssignees.map(t => t.taskId));
    const allTaskIds = await db.select({ id: tasks.id }).from(tasks);
    const unassigned = allTaskIds.filter(t => !taskIdsWithAssignees.has(t.id)).length;
    
    res.json({
      total,
      byStatus: {
        todo: todoCount,
        in_progress: inProgressCount,
        blocked: blockedCount,
        done: doneCount,
      },
      overdue,
      dueToday,
      upcoming,
      unassigned,
    });
  } catch (error) {
    console.error("[reports] Failed to get tasks summary:", error);
    res.status(500).json({ error: "Failed to get tasks summary" });
  }
});

reportsRouter.get("/reports/time-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const weekResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)` 
    })
      .from(timeEntries)
      .where(gte(timeEntries.startTime, startOfWeek));
    const totalMinutesThisWeek = Math.round((weekResult[0]?.total || 0) / 60);
    
    const monthResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)` 
    })
      .from(timeEntries)
      .where(gte(timeEntries.startTime, startOfMonth));
    const totalMinutesThisMonth = Math.round((monthResult[0]?.total || 0) / 60);
    
    const topTenants = await db.select({
      tenantId: timeEntries.tenantId,
      totalSeconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`,
    })
      .from(timeEntries)
      .where(isNotNull(timeEntries.tenantId))
      .groupBy(timeEntries.tenantId)
      .orderBy(desc(sql`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`))
      .limit(5);
    
    const topTenantsByHours = await Promise.all(topTenants.map(async (t) => {
      const [tenant] = await db.select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, t.tenantId!))
        .limit(1);
      return {
        tenantId: t.tenantId,
        tenantName: tenant?.name || "Unknown",
        totalMinutes: Math.round(t.totalSeconds / 60),
      };
    }));
    
    const topUsers = await db.select({
      userId: timeEntries.userId,
      totalSeconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`,
    })
      .from(timeEntries)
      .groupBy(timeEntries.userId)
      .orderBy(desc(sql`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`))
      .limit(5);
    
    const topUsersByHours = await Promise.all(topUsers.map(async (u) => {
      const [user] = await db.select({ name: users.name })
        .from(users)
        .where(eq(users.id, u.userId))
        .limit(1);
      return {
        userId: u.userId,
        userName: user?.name || "Unknown",
        totalMinutes: Math.round(u.totalSeconds / 60),
      };
    }));
    
    res.json({
      totalMinutesThisWeek,
      totalMinutesThisMonth,
      topTenantsByHours,
      topUsersByHours,
    });
  } catch (error) {
    console.error("[reports] Failed to get time summary:", error);
    res.status(500).json({ error: "Failed to get time summary" });
  }
});
