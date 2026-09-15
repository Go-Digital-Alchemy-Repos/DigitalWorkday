import { beforeEach, describe, expect, it, vi } from "vitest";

let queryResults: unknown[][] = [];

function queryChain(rows: unknown[]) {
  const chain: Record<string, any> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(async () => rows);
  chain.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

const selectMock = vi.fn(() => queryChain(queryResults.shift() || []));

vi.mock("../db", () => ({
  db: { select: selectMock },
}));

const {
  canUseClientPortalDirectoryUser,
  assertClientPortalDirectoryUsers,
  getClientPortalConversationDirectory,
  getClientPortalInternalDirectory,
  getClientPortalProjectDirectory,
  getProjectScopedPortalUsers,
  isClientPortalDirectoryEnabled,
  setClientPortalDirectoryEnabled,
} = await import("../services/clientPortalDirectory");

describe("client portal internal directory", () => {
  beforeEach(() => {
    queryResults = [];
    vi.clearAllMocks();
  });

  it("uses an explicit deny-by-default marker while preserving unrelated permissions", () => {
    expect(isClientPortalDirectoryEnabled(null)).toBe(false);
    expect(isClientPortalDirectoryEnabled({ reports: true })).toBe(false);
    expect(isClientPortalDirectoryEnabled({ clientPortalDirectory: true })).toBe(true);
    expect(setClientPortalDirectoryEnabled({ reports: true }, true)).toEqual({
      reports: true,
      clientPortalDirectory: true,
    });
    expect(setClientPortalDirectoryEnabled({ reports: true, clientPortalDirectory: true }, false)).toEqual({ reports: true });
  });

  it("returns only internal users explicitly selected for the client portal directory", async () => {
    queryResults = [[
      { id: "internal-1", name: "Visible User", avatarUrl: null, permissions: { clientPortalDirectory: true } },
      { id: "internal-2", name: "Hidden User", avatarUrl: null, permissions: null },
      { id: "internal-3", name: "Legacy Access", avatarUrl: null, permissions: { reports: true } },
    ]];

    await expect(getClientPortalInternalDirectory("client-1")).resolves.toEqual([
      { id: "internal-1", name: "Visible User", avatarUrl: null },
    ]);
  });

  it("excludes selected-scope portal users without a grant to the exact project", async () => {
    queryResults = [
      [
        { id: "portal-all", name: "All Projects", avatarUrl: null, projectScope: "all_visible" },
        { id: "portal-a", name: "Project A", avatarUrl: null, projectScope: "selected" },
        { id: "portal-b", name: "Project B", avatarUrl: null, projectScope: "selected" },
      ],
      [{ userId: "portal-a" }],
    ];

    await expect(getProjectScopedPortalUsers("client-1", "project-a")).resolves.toEqual([
      { id: "portal-all", name: "All Projects", avatarUrl: null },
      { id: "portal-a", name: "Project A", avatarUrl: null },
    ]);
  });

  it("combines the client allowlist with exact-project portal users and enforces the same directory", async () => {
    queryResults = [
      [{ id: "internal-1", name: "Account Lead", avatarUrl: null, permissions: { clientPortalDirectory: true } }],
      [{ id: "portal-a", name: "Client User", avatarUrl: null, projectScope: "selected" }],
      [{ userId: "portal-a" }],
    ];
    await expect(getClientPortalProjectDirectory("client-1", "project-a")).resolves.toEqual([
      { id: "internal-1", name: "Account Lead", avatarUrl: null },
      { id: "portal-a", name: "Client User", avatarUrl: null },
    ]);

    queryResults = [
      [{ id: "internal-1", name: "Account Lead", avatarUrl: null, permissions: { clientPortalDirectory: true } }],
      [],
    ];
    await expect(canUseClientPortalDirectoryUser("client-1", "project-a", "internal-hidden")).resolves.toBe(false);
  });

  it("identifies only allowlisted employees and active client users in client-level conversations", async () => {
    queryResults = [
      [
        { id: "internal-visible", name: "Account Lead", avatarUrl: null, permissions: { clientPortalDirectory: true } },
        { id: "internal-hidden", name: "Hidden Employee", avatarUrl: null, permissions: null },
      ],
      [{ id: "portal-active", name: "Client Admin", avatarUrl: null }],
    ];

    await expect(getClientPortalConversationDirectory("client-1")).resolves.toEqual([
      { id: "internal-visible", name: "Account Lead", avatarUrl: null },
      { id: "portal-active", name: "Client Admin", avatarUrl: null },
    ]);
  });

  it("rejects forged assignee IDs that were not returned by the directory", async () => {
    queryResults = [
      [{ id: "internal-1", name: "Account Lead", avatarUrl: null, permissions: { clientPortalDirectory: true } }],
      [],
    ];

    await expect(assertClientPortalDirectoryUsers(
      "client-1",
      "project-a",
      ["internal-1", "internal-hidden"],
    )).rejects.toMatchObject({ statusCode: 403 });
  });
});
