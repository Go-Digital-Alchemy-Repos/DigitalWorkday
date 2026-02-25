import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  computeCapacityOverload,
  computeProjectDeadlineRisk,
  computeClientRiskTrend,
} from "../reports/forecasting/snapshotService";
import { emailOutboxService } from "../services/emailOutbox";


async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

interface DigestSections {
  generatedAt: string;
  tenantId: string;
  teamAvgUtilization: number;
  topOverloadedUsers: Array<{
    name: string;
    email: string;
    peakPredictedHours: number;
    peakUtilizationPct: number;
    overloadRisk: string;
  }>;
  projectsAtRisk: Array<{
    projectName: string;
    dueDate: string | null;
    openTasks: number;
    overdueTasks: number;
    throughput: number;
    predictedWeeksToClear: number;
    deadlineRisk: string;
  }>;
  clientsAtRisk: Array<{
    companyName: string;
    currentHealthScore: number;
    predictedHealthScore: number;
    riskTrend: string;
    clientRisk: string;
  }>;
}

export async function generateDigest(tenantId: string): Promise<DigestSections> {
  const [capacityResult, deadlineResult, clientResult] = await Promise.all([
    computeCapacityOverload(tenantId, 4),
    computeProjectDeadlineRisk(tenantId, 4),
    computeClientRiskTrend(tenantId, 4),
  ]);

  const allUtilizations = capacityResult.users.flatMap((u) =>
    u.weeks.map((w) => w.predictedUtilizationPct)
  );
  const teamAvgUtilization = allUtilizations.length > 0
    ? Math.round(allUtilizations.reduce((a, b) => a + b, 0) / allUtilizations.length)
    : 0;

  const topOverloadedUsers = capacityResult.users
    .filter((u) => u.weeks.some((w) => w.overloadRisk === "High" || w.overloadRisk === "Medium"))
    .sort((a, b) => {
      const maxA = Math.max(...a.weeks.map((w) => w.predictedUtilizationPct));
      const maxB = Math.max(...b.weeks.map((w) => w.predictedUtilizationPct));
      return maxB - maxA;
    })
    .slice(0, 5)
    .map((u) => {
      const peakWeek = u.weeks.reduce((a, b) =>
        a.predictedUtilizationPct > b.predictedUtilizationPct ? a : b
      );
      return {
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        email: u.email,
        peakPredictedHours: peakWeek.predictedHours,
        peakUtilizationPct: peakWeek.predictedUtilizationPct,
        overloadRisk: peakWeek.overloadRisk,
      };
    });

  const projectsAtRisk = deadlineResult.projects
    .filter((p) => p.deadlineRisk === "High" || p.deadlineRisk === "Medium")
    .sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      return order[a.deadlineRisk] - order[b.deadlineRisk] || b.openTaskCount - a.openTaskCount;
    })
    .slice(0, 5)
    .map((p) => ({
      projectName: p.projectName,
      dueDate: p.dueDate,
      openTasks: p.openTaskCount,
      overdueTasks: p.overdueCount,
      throughput: p.throughputPerWeek,
      predictedWeeksToClear: p.predictedWeeksToClear,
      deadlineRisk: p.deadlineRisk,
    }));

  const clientsAtRisk = clientResult.clients
    .filter((c) => c.clientRisk === "High" || c.riskTrend === "Worsening")
    .slice(0, 5)
    .map((c) => ({
      companyName: c.companyName,
      currentHealthScore: c.currentHealthScore,
      predictedHealthScore: c.predictedHealthScore,
      riskTrend: c.riskTrend,
      clientRisk: c.clientRisk,
    }));

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    teamAvgUtilization,
    topOverloadedUsers,
    projectsAtRisk,
    clientsAtRisk,
  };
}

export function generateDigestHtml(sections: DigestSections): string {
  const date = new Date(sections.generatedAt).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const tableStyle = 'width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;';
  const thStyle = 'background:#f5f5f5;padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;font-weight:600;';
  const tdStyle = 'padding:8px 12px;border-bottom:1px solid #eee;';
  const riskBadge = (risk: string) => {
    const color = risk === "High" ? "#dc2626" : risk === "Medium" ? "#d97706" : "#16a34a";
    return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${risk}</span>`;
  };

  let html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Weekly Ops Digest</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;max-width:720px;margin:0 auto;padding:24px;">
  <h1 style="color:#1a1a1a;margin:0 0 4px;">Weekly Ops Digest</h1>
  <p style="color:#6b7280;margin:0 0 32px;">${date}</p>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h3 style="margin:0 0 8px;color:#475569;">Team Overview</h3>
    <p style="margin:0;font-size:24px;font-weight:700;color:#1a1a1a;">
      ${sections.teamAvgUtilization}%
      <span style="font-size:14px;font-weight:400;color:#6b7280;">avg team utilization (next 4 weeks forecast)</span>
    </p>
  </div>`;

  if (sections.topOverloadedUsers.length > 0) {
    html += `
  <h2 style="font-size:18px;margin:0 0 8px;">Top Overloaded Employees</h2>
  <table style="${tableStyle}">
    <thead>
      <tr>
        <th style="${thStyle}">Employee</th>
        <th style="${thStyle}">Peak Predicted Hours</th>
        <th style="${thStyle}">Utilization %</th>
        <th style="${thStyle}">Risk</th>
      </tr>
    </thead>
    <tbody>`;
    for (const u of sections.topOverloadedUsers) {
      html += `
      <tr>
        <td style="${tdStyle}">${u.name}<br><span style="color:#6b7280;font-size:12px;">${u.email}</span></td>
        <td style="${tdStyle}">${u.peakPredictedHours}h</td>
        <td style="${tdStyle}">${u.peakUtilizationPct}%</td>
        <td style="${tdStyle}">${riskBadge(u.overloadRisk)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  } else {
    html += `<p style="color:#16a34a;">No overloaded employees this week. Great job!</p>`;
  }

  if (sections.projectsAtRisk.length > 0) {
    html += `
  <h2 style="font-size:18px;margin:24px 0 8px;">Projects at Deadline Risk</h2>
  <table style="${tableStyle}">
    <thead>
      <tr>
        <th style="${thStyle}">Project</th>
        <th style="${thStyle}">Due Date</th>
        <th style="${thStyle}">Open / Overdue</th>
        <th style="${thStyle}">Throughput</th>
        <th style="${thStyle}">Wks to Clear</th>
        <th style="${thStyle}">Risk</th>
      </tr>
    </thead>
    <tbody>`;
    for (const p of sections.projectsAtRisk) {
      html += `
      <tr>
        <td style="${tdStyle}">${p.projectName}</td>
        <td style="${tdStyle}">${p.dueDate ?? "—"}</td>
        <td style="${tdStyle}">${p.openTasks} / <span style="color:#dc2626;">${p.overdueTasks}</span></td>
        <td style="${tdStyle}">${p.throughput}/wk</td>
        <td style="${tdStyle}">${p.predictedWeeksToClear}w</td>
        <td style="${tdStyle}">${riskBadge(p.deadlineRisk)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  if (sections.clientsAtRisk.length > 0) {
    html += `
  <h2 style="font-size:18px;margin:24px 0 8px;">Clients at Risk</h2>
  <table style="${tableStyle}">
    <thead>
      <tr>
        <th style="${thStyle}">Client</th>
        <th style="${thStyle}">Health Score</th>
        <th style="${thStyle}">Predicted Score</th>
        <th style="${thStyle}">Trend</th>
        <th style="${thStyle}">Risk</th>
      </tr>
    </thead>
    <tbody>`;
    for (const c of sections.clientsAtRisk) {
      const trendColor = c.riskTrend === "Improving" ? "#16a34a" : c.riskTrend === "Worsening" ? "#dc2626" : "#6b7280";
      html += `
      <tr>
        <td style="${tdStyle}">${c.companyName}</td>
        <td style="${tdStyle}">${c.currentHealthScore}/100</td>
        <td style="${tdStyle}">${c.predictedHealthScore}/100</td>
        <td style="${tdStyle}"><span style="color:${trendColor};font-weight:600;">${c.riskTrend}</span></td>
        <td style="${tdStyle}">${riskBadge(c.clientRisk)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
  <p style="color:#6b7280;font-size:13px;">
    This is an automated ops digest. View full reports in your MyWorkDay dashboard.
    Generated: ${date}
  </p>
</body>
</html>`;

  return html;
}

export async function sendDigestToRecipients(
  tenantId: string,
  schedule: {
    id: string;
    recipientsScope: string;
    targetUserIds?: string[] | null;
  }
): Promise<void> {
  const sections = await generateDigest(tenantId);
  const html = generateDigestHtml(sections);
  const subject = `Weekly Ops Digest — ${new Date(sections.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  const roleFilter = schedule.recipientsScope === "project_managers"
    ? ["project_manager", "admin", "super_user"]
    : ["admin", "super_user"];

  let recipientRows: Array<{ email: string }>;
  if (schedule.recipientsScope === "custom" && schedule.targetUserIds?.length) {
    recipientRows = await dbRows<{ email: string }>(sql`
      SELECT email FROM users
      WHERE tenant_id = ${tenantId} AND id = ANY(${schedule.targetUserIds}::text[]) AND is_active = true
    `);
  } else {
    recipientRows = await dbRows<{ email: string }>(sql`
      SELECT email FROM users
      WHERE tenant_id = ${tenantId} AND role = ANY(${roleFilter}::text[]) AND is_active = true
    `);
  }

  for (const row of recipientRows) {
    try {
      await emailOutboxService.sendEmail({
        tenantId,
        messageType: "other",
        toEmail: row.email,
        subject,
        textBody: `Weekly Ops Digest\n\nTeam avg utilization: ${sections.teamAvgUtilization}%\nProjects at risk: ${sections.projectsAtRisk.length}\nClients at risk: ${sections.clientsAtRisk.length}`,
        htmlBody: html,
        metadata: { digestScheduleId: schedule.id },
      });
    } catch (err) {
      console.warn({ err, email: row.email }, "Failed to send ops digest email");
    }
  }

  await db.execute(sql`
    UPDATE ops_digest_schedules SET last_sent_at = NOW() WHERE id = ${schedule.id}
  `);
  console.log({ tenantId, recipients: recipientRows.length }, "Ops digest sent");
}
