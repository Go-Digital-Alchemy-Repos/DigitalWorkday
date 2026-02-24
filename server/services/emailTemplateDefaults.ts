import type { InsertEmailTemplate } from "@shared/schema";

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

export interface DefaultTemplate {
  templateKey: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: TemplateVariable[];
}

const baseHtmlWrapper = (content: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">This email was sent by {{appName}}. Please do not reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const buttonStyle = `display: inline-block; padding: 12px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;`;

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    templateKey: "forgot_password",
    name: "Password Reset",
    subject: "Password Reset Request — {{appName}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Password Reset Request</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #3f3f46;">We received a request to reset the password for your account.</p>
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="{{resetUrl}}" style="${buttonStyle}">Reset Password</a>
              </p>
              <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">This link will expire in {{expiryMinutes}} minutes.</p>
              <p style="margin: 0; font-size: 13px; color: #71717a;">If you did not request this reset, you can safely ignore this email. Your password will not be changed.</p>
    `),
    textBody: `Hi {{userName}},

We received a request to reset the password for your account.

Click this link to reset your password:
{{resetUrl}}

This link will expire in {{expiryMinutes}} minutes.

If you did not request this reset, you can safely ignore this email.`,
    variables: [
      { name: "userName", description: "The recipient's display name", example: "Alex Rivera" },
      { name: "resetUrl", description: "The password reset URL with token", example: "https://app.example.com/auth/reset-password?token=abc123" },
      { name: "expiryMinutes", description: "Minutes until the reset link expires", example: "30" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
      { name: "userEmail", description: "The recipient's email address", example: "alex@example.com" },
    ],
  },
  {
    templateKey: "mention_notification",
    name: "Mention Notification",
    subject: "{{mentionedByName}} mentioned you in {{itemTitle}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">You were mentioned</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 16px; font-size: 15px; color: #3f3f46;"><strong>{{mentionedByName}}</strong> mentioned you in <strong>{{itemTitle}}</strong>:</p>
              <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 6px; border-left: 4px solid #3b82f6;">
                <p style="margin: 0; font-size: 14px; color: #3f3f46; font-style: italic;">{{commentText}}</p>
              </div>
              <p style="margin: 0; font-size: 13px; color: #71717a;">Log in to view the full conversation and respond.</p>
    `),
    textBody: `Hi {{userName}},

{{mentionedByName}} mentioned you in {{itemTitle}}:

"{{commentText}}"

Log in to view the full conversation and respond.`,
    variables: [
      { name: "userName", description: "The recipient's display name", example: "Mike Johnson" },
      { name: "mentionedByName", description: "Name of the person who mentioned the user", example: "Alex Rivera" },
      { name: "itemTitle", description: "Title of the task or subtask", example: "Design homepage mockup" },
      { name: "commentText", description: "The comment text containing the mention", example: "Hey @Mike, can you review this?" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "invitation",
    name: "User Invitation",
    subject: "You've been invited to join {{tenantName}} on {{appName}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">You're Invited!</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #3f3f46;"><strong>{{invitedByName}}</strong> has invited you to join <strong>{{tenantName}}</strong> on {{appName}}.</p>
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="{{inviteUrl}}" style="${buttonStyle}">Accept Invitation</a>
              </p>
              <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">Your role: <strong>{{role}}</strong></p>
              <p style="margin: 0; font-size: 13px; color: #71717a;">This invitation will expire in {{expiryDays}} days.</p>
    `),
    textBody: `Hi {{userName}},

{{invitedByName}} has invited you to join {{tenantName}} on {{appName}}.

Accept your invitation here:
{{inviteUrl}}

Your role: {{role}}
This invitation will expire in {{expiryDays}} days.`,
    variables: [
      { name: "userName", description: "The recipient's display name or email", example: "sarah@example.com" },
      { name: "invitedByName", description: "Name of the person who sent the invite", example: "Alex Rivera" },
      { name: "tenantName", description: "Name of the organization/tenant", example: "Bright Studio" },
      { name: "inviteUrl", description: "The invitation acceptance URL", example: "https://app.example.com/invite/accept?token=abc123" },
      { name: "role", description: "The assigned role for the invited user", example: "Team Member" },
      { name: "expiryDays", description: "Days until invitation expires", example: "7" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "task_assignment",
    name: "Task Assignment",
    subject: "You've been assigned to: {{taskTitle}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">New Task Assignment</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 16px; font-size: 15px; color: #3f3f46;"><strong>{{assignedByName}}</strong> has assigned you to the following task:</p>
              <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 6px;">
                <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #18181b;">{{taskTitle}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Project: {{projectName}}</p>
                <p style="margin: 0; font-size: 13px; color: #71717a;">Due: {{dueDate}}</p>
              </div>
              <p style="margin: 0; font-size: 13px; color: #71717a;">Log in to view the task details and get started.</p>
    `),
    textBody: `Hi {{userName}},

{{assignedByName}} has assigned you to the following task:

Task: {{taskTitle}}
Project: {{projectName}}
Due: {{dueDate}}

Log in to view the task details and get started.`,
    variables: [
      { name: "userName", description: "The recipient's display name", example: "Mike Johnson" },
      { name: "assignedByName", description: "Name of the person who assigned the task", example: "Alex Rivera" },
      { name: "taskTitle", description: "Title of the assigned task", example: "Design homepage mockup" },
      { name: "projectName", description: "Name of the project", example: "Website Redesign" },
      { name: "dueDate", description: "Task due date", example: "March 15, 2026" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "welcome_email",
    name: "Welcome Email",
    subject: "Welcome to {{appName}}!",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Welcome to {{appName}}!</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #3f3f46;">Your account has been created and you're all set to start using {{appName}}.</p>
              <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 6px;">
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Email: <strong>{{userEmail}}</strong></p>
                <p style="margin: 0; font-size: 13px; color: #71717a;">Organization: <strong>{{tenantName}}</strong></p>
              </div>
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="{{loginUrl}}" style="${buttonStyle}">Get Started</a>
              </p>
              <p style="margin: 0; font-size: 13px; color: #71717a;">If you have any questions, reach out to your administrator.</p>
    `),
    textBody: `Hi {{userName}},

Your account has been created and you're all set to start using {{appName}}.

Email: {{userEmail}}
Organization: {{tenantName}}

Log in here: {{loginUrl}}

If you have any questions, reach out to your administrator.`,
    variables: [
      { name: "userName", description: "The new user's display name", example: "Sarah Chen" },
      { name: "userEmail", description: "The new user's email address", example: "sarah@example.com" },
      { name: "tenantName", description: "Name of the organization", example: "Bright Studio" },
      { name: "loginUrl", description: "URL to the login page", example: "https://app.example.com/login" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
];

export function getDefaultTemplate(templateKey: string): DefaultTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.templateKey === templateKey);
}

export function getAllTemplateKeys(): string[] {
  return DEFAULT_TEMPLATES.map(t => t.templateKey);
}
