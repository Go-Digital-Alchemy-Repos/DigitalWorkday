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
  {
    templateKey: "admin_password_reset",
    name: "Admin Password Reset",
    subject: "Password Reset — {{appName}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Password Reset</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #3f3f46;">A password reset has been requested for your account by an administrator.</p>
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="{{resetUrl}}" style="${buttonStyle}">Set New Password</a>
              </p>
              <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">This link will expire in {{expiryHours}} hours.</p>
              <p style="margin: 0; font-size: 13px; color: #71717a;">If you did not expect this, please contact your administrator.</p>
    `),
    textBody: `Hi {{userName}},

A password reset has been requested for your account by an administrator.

Click this link to set your new password:
{{resetUrl}}

This link will expire in {{expiryHours}} hours.

If you did not expect this, please contact your administrator.`,
    variables: [
      { name: "userName", description: "The recipient's display name", example: "Alex Rivera" },
      { name: "userEmail", description: "The recipient's email address", example: "alex@example.com" },
      { name: "resetUrl", description: "The password reset URL with token", example: "https://app.example.com/auth/reset-password?token=abc123" },
      { name: "expiryHours", description: "Hours until the reset link expires", example: "24" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "platform_admin_invite",
    name: "Platform Admin Invitation",
    subject: "You've been invited as a Platform Administrator — {{appName}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Platform Administrator Invitation</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #3f3f46;">You've been invited to become a platform administrator for {{appName}}.</p>
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="{{inviteUrl}}" style="${buttonStyle}">Set Password &amp; Activate</a>
              </p>
              <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">This invitation will expire in {{expiryDays}} day(s).</p>
              <p style="margin: 0; font-size: 13px; color: #71717a;">If you did not expect this invitation, you can safely ignore this email.</p>
    `),
    textBody: `Hi {{userName}},

You've been invited to become a platform administrator for {{appName}}.

Click this link to set your password and activate your account:
{{inviteUrl}}

This invitation will expire in {{expiryDays}} day(s).

If you did not expect this invitation, you can safely ignore this email.`,
    variables: [
      { name: "userName", description: "The recipient's display name or email", example: "admin@example.com" },
      { name: "inviteUrl", description: "The invitation URL with token", example: "https://app.example.com/auth/platform-invite?token=abc123" },
      { name: "expiryDays", description: "Days until the invitation expires", example: "7" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "user_provision",
    name: "Account Provisioned",
    subject: "Your account has been created — {{tenantName}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Welcome to {{tenantName}}</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #3f3f46;">Your account has been created. Click the button below to set your password and get started.</p>
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="{{resetUrl}}" style="${buttonStyle}">Set Your Password</a>
              </p>
              <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">This link will expire in {{expiryHours}} hours.</p>
              <p style="margin: 0; font-size: 13px; color: #71717a;">If you have any questions, reach out to your administrator.</p>
    `),
    textBody: `Hi {{userName}},

Your account on {{tenantName}} has been created.

Click this link to set your password:
{{resetUrl}}

This link will expire in {{expiryHours}} hours.

If you have any questions, reach out to your administrator.`,
    variables: [
      { name: "userName", description: "The new user's display name or email", example: "sarah@example.com" },
      { name: "userEmail", description: "The new user's email address", example: "sarah@example.com" },
      { name: "tenantName", description: "Name of the organization", example: "Bright Studio" },
      { name: "resetUrl", description: "The password set URL with token", example: "https://app.example.com/auth/reset-password?token=abc123" },
      { name: "expiryHours", description: "Hours until the link expires", example: "24" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "task_due_reminder",
    name: "Task Due Reminder",
    subject: "Reminder: {{taskTitle}} is due {{dueDescription}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Task Due Reminder</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 16px; font-size: 15px; color: #3f3f46;">This is a reminder that the following task is due {{dueDescription}}:</p>
              <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 6px;">
                <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #18181b;">{{taskTitle}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Project: {{projectName}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Due: {{dueDate}}</p>
                <p style="margin: 0; font-size: 13px; color: #71717a;">Priority: {{priority}}</p>
              </div>
              <p style="margin: 0; font-size: 13px; color: #71717a;">Log in to view the task and update its status.</p>
    `),
    textBody: `Hi {{userName}},

This is a reminder that the following task is due {{dueDescription}}:

Task: {{taskTitle}}
Project: {{projectName}}
Due: {{dueDate}}
Priority: {{priority}}

Log in to view the task and update its status.`,
    variables: [
      { name: "userName", description: "The assignee's display name", example: "Mike Johnson" },
      { name: "taskTitle", description: "Title of the task", example: "Design homepage mockup" },
      { name: "projectName", description: "Name of the project", example: "Website Redesign" },
      { name: "dueDate", description: "The task due date", example: "March 15, 2026" },
      { name: "dueDescription", description: "Relative due description", example: "tomorrow" },
      { name: "priority", description: "Task priority level", example: "High" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "support_ticket_created",
    name: "Support Ticket Confirmation",
    subject: "Ticket #{{ticketNumber}}: {{ticketSubject}} — {{appName}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Support Ticket Created</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 16px; font-size: 15px; color: #3f3f46;">Your support ticket has been created and our team will review it shortly.</p>
              <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 6px;">
                <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #18181b;">{{ticketSubject}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Ticket #: {{ticketNumber}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Category: {{category}}</p>
                <p style="margin: 0; font-size: 13px; color: #71717a;">Priority: {{priority}}</p>
              </div>
              <p style="margin: 0; font-size: 13px; color: #71717a;">You can track the status of your ticket by logging into the client portal.</p>
    `),
    textBody: `Hi {{userName}},

Your support ticket has been created and our team will review it shortly.

Subject: {{ticketSubject}}
Ticket #: {{ticketNumber}}
Category: {{category}}
Priority: {{priority}}

You can track the status of your ticket by logging into the client portal.`,
    variables: [
      { name: "userName", description: "The ticket creator's display name", example: "Client User" },
      { name: "ticketSubject", description: "The ticket subject/title", example: "Cannot access dashboard" },
      { name: "ticketNumber", description: "The ticket reference number", example: "TK-001234" },
      { name: "category", description: "Ticket category", example: "Technical Support" },
      { name: "priority", description: "Ticket priority", example: "Medium" },
      { name: "appName", description: "Application name", example: "MyWorkDay" },
    ],
  },
  {
    templateKey: "support_ticket_assigned",
    name: "Support Ticket Assigned",
    subject: "You've been assigned to Ticket #{{ticketNumber}}: {{ticketSubject}}",
    htmlBody: baseHtmlWrapper(`
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #18181b;">Ticket Assigned to You</h2>
              <p style="margin: 0 0 8px; font-size: 15px; color: #3f3f46;">Hi {{userName}},</p>
              <p style="margin: 0 0 16px; font-size: 15px; color: #3f3f46;">You've been assigned to the following support ticket:</p>
              <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 6px;">
                <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #18181b;">{{ticketSubject}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Ticket #: {{ticketNumber}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Client: {{clientName}}</p>
                <p style="margin: 0 0 4px; font-size: 13px; color: #71717a;">Priority: {{priority}}</p>
                <p style="margin: 0; font-size: 13px; color: #71717a;">Assigned by: {{assignedByName}}</p>
              </div>
              <p style="margin: 0; font-size: 13px; color: #71717a;">Log in to view the ticket details and respond.</p>
    `),
    textBody: `Hi {{userName}},

You've been assigned to the following support ticket:

Subject: {{ticketSubject}}
Ticket #: {{ticketNumber}}
Client: {{clientName}}
Priority: {{priority}}
Assigned by: {{assignedByName}}

Log in to view the ticket details and respond.`,
    variables: [
      { name: "userName", description: "The assignee's display name", example: "Support Agent" },
      { name: "ticketSubject", description: "The ticket subject/title", example: "Cannot access dashboard" },
      { name: "ticketNumber", description: "The ticket reference number", example: "TK-001234" },
      { name: "clientName", description: "Name of the client who submitted the ticket", example: "Acme Corp" },
      { name: "priority", description: "Ticket priority", example: "High" },
      { name: "assignedByName", description: "Name of the person who made the assignment", example: "Alex Rivera" },
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
