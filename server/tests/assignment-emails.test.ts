import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  rows: [] as any[][],
  created: [{ id: "assignment-1" }] as any[],
  writes: [] as { table: string; values: any }[],
  send: vi.fn(), render: vi.fn(), transaction: vi.fn(), visible: vi.fn(), updates: [] as any[],
}));
vi.mock("../db", () => {
  const database: any = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => {
      if (!mocks.rows.length) throw new Error("Unexpected database query");
      return Promise.resolve(mocks.rows.shift());
    } }) }) }),
    insert: (table: any) => ({ values: (values: any) => {
      mocks.writes.push({ table: getTableName(table), values });
      return { onConflictDoNothing: () => ({ returning: () => Promise.resolve(mocks.created) }) };
    } }),
    update: () => ({ set: (values: any) => ({ where: async () => { mocks.updates.push(values); } }) }),
    transaction: (callback: any) => mocks.transaction(callback, database),
  };
  return { db: database };
});
vi.mock("../lib/privateVisibility", () => ({ canViewTask: mocks.visible, canViewProject: mocks.visible }));
vi.mock("../services/emailOutbox", () => ({ emailOutboxService: { sendEmail: mocks.send } }));
vi.mock("../services/emailTemplates", () => ({ emailTemplateService: { renderByKey: mocks.render } }));
const { assignTaskWithEmail, assignSubtaskWithEmail, deliverAssignmentEmail } = await import("../services/assignmentEmails");
const input = { taskId: "task-1", userId: "daniel", actorUserId: "ben", tenantId: "tenant-1" };
const task = { id: "task-1", tenantId: "tenant-1", projectId: "project-1", title: "Load More", isPersonal: false, dueDate: null };
const recipient = { id: "daniel", tenantId: "tenant-1", email: "daniel@example.com", name: "Daniel", isActive: true };
const project = { id: "project-1", tenantId: "tenant-1", name: "Directory", assignmentEmailsEnabled: true };
const actor = { id: "ben", tenantId: "tenant-1", name: "Ben", email: "ben@example.com" };
const eligible = () => [[task], [project], [recipient], [actor], [{ emailEnabled: true }]];
const ctx: any = { jobId: "job-1", tenantId: "tenant-1", userId: "ben", payload: { ...input, assignmentId: "assignment-1" } };

beforeEach(() => {
  mocks.visible.mockReset().mockResolvedValue(true);
  mocks.updates = [];
  mocks.rows = []; mocks.writes = []; mocks.created = [{ id: "assignment-1" }];
  mocks.transaction.mockImplementation((cb, db) => cb(db));
  mocks.send.mockReset().mockResolvedValue({ success: true });
  mocks.render.mockReset().mockResolvedValue({ subject: "Assigned", textBody: "Body", htmlBody: "<p>Body</p>" });
});

afterEach(() => vi.unstubAllEnvs());

describe("assignment email creation", () => {
  it("stores a public deep link resolved from the trusted assignment request", async () => {
    vi.stubEnv("APP_PUBLIC_URL", ""); vi.stubEnv("APP_URL", "");
    mocks.rows = [[task], [recipient], ...eligible()];
    await assignTaskWithEmail(input, { protocol: "https", get: (name: string) => name === "host" ? "digitalworkday.ai" : undefined } as any);
    expect(mocks.writes[1].values.payload.actionUrl).toBe("https://digitalworkday.ai/projects/project-1?task=task-1");
  });
  it("does not email an unchanged legacy primary assignee while repairing its missing join row", async () => {
    const subtask = { id: "sub-1", taskId: task.id, title: "Subtask", assigneeId: "daniel" };
    mocks.rows = [[subtask], [task], [recipient], [subtask], ...eligible(), [subtask]];
    await assignSubtaskWithEmail({ ...input, subtaskId: subtask.id, setPrimaryAssignee: true });
    expect(mocks.writes.map(w => w.table)).toEqual(["subtask_assignees"]);
  });
  it("commits one delivery job with the new assignment and never calls the provider in the request", async () => {
    mocks.rows = [[task], [recipient], ...eligible()];
    await assignTaskWithEmail(input);
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.writes.map(w => w.table)).toEqual(["task_assignees", "background_jobs"]);
    expect(mocks.writes[1].values).toMatchObject({ type: "assignment_email", maxAttempts: 3, payload: { assignmentId: "assignment-1", actorUserId: "ben" } });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([false, undefined])("does not queue when the project setting is %s", async (enabled) => {
    mocks.rows = [[task], [recipient], [task], [{ ...project, assignmentEmailsEnabled: enabled }]];
    await assignTaskWithEmail(input);
    expect(mocks.writes.map(w => w.table)).toEqual(["task_assignees"]);
  });
  it.each([{ prefs: [] }, { prefs: [{ emailEnabled: false }] }])("requires an explicit recipient opt-in ($prefs)", async ({ prefs }) => {
    mocks.rows = [[task], [recipient], ...eligible().slice(0, 4), prefs];
    await assignTaskWithEmail(input);
    expect(mocks.writes).toHaveLength(1);
  });
  it("does not queue self assignments", async () => {
    mocks.rows = [[task], [recipient], [task]];
    await assignTaskWithEmail({ ...input, actorUserId: input.userId });
    expect(mocks.writes).toHaveLength(1);
  });
  it("does not queue personal tasks", async () => {
    const personal = { ...task, isPersonal: true, projectId: null };
    mocks.rows = [[personal], [recipient], [personal]];
    await assignTaskWithEmail(input);
    expect(mocks.writes).toHaveLength(1);
  });
  it("does not queue duplicate requests", async () => {
    mocks.created = [];
    mocks.rows = [[task], [recipient], [{ id: "assignment-1" }]];
    await assignTaskWithEmail(input);
    expect(mocks.writes).toHaveLength(1);
  });
  it("rejects cross tenant assignments before inserting anything", async () => {
    mocks.rows = [[task], [{ ...recipient, tenantId: "another-tenant" }]];
    await expect(assignTaskWithEmail(input)).rejects.toThrow("same organization");
    expect(mocks.writes).toHaveLength(0);
  });
  it("queues subtask assignments with the parent task and subtask IDs", async () => {
    const subtask = { id: "sub-1", taskId: task.id, title: "Subtask" };
    mocks.rows = [[subtask], [task], [recipient], [subtask], ...eligible(), [subtask]];
    await assignSubtaskWithEmail({ ...input, subtaskId: subtask.id });
    expect(mocks.writes.map(w => w.table)).toEqual(["subtask_assignees", "background_jobs"]);
    expect(mocks.updates[0]).toMatchObject({ assigneeId: "daniel" });
    expect(mocks.writes[1].values.payload).toMatchObject({ taskId: task.id, subtaskId: subtask.id });
  });
});

describe("assignment email delivery", () => {
  it("uses the existing template, sender and project deep link", async () => {
    mocks.rows = [...eligible(), [{ id: "assignment-1" }], []];
    await deliverAssignmentEmail(ctx);
    expect(mocks.render).toHaveBeenCalledWith("tenant-1", "task_assignment", expect.objectContaining({ taskTitle: "Load More", assignedByName: "Ben", dueDate: "No due date" }), true);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ messageType: "task_assignment", toEmail: recipient.email,
      actionUrl: expect.stringContaining("/projects/project-1?task=task-1"), metadata: expect.objectContaining({ assignmentJobId: "job-1" }) }));
  });
  it("does not disclose inaccessible private tasks or projects", async () => {
    mocks.rows = eligible();
    mocks.visible.mockResolvedValue(false);
    await deliverAssignmentEmail(ctx);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uses the subtask title, due date and deep link", async () => {
    mocks.rows = [...eligible(), [{ id: "sub-1", taskId: task.id, title: "Subtask", dueDate: new Date("2026-10-20") }], [{ id: "assignment-1" }], []];
    await deliverAssignmentEmail({ ...ctx, payload: { ...ctx.payload, subtaskId: "sub-1" } });
    expect(mocks.render).toHaveBeenCalledWith("tenant-1", "task_assignment", expect.objectContaining({ taskTitle: "Subtask", dueDate: "2026-10-20" }), true);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ actionUrl: expect.stringContaining("subtask=sub-1") }));
  });
  it("does not resend a job already recorded as sent", async () => {
    mocks.rows = [...eligible(), [{ id: "assignment-1" }], [{ id: "email-1" }]];
    await deliverAssignmentEmail(ctx);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("cancels delivery if the assignment was removed", async () => {
    mocks.rows = [...eligible(), []];
    await deliverAssignmentEmail(ctx);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rechecks project opt-in before sending", async () => {
    mocks.rows = [[task], [{ ...project, assignmentEmailsEnabled: false }]];
    await deliverAssignmentEmail(ctx);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rechecks recipient opt-in before sending", async () => {
    mocks.rows = [...eligible().slice(0, 4), [{ emailEnabled: false }]];
    await deliverAssignmentEmail(ctx);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("treats a provider failure as a failed job so the existing queue can retry", async () => {
    mocks.rows = [...eligible(), [{ id: "assignment-1" }], []];
    mocks.send.mockResolvedValue({ success: false, error: "Mailgun unavailable" });
    await expect(deliverAssignmentEmail(ctx)).rejects.toThrow("Mailgun unavailable");
  });
  it("rejects a job whose tenant no longer matches the task", async () => {
    mocks.rows = [[{ ...task, tenantId: "another-tenant" }]];
    await deliverAssignmentEmail(ctx);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
