import { afterEach, describe, expect, it } from "vitest";

import { buildAppUrl, buildChatUrl, buildTaskUrl, getAppBaseUrl } from "../lib/appLinks";

const originalAppPublicUrl = process.env.APP_PUBLIC_URL;
const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalAppPublicUrl === undefined) {
    delete process.env.APP_PUBLIC_URL;
  } else {
    process.env.APP_PUBLIC_URL = originalAppPublicUrl;
  }

  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }
});

describe("app link helpers", () => {
  it("uses APP_PUBLIC_URL for absolute email links", () => {
    process.env.APP_PUBLIC_URL = "https://digitalworkday.ai/";
    delete process.env.APP_URL;

    expect(getAppBaseUrl()).toBe("https://digitalworkday.ai");
    expect(buildAppUrl("/reports")).toBe("https://digitalworkday.ai/reports");
  });

  it("builds project task deep links with task, subtask, and comment context", () => {
    process.env.APP_PUBLIC_URL = "https://digitalworkday.ai";

    expect(buildTaskUrl({
      projectId: "project-1",
      taskId: "task-2",
      subtaskId: "subtask-3",
      commentId: "comment-4",
    })).toBe("https://digitalworkday.ai/projects/project-1?task=task-2&subtask=subtask-3&comment=comment-4");
  });

  it("builds chat conversation deep links", () => {
    process.env.APP_PUBLIC_URL = "https://digitalworkday.ai";

    expect(buildChatUrl({ type: "dm", conversationId: "thread-1", messageId: "message-2" }))
      .toBe("https://digitalworkday.ai/chat?c=dm%3Athread-1&message=message-2");
  });
});

