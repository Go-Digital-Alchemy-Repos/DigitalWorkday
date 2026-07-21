#!/usr/bin/env node
/**
 * Static publishing/CMS readiness gate.
 *
 * Digital Workday is currently an authenticated SaaS application, not a public
 * CMS. This check keeps that boundary explicit until a real publishing model is
 * intentionally designed, reviewed, and shipped.
 */

const fs = require("fs");
const path = require("path");

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

function runPublishingReadinessCheck(root = process.cwd()) {
  const checks = [];
  const packageJson = readJson(root, "package.json");
  const scripts = packageJson.scripts || {};
  const staticTs = fileExists(root, "server/static.ts") ? readFile(root, "server/static.ts") : "";
  const indexHtml = fileExists(root, "client/index.html") ? readFile(root, "client/index.html") : "";
  const docsRouter = fileExists(root, "server/routes/modules/super-admin/docs.router.ts")
    ? readFile(root, "server/routes/modules/super-admin/docs.router.ts")
    : "";
  const tenantDefaultDocsRouter = fileExists(root, "server/http/domains/tenantDefaultDocs.router.ts")
    ? readFile(root, "server/http/domains/tenantDefaultDocs.router.ts")
    : "";
  const clientDocumentsRouter = fileExists(root, "server/http/domains/clientDocuments.router.ts")
    ? readFile(root, "server/http/domains/clientDocuments.router.ts")
    : "";

  checks.push(createCheck(
    "PUB-001",
    "critical",
    fileExists(root, "docs/12-OPERATIONS/PUBLIC_CONTENT_GOVERNANCE.md"),
    "docs/12-OPERATIONS/PUBLIC_CONTENT_GOVERNANCE.md",
    fileExists(root, "docs/12-OPERATIONS/PUBLIC_CONTENT_GOVERNANCE.md") ? "present" : "missing",
    "Document the current non-CMS boundary and the minimum architecture required before public publishing is added.",
  ));

  checks.push(createCheck(
    "PUB-002",
    "critical",
    Boolean(scripts["publishing:check"]),
    "package.json#scripts.publishing:check",
    scripts["publishing:check"] || "(missing)",
    "Expose the publishing readiness gate as a package script so reviewers can run it before deploys.",
  ));

  checks.push(createCheck(
    "PUB-003",
    "critical",
    containsAll(staticTs, [
      'app.get("/robots.txt"',
      'app.get("/sitemap.xml"',
      'app.get("/llms.txt"',
      '"/portal/"',
      '"/super-admin/"',
      '"/api/"',
      'const SITEMAP_PUBLIC_PATHS =',
      '{ path: "/", priority: "1.0" }',
      '{ path: "/login", priority: "0.6" }',
      '{ path: "/auth/forgot-password", priority: "0.2" }',
    ]),
    "server/static.ts",
    "crawler endpoints and allowlist checked",
    "Keep crawler routes explicit and do not add authenticated tenant/client routes to the sitemap.",
  ));

  checks.push(createCheck(
    "PUB-004",
    "warning",
    containsAll(indexHtml, [
      'content="index,follow',
      '<link rel="sitemap" type="application/xml" href="/sitemap.xml" />',
      '"@type": "SoftwareApplication"',
    ]),
    "client/index.html",
    "metadata, sitemap link, and SoftwareApplication JSON-LD checked",
    "Keep public metadata scoped to the application shell until real public content pages exist.",
  ));

  checks.push(createCheck(
    "PUB-005",
    "critical",
    containsAll(docsRouter, [
      "import { requireSuperUser }",
      'docsRouter.get("/docs", requireSuperUser',
      'docsRouter.get("/docs/:docPath", requireSuperUser',
      'docsRouter.post("/docs/sync", requireSuperUser',
      'docsRouter.get("/docs/coverage", requireSuperUser',
      "resolvedPath.startsWith(path.resolve(DOCS_DIR))",
    ]),
    "server/routes/modules/super-admin/docs.router.ts",
    "internal docs reader permissions and path containment checked",
    "Keep repository documentation readable only by super admins; do not repurpose this as public documentation serving.",
  ));

  checks.push(createCheck(
    "PUB-006",
    "critical",
    containsAll(tenantDefaultDocsRouter, [
      'policy: "authTenant"',
      "requireAdminOrSuper",
      "validateTenantAccess(req, tenantId)",
      'router.get("/tenants/:tenantId/default-docs/client-view"',
      "effectiveTenantId === tenantId",
      'router.get("/tenants/:tenantId/default-docs/documents/:documentId/download"',
      "createPresignedDownloadUrl(doc.r2Key, tenantId)",
    ]),
    "server/http/domains/tenantDefaultDocs.router.ts",
    "tenant default document authentication, tenant match, and presigned download checked",
    "Keep default documents as authenticated tenant/client resources, not public published assets.",
  ));

  checks.push(createCheck(
    "PUB-007",
    "critical",
    containsAll(clientDocumentsRouter, [
      'policy: "authTenant"',
      "verifyClientAccess(clientId, tenantId)",
      '"/clients/:clientId/documents/files/:fileId/download"',
      "eq(clientDocuments.clientId, clientId)",
      "eq(clientDocuments.tenantId, tenantId)",
      "createPresignedDownloadUrl(document.storageKey, tenantId)",
    ]),
    "server/http/domains/clientDocuments.router.ts",
    "client document tenant scoping and presigned download checked",
    "Keep client documents tenant/client-scoped; future public publishing needs a separate model.",
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
  const result = runPublishingReadinessCheck(process.cwd());
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
  runPublishingReadinessCheck,
};
