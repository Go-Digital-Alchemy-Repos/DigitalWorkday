export interface UserDisplay {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  email?: string;
}

export function buildUserDisplayName(user: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  if (user.name) return user.name;
  if (user.email) return user.email.split("@")[0];
  return "Unknown";
}

export function toUserDisplay(user: {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}): UserDisplay {
  return {
    id: user.id,
    displayName: buildUserDisplayName(user),
    avatarUrl: user.avatarUrl,
    email: user.email || undefined,
  };
}
