import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

export const seedingRouter = Router();

const TASK_TEMPLATES: Record<string, { sections: Array<{ name: string; tasks: Array<{ title: string; description?: string; subtasks?: string[] }> }> }> = {
  client_onboarding: {
    sections: [
      {
        name: "Kickoff",
        tasks: [
          { title: "Schedule kickoff call", description: "Coordinate with client for initial meeting" },
          { title: "Send welcome packet", description: "Include project overview and contact info" },
          { title: "Collect client materials", description: "Gather logos, brand guidelines, and assets" },
        ],
      },
      {
        name: "Discovery",
        tasks: [
          { title: "Review client requirements", description: "Document all specifications" },
          { title: "Conduct stakeholder interviews" },
          { title: "Create project timeline", description: "Define milestones and deliverables" },
        ],
      },
      {
        name: "Delivery",
        tasks: [
          { title: "Complete deliverables" },
          { title: "Client review and feedback" },
          { title: "Final handoff", description: "Transfer all assets and documentation" },
        ],
      },
    ],
  },
  website_build: {
    sections: [
      {
        name: "Planning",
        tasks: [
          { title: "Define site structure", description: "Create sitemap and navigation flow" },
          { title: "Gather content requirements" },
          { title: "Review competitor sites" },
        ],
      },
      {
        name: "Design",
        tasks: [
          { title: "Create wireframes" },
          { title: "Design mockups", description: "Desktop and mobile versions" },
          { title: "Client design approval" },
        ],
      },
      {
        name: "Development",
        tasks: [
          { title: "Set up development environment" },
          { title: "Build pages and components" },
          { title: "Integrate CMS/backend" },
          { title: "Cross-browser testing" },
        ],
      },
      {
        name: "Launch",
        tasks: [
          { title: "Content migration" },
          { title: "SEO optimization" },
          { title: "Deploy to production" },
          { title: "Post-launch monitoring" },
        ],
      },
    ],
  },
  general_setup: {
    sections: [
      {
        name: "To Do",
        tasks: [
          { title: "Define project scope" },
          { title: "Assign team members" },
          { title: "Set project milestones" },
        ],
      },
      {
        name: "In Progress",
        tasks: [],
      },
      {
        name: "Review",
        tasks: [],
      },
      {
        name: "Done",
        tasks: [],
      },
    ],
  },
};

const WELCOME_PROJECT_TEMPLATE = {
  sections: [
    {
      name: "Getting Started",
      tasks: [
        {
          title: "Invite your team",
          description: "Add team members to collaborate on projects",
          subtasks: ["Add employees", "Add clients", "Assign roles"],
        },
        { title: "Create your first client", description: "Set up a client to organize projects" },
      ],
    },
    {
      name: "Your First Workflow",
      tasks: [
        { title: "Create your first project", description: "Projects organize tasks for a specific goal" },
        { title: "Add tasks and due dates", description: "Break down work into actionable items" },
      ],
    },
    {
      name: "Next Steps",
      tasks: [
        { title: "Track time and run reports", description: "Monitor progress and generate insights" },
        { title: "Explore advanced features", description: "Discover templates, automations, and more" },
      ],
    },
  ],
};

const taskTemplateSchema = z.object({
  templateKey: z.enum(["client_onboarding", "website_build", "general_setup"]),
});

seedingRouter.post("/tenants/:tenantId/seed/welcome-project", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const user = req.user as Express.User;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const requestId = req.headers["x-request-id"] as string | undefined;
    const primaryWorkspaceId = await storage.getPrimaryWorkspaceIdOrFail(tenantId, requestId);

    const welcomeProjectName = `Welcome to ${tenant.name}`;
    const existingProjects = await db.select()
      .from(schema.projects)
      .where(and(
        eq(schema.projects.workspaceId, primaryWorkspaceId),
        eq(schema.projects.name, welcomeProjectName)
      ));

    if (existingProjects.length > 0) {
      return res.json({
        status: "skipped",
        projectId: existingProjects[0].id,
        reason: "Welcome project already exists",
      });
    }

    const [project] = await db.insert(schema.projects).values({
      tenantId,
      workspaceId: primaryWorkspaceId,
      name: welcomeProjectName,
      description: "Your introduction to the platform",
      status: "active",
      color: "#10B981",
      createdBy: user.id,
    }).returning();

    let createdTasks = 0;
    let createdSubtasks = 0;

    for (let sIdx = 0; sIdx < WELCOME_PROJECT_TEMPLATE.sections.length; sIdx++) {
      const sectionTemplate = WELCOME_PROJECT_TEMPLATE.sections[sIdx];
      
      const [section] = await db.insert(schema.sections).values({
        projectId: project.id,
        name: sectionTemplate.name,
        orderIndex: sIdx,
      }).returning();

      for (let tIdx = 0; tIdx < sectionTemplate.tasks.length; tIdx++) {
        const taskTemplate = sectionTemplate.tasks[tIdx];
        
        const [task] = await db.insert(schema.tasks).values({
          tenantId,
          projectId: project.id,
          sectionId: section.id,
          title: taskTemplate.title,
          description: taskTemplate.description,
          status: "todo",
          priority: "medium",
          createdBy: user.id,
          orderIndex: tIdx,
        }).returning();
        createdTasks++;

        if (taskTemplate.subtasks && taskTemplate.subtasks.length > 0) {
          for (let stIdx = 0; stIdx < taskTemplate.subtasks.length; stIdx++) {
            await db.insert(schema.subtasks).values({
              taskId: task.id,
              title: taskTemplate.subtasks[stIdx],
              completed: false,
              orderIndex: stIdx,
            });
            createdSubtasks++;
          }
        }
      }
    }

    await db.insert(schema.tenantAuditEvents).values({
      tenantId,
      actorUserId: user.id,
      eventType: "welcome_project_seeded",
      message: `Welcome project created with ${createdTasks} tasks and ${createdSubtasks} subtasks`,
      metadata: { projectId: project.id, projectName: welcomeProjectName, createdTasks, createdSubtasks },
    });

    res.json({
      status: "created",
      projectId: project.id,
      created: {
        sections: WELCOME_PROJECT_TEMPLATE.sections.length,
        tasks: createdTasks,
        subtasks: createdSubtasks,
      },
    });
  } catch (error) {
    console.error("[seed] Welcome project seed failed:", error);
    res.status(500).json({ error: "Failed to seed welcome project" });
  }
});

seedingRouter.post("/tenants/:tenantId/projects/:projectId/seed/task-template", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;
    const user = req.user as Express.User;
    const data = taskTemplateSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [project] = await db.select()
      .from(schema.projects)
      .where(and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.tenantId, tenantId)
      ));

    if (!project) {
      return res.status(404).json({ error: "Project not found or does not belong to tenant" });
    }

    const template = TASK_TEMPLATES[data.templateKey];
    if (!template) {
      return res.status(400).json({ error: "Unknown template key" });
    }

    const existingSections = await db.select()
      .from(schema.sections)
      .where(eq(schema.sections.projectId, projectId));
    const existingSectionNames = new Set(existingSections.map(s => s.name.toLowerCase()));

    const existingTasks = await db.select()
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId));
    const existingTaskTitles = new Map<string, Set<string>>();
    for (const task of existingTasks) {
      const sectionId = task.sectionId || "none";
      if (!existingTaskTitles.has(sectionId)) {
        existingTaskTitles.set(sectionId, new Set());
      }
      existingTaskTitles.get(sectionId)!.add(task.title.toLowerCase());
    }

    let createdSections = 0;
    let createdTasks = 0;
    let createdSubtasks = 0;
    let skippedTasks = 0;

    const sectionMaxOrder = existingSections.length;

    for (let sIdx = 0; sIdx < template.sections.length; sIdx++) {
      const sectionTemplate = template.sections[sIdx];
      
      let section: typeof existingSections[0] | undefined;
      
      if (existingSectionNames.has(sectionTemplate.name.toLowerCase())) {
        section = existingSections.find(s => s.name.toLowerCase() === sectionTemplate.name.toLowerCase());
      } else {
        const [newSection] = await db.insert(schema.sections).values({
          projectId,
          name: sectionTemplate.name,
          orderIndex: sectionMaxOrder + sIdx,
        }).returning();
        section = newSection;
        createdSections++;
      }

      if (!section) continue;

      const taskTitlesInSection = existingTaskTitles.get(section.id) || new Set();
      const tasksInSection = existingTasks.filter(t => t.sectionId === section!.id);
      let taskOrderIndex = tasksInSection.length;

      for (const taskTemplate of sectionTemplate.tasks) {
        if (taskTitlesInSection.has(taskTemplate.title.toLowerCase())) {
          skippedTasks++;
          continue;
        }

        const [task] = await db.insert(schema.tasks).values({
          tenantId,
          projectId,
          sectionId: section.id,
          title: taskTemplate.title,
          description: taskTemplate.description,
          status: "todo",
          priority: "medium",
          createdBy: user.id,
          orderIndex: taskOrderIndex++,
        }).returning();
        createdTasks++;

        if (taskTemplate.subtasks && taskTemplate.subtasks.length > 0) {
          for (let stIdx = 0; stIdx < taskTemplate.subtasks.length; stIdx++) {
            await db.insert(schema.subtasks).values({
              taskId: task.id,
              title: taskTemplate.subtasks[stIdx],
              completed: false,
              orderIndex: stIdx,
            });
            createdSubtasks++;
          }
        }
      }
    }

    await db.insert(schema.tenantAuditEvents).values({
      tenantId,
      actorUserId: user.id,
      eventType: "task_template_applied",
      message: `Template "${data.templateKey}" applied: ${createdSections} sections, ${createdTasks} tasks, ${createdSubtasks} subtasks created`,
      metadata: { projectId, templateKey: data.templateKey, createdSections, createdTasks, createdSubtasks, skippedTasks },
    });

    res.json({
      status: createdTasks > 0 || createdSections > 0 ? "applied" : "skipped",
      created: { sections: createdSections, tasks: createdTasks, subtasks: createdSubtasks },
      skipped: { tasks: skippedTasks },
      reason: createdTasks === 0 && createdSections === 0 ? "All template items already exist" : undefined,
    });
  } catch (error) {
    console.error("[seed] Task template apply failed:", error);
    res.status(500).json({ error: "Failed to apply task template" });
  }
});
