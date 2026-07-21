import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  extractLocalLinks,
  runDocsEntrypointCheck,
} = require("../../script/docs-entrypoint-check.cjs");

describe("docs entrypoint check", () => {
  it("extracts local links and ignores external links", () => {
    const links = extractLocalLinks("[Docs](docs/README.md) [Site](https://example.com) [Anchor](#top)");
    expect(links).toEqual(["docs/README.md"]);
  });

  it("passes root documentation entrypoints", () => {
    const result = runDocsEntrypointCheck(process.cwd());
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });
});
