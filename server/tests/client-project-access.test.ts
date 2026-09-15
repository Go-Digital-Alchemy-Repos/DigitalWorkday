import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = {
  getClientsForUser: vi.fn(),
  getProjectsByClient: vi.fn(),
  getProject: vi.fn(),
  getClientUserAccessByUserAndClient: vi.fn(),
};

let queryRows: unknown[] = [];

vi.mock("../storage", () => ({ storage: storageMocks }));
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          then: (resolve: (value: unknown[]) => void) => resolve(queryRows),
          limit: async () => queryRows,
        }),
      }),
    }),
  },
}));

const { canClientAccessProject, getClientUserAccessibleProjects } = await import("../middleware/clientAccess");

describe("client project access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRows = [];
  });

  it("preserves backward-compatible access to all projects in all_visible mode", async () => {
    storageMocks.getClientsForUser.mockResolvedValue([
      { client: { id: "client-1" }, access: { status: "active", projectScope: "all_visible" } },
    ]);
    storageMocks.getProjectsByClient.mockResolvedValue([{ id: "project-1" }, { id: "project-2" }]);

    await expect(getClientUserAccessibleProjects("portal-1")).resolves.toEqual(["project-1", "project-2"]);
  });

  it("returns only explicit grants in selected mode", async () => {
    storageMocks.getClientsForUser.mockResolvedValue([
      { client: { id: "client-1" }, access: { status: "active", projectScope: "selected" } },
    ]);
    queryRows = [{ projectId: "project-2" }];

    await expect(getClientUserAccessibleProjects("portal-1")).resolves.toEqual(["project-2"]);
    expect(storageMocks.getProjectsByClient).not.toHaveBeenCalled();
  });

  it("denies a project that is not explicitly granted in selected mode", async () => {
    storageMocks.getProject.mockResolvedValue({ id: "project-1", clientId: "client-1" });
    storageMocks.getClientUserAccessByUserAndClient.mockResolvedValue({ status: "active", projectScope: "selected" });
    queryRows = [];

    await expect(canClientAccessProject("portal-1", "project-1")).resolves.toBe(false);
  });

  it("allows an explicitly granted project in selected mode", async () => {
    storageMocks.getProject.mockResolvedValue({ id: "project-1", clientId: "client-1" });
    storageMocks.getClientUserAccessByUserAndClient.mockResolvedValue({ status: "active", projectScope: "selected" });
    queryRows = [{ id: "grant-1" }];

    await expect(canClientAccessProject("portal-1", "project-1")).resolves.toBe(true);
  });
});
