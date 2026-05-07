import { describe, expect, it } from "vitest";

import {
  buildEmailActionBlock,
  buildEmailActionText,
  ensureEmailActionLink,
} from "../services/emailActionLinks";

describe("email action links", () => {
  it("renders reusable html and text CTA content", () => {
    const url = "https://digitalworkday.ai/projects/project-1?task=task-2";

    expect(buildEmailActionBlock(url, "View Task")).toContain('href="https://digitalworkday.ai/projects/project-1?task=task-2"');
    expect(buildEmailActionBlock(url, "View Task")).toContain("View Task");
    expect(buildEmailActionText(url, "View Task")).toBe(`\n\nView Task:\n${url}`);
  });

  it("appends a button to legacy html templates that do not include the action url", () => {
    const result = ensureEmailActionLink({
      textBody: "You were mentioned.",
      htmlBody: '<html><body><table><tr><td style="padding: 20px 40px; border-top: 1px solid #e4e4e7; text-align: center;">Footer</td></tr></table></body></html>',
      actionUrl: "https://digitalworkday.ai/projects/project-1?task=task-2",
      actionLabel: "View Task",
    });

    expect(result.textBody).toContain("View Task:");
    expect(result.htmlBody).toContain("View Task");
    expect(result.htmlBody).toContain("https://digitalworkday.ai/projects/project-1?task=task-2");
  });

  it("does not duplicate links when the rendered template already contains the action url", () => {
    const url = "https://digitalworkday.ai/projects/project-1?task=task-2";
    const result = ensureEmailActionLink({
      textBody: `View Task:\n${url}`,
      htmlBody: `<a href="${url}">View Task</a>`,
      actionUrl: url,
      actionLabel: "View Task",
    });

    expect(result.textBody.match(/https:\/\/digitalworkday\.ai/g)).toHaveLength(1);
    expect(result.htmlBody?.match(/https:\/\/digitalworkday\.ai/g)).toHaveLength(1);
  });
});

