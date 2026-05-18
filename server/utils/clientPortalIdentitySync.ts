import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  clientContacts,
  clientUserAccess,
  users,
  UserRole,
  type ClientContact,
  type User,
} from "@shared/schema";

function normalizedEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || "";
}

function displayName(firstName: string | null | undefined, lastName: string | null | undefined, fallback: string) {
  return `${firstName || ""} ${lastName || ""}`.trim() || fallback;
}

export async function syncPortalUserFromClientContact(contact: ClientContact) {
  const email = normalizedEmail(contact.email);
  if (!email) return;

  const [match] = await db
    .select({ user: users })
    .from(clientUserAccess)
    .innerJoin(users, eq(users.id, clientUserAccess.userId))
    .where(and(
      eq(clientUserAccess.clientId, contact.clientId),
      eq(users.role, UserRole.CLIENT),
      sql`lower(${users.email}) = ${email}`,
    ))
    .limit(1);

  const user = match?.user;
  if (!user) return;

  await db
    .update(users)
    .set({
      firstName: contact.firstName || null,
      lastName: contact.lastName || null,
      name: displayName(contact.firstName, contact.lastName, user.email),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}

export async function syncPortalUsersFromClientContacts(clientId: string) {
  const contacts = await db
    .select()
    .from(clientContacts)
    .where(eq(clientContacts.clientId, clientId));

  for (const contact of contacts) {
    await syncPortalUserFromClientContact(contact);
  }
}

export async function syncClientContactsFromPortalUser(user: Pick<User, "id" | "email" | "role" | "firstName" | "lastName">) {
  const email = normalizedEmail(user.email);
  if (!email || user.role !== UserRole.CLIENT) return;

  const accessRows = await db
    .select({ clientId: clientUserAccess.clientId })
    .from(clientUserAccess)
    .where(eq(clientUserAccess.userId, user.id));

  const clientIds = [...new Set(accessRows.map((row) => row.clientId).filter(Boolean))];
  if (clientIds.length === 0) return;

  await db
    .update(clientContacts)
    .set({
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      updatedAt: new Date(),
    })
    .where(and(
      inArray(clientContacts.clientId, clientIds),
      sql`lower(${clientContacts.email}) = ${email}`,
    ));
}
