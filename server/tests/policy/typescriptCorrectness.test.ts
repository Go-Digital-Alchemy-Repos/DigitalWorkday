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

describe("typescript correctness policy", () => {
  it("live application code must not use TypeScript suppression comments", () => {
    const result = runRg(
      String.raw`@ts-(ignore|nocheck|expect-error)`,
      ["client/src", "server", "shared"],
    );

    expectNoMatches(result);
  });
});
