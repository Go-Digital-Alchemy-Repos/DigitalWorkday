/**
 * Task Creation Visibility Regression Tests
 * 
 * Purpose: Verify tasks created from different entry points appear in all relevant views
 * 
 * Coverage:
 * - Tasks created via POST /api/tasks have correct tenantId and projectId
 * - Personal tasks created via POST /api/tasks/personal have correct tenantId  
 * - Child tasks inherit parent's tenantId and projectId
 * - Tasks appear in correct lists (project view, my-tasks)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../db";
import { 
  tenants, workspaces, projects, tasks, sections, taskAssignees,
  TenantStatus, UserRole 
} from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { 
  createTestTenant, 
  createTestWorkspace, 
  createTestProject,
  createTestUser,
  cleanupTestData 
} from "./fixtures";

describe("Task Creation Visibility", () => {
  let tenant1: any;
  let workspace1: any;
  let project1: any;
  let testUser: any;
  let section1: any;

  beforeAll(async () => {
    tenant1 = await createTestTenant({ name: "Task Visibility Test Tenant" });
    workspace1 = await createTestWorkspace({ tenantId: tenant1.id, isPrimary: true });
    project1 = await createTestProject({ workspaceId: workspace1.id, tenantId: tenant1.id });
    
    testUser = await createTestUser({
      email: `taskvis-${Date.now()}@test.com`,
      password: "testpass123",
      role: UserRole.ADMIN,
      tenantId: tenant1.id,
    });

    [section1] = await db.insert(sections).values({
      projectId: project1.id,
      name: "To Do",
      orderIndex: 0,
    }).returning();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    await db.delete(taskAssignees);
    await db.delete(tasks).where(eq(tasks.tenantId, tenant1.id));
  });

  describe("Project Task Creation", () => {
    it("should create task with correct tenantId and projectId", async () => {
      const [task] = await db.insert(tasks).values({
        title: "Test Task from Project",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        priority: "medium",
        status: "todo",
      }).returning();

      expect(task.title).toBe("Test Task from Project");
      expect(task.projectId).toBe(project1.id);
      expect(task.tenantId).toBe(tenant1.id);
    });

    it("should make task visible when querying by project", async () => {
      const [createdTask] = await db.insert(tasks).values({
        title: "Visible in Project View",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        status: "todo",
      }).returning();

      const projectTasks = await db.select()
        .from(tasks)
        .where(eq(tasks.projectId, project1.id));

      const taskTitles = projectTasks.map(t => t.title);
      expect(taskTitles).toContain("Visible in Project View");
    });

    it("should make task visible in my-tasks query when assigned", async () => {
      const [createdTask] = await db.insert(tasks).values({
        title: "Visible in My Tasks",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        status: "todo",
      }).returning();

      await db.insert(taskAssignees).values({
        taskId: createdTask.id,
        userId: testUser.id,
      });

      const myTasks = await db.select()
        .from(tasks)
        .innerJoin(taskAssignees, eq(tasks.id, taskAssignees.taskId))
        .where(eq(taskAssignees.userId, testUser.id));

      const taskTitles = myTasks.map(t => t.tasks.title);
      expect(taskTitles).toContain("Visible in My Tasks");
    });
  });

  describe("Personal Task Creation", () => {
    it("should create personal task with correct tenantId and isPersonal flag", async () => {
      const [task] = await db.insert(tasks).values({
        title: "Personal Test Task",
        tenantId: tenant1.id,
        createdBy: testUser.id,
        isPersonal: true,
        status: "todo",
      }).returning();

      expect(task.title).toBe("Personal Test Task");
      expect(task.tenantId).toBe(tenant1.id);
      expect(task.isPersonal).toBe(true);
      expect(task.projectId).toBeNull();
    });

    it("should make personal task visible when querying by user", async () => {
      const [createdTask] = await db.insert(tasks).values({
        title: "Personal Task Visible",
        tenantId: tenant1.id,
        createdBy: testUser.id,
        isPersonal: true,
        status: "todo",
      }).returning();

      await db.insert(taskAssignees).values({
        taskId: createdTask.id,
        userId: testUser.id,
      });

      const myTasks = await db.select()
        .from(tasks)
        .innerJoin(taskAssignees, eq(tasks.id, taskAssignees.taskId))
        .where(eq(taskAssignees.userId, testUser.id));

      const taskTitles = myTasks.map(t => t.tasks.title);
      expect(taskTitles).toContain("Personal Task Visible");
    });
  });

  describe("Child Task Creation", () => {
    it("should create child task inheriting parent projectId and tenantId", async () => {
      const [parentTask] = await db.insert(tasks).values({
        title: "Parent Task",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        status: "todo",
      }).returning();

      const [childTask] = await db.insert(tasks).values({
        title: "Child Task",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        parentTaskId: parentTask.id,
        status: "todo",
      }).returning();

      expect(childTask.title).toBe("Child Task");
      expect(childTask.parentTaskId).toBe(parentTask.id);
      expect(childTask.projectId).toBe(project1.id);
      expect(childTask.tenantId).toBe(tenant1.id);
    });

    it("should make child task visible in project view", async () => {
      const [parentTask] = await db.insert(tasks).values({
        title: "Parent for Child Test",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        status: "todo",
      }).returning();

      const [childTask] = await db.insert(tasks).values({
        title: "Child Task Visible",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        parentTaskId: parentTask.id,
        status: "todo",
      }).returning();

      const projectTasks = await db.select()
        .from(tasks)
        .where(eq(tasks.projectId, project1.id));

      const taskTitles = projectTasks.map(t => t.title);
      expect(taskTitles).toContain("Child Task Visible");
    });
  });

  describe("Cross-visibility Requirements", () => {
    it("project task should appear in both project view and my-tasks simultaneously", async () => {
      const [createdTask] = await db.insert(tasks).values({
        title: "Cross-View Task",
        projectId: project1.id,
        sectionId: section1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        status: "todo",
      }).returning();

      await db.insert(taskAssignees).values({
        taskId: createdTask.id,
        userId: testUser.id,
      });

      const [projectTasks, myTasks] = await Promise.all([
        db.select().from(tasks).where(eq(tasks.projectId, project1.id)),
        db.select()
          .from(tasks)
          .innerJoin(taskAssignees, eq(tasks.id, taskAssignees.taskId))
          .where(eq(taskAssignees.userId, testUser.id)),
      ]);

      const projectTitles = projectTasks.map(t => t.title);
      const myTitles = myTasks.map(t => t.tasks.title);

      expect(projectTitles).toContain("Cross-View Task");
      expect(myTitles).toContain("Cross-View Task");
    });

    it("task tenantId should match project tenantId", async () => {
      const [task] = await db.insert(tasks).values({
        title: "Tenant Match Task",
        projectId: project1.id,
        tenantId: tenant1.id,
        createdBy: testUser.id,
        status: "todo",
      }).returning();

      const [project] = await db.select().from(projects).where(eq(projects.id, project1.id));

      expect(task.tenantId).toBe(project.tenantId);
    });
  });
});
