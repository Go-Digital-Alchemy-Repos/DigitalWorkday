import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { extractMentionsFromTipTapJson, getPlainTextFromTipTapJson, getMentionDelta } from "../utils/mentionUtils";
import { db } from "../db";
import { commentMentions, comments } from "../../shared/schema";
import { eq } from "drizzle-orm";
import {
  createTestUser,
  createTestTenant,
  createTestWorkspace,
  createTestProject,
  createTestTask,
  cleanupTestData,
} from "./fixtures";
import { storage } from "../storage";

function makeTipTapDoc(...nodes: object[]) {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: nodes }],
  });
}

function mentionNode(id: string, label: string) {
  return { type: "mention", attrs: { id, label } };
}

function textNode(text: string) {
  return { type: "text", text };
}

describe("mentionUtils – extractMentionsFromTipTapJson", () => {
  it("returns empty array for null/undefined/empty input", () => {
    expect(extractMentionsFromTipTapJson(null)).toEqual([]);
    expect(extractMentionsFromTipTapJson(undefined)).toEqual([]);
    expect(extractMentionsFromTipTapJson("")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(extractMentionsFromTipTapJson("not json")).toEqual([]);
  });

  it("extracts a single mention", () => {
    const doc = makeTipTapDoc(
      textNode("Hello "),
      mentionNode("user-1", "Alice")
    );
    expect(extractMentionsFromTipTapJson(doc)).toEqual(["user-1"]);
  });

  it("deduplicates mentions of the same user", () => {
    const doc = makeTipTapDoc(
      mentionNode("user-1", "Alice"),
      textNode(" and "),
      mentionNode("user-1", "Alice")
    );
    expect(extractMentionsFromTipTapJson(doc)).toEqual(["user-1"]);
  });

  it("extracts multiple distinct mentions", () => {
    const doc = makeTipTapDoc(
      mentionNode("user-1", "Alice"),
      textNode(" and "),
      mentionNode("user-2", "Bob")
    );
    const result = extractMentionsFromTipTapJson(doc);
    expect(result).toHaveLength(2);
    expect(result).toContain("user-1");
    expect(result).toContain("user-2");
  });

  it("returns empty array for doc with no mentions", () => {
    const doc = makeTipTapDoc(textNode("Just some text"));
    expect(extractMentionsFromTipTapJson(doc)).toEqual([]);
  });
});

describe("mentionUtils – getPlainTextFromTipTapJson", () => {
  it("converts mention node to @label", () => {
    const doc = makeTipTapDoc(
      textNode("Hey "),
      mentionNode("user-1", "Alice"),
      textNode(", check this")
    );
    const result = getPlainTextFromTipTapJson(doc);
    expect(result).toContain("@Alice");
    expect(result).toContain("Hey");
    expect(result).toContain(", check this");
  });
});

describe("mentionUtils – getMentionDelta", () => {
  it("detects newly added mentions", () => {
    const oldDoc = makeTipTapDoc(textNode("Hello"));
    const newDoc = makeTipTapDoc(
      textNode("Hello "),
      mentionNode("user-1", "Alice")
    );
    const delta = getMentionDelta(oldDoc, newDoc);
    expect(delta.added).toEqual(["user-1"]);
    expect(delta.removed).toEqual([]);
  });

  it("detects removed mentions", () => {
    const oldDoc = makeTipTapDoc(
      mentionNode("user-1", "Alice"),
      textNode(" was here")
    );
    const newDoc = makeTipTapDoc(textNode("was here"));
    const delta = getMentionDelta(oldDoc, newDoc);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual(["user-1"]);
  });
});

describe("comment mentions – storage integration", () => {
  let tenant: any;
  let user1: any;
  let user2: any;
  let workspace: any;
  let project: any;
  let task: any;

  beforeAll(async () => {
    tenant = await createTestTenant({ name: "MentionTest" });
    user1 = await createTestUser({ email: "mention-author@test.com", name: "Author", tenantId: tenant.id });
    user2 = await createTestUser({ email: "mention-target@test.com", name: "Target", tenantId: tenant.id });
    workspace = await createTestWorkspace({ tenantId: tenant.id });
    project = await createTestProject({ tenantId: tenant.id, workspaceId: workspace.id });
    task = await createTestTask({ tenantId: tenant.id, projectId: project.id, createdBy: user1.id });
  });

  afterAll(async () => {
    await cleanupTestData({ tenantIds: [tenant.id] });
  });

  it("createCommentMention persists a mention record", async () => {
    const body = makeTipTapDoc(
      textNode("cc "),
      mentionNode(user2.id, "Target")
    );
    const comment = await storage.createComment({
      taskId: task.id,
      userId: user1.id,
      body,
    });

    const mention = await storage.createCommentMention({
      commentId: comment.id,
      mentionedUserId: user2.id,
    });

    expect(mention).toBeDefined();
    expect(mention.commentId).toBe(comment.id);
    expect(mention.mentionedUserId).toBe(user2.id);

    const rows = await db.select().from(commentMentions).where(eq(commentMentions.commentId, comment.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].mentionedUserId).toBe(user2.id);
  });

  it("extractMentionsFromTipTapJson round-trips with comment body", async () => {
    const body = makeTipTapDoc(
      textNode("hey "),
      mentionNode(user1.id, "Author"),
      textNode(" and "),
      mentionNode(user2.id, "Target")
    );
    const ids = extractMentionsFromTipTapJson(body);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(user1.id);
    expect(ids).toContain(user2.id);
  });
});
