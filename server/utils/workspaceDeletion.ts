import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function deleteWorkspaceCascade(workspaceId: string): Promise<{ deletedCounts: Record<string, number> }> {
  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    const projectIds = await tx.execute(
      sql`SELECT id FROM projects WHERE workspace_id = ${workspaceId}`
    );
    const pIds = (projectIds.rows as any[]).map((r: any) => r.id);

    if (pIds.length > 0) {
      const taskIds = await tx.execute(
        sql`SELECT id FROM tasks WHERE project_id = ANY(${pIds})`
      );
      const tIds = (taskIds.rows as any[]).map((r: any) => r.id);

      if (tIds.length > 0) {
        await tx.execute(sql`DELETE FROM subtask_tags WHERE subtask_id IN (SELECT id FROM subtasks WHERE task_id = ANY(${tIds}))`);
        const r1 = await tx.execute(sql`DELETE FROM subtasks WHERE task_id = ANY(${tIds})`);
        counts.subtasks = Number(r1.rowCount ?? 0);
        const r2 = await tx.execute(sql`DELETE FROM comments WHERE task_id = ANY(${tIds})`);
        counts.comments = Number(r2.rowCount ?? 0);
        const r3 = await tx.execute(sql`DELETE FROM task_assignees WHERE task_id = ANY(${tIds})`);
        counts.task_assignees = Number(r3.rowCount ?? 0);
        const r4 = await tx.execute(sql`DELETE FROM task_tags WHERE task_id = ANY(${tIds})`);
        counts.task_tags = Number(r4.rowCount ?? 0);
        const r5 = await tx.execute(sql`DELETE FROM task_watchers WHERE task_id = ANY(${tIds})`);
        counts.task_watchers = Number(r5.rowCount ?? 0);
        const r6 = await tx.execute(sql`DELETE FROM task_attachments WHERE task_id = ANY(${tIds})`);
        counts.task_attachments = Number(r6.rowCount ?? 0);
        const r7 = await tx.execute(sql`DELETE FROM active_timers WHERE task_id = ANY(${tIds})`);
        counts.active_timers_task = Number(r7.rowCount ?? 0);
        const r8 = await tx.execute(sql`DELETE FROM time_entries WHERE task_id = ANY(${tIds})`);
        counts.time_entries_task = Number(r8.rowCount ?? 0);
        const r9 = await tx.execute(sql`DELETE FROM approval_requests WHERE task_id = ANY(${tIds})`);
        counts.approval_requests_task = Number(r9.rowCount ?? 0);
      }

      const r10 = await tx.execute(sql`DELETE FROM tasks WHERE project_id = ANY(${pIds})`);
      counts.tasks = Number(r10.rowCount ?? 0);
      const r11 = await tx.execute(sql`DELETE FROM sections WHERE project_id = ANY(${pIds})`);
      counts.sections = Number(r11.rowCount ?? 0);
      const r12 = await tx.execute(sql`DELETE FROM project_members WHERE project_id = ANY(${pIds})`);
      counts.project_members = Number(r12.rowCount ?? 0);
      const r13 = await tx.execute(sql`DELETE FROM project_notes WHERE project_id = ANY(${pIds})`);
      counts.project_notes = Number(r13.rowCount ?? 0);
      const r14 = await tx.execute(sql`DELETE FROM hidden_projects WHERE project_id = ANY(${pIds})`);
      counts.hidden_projects = Number(r14.rowCount ?? 0);
      const r15 = await tx.execute(sql`DELETE FROM approval_requests WHERE project_id = ANY(${pIds})`);
      counts.approval_requests_project = Number(r15.rowCount ?? 0);
      const r16 = await tx.execute(sql`DELETE FROM client_conversations WHERE project_id = ANY(${pIds})`);
      counts.client_conversations = Number(r16.rowCount ?? 0);
      const r17 = await tx.execute(sql`DELETE FROM active_timers WHERE project_id = ANY(${pIds})`);
      counts.active_timers_project = Number(r17.rowCount ?? 0);
      const r18 = await tx.execute(sql`DELETE FROM time_entries WHERE project_id = ANY(${pIds})`);
      counts.time_entries_project = Number(r18.rowCount ?? 0);
      const r19 = await tx.execute(sql`DELETE FROM task_attachments WHERE project_id = ANY(${pIds})`);
      counts.task_attachments_project = Number(r19.rowCount ?? 0);
    }

    const r20 = await tx.execute(sql`DELETE FROM projects WHERE workspace_id = ${workspaceId}`);
    counts.projects = Number(r20.rowCount ?? 0);

    const clientIds = await tx.execute(
      sql`SELECT id FROM clients WHERE workspace_id = ${workspaceId}`
    );
    const cIds = (clientIds.rows as any[]).map((r: any) => r.id);

    if (cIds.length > 0) {
      await tx.execute(sql`DELETE FROM client_contacts WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_conversations WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_crm WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_documents WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_document_folders WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_document_categories WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_files WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_notes WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_user_access WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM client_invites WHERE client_id = ANY(${cIds})`);
      const divisionIds = await tx.execute(
        sql`SELECT id FROM client_divisions WHERE client_id = ANY(${cIds})`
      );
      const dIds = (divisionIds.rows as any[]).map((r: any) => r.id);
      if (dIds.length > 0) {
        await tx.execute(sql`DELETE FROM division_members WHERE division_id = ANY(${dIds})`);
      }
      await tx.execute(sql`DELETE FROM client_divisions WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM user_client_access WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM active_timers WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM approval_requests WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM invitations WHERE client_id = ANY(${cIds})`);
      await tx.execute(sql`DELETE FROM time_entries WHERE client_id = ANY(${cIds})`);
    }

    const r21 = await tx.execute(sql`DELETE FROM clients WHERE workspace_id = ${workspaceId}`);
    counts.clients = Number(r21.rowCount ?? 0);

    const teamIds = await tx.execute(
      sql`SELECT id FROM teams WHERE workspace_id = ${workspaceId}`
    );
    const tmIds = (teamIds.rows as any[]).map((r: any) => r.id);

    if (tmIds.length > 0) {
      await tx.execute(sql`DELETE FROM team_members WHERE team_id = ANY(${tmIds})`);
    }

    const r22 = await tx.execute(sql`DELETE FROM teams WHERE workspace_id = ${workspaceId}`);
    counts.teams = Number(r22.rowCount ?? 0);

    const r23 = await tx.execute(sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}`);
    counts.workspace_members = Number(r23.rowCount ?? 0);
    const r24 = await tx.execute(sql`DELETE FROM tags WHERE workspace_id = ${workspaceId}`);
    counts.tags = Number(r24.rowCount ?? 0);
    const r25 = await tx.execute(sql`DELETE FROM activity_log WHERE workspace_id = ${workspaceId}`);
    counts.activity_log = Number(r25.rowCount ?? 0);
    const r26 = await tx.execute(sql`DELETE FROM invitations WHERE workspace_id = ${workspaceId}`);
    counts.invitations = Number(r26.rowCount ?? 0);
    const r27 = await tx.execute(sql`DELETE FROM active_timers WHERE workspace_id = ${workspaceId}`);
    counts.active_timers = Number(r27.rowCount ?? 0);
    const r28 = await tx.execute(sql`DELETE FROM time_entries WHERE workspace_id = ${workspaceId}`);
    counts.time_entries = Number(r28.rowCount ?? 0);
    const r29 = await tx.execute(sql`DELETE FROM app_settings WHERE workspace_id = ${workspaceId}`);
    counts.app_settings = Number(r29.rowCount ?? 0);
    const r30 = await tx.execute(sql`DELETE FROM client_contacts WHERE workspace_id = ${workspaceId}`);
    counts.client_contacts = Number(r30.rowCount ?? 0);
    const r31 = await tx.execute(sql`DELETE FROM client_user_access WHERE workspace_id = ${workspaceId}`);
    counts.client_user_access = Number(r31.rowCount ?? 0);
    await tx.execute(sql`DELETE FROM asana_import_runs WHERE target_workspace_id = ${workspaceId}`);

    const r32 = await tx.execute(sql`DELETE FROM workspaces WHERE id = ${workspaceId}`);
    counts.workspaces = Number(r32.rowCount ?? 0);
  });

  return { deletedCounts: counts };
}
