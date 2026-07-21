import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@shared/schema";

const storageMocks = {
  getWorkspacesByUser: vi.fn(),
  getClientsForUser: vi.fn(),
};

vi.mock("../storage", () => ({
  storage: storageMocks,
}));

const { resolveWorkspaceIdForLogin } = await import("../auth");

describe("client portal login workspace resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses client portal access to resolve workspace for client users without workspace membership", async () => {
    storageMocks.getWorkspacesByUser.mockResolvedValue([]);
    storageMocks.getClientsForUser.mockResolvedValue([
      {
        client: { id: "client-1", workspaceId: "workspace-portal-1" },
        access: { userId: "portal-user-1", clientId: "client-1", workspaceId: "workspace-portal-1" },
      },
    ]);

    const workspaceId = await resolveWorkspaceIdForLogin({
      id: "portal-user-1",
      email: "client@example.com",
      role: UserRole.CLIENT,
    } as Express.User);

    expect(workspaceId).toBe("workspace-portal-1");
    expect(storageMocks.getWorkspacesByUser).toHaveBeenCalledWith("portal-user-1");
    expect(storageMocks.getClientsForUser).toHaveBeenCalledWith("portal-user-1");
  });

  it("still rejects internal users without workspace membership", async () => {
    storageMocks.getWorkspacesByUser.mockResolvedValue([]);
    storageMocks.getClientsForUser.mockResolvedValue([]);

    await expect(resolveWorkspaceIdForLogin({
      id: "employee-1",
      email: "employee@example.com",
      role: UserRole.EMPLOYEE,
    } as Express.User)).rejects.toThrow("No workspace access");

    expect(storageMocks.getClientsForUser).not.toHaveBeenCalled();
  });

  it("still rejects client users without any portal access", async () => {
    storageMocks.getWorkspacesByUser.mockResolvedValue([]);
    storageMocks.getClientsForUser.mockResolvedValue([]);

    await expect(resolveWorkspaceIdForLogin({
      id: "portal-user-1",
      email: "client@example.com",
      role: UserRole.CLIENT,
    } as Express.User)).rejects.toThrow("No workspace access");
  });
});
