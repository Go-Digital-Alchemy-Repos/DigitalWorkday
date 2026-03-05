import { db } from "../../db";
import { sql } from "drizzle-orm";
import { computeHealthStatus, type CommunicationHealthStatus } from "./communicationHealthService";

export interface FollowUpProject {
  projectId: string;
  projectName: string;
  projectColor: string;
  clientId: string | null;
  clientName: string | null;
  lastClientContactAt: Date | null;
  lastStatusReportAt: Date | null;
  nextFollowupDueAt: Date | null;
  daysSinceContact: number | null;
  communicationStatus: CommunicationHealthStatus;
  followupOverdue: boolean;
}

export async function getProjectsNeedingFollowup(tenantId: string): Promise<FollowUpProject[]> {
  const now = new Date();
  const warningThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      COALESCE(p.color, '#3B82F6') AS project_color,
      p.client_id,
      c.company_name AS client_name,
      p.last_client_contact_at,
      p.last_status_report_at,
      p.next_followup_due_at,
      CASE
        WHEN p.last_client_contact_at IS NULL THEN NULL
        ELSE EXTRACT(DAY FROM (NOW() - p.last_client_contact_at))::int
      END AS days_since_contact
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.tenant_id = ${tenantId}
      AND p.status = 'active'
      AND (
        p.last_client_contact_at IS NULL
        OR p.last_client_contact_at < ${warningThreshold}
        OR (p.next_followup_due_at IS NOT NULL AND p.next_followup_due_at <= ${now})
      )
    ORDER BY
      CASE WHEN p.last_client_contact_at IS NULL THEN 0 ELSE 1 END,
      p.last_client_contact_at ASC NULLS FIRST
    LIMIT 50
  `);

  const rawRows = (rows as any).rows ?? (rows as any) ?? [];

  return rawRows.map((row: any) => {
    const lastContact = row.last_client_contact_at ? new Date(row.last_client_contact_at) : null;
    const nextFollowup = row.next_followup_due_at ? new Date(row.next_followup_due_at) : null;
    return {
      projectId: row.project_id,
      projectName: row.project_name,
      projectColor: row.project_color,
      clientId: row.client_id ?? null,
      clientName: row.client_name ?? null,
      lastClientContactAt: lastContact,
      lastStatusReportAt: row.last_status_report_at ? new Date(row.last_status_report_at) : null,
      nextFollowupDueAt: nextFollowup,
      daysSinceContact: row.days_since_contact !== null ? parseInt(row.days_since_contact, 10) : null,
      communicationStatus: computeHealthStatus(lastContact),
      followupOverdue: nextFollowup !== null && nextFollowup <= now,
    };
  });
}
