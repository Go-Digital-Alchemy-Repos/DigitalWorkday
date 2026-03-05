import { db } from "../../db";
import { sql } from "drizzle-orm";

export type CommunicationHealthStatus = "healthy" | "warning" | "stale" | "never_contacted";

export interface ProjectCommunicationHealth {
  projectId: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  lastClientContactAt: Date | null;
  lastStatusReportAt: Date | null;
  nextFollowupDueAt: Date | null;
  daysSinceContact: number | null;
  status: CommunicationHealthStatus;
}

export interface CommunicationHealthSummary {
  projectsNeedingFollowup: number;
  clientsNotContactedRecently: number;
  statusReportsSentThisWeek: number;
  staleProjects: number;
  warningProjects: number;
  healthyProjects: number;
}

const HEALTHY_DAYS = 7;
const WARNING_DAYS = 14;
const DEFAULT_FOLLOWUP_DAYS = 7;

export function computeHealthStatus(lastContactAt: Date | null): CommunicationHealthStatus {
  if (!lastContactAt) return "never_contacted";
  const days = Math.floor((Date.now() - lastContactAt.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= HEALTHY_DAYS) return "healthy";
  if (days <= WARNING_DAYS) return "warning";
  return "stale";
}

export async function recordClientContact(projectId: string, tenantId: string): Promise<void> {
  const now = new Date();
  const followupDue = new Date(now.getTime() + DEFAULT_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000);
  await db.execute(sql`
    UPDATE projects
    SET last_client_contact_at = ${now},
        next_followup_due_at = ${followupDue},
        updated_at = ${now}
    WHERE id = ${projectId}
      AND tenant_id = ${tenantId}
  `);
}

export async function updateStatusReportSent(projectId: string, tenantId: string): Promise<void> {
  const now = new Date();
  await db.execute(sql`
    UPDATE projects
    SET last_status_report_at = ${now},
        updated_at = ${now}
    WHERE id = ${projectId}
      AND tenant_id = ${tenantId}
  `);
}

export async function calculateCommunicationHealth(
  projectId: string,
  tenantId: string
): Promise<ProjectCommunicationHealth | null> {
  const rows = await db.execute(sql`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.client_id,
      c.company_name AS client_name,
      p.last_client_contact_at,
      p.last_status_report_at,
      p.next_followup_due_at
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ${projectId}
      AND p.tenant_id = ${tenantId}
    LIMIT 1
  `);

  const row = (rows as any).rows?.[0] ?? rows?.[0];
  if (!row) return null;

  const lastContact = row.last_client_contact_at ? new Date(row.last_client_contact_at) : null;
  const daysSinceContact = lastContact
    ? Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    projectId: row.project_id,
    projectName: row.project_name,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
    lastClientContactAt: lastContact,
    lastStatusReportAt: row.last_status_report_at ? new Date(row.last_status_report_at) : null,
    nextFollowupDueAt: row.next_followup_due_at ? new Date(row.next_followup_due_at) : null,
    daysSinceContact,
    status: computeHealthStatus(lastContact),
  };
}

export async function getCommunicationHealthSummary(tenantId: string): Promise<CommunicationHealthSummary> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const warningThreshold = new Date(now.getTime() - WARNING_DAYS * 24 * 60 * 60 * 1000);
  const healthyThreshold = new Date(now.getTime() - HEALTHY_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE (next_followup_due_at IS NOT NULL AND next_followup_due_at <= ${now})
           OR (last_client_contact_at IS NULL)
           OR (last_client_contact_at < ${warningThreshold})
      ) AS projects_needing_followup,
      COUNT(DISTINCT client_id) FILTER (
        WHERE client_id IS NOT NULL
          AND (last_client_contact_at IS NULL OR last_client_contact_at < ${warningThreshold})
      ) AS clients_not_contacted_recently,
      COUNT(*) FILTER (
        WHERE last_status_report_at >= ${weekAgo}
      ) AS status_reports_sent_this_week,
      COUNT(*) FILTER (
        WHERE last_client_contact_at IS NOT NULL
          AND last_client_contact_at < ${warningThreshold}
      ) AS stale_projects,
      COUNT(*) FILTER (
        WHERE last_client_contact_at IS NOT NULL
          AND last_client_contact_at >= ${warningThreshold}
          AND last_client_contact_at < ${healthyThreshold}
      ) AS warning_projects,
      COUNT(*) FILTER (
        WHERE last_client_contact_at IS NOT NULL
          AND last_client_contact_at >= ${healthyThreshold}
      ) AS healthy_projects
    FROM projects
    WHERE tenant_id = ${tenantId}
      AND status = 'active'
  `);

  const row = (rows as any).rows?.[0] ?? (rows as any)?.[0] ?? {};
  return {
    projectsNeedingFollowup: parseInt(row.projects_needing_followup ?? "0", 10),
    clientsNotContactedRecently: parseInt(row.clients_not_contacted_recently ?? "0", 10),
    statusReportsSentThisWeek: parseInt(row.status_reports_sent_this_week ?? "0", 10),
    staleProjects: parseInt(row.stale_projects ?? "0", 10),
    warningProjects: parseInt(row.warning_projects ?? "0", 10),
    healthyProjects: parseInt(row.healthy_projects ?? "0", 10),
  };
}
