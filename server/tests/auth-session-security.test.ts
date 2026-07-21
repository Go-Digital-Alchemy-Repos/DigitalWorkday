import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { establishAuthenticatedSession } from "../auth";

describe("auth session security", () => {
  it("rotates the session before writing authenticated user state", async () => {
    const calls: string[] = [];
    const user = {
      id: "user-1",
      email: "client@example.com",
      role: "client",
      isActive: true,
    } as Express.User;

    const req = {
      session: {
        workspaceId: "old-workspace",
        regenerate: (callback: (err?: Error) => void) => {
          calls.push("regenerate");
          callback();
        },
        save: (callback: (err?: Error) => void) => {
          calls.push("save");
          callback();
        },
      },
      logIn: (_user: Express.User, callback: (err?: Error) => void) => {
        calls.push("login");
        callback();
      },
    } as unknown as Request;

    await establishAuthenticatedSession(req, user, "workspace-1");

    expect(calls).toEqual(["regenerate", "login", "save"]);
    expect(req.session.workspaceId).toBe("workspace-1");
  });

  it("stops login when session rotation fails", async () => {
    const calls: string[] = [];
    const user = {
      id: "user-1",
      email: "client@example.com",
      role: "client",
      isActive: true,
    } as Express.User;

    const req = {
      session: {
        regenerate: (callback: (err?: Error) => void) => {
          calls.push("regenerate");
          callback(new Error("rotation failed"));
        },
        save: (callback: (err?: Error) => void) => {
          calls.push("save");
          callback();
        },
      },
      logIn: (_user: Express.User, callback: (err?: Error) => void) => {
        calls.push("login");
        callback();
      },
    } as unknown as Request;

    await expect(establishAuthenticatedSession(req, user, "workspace-1")).rejects.toThrow("rotation failed");
    expect(calls).toEqual(["regenerate"]);
  });
});
