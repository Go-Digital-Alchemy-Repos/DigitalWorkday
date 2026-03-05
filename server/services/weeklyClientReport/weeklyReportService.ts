import { db } from "../../db";
import { sql } from "drizzle-orm";
import { generateWeeklyStatusReport } from "../../ops/statusReports/statusReportGenerator";
import { emailOutboxService } from "../emailOutbox";
import { updateStatusReportSent } from "../communication/communicationHealthService";
import type { GeneratedStatusReport, StatusReportSection } from "../../ops/statusReports/statusReportGenerator";

export interface WeeklyReportContact {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface WeeklyReportProject {
  projectId: string;
  projectName: string;
  tenantId: string;
  clientId: string | null;
  clientName: string | null;
  weeklyReportAutoSend: boolean;
}

export async function getContactsForReport(
  projectId: string,
  tenantId: string
): Promise<WeeklyReportContact[]> {
  const rows = await db.execute(sql`
    SELECT cc.email, cc.first_name, cc.last_name
    FROM client_contacts cc
    JOIN projects p ON p.client_id = cc.client_id
    WHERE p.id = ${projectId}
      AND p.tenant_id = ${tenantId}
      AND cc.receive_status_reports = true
      AND cc.email IS NOT NULL
      AND cc.email != ''
  `);
  const rawRows = (rows as any).rows ?? (rows as any) ?? [];
  return rawRows.map((r: any) => ({
    email: r.email,
    firstName: r.first_name ?? null,
    lastName: r.last_name ?? null,
  }));
}

export async function getActiveProjectsForWeeklyReports(tenantId?: string): Promise<WeeklyReportProject[]> {
  const tenantFilter = tenantId ? sql`AND p.tenant_id = ${tenantId}` : sql``;
  const rows = await db.execute(sql`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.tenant_id,
      p.client_id,
      c.company_name AS client_name,
      p.weekly_report_auto_send
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.status = 'active'
      AND p.weekly_report_auto_send = true
      ${tenantFilter}
    ORDER BY p.tenant_id, p.name
  `);
  const rawRows = (rows as any).rows ?? (rows as any) ?? [];
  return rawRows.map((r: any) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    tenantId: r.tenant_id,
    clientId: r.client_id ?? null,
    clientName: r.client_name ?? null,
    weeklyReportAutoSend: r.weekly_report_auto_send,
  }));
}

function buildReportEmailHtml(report: GeneratedStatusReport, clientName: string | null): string {
  const formattedDate = new Date(report.rangeEnd).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  function renderSection(section: StatusReportSection): string {
    let html = `<h3 style="color:#1e40af;font-size:15px;margin:20px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">${section.title}</h3>`;

    if (section.body) {
      html += `<p style="color:#374151;font-size:14px;line-height:1.6;">${section.body.replace(/\n/g, "<br>")}</p>`;
    }

    if (section.metrics) {
      html += `<table style="border-collapse:collapse;width:100%;margin:8px 0;">`;
      for (const [key, value] of Object.entries(section.metrics)) {
        if (value !== null && value !== undefined) {
          const label = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
          html += `<tr>
            <td style="padding:4px 8px;color:#6b7280;font-size:13px;width:50%;">${label}</td>
            <td style="padding:4px 8px;font-weight:600;font-size:13px;color:#111827;">${value}</td>
          </tr>`;
        }
      }
      html += `</table>`;
    }

    if (section.items && section.items.length > 0) {
      html += `<ul style="margin:8px 0;padding-left:20px;">`;
      for (const item of section.items.slice(0, 10)) {
        const status = item.status ? ` <span style="color:#6b7280;font-size:12px;">[${item.status}]</span>` : "";
        const assignee = item.assigneeName ? ` — ${item.assigneeName}` : "";
        html += `<li style="margin:4px 0;font-size:13px;color:#374151;">${item.title}${status}${assignee}</li>`;
      }
      if (section.items.length > 10) {
        html += `<li style="color:#6b7280;font-size:12px;">...and ${section.items.length - 10} more</li>`;
      }
      html += `</ul>`;
    }

    return html;
  }

  const sectionsHtml = report.sections.map(renderSection).join("");
  const greeting = clientName ? `Dear ${clientName} team,` : "Dear Client,";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#1e40af;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">${report.projectName}</h1>
      <p style="color:#bfdbfe;margin:4px 0 0;font-size:14px;">Weekly Status Report — Week ending ${formattedDate}</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="color:#374151;font-size:14px;">${greeting}</p>
      <p style="color:#374151;font-size:14px;margin-bottom:24px;">Please find below the weekly status update for your project.</p>
      ${sectionsHtml}
    </div>
    <div style="background:#f3f4f6;padding:16px 32px;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">This is an automated weekly report. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function generateWeeklyClientReport(
  projectId: string,
  tenantId: string,
  systemUserId: string
): Promise<GeneratedStatusReport> {
  const now = new Date();
  const rangeEnd = new Date(now);
  rangeEnd.setHours(23, 59, 59, 999);
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - 6);
  rangeStart.setHours(0, 0, 0, 0);

  return generateWeeklyStatusReport({
    tenantId,
    projectId,
    rangeStart: rangeStart.toISOString().split("T")[0],
    rangeEnd: rangeEnd.toISOString().split("T")[0],
    viewerUserId: systemUserId,
  });
}

export interface SendReportResult {
  projectId: string;
  projectName: string;
  emailsSent: number;
  contactsFound: number;
  errors: string[];
}

export async function sendWeeklyClientReportForProject(
  projectId: string,
  tenantId: string,
  systemUserId: string,
  clientName: string | null
): Promise<SendReportResult> {
  const errors: string[] = [];

  let report: GeneratedStatusReport;
  try {
    report = await generateWeeklyClientReport(projectId, tenantId, systemUserId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { projectId, projectName: projectId, emailsSent: 0, contactsFound: 0, errors: [`Report generation failed: ${msg}`] };
  }

  const contacts = await getContactsForReport(projectId, tenantId);

  let emailsSent = 0;
  const htmlBody = buildReportEmailHtml(report, clientName);
  const subject = `Weekly Update: ${report.projectName} — ${new Date(report.rangeEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const textBody = report.summaryMarkdown;

  for (const contact of contacts) {
    try {
      const result = await emailOutboxService.sendEmail({
        tenantId,
        messageType: "other",
        toEmail: contact.email,
        subject,
        textBody,
        htmlBody,
        metadata: { projectId, reportId: report.reportId, type: "weekly_client_report" },
      });
      if (result.success) {
        emailsSent++;
      } else {
        errors.push(`Failed to send to ${contact.email}`);
      }
    } catch (err) {
      errors.push(`Error sending to ${contact.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (contacts.length > 0 || emailsSent > 0) {
    const now = new Date();
    await db.execute(sql`
      UPDATE projects
      SET last_weekly_report_sent_at = ${now}, updated_at = ${now}
      WHERE id = ${projectId} AND tenant_id = ${tenantId}
    `);
    await updateStatusReportSent(projectId, tenantId).catch(() => {});
  }

  return {
    projectId,
    projectName: report.projectName,
    emailsSent,
    contactsFound: contacts.length,
    errors,
  };
}

export async function runWeeklyReportsForAllTenants(): Promise<void> {
  const projects = await getActiveProjectsForWeeklyReports();
  console.log(`[weeklyReports] Processing ${projects.length} projects with auto-send enabled`);

  for (const project of projects) {
    try {
      const systemUserId = await getSystemUserIdForTenant(project.tenantId);
      if (!systemUserId) {
        console.warn(`[weeklyReports] No system user found for tenant ${project.tenantId}, skipping ${project.projectId}`);
        continue;
      }
      const result = await sendWeeklyClientReportForProject(
        project.projectId,
        project.tenantId,
        systemUserId,
        project.clientName
      );
      console.log(`[weeklyReports] ${result.projectName}: sent ${result.emailsSent}/${result.contactsFound} emails`);
      if (result.errors.length > 0) {
        console.warn(`[weeklyReports] Errors for ${result.projectName}:`, result.errors);
      }
    } catch (err) {
      console.error(`[weeklyReports] Failed for project ${project.projectId}:`, err);
    }
  }
}

async function getSystemUserIdForTenant(tenantId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT id FROM users
    WHERE tenant_id = ${tenantId}
      AND role IN ('tenant_owner', 'admin')
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const rawRows = (rows as any).rows ?? (rows as any) ?? [];
  return rawRows[0]?.id ?? null;
}
