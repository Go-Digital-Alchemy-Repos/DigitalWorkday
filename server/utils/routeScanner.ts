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

// Base path prefixes from routes/index.ts
const BASE_PATH_MAP: Record<string, string> = {
  "timeTracking.ts": "/api/timer",
  "superAdmin.ts": "/api/v1/super",
  "superDebug.ts": "/api/v1/super/debug",
  "superChat.ts": "/api/v1/super/chat",
  "chatDebug.ts": "/api/v1/super/debug/chat",
  "tenantOnboarding.ts": "/api/v1/tenant",
  "tenantBilling.ts": "/api/v1/tenant",
  "projectsDashboard.ts": "/api/v1",
  "workloadReports.ts": "/api/v1",
  "uploads.ts": "/api/v1/uploads",
  "emailOutbox.ts": "/api/v1",
  "systemStatus.ts": "/api/v1/super/status",
  "systemIntegrations.ts": "/api/v1/system",
  "chat.ts": "/api/v1/chat",
  "chatRetention.ts": "/api/v1",
  "ai.ts": "/api/v1/ai",
  "tenancyHealth.ts": "/api",
  "webhooks.ts": "/api/v1",
  // Features - these use nested paths
  "router.ts": "/api/v1/clients",
  "notes.router.ts": "/api/v1/clients",
  "documents.router.ts": "/api/v1/clients",
  "divisions.router.ts": "/api/v1/clients",
  "portal.router.ts": "/api/v1/clients",
  "notifications.router.ts": "/api/v1/notifications",
  "systemStatus.router.ts": "/api/v1/super",
  "integrations.router.ts": "/api/v1/super",
};

/**
 * Extract routes from a TypeScript file using regex
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
    
    // Match router.get/post/patch/put/delete patterns
    const routePattern = /router\.(get|post|patch|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      routePattern.lastIndex = 0;
      
      while ((match = routePattern.exec(line)) !== null) {
        const method = match[1].toUpperCase();
        let routePath = match[2];
        
        // Combine base path with route path
        const fullPath = routePath.startsWith("/") 
          ? `${basePath}${routePath}`
          : `${basePath}/${routePath}`;
        
        routes.push({
          method,
          path: fullPath.replace(/\/+/g, "/"), // Clean up double slashes
          file: path.relative(process.cwd(), filePath),
          domain: domainInfo.domain,
          line: i + 1,
        });
      }
    }
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
 */
export function mergeContent(existingContent: string, autoSection: string): string {
  const autoStartMarker = "<!-- === AUTO-GENERATED SECTION (do not edit below this line) === -->";
  const autoEndMarker = "<!-- === END AUTO-GENERATED SECTION === -->";
  
  // Check if auto section already exists
  const startIdx = existingContent.indexOf(autoStartMarker);
  const endIdx = existingContent.indexOf(autoEndMarker);
  
  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing auto section
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx + autoEndMarker.length);
    return before.trimEnd() + "\n\n" + autoSection + after;
  } else {
    // Append auto section at the end
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
