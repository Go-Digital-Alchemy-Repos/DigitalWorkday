import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentVisibility } from "@shared/schema";

const dbQueryMock = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: dbQueryMock,
      }),
    }),
  },
}));

vi.mock("../storage", () => ({
  storage: {},
}));

const { filterCommentsForPortalUser } = await import("../services/customerAccessPermissions");

describe("customer access permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides internal task comments from portal users unless they authored or were mentioned", async () => {
    dbQueryMock.mockResolvedValue([{ commentId: "internal-mentioned" }]);

    const comments = [
      {
        id: "internal-hidden",
        taskId: "task-1",
        subtaskId: null,
        userId: "staff-1",
        body: "Internal note",
        visibility: CommentVisibility.INTERNAL,
        isResolved: false,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "internal-mentioned",
        taskId: "task-1",
        subtaskId: null,
        userId: "staff-1",
        body: "Internal but tagged",
        visibility: CommentVisibility.INTERNAL,
        isResolved: false,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "client-visible",
        taskId: "task-1",
        subtaskId: null,
        userId: "staff-1",
        body: "Visible update",
        visibility: CommentVisibility.CLIENT_VISIBLE,
        isResolved: false,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "portal-authored",
        taskId: "task-1",
        subtaskId: null,
        userId: "portal-1",
        body: "Portal question",
        visibility: CommentVisibility.INTERNAL,
        isResolved: false,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const visible = await filterCommentsForPortalUser(comments, "portal-1");
    expect(visible.map((comment) => comment.id)).toEqual([
      "internal-mentioned",
      "client-visible",
      "portal-authored",
    ]);
  });
});

