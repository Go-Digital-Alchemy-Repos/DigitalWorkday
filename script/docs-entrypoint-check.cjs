#!/usr/bin/env node
/**
 * Checks the repository's documentation entrypoints for broken local links.
 *
 * This intentionally starts narrow: root README and docs README are the first
 * files new developers read, so broken links there are high-friction.
 */

const fs = require("fs");
const path = require("path");

const ENTRYPOINTS = ["README.md", "docs/README.md"];

function extractLocalLinks(markdown) {
  const links = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    const href = match[1].trim();
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:")
    ) {
      continue;
    }
    links.push(href);
  }
  return links;
}

function normalizeHref(href) {
  return href.split("#")[0].replace(/^<|>$/g, "");
}

function runDocsEntrypointCheck(root = process.cwd()) {
  const failures = [];
  const files = [];

  for (const relativeFile of ENTRYPOINTS) {
    const absoluteFile = path.join(root, relativeFile);
    if (!fs.existsSync(absoluteFile)) {
      failures.push({ file: relativeFile, href: relativeFile, reason: "entrypoint missing" });
      continue;
    }

    const markdown = fs.readFileSync(absoluteFile, "utf8");
    const localLinks = extractLocalLinks(markdown);
    files.push({ file: relativeFile, localLinks: localLinks.length });

    for (const href of localLinks) {
      const normalized = normalizeHref(href);
      if (!normalized) continue;
      const target = path.resolve(path.dirname(absoluteFile), normalized);
      if (!fs.existsSync(target)) {
        failures.push({ file: relativeFile, href, reason: "target missing" });
      }
    }
  }

  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    files,
    failures,
  };
}

function main() {
  const result = runDocsEntrypointCheck(process.cwd());
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractLocalLinks,
  runDocsEntrypointCheck,
};
