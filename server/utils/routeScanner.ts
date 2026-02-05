/**
 * Route Scanner Utility
 * Scans Express route files to extract endpoint definitions for API documentation
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface RouteDefinition {
  method: string;
  path: string;
  file: string;
  domain: string;
  line: number;
}

export interface DomainRoutes {
  domain: string;
  displayName: string;
  files: string[];
  routes: RouteDefinition[];
}

const ROUTES_DIR = path.join(process.cwd(), "server/routes");
const FEATURES_DIR = path.join(process.cwd(), "server/features");

// Domain inference from file paths
const DOMAIN_MAP: Record<string, { domain: string; displayName: string }> = {
  "timeTracking.ts": { domain: "time-tracking", displayName: "Time Tracking" },
  "superAdmin.ts": { domain: "super-admin", displayName: "Super Admin" },
  "superDebug.ts": { domain: "super-debug", displayName: "Super Debug" },
  "superChat.ts": { domain: "super-chat", displayName: "Super Chat" },
  "chatDebug.ts": { domain: "chat-debug", displayName: "Chat Debug" },
  "tenantOnboarding.ts": { domain: "tenant-onboarding", displayName: "Tenant Onboarding" },
  "tenantBilling.ts": { domain: "tenant-billing", displayName: "Tenant Billing" },
  "tenancyHealth.ts": { domain: "tenancy-health", displayName: "Tenancy Health" },
  "projectsDashboard.ts": { domain: "projects-dashboard", displayName: "Projects Dashboard" },
  "workloadReports.ts": { domain: "workload-reports", displayName: "Workload Reports" },
  "uploads.ts": { domain: "uploads", displayName: "File Uploads" },
  "emailOutbox.ts": { domain: "email-outbox", displayName: "Email Outbox" },
  "systemStatus.ts": { domain: "system-status", displayName: "System Status" },
  "systemIntegrations.ts": { domain: "system-integrations", displayName: "System Integrations" },
  "chat.ts": { domain: "chat", displayName: "Chat" },
  "chatRetention.ts": { domain: "chat-retention", displayName: "Chat Retention" },
  "ai.ts": { domain: "ai", displayName: "AI" },
  "webhooks.ts": { domain: "webhooks", displayName: "Webhooks" },
  // Features
  "router.ts": { domain: "clients", displayName: "Clients" },
  "notes.router.ts": { domain: "client-notes", displayName: "Client Notes" },
  "documents.router.ts": { domain: "client-documents", displayName: "Client Documents" },
  "divisions.router.ts": { domain: "divisions", displayName: "Divisions" },
  "portal.router.ts": { domain: "client-portal", displayName: "Client Portal" },
  "notifications.router.ts": { domain: "notifications", displayName: "Notifications" },
  "systemStatus.router.ts": { domain: "super-system-status", displayName: "Super System Status" },
  "integrations.router.ts": { domain: "super-integrations", displayName: "Super Integrations" },
};

// Base path prefixes from routes/index.ts and features/*/index.ts
// Note: These must match the actual Express router.use() mount paths
// The main router is mounted at /api, so all paths here are relative to that
const BASE_PATH_MAP: Record<string, string> = {
  // Routes in server/routes/
  "timeTracking.ts": "/api/timer",          // router.use("/timer", timerRoutes)
  "superAdmin.ts": "/api/v1/super",         // router.use("/v1/super", superAdminRoutes)
  "superDebug.ts": "/api/v1/super/debug",   // router.use("/v1/super/debug", superDebugRoutes)
  "superChat.ts": "/api/v1/super/chat",     // router.use("/v1/super/chat", superChatRoutes)
  "chatDebug.ts": "/api/v1/super/debug/chat", // router.use("/v1/super/debug/chat", chatDebugRoutes)
  "tenantOnboarding.ts": "/api/v1/tenant",  // router.use("/v1/tenant", tenantOnboardingRoutes)
  "tenantBilling.ts": "/api/v1/tenant",     // router.use("/v1/tenant", tenantBillingRoutes)
  "projectsDashboard.ts": "/api/v1",        // router.use("/v1", projectsDashboardRoutes)
  "workloadReports.ts": "/api/v1",          // router.use("/v1", workloadReportsRoutes)
  "uploads.ts": "/api/v1/uploads",          // router.use("/v1/uploads", uploadRoutes)
  "emailOutbox.ts": "/api/v1",              // router.use("/v1", emailOutboxRoutes)
  "systemStatus.ts": "/api/v1/super/status", // router.use("/v1/super/status", systemStatusRoutes)
  "systemIntegrations.ts": "/api/v1/system", // router.use("/v1/system", systemIntegrationsRoutes)
  "chat.ts": "/api/v1/chat",                // router.use("/v1/chat", chatRoutes)
  "chatRetention.ts": "/api/v1",            // router.use("/v1", chatRetentionRoutes)
  "ai.ts": "/api/v1/ai",                    // router.use("/v1/ai", aiRoutes)
  "tenancyHealth.ts": "/api",               // router.use(tenancyHealthRoutes)
  "webhooks.ts": "/api/v1",
  // Features in server/features/
  // features/index.ts is mounted at /api (no prefix from routes/index.ts)
  // features/clients/index.ts: router.use("/clients", clientsRouter) -> /api/clients
  "router.ts": "/api/clients",              // Features clients router
  "notes.router.ts": "/api/clients",        // router.use("/clients", notesRouter)
  "documents.router.ts": "/api/clients",    // router.use("/clients", documentsRouter)
  "portal.router.ts": "/api/clients",       // router.use("/clients", portalRouter)
  "divisions.router.ts": "/api/v1",         // router.use("/v1", divisionsRouter) - routes already have /clients prefix
  "notifications.router.ts": "/api/v1/notifications", // features/notifications
  // Routes in server/routes/super/
  "systemStatus.router.ts": "/api/v1/super", // router.use("/v1/super", superSystemStatusRouter)
  "integrations.router.ts": "/api/v1/super", // router.use("/v1/super", superIntegrationsRouter)
};

/**
 * Extract routes from a TypeScript file using regex
 * Handles both single-line and multi-line route definitions
 * Uses flexible patterns that work with various whitespace and formatting
 */
async function extractRoutesFromFile(filePath: string): Promise<RouteDefinition[]> {
  const routes: RouteDefinition[] = [];
  const filename = path.basename(filePath);
  const domainInfo = DOMAIN_MAP[filename] || { 
    domain: filename.replace(/\.(router\.)?ts$/, "").toLowerCase(),
    displayName: filename.replace(/\.(router\.)?ts$/, "").replace(/([A-Z])/g, " $1").trim()
  };
  const basePath = BASE_PATH_MAP[filename] || "/api/v1";
  
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    
    // Find line numbers for each match
    const findLineNumber = (index: number): number => {
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        charCount += lines[i].length + 1; // +1 for newline
        if (charCount > index) return i + 1;
      }
      return lines.length;
    };
    
    // Main pattern: router.method( followed by path string anywhere (handles multi-line)
    // Uses [\s\S]*? to match any whitespace/newlines between ( and the path
    // The {0,100} limit prevents catastrophic backtracking
    const routePattern = /router\.(get|post|patch|put|delete)\s*\([\s\S]{0,100}?["'`](\/[^"'`]*)["'`]/gi;
    
    // router.route("/path") followed by .method() (handles chaining)
    // Uses [\s\S]*? to handle line breaks between route() and method()
    const routeChainPattern = /router\.route\s*\(\s*["'`](\/[^"'`]*)["'`]\s*\)[\s\S]{0,50}?\.(get|post|patch|put|delete)\s*\(/gi;
    
    const addedRoutes = new Set<string>();
    
    // Process main route patterns
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const fullPath = `${basePath}${routePath}`.replace(/\/+/g, "/");
      const routeKey = `${method}:${fullPath}`;
      
      if (!addedRoutes.has(routeKey)) {
        addedRoutes.add(routeKey);
        routes.push({
          method,
          path: fullPath,
          file: path.relative(process.cwd(), filePath),
          domain: domainInfo.domain,
          line: findLineNumber(match.index),
        });
      }
    }
    
    // Process router.route() chaining patterns
    while ((match = routeChainPattern.exec(content)) !== null) {
      const routePath = match[1];
      const method = match[2].toUpperCase();
      const fullPath = `${basePath}${routePath}`.replace(/\/+/g, "/");
      const routeKey = `${method}:${fullPath}`;
      
      if (!addedRoutes.has(routeKey)) {
        addedRoutes.add(routeKey);
        routes.push({
          method,
          path: fullPath,
          file: path.relative(process.cwd(), filePath),
          domain: domainInfo.domain,
          line: findLineNumber(match.index),
        });
      }
    }
    
    // Sort routes by line number for consistent output
    routes.sort((a, b) => a.line - b.line);
    
  } catch (error) {
    console.error(`[routeScanner] Failed to parse ${filePath}:`, error);
  }
  
  return routes;
}

/**
 * Scan all route files and extract route definitions
 */
export async function scanAllRoutes(): Promise<Map<string, DomainRoutes>> {
  const domains = new Map<string, DomainRoutes>();
  
  async function scanDirectory(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.name.endsWith(".ts") && !entry.name.startsWith("index")) {
          const routes = await extractRoutesFromFile(fullPath);
          
          if (routes.length > 0) {
            const filename = entry.name;
            const domainInfo = DOMAIN_MAP[filename] || {
              domain: filename.replace(/\.(router\.)?ts$/, "").toLowerCase(),
              displayName: filename.replace(/\.(router\.)?ts$/, "").replace(/([A-Z])/g, " $1").trim()
            };
            
            const existing = domains.get(domainInfo.domain);
            if (existing) {
              existing.routes.push(...routes);
              if (!existing.files.includes(path.relative(process.cwd(), fullPath))) {
                existing.files.push(path.relative(process.cwd(), fullPath));
              }
            } else {
              domains.set(domainInfo.domain, {
                domain: domainInfo.domain,
                displayName: domainInfo.displayName,
                files: [path.relative(process.cwd(), fullPath)],
                routes,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[routeScanner] Failed to scan ${dir}:`, error);
    }
  }
  
  await scanDirectory(ROUTES_DIR);
  await scanDirectory(FEATURES_DIR);
  
  return domains;
}

/**
 * Generate markdown content for a domain's routes
 */
export function generateAutoSection(domainRoutes: DomainRoutes): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [
    "<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->",
    "",
    `**Last Synced:** ${timestamp}`,
    "",
    `**Synced From:**`,
    ...domainRoutes.files.map(f => `- \`${f}\``),
    "",
    "### Endpoints",
    "",
    "| Method | Path |",
    "|--------|------|",
    ...domainRoutes.routes.map(r => `| ${r.method} | \`${r.path}\` |`),
    "",
    "<!-- === END AUTO-GENERATED SECTION === -->",
  ];
  
  return lines.join("\n");
}

/**
 * Merge auto-generated content with existing manual content
 * Validates marker order and handles edge cases safely
 */
export function mergeContent(existingContent: string, autoSection: string): string {
  const autoStartMarker = "<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->";
  const autoEndMarker = "<!-- === END AUTO-GENERATED SECTION === -->";
  
  // Check if auto section already exists
  const startIdx = existingContent.indexOf(autoStartMarker);
  const endIdx = existingContent.indexOf(autoEndMarker);
  
  // Validate markers are in correct order (start before end)
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    // Valid existing auto section - replace it
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx + autoEndMarker.length);
    return before.trimEnd() + "\n\n" + autoSection + after;
  } else if (startIdx !== -1 || endIdx !== -1) {
    // Malformed markers (only one present, or out of order)
    // Log warning and append new auto section at the end
    console.warn("[routeScanner] Malformed auto-generated section markers detected. Appending new section.");
    return existingContent.trimEnd() + "\n\n---\n\n" + autoSection;
  } else {
    // No existing auto section - append at the end
    return existingContent.trimEnd() + "\n\n---\n\n" + autoSection;
  }
}

/**
 * Create a new stub document for a domain
 */
export function createStubDocument(domainRoutes: DomainRoutes): string {
  const autoSection = generateAutoSection(domainRoutes);
  
  return `# ${domainRoutes.displayName} API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | ${domainRoutes.displayName} |
| **Route File(s)** | ${domainRoutes.files.map(f => `\`${f}\``).join(", ")} |
| **Base Path(s)** | ${[...new Set(domainRoutes.routes.map(r => r.path.split("/").slice(0, 4).join("/")))].join(", ")} |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | TBD |
| **Tenant Scoped** | TBD |

---

<!-- === MANUAL NOTES SECTION (safe to edit) === -->

## Notes / Gotchas

*Add manual notes here. This section will be preserved during sync.*

<!-- === END MANUAL NOTES SECTION === -->

---

${autoSection}
`;
}
