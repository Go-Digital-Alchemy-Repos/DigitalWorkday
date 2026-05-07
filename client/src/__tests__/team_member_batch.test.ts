import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/queryClient";
import { addUsersToTeam } from "@/features/teams/team-member-batch";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("addUsersToTeam", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("adds each selected user to the team", async () => {
    mockedApiRequest.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await addUsersToTeam("team_1", ["user_1", "user_2"]);

    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    expect(mockedApiRequest).toHaveBeenNthCalledWith(1, "POST", "/api/teams/team_1/members", {
      userId: "user_1",
    });
    expect(mockedApiRequest).toHaveBeenNthCalledWith(2, "POST", "/api/teams/team_1/members", {
      userId: "user_2",
    });
    expect(result).toEqual({
      total: 2,
      succeeded: 2,
      failed: 0,
      failedUserIds: [],
    });
  });

  it("deduplicates repeated selections before submitting", async () => {
    mockedApiRequest.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await addUsersToTeam("team_1", ["user_1", "user_1", "user_2"]);

    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(2);
  });

  it("reports partial failures without rejecting the whole batch", async () => {
    mockedApiRequest
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValueOnce(new Error("already a member"));

    const result = await addUsersToTeam("team_1", ["user_1", "user_2"]);

    expect(result).toEqual({
      total: 2,
      succeeded: 1,
      failed: 1,
      failedUserIds: ["user_2"],
    });
  });
});
