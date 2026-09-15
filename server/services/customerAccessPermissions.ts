import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { AppError } from "../lib/errors";
import {
  ClientAccessLevel,
  CommentVisibility,
  UserRole,
  clientUserAccess,
  clientUserProjectAccess,
  clients,
  commentMentions,
  projects,
  type Client,
  type ClientUserAccess,
  type Comment,
  type User,
} from "@shared/schema";

export type PortalAccessMatrixEntry = {
  client: Client;
  access: ClientUserAccess | null;
  projectIds: string[];
  projects: Array<typeof projects.$inferSelect>;
  relationship: "current" | "child" | "descendant" | "other";
};

export type PortalAccessOption = {
  client: Client;
  projects: Array<typeof projects.$inferSelect>;
  relationship: PortalAccessMatrixEntry["relationship"];
};

export type PortalAccessScopeInput = {
  entries: Array<{
    clientId: string;
    accessLevel: typeof ClientAccessLevel.COLLABORATOR | typeof ClientAccessLevel.CLIENT_ADMIN;
    projectScope?: "all_visible" | "selected";
    projectIds?: string[];
  }>;
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export async function getClientDescendantIds(parentClientId: string, tenantId: string): Promise<string[]> {
  const descendantIds: string[] = [];
  let frontier = [parentClientId];

  while (frontier.length > 0) {
    const children = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.parentClientId, frontier)));

    const childIds = children.map((child) => child.id).filter((id) => !descendantIds.includes(id));
    descendantIds.push(...childIds);
    frontier = childIds;
  }

  return descendantIds;
}

export async function getPortalAccessMatrix(
  tenantId: string,
  rootClientId: string,
  userId: string,
): Promise<PortalAccessMatrixEntry[]> {
  const [rootClient] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, rootClientId), eq(clients.tenantId, tenantId)));

  if (!rootClient) {
    return [];
  }

  const descendantIds = await getClientDescendantIds(rootClientId, tenantId);
  const visibleClientIds = unique([rootClientId, ...descendantIds]);

  const [clientRows, accessRows, projectGrantRows, projectRows] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, visibleClientIds)))
      .orderBy(asc(clients.companyName)),
    db.select().from(clientUserAccess).where(eq(clientUserAccess.userId, userId)),
    db.select().from(clientUserProjectAccess).where(eq(clientUserProjectAccess.userId, userId)),
    db.select().from(projects).where(and(
      eq(projects.tenantId, tenantId),
      inArray(projects.clientId, visibleClientIds),
    )),
  ]);

  const accessByClient = new Map(accessRows.map((access) => [access.clientId, access]));
  const projectIdsByClient = new Map<string, string[]>();
  for (const grant of projectGrantRows) {
    const ids = projectIdsByClient.get(grant.clientId) || [];
    ids.push(grant.projectId);
    projectIdsByClient.set(grant.clientId, ids);
  }

  return clientRows.map((client) => ({
    client,
    access: accessByClient.get(client.id) || null,
    projectIds: projectIdsByClient.get(client.id) || [],
    projects: projectRows.filter((project) => project.clientId === client.id && project.visibility !== "private"),
    relationship: client.id === rootClientId ? "current" : client.parentClientId === rootClientId ? "child" : "descendant",
  }));
}

export async function getPortalAccessOptions(
  tenantId: string,
  rootClientId: string,
): Promise<PortalAccessOption[]> {
  const [rootClient] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, rootClientId), eq(clients.tenantId, tenantId)));

  if (!rootClient) {
    return [];
  }

  const descendantIds = await getClientDescendantIds(rootClientId, tenantId);
  const visibleClientIds = unique([rootClientId, ...descendantIds]);
  const clientRows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, visibleClientIds)))
    .orderBy(asc(clients.companyName));

  const projectRows = await db.select()
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), inArray(projects.clientId, visibleClientIds)));

  return clientRows.map((client) => ({
    client,
    projects: projectRows.filter((project) => project.clientId === client.id && project.visibility !== "private"),
    relationship: client.id === rootClientId ? "current" : client.parentClientId === rootClientId ? "child" : "descendant",
  }));
}

export async function replacePortalAccessScope(
  tenantId: string,
  workspaceId: string,
  rootClientId: string,
  userId: string,
  input: PortalAccessScopeInput,
): Promise<PortalAccessMatrixEntry[]> {
  const user = await storage.getUser(userId);
  if (!user || user.role !== UserRole.CLIENT || user.tenantId !== tenantId) {
    throw AppError.notFound("Portal user");
  }

  const allowedIds = unique([rootClientId, ...(await getClientDescendantIds(rootClientId, tenantId))]);
  const requestedIds = unique(input.entries.map((entry) => entry.clientId));
  const invalidId = requestedIds.find((clientId) => !allowedIds.includes(clientId));
  if (invalidId) {
    throw AppError.badRequest("Access can only be managed for this client and its child accounts");
  }

  const requestedProjectIds = unique(input.entries.flatMap((entry) => entry.projectIds || []));
  const projectRows = requestedProjectIds.length > 0
    ? await db.select({ id: projects.id, clientId: projects.clientId })
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), inArray(projects.id, requestedProjectIds)))
    : [];
  const projectById = new Map(projectRows.map((project) => [project.id, project]));
  for (const entry of input.entries) {
    if (entry.projectScope !== "selected") continue;
    for (const projectId of unique(entry.projectIds || [])) {
      if (projectById.get(projectId)?.clientId !== entry.clientId) {
        throw AppError.badRequest("Selected projects must belong to their client account");
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(clientUserProjectAccess).where(and(
      eq(clientUserProjectAccess.userId, userId),
      inArray(clientUserProjectAccess.clientId, allowedIds),
    ));
    await tx
      .delete(clientUserAccess)
      .where(and(eq(clientUserAccess.userId, userId), inArray(clientUserAccess.clientId, allowedIds)));

    if (input.entries.length > 0) {
      await tx.insert(clientUserAccess).values(
        input.entries.map((entry) => ({
          workspaceId,
          clientId: entry.clientId,
          userId,
          accessLevel: entry.accessLevel,
          projectScope: entry.projectScope || "all_visible",
        })),
      );

      const selectedGrants = input.entries.flatMap((entry) =>
        entry.projectScope === "selected"
          ? unique(entry.projectIds || []).map((projectId) => ({
              workspaceId,
              clientId: entry.clientId,
              projectId,
              userId,
            }))
          : [],
      );
      if (selectedGrants.length > 0) {
        await tx.insert(clientUserProjectAccess).values(selectedGrants);
      }
    }
  });

  return getPortalAccessMatrix(tenantId, rootClientId, userId);
}

export async function filterCommentsForPortalUser<T extends Comment & { user?: User }>(
  commentsList: T[],
  portalUserId: string,
): Promise<T[]> {
  if (commentsList.length === 0) return [];

  const commentIds = commentsList.map((comment) => comment.id);
  const mentionRows = await db
    .select({ commentId: commentMentions.commentId })
    .from(commentMentions)
    .where(and(
      eq(commentMentions.mentionedUserId, portalUserId),
      inArray(commentMentions.commentId, commentIds),
    ));

  const mentionedCommentIds = new Set(mentionRows.map((row) => row.commentId));

  return commentsList.filter((comment) => (
    comment.visibility === CommentVisibility.CLIENT_VISIBLE ||
    comment.userId === portalUserId ||
    mentionedCommentIds.has(comment.id)
  ));
}
