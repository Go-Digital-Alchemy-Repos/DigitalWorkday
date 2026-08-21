import { z } from "zod";

const isoDate = z.string().datetime({ offset: true }).nullable();

export const desktopUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email(),
  role: z.string(),
  avatarUrl: z.string().nullable(),
});

export const desktopProfileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
}).strict();

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

export const desktopMemberSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: z.string(),
  avatarUrl: z.string().nullable(),
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
  assignees: z.array(desktopMemberSchema),
  estimateMinutes: z.number().int().nonnegative().nullable(),
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

export const desktopTimeEntrySchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  projectId: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  startTime: z.string().datetime({ offset: true }),
  endTime: isoDate,
  durationSeconds: z.number().int().nonnegative(),
  isManual: z.boolean(),
  projectName: z.string().nullable(),
  taskTitle: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
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
  timeEntries: z.array(desktopTimeEntrySchema),
});

export const desktopWorkloadSchema = z.object({
  overdue: z.number().int().nonnegative(),
  today: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative(),
});

export const desktopTrackedDaySchema = z.object({
  date: z.string().date(),
  seconds: z.number().int().nonnegative(),
});

export const desktopAgendaEventSchema = z.object({
  id: z.string(),
  kind: z.enum(["task", "personal_task", "time_entry"]),
  taskId: z.string().nullable(),
  title: z.string(),
  subtitle: z.string().nullable(),
  start: z.string().datetime({ offset: true }),
  end: isoDate,
  allDay: z.boolean(),
  durationSeconds: z.number().int().nonnegative().nullable(),
});

export const desktopCommandCenterSchema = z.object({
  date: z.string().date(),
  timeZone: z.string(),
  workload: desktopWorkloadSchema,
  trackedTodaySeconds: z.number().int().nonnegative(),
  trackedWeekSeconds: z.number().int().nonnegative(),
  trackedDays: z.array(desktopTrackedDaySchema).length(7),
  agenda: z.array(desktopAgendaEventSchema),
});

export const desktopTodaySchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  overdue: z.array(desktopTaskSchema),
  today: z.array(desktopTaskSchema),
  agenda: z.array(desktopTaskSchema),
  trackedSeconds: z.number().int().nonnegative(),
});

export const desktopNotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  severity: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  payloadJson: z.unknown().nullable(),
  readAt: isoDate,
  createdAt: z.string().datetime({ offset: true }),
  lastEventAt: z.string().datetime({ offset: true }),
  eventCount: z.number().int().positive(),
});

export const desktopNotificationPageSchema = z.object({
  items: z.array(desktopNotificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
});

export const desktopBootstrapSchema = z.object({
  contractVersion: z.literal(1),
  serverTime: z.string().datetime({ offset: true }),
  user: desktopUserSchema,
  workspace: desktopWorkspaceSchema,
  projects: z.array(desktopProjectSchema),
  clients: z.array(desktopClientSchema),
  members: z.array(desktopMemberSchema),
  tasks: desktopTaskPageSchema,
  activeTimer: desktopTimerSchema.nullable(),
});

export type DesktopTask = z.infer<typeof desktopTaskSchema>;
export type DesktopUser = z.infer<typeof desktopUserSchema>;
export type DesktopTaskPage = z.infer<typeof desktopTaskPageSchema>;
export type DesktopBootstrap = z.infer<typeof desktopBootstrapSchema>;
export type DesktopComment = z.infer<typeof desktopCommentSchema>;
export type DesktopTaskDetail = z.infer<typeof desktopTaskDetailSchema>;
export type DesktopTimeEntry = z.infer<typeof desktopTimeEntrySchema>;
export type DesktopCommandCenter = z.infer<typeof desktopCommandCenterSchema>;
export type DesktopMember = z.infer<typeof desktopMemberSchema>;
export type DesktopToday = z.infer<typeof desktopTodaySchema>;
export type DesktopNotification = z.infer<typeof desktopNotificationSchema>;
