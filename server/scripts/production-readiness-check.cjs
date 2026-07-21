#!/usr/bin/env node
/**
 * Repository-level production readiness gate.
 *
 * This is intentionally static and deterministic. It checks release-critical
 * wiring that should be true before a Railway deploy is considered ready.
 */

const fs = require("fs");
const path = require("path");

const REQUIRED_PACKAGE_SCRIPTS = [
  "build",
  "check",
  "test:ci",
  "supply-chain:check",
  "slo:check",
  "db:migrate",
  "db:push",
];

const REQUIRED_FILES = [
  "package-lock.json",
  "railway.toml",
  ".github/workflows/ci.yml",
  "deploy/Dockerfile.reference",
  "docker-compose.yml",
  "server/scripts/deploy-smoke.cjs",
  "server/scripts/migrate.ts",
  "server/scripts/guard-production-push.ts",
  "server/scripts/slo-check.cjs",
  "docs/ROLLBACK_PROCEDURE.md",
  "docs/INCIDENTS.md",
  "docs/12-OPERATIONS/SLOS_ALERTING_INCIDENT_RESPONSE.md",
  "docs/RAILWAY_VERIFICATION_CHECKLIST.md",
  "docs/RAILWAY_DEPLOYMENT_CHECKLIST.md",
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

function runProductionReadinessCheck(root = process.cwd()) {
  const checks = [];
  const packageJson = readJson(root, "package.json");
  const scripts = packageJson.scripts || {};

  checks.push(createCheck(
    "PRD-001",
    "critical",
    packageJson.packageManager === "npm@11.16.0",
    "package.json#packageManager",
    `packageManager=${packageJson.packageManager || "(missing)"}`,
    "Pin the package manager to npm@11.16.0 so local, CI, and Railway installs are reproducible.",
  ));

  for (const scriptName of REQUIRED_PACKAGE_SCRIPTS) {
    checks.push(createCheck(
      `PRD-SCRIPT-${scriptName}`,
      "critical",
      Boolean(scripts[scriptName]),
      `package.json#scripts.${scriptName}`,
      scripts[scriptName] || "(missing)",
      `Add a ${scriptName} package script or update this readiness gate if the release command changed.`,
    ));
  }

  checks.push(createCheck(
    "PRD-002",
    "critical",
    typeof scripts["db:push"] === "string" && scripts["db:push"].includes("guard-production-push"),
    "package.json#scripts.db:push",
    scripts["db:push"] || "(missing)",
    "Keep direct Drizzle push protected by the production guard; use migrations for deploys.",
  ));

  for (const relativePath of REQUIRED_FILES) {
    checks.push(createCheck(
      `PRD-FILE-${relativePath}`,
      "critical",
      fileExists(root, relativePath),
      relativePath,
      fileExists(root, relativePath) ? "present" : "missing",
      `Restore ${relativePath} or update the readiness gate if this release artifact moved.`,
    ));
  }

  const railwayToml = fileExists(root, "railway.toml") ? readFile(root, "railway.toml") : "";
  checks.push(createCheck(
    "PRD-003",
    "critical",
    containsAll(railwayToml, [
      'startCommand = "node server/scripts/deploy-smoke.cjs && npm run start"',
      'healthcheckPath = "/health"',
      "restartPolicyType = \"ON_FAILURE\"",
    ]),
    "railway.toml",
    "start command, healthcheck, and restart policy checked",
    "Keep Railway configured to run deploy smoke checks before serving traffic and expose /health.",
  ));

  const workflow = fileExists(root, ".github/workflows/ci.yml") ? readFile(root, ".github/workflows/ci.yml") : "";
  checks.push(createCheck(
    "PRD-004",
    "critical",
    containsAll(workflow, [
      "npm ci",
      "npm sbom --sbom-format=cyclonedx --json > sbom.cdx.json",
      "npm run test:ci",
      "actions/upload-artifact@v4",
    ]),
    ".github/workflows/ci.yml",
    "install, SBOM, CI gate, and artifact upload checked",
    "Keep CI blocking merges on install reproducibility, supply-chain evidence, tests, typecheck, and build.",
  ));

  const deploySmoke = fileExists(root, "server/scripts/deploy-smoke.cjs")
    ? readFile(root, "server/scripts/deploy-smoke.cjs")
    : "";
  checks.push(createCheck(
    "PRD-005",
    "critical",
    containsAll(deploySmoke, [
      "'DATABASE_URL'",
      "'SESSION_SECRET'",
      "'APP_ENCRYPTION_KEY'",
      "decoded.length !== 32",
      "dist/index.cjs",
      "dist/public/index.html",
    ]),
    "server/scripts/deploy-smoke.cjs",
    "required env vars, encryption key format, and build artifact checks verified",
    "Require all production secrets and build artifacts before the app process starts.",
  ));

  const dockerfile = fileExists(root, "deploy/Dockerfile.reference") ? readFile(root, "deploy/Dockerfile.reference") : "";
  checks.push(createCheck(
    "PRD-006",
    "warning",
    containsAll(dockerfile, [
      "FROM node:20.19-bookworm-slim",
      "npm ci --omit=dev",
      "USER node",
      "HEALTHCHECK",
    ]),
    "deploy/Dockerfile.reference",
    "runtime image, production install, non-root user, and healthcheck checked",
    "Keep container runtime pinned, non-root, and health-probed.",
  ));

  checks.push(createCheck(
    "PRD-007",
    "critical",
    !fileExists(root, "Dockerfile") && containsAll(dockerfile, [
      "ENV PORT=8080",
      "EXPOSE 8080",
    ]) && !dockerfile.includes("ENV PORT=5000"),
    "deploy/Dockerfile.reference",
    "Railway Railpack path and reference container port alignment checked",
    "Keep root Dockerfile absent so Railway uses Railpack; keep the reference Docker runtime aligned with Railway port 8080.",
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
  const result = runProductionReadinessCheck(process.cwd());
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_FILES,
  REQUIRED_PACKAGE_SCRIPTS,
  containsAll,
  runProductionReadinessCheck,
};
