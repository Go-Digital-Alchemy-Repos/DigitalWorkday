import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";

function runRg(pattern: string, paths: string[]) {
  return spawnSync("rg", [
    "-n",
    "-g",
    "*.ts",
    "-g",
    "*.tsx",
    "-g",
    "!server/tests/**",
    "-g",
    "!client/src/__tests__/**",
    pattern,
    ...paths,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function expectNoMatches(result: ReturnType<typeof runRg>): void {
  expect(result.error).toBeUndefined();
  expect(result.stderr.trim()).toBe("");
  expect(result.stdout.trim()).toBe("");
}

describe("module boundary policy", () => {
  it("server and shared code must not import client modules", () => {
    const result = runRg(
      String.raw`from ["']@/|import\(["']@/|from ["'](?:\.\./)+client/|from ["']client/`,
      ["server", "shared", "scripts"],
    );

    expectNoMatches(result);
  });

  it("client and shared code must not import server modules", () => {
    const result = runRg(
      String.raw`from ["']server/|import\(["']server/|from ["'](?:\.\./)+server/|import\(["'](?:\.\./)+server/`,
      ["client/src", "shared"],
    );

    expectNoMatches(result);
  });

  it("client code should avoid root feature barrel imports", () => {
    const result = runRg(
      String.raw`from ["']@/features["']`,
      ["client/src"],
    );

    expectNoMatches(result);
  });
});
