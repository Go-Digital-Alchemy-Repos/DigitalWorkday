import { z } from "zod";

const isoDate = z.string().datetime({ offset: true }).nullable();

export const desktopUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: z.string(),
  avatarUrl: z.string().nullable(),
});

export const desktopWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const desktopClientSchema = z.object({
  id: z.string(),
  companyName: z.string(),
});

export const desktopProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
});

export const desktopSubtaskSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  status: z.string(),
  completed: z.boolean(),
  dueDate: isoDate,
  updatedAt: z.string().datetime({ offset: true }),
});

export const desktopTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  dueDate: isoDate,
  isPersonal: z.boolean(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  sectionId: z.string().nullable(),
  assigneeIds: z.array(z.string()),
  subtasks: z.array(desktopSubtaskSchema),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const desktopTimerSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  projectId: z.string().nullable(),
  clientId: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(["running", "paused"]),
  elapsedSeconds: z.number().int().nonnegative(),
  lastStartedAt: isoDate,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const desktopTaskPageSchema = z.object({
  items: z.array(desktopTaskSchema),
  nextCursor: z.string().nullable(),
});

export const desktopCommentSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  body: z.string(),
  visibility: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  user: desktopUserSchema.pick({ id: true, name: true, email: true, avatarUrl: true }).nullable(),
});

export const desktopTaskDetailSchema = z.object({
  task: desktopTaskSchema,
  comments: z.array(desktopCommentSchema),
});

export const desktopBootstrapSchema = z.object({
  contractVersion: z.literal(1),
  serverTime: z.string().datetime({ offset: true }),
  user: desktopUserSchema,
  workspace: desktopWorkspaceSchema,
  projects: z.array(desktopProjectSchema),
  clients: z.array(desktopClientSchema),
  tasks: desktopTaskPageSchema,
  activeTimer: desktopTimerSchema.nullable(),
});

export type DesktopTask = z.infer<typeof desktopTaskSchema>;
export type DesktopTaskPage = z.infer<typeof desktopTaskPageSchema>;
export type DesktopBootstrap = z.infer<typeof desktopBootstrapSchema>;
export type DesktopComment = z.infer<typeof desktopCommentSchema>;
export type DesktopTaskDetail = z.infer<typeof desktopTaskDetailSchema>;
