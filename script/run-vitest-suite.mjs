#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const TEST_ROOT = path.join(ROOT, "server", "tests");
const VALID_SUITES = new Set(["fast", "http", "db", "all"]);

function collectTestFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const resolved = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectTestFiles(resolved);
      }
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [resolved] : [];
    })
    .sort();
}

function classifySuite(filePath) {
  const source = readFileSync(filePath, "utf8");
  const usesDb = /from\s+["'](?:\.\.\/)+db["']|import\(["'](?:\.\.\/)+db["']\)/.test(source);
  const usesSupertest = /from\s+["']supertest["']/.test(source);

  if (usesDb) return "db";
  if (usesSupertest) return "http";
  return "fast";
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const watch = args.includes("--watch");
const positionals = args.filter((arg) => !arg.startsWith("--"));
const suiteArg = VALID_SUITES.has(positionals[0] ?? "") ? positionals[0] : "fast";
const passthroughArgs = suiteArg === "fast" && positionals[0] && !VALID_SUITES.has(positionals[0])
  ? positionals
  : positionals.slice(1);

const files = collectTestFiles(TEST_ROOT);
const grouped = {
  fast: [],
  http: [],
  db: [],
  all: files.map(relative),
};

for (const file of files) {
  grouped[classifySuite(file)].push(relative(file));
}

if (listOnly) {
  console.log(
    JSON.stringify(
      {
        counts: {
          fast: grouped.fast.length,
          http: grouped.http.length,
          db: grouped.db.length,
          all: grouped.all.length,
        },
        [suiteArg]: grouped[suiteArg],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const selectedFiles = grouped[suiteArg];
if (selectedFiles.length === 0) {
  console.error(`No test files matched suite "${suiteArg}".`);
  process.exit(1);
}

const vitestArgs = ["vitest"];
if (!watch) {
  vitestArgs.push("run");
}
vitestArgs.push(...selectedFiles);
vitestArgs.push(...passthroughArgs);

const result = spawnSync("npx", vitestArgs, {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
