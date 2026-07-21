import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const modulesRoot = path.join(repoRoot, "server/routes/modules");

function listRouterFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return listRouterFiles(fullPath);
    }

    return entry.endsWith(".router.ts") ? [fullPath] : [];
  });
}

describe("backend service architecture", () => {
  it("does not keep empty legacy module routers that look active", () => {
    const emptyRouterFiles = listRouterFiles(modulesRoot).filter((file) => {
      const source = readFileSync(file, "utf8").trim();
      return /^import \{ Router \} from ['"]express['"];\s*export const \w+Router = Router\(\);?$/s.test(source);
    });

    expect(emptyRouterFiles.map((file) => path.relative(repoRoot, file))).toEqual([]);
  });
});
