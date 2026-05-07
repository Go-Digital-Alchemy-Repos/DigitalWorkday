import { apiRequest } from "@/lib/queryClient";

export interface TeamMemberBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  failedUserIds: string[];
}

export async function addUsersToTeam(
  teamId: string,
  userIds: string[],
): Promise<TeamMemberBatchResult> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  const results = await Promise.allSettled(
    uniqueUserIds.map(async (userId) => {
      await apiRequest("POST", `/api/teams/${teamId}/members`, { userId });
      return userId;
    }),
  );

  const failedUserIds = results.reduce<string[]>((acc, result, index) => {
    if (result.status === "rejected") {
      acc.push(uniqueUserIds[index]);
    }
    return acc;
  }, []);

  return {
    total: uniqueUserIds.length,
    succeeded: uniqueUserIds.length - failedUserIds.length,
    failed: failedUserIds.length,
    failedUserIds,
  };
}
