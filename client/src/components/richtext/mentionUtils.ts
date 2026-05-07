export type MentionableUser = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  displayName?: string | null;
};

function compactParts(parts: Array<string | null | undefined>): string[] {
  return parts.map((part) => part?.trim() || "").filter(Boolean);
}

export function getMentionUserLabel(user: MentionableUser): string {
  const fullName = compactParts([user.firstName, user.lastName]).join(" ");
  return user.displayName || user.name || fullName || user.email || "Unknown";
}

export function matchesMentionUser(user: MentionableUser, query: string): boolean {
  const searchText = query.trim().toLowerCase();
  if (!searchText) {
    return true;
  }

  const searchFields = [
    user.displayName,
    user.name,
    user.email,
    user.firstName,
    user.lastName,
    compactParts([user.firstName, user.lastName]).join(" "),
  ]
    .map((field) => field?.toLowerCase().trim())
    .filter(Boolean);

  return searchFields.some((field) => field!.includes(searchText));
}

export function mergeMentionUsers(...userLists: Array<MentionableUser[] | undefined>): MentionableUser[] {
  const merged = userLists.flatMap((list) => list || []);
  return merged.filter(
    (user, index, all) => all.findIndex((candidate) => candidate.id === user.id) === index,
  );
}
