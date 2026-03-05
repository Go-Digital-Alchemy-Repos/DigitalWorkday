import { db } from "../../db";
import { sql } from "drizzle-orm";
import type { CommunicationEventTypeValue } from "../../../shared/schema";

export interface TimelineEvent {
  id: string;
  tenantId: string;
  clientId: string | null;
  projectId: string | null;
  eventType: CommunicationEventTypeValue;
  eventDescription: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  projectName: string | null;
  clientName: string | null;
  createdAt: string;
}

export async function logCommunicationEvent(params: {
  tenantId: string;
  clientId?: string | null;
  projectId?: string | null;
  eventType: CommunicationEventTypeValue;
  eventDescription?: string | null;
  createdByUserId?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO client_communication_events
      (tenant_id, client_id, project_id, event_type, event_description, created_by_user_id)
    VALUES
      (${params.tenantId},
       ${params.clientId ?? null},
       ${params.projectId ?? null},
       ${params.eventType},
       ${params.eventDescription ?? null},
       ${params.createdByUserId ?? null})
  `);
}

export async function getProjectCommunicationEvents(
  projectId: string,
  tenantId: string,
  limit = 100
): Promise<TimelineEvent[]> {
  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.tenant_id,
      e.client_id,
      e.project_id,
      e.event_type,
      e.event_description,
      e.created_by_user_id,
      e.created_at,
      TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS created_by_name,
      p.name AS project_name,
      c.company_name AS client_name
    FROM client_communication_events e
    LEFT JOIN users u ON u.id = e.created_by_user_id
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN clients c ON c.id = e.client_id
    WHERE e.project_id = ${projectId}
      AND e.tenant_id = ${tenantId}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `);

  const rawRows = (rows as any).rows ?? (rows as any) ?? [];
  return rawRows.map(mapRow);
}

export async function getClientCommunicationEvents(
  clientId: string,
  tenantId: string,
  limit = 200
): Promise<TimelineEvent[]> {
  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.tenant_id,
      e.client_id,
      e.project_id,
      e.event_type,
      e.event_description,
      e.created_by_user_id,
      e.created_at,
      TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS created_by_name,
      p.name AS project_name,
      c.company_name AS client_name
    FROM client_communication_events e
    LEFT JOIN users u ON u.id = e.created_by_user_id
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN clients c ON c.id = e.client_id
    WHERE e.client_id = ${clientId}
      AND e.tenant_id = ${tenantId}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `);

  const rawRows = (rows as any).rows ?? (rows as any) ?? [];
  return rawRows.map(mapRow);
}

function mapRow(r: any): TimelineEvent {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    clientId: r.client_id ?? null,
    projectId: r.project_id ?? null,
    eventType: r.event_type,
    eventDescription: r.event_description ?? null,
    createdByUserId: r.created_by_user_id ?? null,
    createdByName: r.created_by_name || null,
    projectName: r.project_name ?? null,
    clientName: r.client_name ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}
