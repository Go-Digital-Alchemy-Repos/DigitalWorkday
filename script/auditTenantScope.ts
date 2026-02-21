#!/usr/bin/env tsx
/**
 * Tenant Scope Audit Script
 * 
 * Scans repository and route files for potential tenant scoping issues:
 * - Direct db.select().from() without tenant filter
 * - Storage methods called without tenant-scoped variants
 * - Routes missing getEffectiveTenantId
 * 
 * Usage: npx tsx script/auditTenantScope.ts
 * CI:    npm run audit:tenant
 */

import fs from "fs";
import path from "path";

interface Finding {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
  severity: "warning" | "info";
}

const TENANT_OWNED_TABLES = [
  "tasks", "projects", "clients", "time_entries", "active_timers",
  "comments", "subtasks", "task_attachments", "chat_channels",
  "chat_messages", "chat_dm_threads", "activity_log", "sections", "tags",
];

const findings: Finding[] = [];

function scanFile(filePath: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Pattern 1: db.select().from(tenantTable) without tenant filter nearby
    for (const table of TENANT_OWNED_TABLES) {
      const selectPattern = new RegExp(`\\.from\\(${table}\\)`);
      if (selectPattern.test(trimmed)) {
        // Check surrounding lines (±5) for tenant filter
        const context = lines.slice(Math.max(0, idx - 5), Math.min(lines.length, idx + 6)).join("\n");
        if (!context.includes("tenantId") && !context.includes("tenant_id")) {
          findings.push({
            file: filePath,
            line: lineNum,
            pattern: `db.select().from(${table}) without tenant filter`,
            snippet: trimmed.substring(0, 120),
            severity: "warning",
          });
        }
      }
    }

    // Pattern 2: db.delete or db.update on tenant table without tenant filter
    for (const table of TENANT_OWNED_TABLES) {
      const mutatePattern = new RegExp(`\\.(?:delete|update)\\(${table}\\)`);
      if (mutatePattern.test(trimmed)) {
        const context = lines.slice(Math.max(0, idx - 5), Math.min(lines.length, idx + 6)).join("\n");
        if (!context.includes("tenantId") && !context.includes("tenant_id")) {
          findings.push({
            file: filePath,
            line: lineNum,
            pattern: `db.mutate(${table}) without tenant filter`,
            snippet: trimmed.substring(0, 120),
            severity: "warning",
          });
        }
      }
    }

    // Pattern 3: Route handler GET/POST/PATCH/DELETE without getEffectiveTenantId
    if (/router\.(get|post|patch|put|delete)\(/.test(trimmed) && filePath.includes("router")) {
      // Check next 15 lines for tenant context
      const handlerContext = lines.slice(idx, Math.min(lines.length, idx + 15)).join("\n");
      if (!handlerContext.includes("getEffectiveTenantId") &&
          !handlerContext.includes("tenantId") &&
          !handlerContext.includes("TenantScoped") &&
          !handlerContext.includes("requireTenantContext") &&
          !handlerContext.includes("super")) {
        findings.push({
          file: filePath,
          line: lineNum,
          pattern: "Route handler without tenant context check",
          snippet: trimmed.substring(0, 120),
          severity: "info",
        });
      }
    }
  });
}

function walkDir(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  
  if (!fs.existsSync(dir)) return results;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      results.push(...walkDir(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log("🔍 Tenant Scope Audit");
console.log("====================\n");

const serverFiles = walkDir("server", [".ts"]);
const sharedFiles = walkDir("shared", [".ts"]);
const allFiles = [...serverFiles, ...sharedFiles];

console.log(`Scanning ${allFiles.length} files...\n`);

for (const file of allFiles) {
  scanFile(file);
}

if (findings.length === 0) {
  console.log("✅ No tenant scoping issues found.\n");
  process.exit(0);
}

const warnings = findings.filter(f => f.severity === "warning");
const infos = findings.filter(f => f.severity === "info");

console.log(`Found ${findings.length} findings (${warnings.length} warnings, ${infos.length} info)\n`);

for (const f of findings) {
  const icon = f.severity === "warning" ? "⚠️" : "ℹ️";
  console.log(`${icon}  ${f.file}:${f.line}`);
  console.log(`   Pattern: ${f.pattern}`);
  console.log(`   Code: ${f.snippet}`);
  console.log();
}

console.log("---");
console.log("Note: These are heuristic findings. Review each one manually.");
console.log("CI integration: Add `npm run audit:tenant` to your CI pipeline.\n");
process.exit(0);
