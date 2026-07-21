import { afterEach, describe, expect, it } from "vitest";

import { buildAppUrl, buildChatUrl, buildTaskUrl, getAppBaseUrl } from "../lib/appLinks";

const originalAppPublicUrl = process.env.APP_PUBLIC_URL;
const originalAppUrl = process.env.APP_URL;
const originalAppAllowedHosts = process.env.APP_ALLOWED_HOSTS;

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

  if (originalAppAllowedHosts === undefined) {
    delete process.env.APP_ALLOWED_HOSTS;
  } else {
    process.env.APP_ALLOWED_HOSTS = originalAppAllowedHosts;
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

  it("does not trust arbitrary request hosts for external links", () => {
    delete process.env.APP_PUBLIC_URL;
    delete process.env.APP_URL;
    delete process.env.APP_ALLOWED_HOSTS;
    const req = {
      protocol: "https",
      get: (header: string) => header.toLowerCase() === "host" ? "evil.example" : undefined,
    };

    expect(buildAppUrl("/auth/reset-password?token=secret", req as any))
      .toBe("http://localhost:5000/auth/reset-password?token=secret");
  });

  it("allows explicitly configured request hosts", () => {
    delete process.env.APP_PUBLIC_URL;
    delete process.env.APP_URL;
    process.env.APP_ALLOWED_HOSTS = "preview.example.com";
    const req = {
      protocol: "https",
      get: (header: string) => header.toLowerCase() === "host" ? "preview.example.com" : undefined,
    };

    expect(buildAppUrl("/reports", req as any)).toBe("https://preview.example.com/reports");
  });
});
