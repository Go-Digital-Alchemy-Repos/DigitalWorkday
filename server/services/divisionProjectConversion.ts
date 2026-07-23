import { and, countDistinct, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  clientDivisions,
  clients,
  divisionMembers,
  divisionProjectConversions,
  projectAccess,
  projectMembers,
  projects,
  users,
} from "@shared/schema";

export interface DivisionConversionCandidate {
  divisionId: string;
  tenantId: string;
  clientId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  projectCount: number;
  memberCount: number;
  eligible: boolean;
  reason: "empty" | "has_projects";
}

export interface DivisionConversionResult {
  divisionId: string;
  projectId: string;
  projectName: string;
  memberCount: number;
}

export function classifyDivisionConversion(projectCount: number): Pick<DivisionConversionCandidate, "eligible" | "reason"> {
  return projectCount === 0
    ? { eligible: true, reason: "empty" }
    : { eligible: false, reason: "has_projects" };
}

export function replacementProjectValues(division: {
  tenantId: string;
  clientId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
}, memberUserIds: string[]) {
  return {
    tenantId: division.tenantId,
    workspaceId: division.workspaceId,
    clientId: division.clientId,
    divisionId: null,
    name: division.name,
    description: division.description,
    color: division.color || "#3B82F6",
    visibility: memberUserIds.length > 0 ? "private" : "workspace",
    status: division.isActive ? "active" : "archived",
    createdBy: memberUserIds[0] || null,
  } as const;
}

export async function getDivisionConversionPlan(tenantId: string): Promise<DivisionConversionCandidate[]> {
  const rows = await db
    .select({
      divisionId: clientDivisions.id,
      tenantId: clientDivisions.tenantId,
      clientId: clientDivisions.clientId,
      workspaceId: clients.workspaceId,
      name: clientDivisions.name,
      description: clientDivisions.description,
      color: clientDivisions.color,
      isActive: clientDivisions.isActive,
      projectCount: countDistinct(projects.id),
      memberCount: countDistinct(divisionMembers.userId),
    })
    .from(clientDivisions)
    .innerJoin(clients, and(
      eq(clients.id, clientDivisions.clientId),
      eq(clients.tenantId, clientDivisions.tenantId),
    ))
    .leftJoin(projects, eq(projects.divisionId, clientDivisions.id))
    .leftJoin(divisionMembers, eq(divisionMembers.divisionId, clientDivisions.id))
    .leftJoin(divisionProjectConversions, eq(divisionProjectConversions.divisionId, clientDivisions.id))
    .where(and(
      eq(clientDivisions.tenantId, tenantId),
      isNull(divisionProjectConversions.id),
    ))
    .groupBy(
      clientDivisions.id,
      clientDivisions.tenantId,
      clientDivisions.clientId,
      clients.workspaceId,
      clientDivisions.name,
      clientDivisions.description,
      clientDivisions.color,
      clientDivisions.isActive,
    )
    .orderBy(clients.workspaceId, clientDivisions.clientId, clientDivisions.name);

  return rows.map(row => ({
    ...row,
    projectCount: Number(row.projectCount),
    memberCount: Number(row.memberCount),
    ...classifyDivisionConversion(Number(row.projectCount)),
  }));
}

export async function convertEmptyDivisions(tenantId: string): Promise<DivisionConversionResult[]> {
  const plan = await getDivisionConversionPlan(tenantId);
  const results: DivisionConversionResult[] = [];

  for (const candidate of plan.filter(item => item.eligible)) {
    const converted = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM client_divisions WHERE id = ${candidate.divisionId} FOR UPDATE`);

      const [division] = await tx
        .select({
          id: clientDivisions.id,
          tenantId: clientDivisions.tenantId,
          clientId: clientDivisions.clientId,
          workspaceId: clients.workspaceId,
          name: clientDivisions.name,
          description: clientDivisions.description,
          color: clientDivisions.color,
          isActive: clientDivisions.isActive,
        })
        .from(clientDivisions)
        .innerJoin(clients, eq(clients.id, clientDivisions.clientId))
        .where(and(
          eq(clientDivisions.id, candidate.divisionId),
          eq(clientDivisions.tenantId, tenantId),
        ))
        .limit(1);

      if (!division) return null;

      const [existingConversion] = await tx
        .select({ projectId: divisionProjectConversions.projectId })
        .from(divisionProjectConversions)
        .where(eq(divisionProjectConversions.divisionId, division.id))
        .limit(1);
      if (existingConversion) return null;

      const [projectTotal] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(eq(projects.divisionId, division.id));
      if (Number(projectTotal?.count || 0) > 0) return null;

      const members = await tx
        .select({ userId: divisionMembers.userId, role: divisionMembers.role })
        .from(divisionMembers)
        .where(and(
          eq(divisionMembers.divisionId, division.id),
          eq(divisionMembers.tenantId, tenantId),
        ));
      const orderedMembers = [...members].sort((a, b) => (a.role === "admin" ? -1 : 0) - (b.role === "admin" ? -1 : 0));
      const memberUserIds = orderedMembers.map(member => member.userId);
      const values = replacementProjectValues(division, memberUserIds);

      const [project] = await tx.insert(projects).values(values).returning();

      let projectMemberships = orderedMembers.map(member => ({
        projectId: project.id,
        userId: member.userId,
        role: member.role === "admin" ? "owner" : "member",
      }));

      if (projectMemberships.length === 0) {
        const tenantUsers = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));
        projectMemberships = tenantUsers.map(user => ({ projectId: project.id, userId: user.id, role: "member" }));
      }

      if (projectMemberships.length > 0) {
        await tx.insert(projectMembers).values(projectMemberships).onConflictDoNothing();
      }

      if (members.length > 0) {
        await tx.insert(projectAccess).values(members.map(member => ({
          tenantId,
          projectId: project.id,
          userId: member.userId,
          role: member.role === "admin" ? "admin" : "editor",
          invitedByUserId: null,
        }))).onConflictDoNothing();
      }

      await tx.insert(divisionProjectConversions).values({
        tenantId,
        clientId: division.clientId,
        divisionId: division.id,
        projectId: project.id,
        divisionName: division.name,
        divisionSnapshot: {
          ...division,
          members,
        },
      });

      await tx.delete(divisionMembers).where(eq(divisionMembers.divisionId, division.id));
      await tx.delete(clientDivisions).where(eq(clientDivisions.id, division.id));

      return {
        divisionId: division.id,
        projectId: project.id,
        projectName: project.name,
        memberCount: members.length,
      };
    });

    if (converted) results.push(converted);
  }

  return results;
}
