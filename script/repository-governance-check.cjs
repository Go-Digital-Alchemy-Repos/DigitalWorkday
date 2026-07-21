#!/usr/bin/env node
/**
 * Repository governance static gate.
 *
 * It checks the lightweight governance files and release scripts that keep
 * contribution, review, dependency, docs, and deploy expectations discoverable.
 */

const fs = require("fs");
const path = require("path");

const REQUIRED_FILES = [
  "CONTRIBUTING.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/workflows/ci.yml",
  "docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md",
  "docs/DOCUMENTATION_POLICY.md",
  "docs/DOCS_CHECKLIST.md",
  "script/supply-chain-check.mjs",
  "script/docs-entrypoint-check.cjs",
  "server/scripts/production-readiness-check.cjs",
  "server/scripts/publishing-readiness-check.cjs",
];

const REQUIRED_PACKAGE_SCRIPTS = [
  "check",
  "test",
  "test:client",
  "test:ci",
  "release:check",
  "docs:check",
  "governance:check",
  "production:check",
  "publishing:check",
  "supply-chain:check",
];

function readFile(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
  return JSON.parse(readFile(root, relativePath));
}

function fileExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function containsAll(text, markers) {
  return markers.every((marker) => text.includes(marker));
}

function createCheck(id, severity, ok, location, evidence, remediation) {
  return { id, severity, ok, location, evidence, remediation };
}

function runRepositoryGovernanceCheck(root = process.cwd()) {
  const checks = [];
  const packageJson = readJson(root, "package.json");
  const scripts = packageJson.scripts || {};

  for (const file of REQUIRED_FILES) {
    checks.push(createCheck(
      `GOV-FILE-${file}`,
      "critical",
      fileExists(root, file),
      file,
      fileExists(root, file) ? "present" : "missing",
      `Restore ${file} or update the governance gate if the file moved.`,
    ));
  }

  for (const scriptName of REQUIRED_PACKAGE_SCRIPTS) {
    checks.push(createCheck(
      `GOV-SCRIPT-${scriptName}`,
      "critical",
      Boolean(scripts[scriptName]),
      `package.json#scripts.${scriptName}`,
      scripts[scriptName] || "(missing)",
      `Add a ${scriptName} package script or update this governance gate if the command changed.`,
    ));
  }

  const contributing = fileExists(root, "CONTRIBUTING.md") ? readFile(root, "CONTRIBUTING.md") : "";
  checks.push(createCheck(
    "GOV-001",
    "critical",
    containsAll(contributing, [
      "Required Local Gates",
      "Risk Areas",
      "Database Changes",
      "Documentation Changes",
      "npm run release:check",
      "GitHub pushes that modify `.github/workflows/*` require a token with `workflow` scope.",
    ]),
    "CONTRIBUTING.md",
    "workflow, gates, risk areas, database/docs, and workflow-scope notes checked",
    "Keep contribution expectations discoverable from the repository root.",
  ));

  const prTemplate = fileExists(root, ".github/PULL_REQUEST_TEMPLATE.md")
    ? readFile(root, ".github/PULL_REQUEST_TEMPLATE.md")
    : "";
  checks.push(createCheck(
    "GOV-002",
    "critical",
    containsAll(prTemplate, [
      "Risk Areas Touched",
      "Tenant isolation or route policy",
      "Database schema, migration, or data repair",
      "`npm run test:ci`",
      "`npm run release:check`",
      "Rollback notes",
    ]),
    ".github/PULL_REQUEST_TEMPLATE.md",
    "risk checklist, release gate, and rollback notes checked",
    "Keep PRs explicit about risk, verification, and deploy impact.",
  ));

  const workflow = fileExists(root, ".github/workflows/ci.yml")
    ? readFile(root, ".github/workflows/ci.yml")
    : "";
  checks.push(createCheck(
    "GOV-003",
    "critical",
    containsAll(workflow, [
      "pull_request:",
      "push:",
      "branches:",
      "npm ci",
      "npm sbom --sbom-format=cyclonedx --json > sbom.cdx.json",
      "npm run test:ci",
      "actions/upload-artifact@v4",
    ]),
    ".github/workflows/ci.yml",
    "PR/push triggers, reproducible install, SBOM, CI gate, and artifacts checked",
    "Keep CI as the merge and release verification backstop.",
  ));

  const governance = fileExists(root, "docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md")
    ? readFile(root, "docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md")
    : "";
  checks.push(createCheck(
    "GOV-004",
    "critical",
    containsAll(governance, [
      "Source Of Truth",
      "Review Ownership By Area",
      "No GitHub `CODEOWNERS` file is active yet",
      "Dependency Policy",
      "Deprecation Policy",
      "npm run governance:check",
    ]),
    "docs/12-OPERATIONS/REPOSITORY_GOVERNANCE.md",
    "source of truth, ownership, CODEOWNERS decision, dependency, deprecation, and automation checked",
    "Keep repository governance current as owners, branch policy, and release process evolve.",
  ));

  const failed = checks.filter((check) => !check.ok);
  const criticalFailures = failed.filter((check) => check.severity === "critical");

  return {
    ok: criticalFailures.length === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      criticalFailures: criticalFailures.length,
    },
    checks,
  };
}

function main() {
  const result = runRepositoryGovernanceCheck(process.cwd());
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  containsAll,
  runRepositoryGovernanceCheck,
};
