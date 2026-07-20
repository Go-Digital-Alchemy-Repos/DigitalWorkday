import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { AppError } from "../lib/errors";
import {
  ClientAccessLevel,
  CommentVisibility,
  UserRole,
  clientUserAccess,
  clients,
  commentMentions,
  type Client,
  type ClientUserAccess,
  type Comment,
  type User,
} from "@shared/schema";

export type PortalAccessMatrixEntry = {
  client: Client;
  access: ClientUserAccess | null;
  relationship: "current" | "child" | "descendant" | "other";
};

export type PortalAccessScopeInput = {
  entries: Array<{
    clientId: string;
    accessLevel: typeof ClientAccessLevel.VIEWER | typeof ClientAccessLevel.COLLABORATOR;
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

  const [clientRows, accessRows] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, visibleClientIds)))
      .orderBy(asc(clients.companyName)),
    db.select().from(clientUserAccess).where(eq(clientUserAccess.userId, userId)),
  ]);

  const accessByClient = new Map(accessRows.map((access) => [access.clientId, access]));

  return clientRows.map((client) => ({
    client,
    access: accessByClient.get(client.id) || null,
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

  await db.transaction(async (tx) => {
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
        })),
      );
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
