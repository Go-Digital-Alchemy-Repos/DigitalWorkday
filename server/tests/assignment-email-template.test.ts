import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {} }));
import { emailTemplateService } from "../services/emailTemplates";

describe("assignment template HTML safety", () => {
  const template = { subject: "Task {{taskTitle}}", htmlBody: "<p>{{taskTitle}}</p>{{actionBlock}}", textBody: "{{taskTitle}}" };
  const variables = { taskTitle: '<img src=x onerror="alert(1)">', actionBlock: '<a href="https://example.com">View Task</a>' };
  it("escapes user text in HTML while keeping text, subject and generated buttons intact", () => {
    const rendered = emailTemplateService.renderTemplate(template, variables, true);
    expect(rendered.htmlBody).toContain("&lt;img");
    expect(rendered.htmlBody).not.toContain("<img");
    expect(rendered.htmlBody).toContain(variables.actionBlock);
    expect(rendered.textBody).toBe(variables.taskTitle);
    expect(rendered.subject).toBe(`Task ${variables.taskTitle}`);
  });
  it("preserves existing rendering for other email callers", () => {
    expect(emailTemplateService.renderTemplate(template, variables).htmlBody).toContain(variables.taskTitle);
  });
});
