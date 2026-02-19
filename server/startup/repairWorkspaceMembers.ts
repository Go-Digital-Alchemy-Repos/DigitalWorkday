import { db } from "../db";
import { sql } from "drizzle-orm";

export async function repairDemoWorkspaceMembers(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE workspace_members wm
      SET workspace_id = w.id
      FROM users u
      JOIN workspaces w ON w.tenant_id = u.tenant_id AND w.is_primary = true
      WHERE wm.workspace_id = 'demo-workspace-id'
        AND wm.user_id = u.id
        AND u.tenant_id IS NOT NULL
    `);

    const count = (result as any)?.rowCount || 0;
    if (count > 0) {
      console.log(`[workspace-repair] Fixed ${count} workspace members from demo-workspace-id to their correct primary workspace`);
    }
  } catch (err) {
    console.warn("[workspace-repair] Could not repair demo-workspace-id members:", err instanceof Error ? err.message : err);
  }
}
