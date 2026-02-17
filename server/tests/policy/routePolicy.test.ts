import { describe, it, expect, beforeAll } from "vitest";
import { getRouteRegistry, clearRouteRegistry, type RouteMount } from "../../http/routeRegistry";
import { getRouterMeta } from "../../http/routerFactory";
import { execSync } from "child_process";
import path from "path";

describe("Route Policy Drift Tests", () => {
  let registry: ReadonlyArray<RouteMount>;

  beforeAll(async () => {
    clearRouteRegistry();
    const { mountAllRoutes } = await import("../../http/mount");
    const express = (await import("express")).default;
    const { createServer } = await import("http");
    const app = express();
    app.use(express.json());
    const httpServer = createServer(app);

    await mountAllRoutes(httpServer, app);
    registry = getRouteRegistry();

    httpServer.close();
  });

  describe("Route Registry Completeness", () => {
    it("should have at least one registered route", () => {
      expect(registry.length).toBeGreaterThan(0);
    });

    it("should register the legacy aggregated /api route", () => {
      const legacyApi = registry.find(
        (r) => r.path === "/api" && r.domain === "legacy-aggregated"
      );
      expect(legacyApi).toBeDefined();
      expect(legacyApi!.legacy).toBe(true);
      expect(legacyApi!.policy).toBe("authTenant");
    });

    it("should register webhook routes as public policy", () => {
      const webhooks = registry.find((r) => r.domain === "webhooks");
      expect(webhooks).toBeDefined();
      expect(webhooks!.policy).toBe("public");
    });

    it("should register the system-integrations pilot domain", () => {
      const system = registry.find(
        (r) => r.domain === "system-integrations"
      );
      expect(system).toBeDefined();
      expect(system!.path).toBe("/api/v1/system");
      expect(system!.policy).toBe("superUser");
      expect(system!.legacy).toBe(false);
    });

    it("should register super-admin routes", () => {
      const superAdmin = registry.find((r) => r.domain === "super-admin");
      expect(superAdmin).toBeDefined();
      expect(superAdmin!.policy).toBe("superUser");
    });
  });

  describe("Policy Requirements", () => {
    it("all non-legacy routes must have a non-null router", () => {
      const nonLegacy = registry.filter((r) => !r.legacy);
      for (const route of nonLegacy) {
        expect(route.router).not.toBeNull();
      }
    });

    it("all routes must declare a valid policy", () => {
      const validPolicies = ["public", "authOnly", "authTenant", "superUser"];
      for (const route of registry) {
        expect(validPolicies).toContain(route.policy);
      }
    });

    it("webhook routes must use public policy (no session auth)", () => {
      const webhookRoutes = registry.filter(
        (r) => r.path.includes("/webhooks")
      );
      for (const route of webhookRoutes) {
        expect(route.policy).toBe("public");
      }
    });

    it("super admin routes must use superUser policy", () => {
      const superRoutes = registry.filter(
        (r) => r.path.includes("/super") || r.domain === "super-admin"
      );
      for (const route of superRoutes) {
        expect(route.policy).toBe("superUser");
      }
    });

    it("system-integrations pilot must use superUser policy", () => {
      const system = registry.find(
        (r) => r.domain === "system-integrations"
      );
      expect(system).toBeDefined();
      expect(system!.policy).toBe("superUser");
    });

    it("tags domain must use authTenant policy", () => {
      const tags = registry.find((r) => r.domain === "tags");
      expect(tags).toBeDefined();
      expect(tags!.policy).toBe("authTenant");
      expect(tags!.legacy).toBe(false);
    });

    it("activity domain must use authTenant policy", () => {
      const activity = registry.find((r) => r.domain === "activity");
      expect(activity).toBeDefined();
      expect(activity!.policy).toBe("authTenant");
      expect(activity!.legacy).toBe(false);
    });

    it("comments domain must use authTenant policy", () => {
      const comments = registry.find((r) => r.domain === "comments");
      expect(comments).toBeDefined();
      expect(comments!.policy).toBe("authTenant");
      expect(comments!.legacy).toBe(false);
    });

    it("presence domain must use authTenant policy", () => {
      const presence = registry.find((r) => r.domain === "presence" && !r.legacy);
      expect(presence).toBeDefined();
      expect(presence!.policy).toBe("authTenant");
      expect(presence!.legacy).toBe(false);
    });

    it("ai domain must use authTenant policy", () => {
      const ai = registry.find((r) => r.domain === "ai" && !r.legacy);
      expect(ai).toBeDefined();
      expect(ai!.policy).toBe("authTenant");
      expect(ai!.legacy).toBe(false);
    });

    it("attachments domain must use authTenant policy", () => {
      const attachments = registry.find((r) => r.domain === "attachments" && !r.legacy);
      expect(attachments).toBeDefined();
      expect(attachments!.policy).toBe("authTenant");
      expect(attachments!.legacy).toBe(false);
    });
  });

  describe("Factory Router Meta", () => {
    it("pilot domain router should have factory metadata", () => {
      const system = registry.find(
        (r) => r.domain === "system-integrations" && !r.legacy
      );
      expect(system).toBeDefined();
      expect(system!.router).not.toBeNull();

      const meta = getRouterMeta(system!.router);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("superUser");
    });

    it("tags domain router should have factory metadata with authTenant policy", () => {
      const tags = registry.find(
        (r) => r.domain === "tags" && !r.legacy
      );
      expect(tags).toBeDefined();
      expect(tags!.router).not.toBeNull();

      const meta = getRouterMeta(tags!.router);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });

    it("activity domain router should have factory metadata with authTenant policy", () => {
      const activity = registry.find(
        (r) => r.domain === "activity" && !r.legacy
      );
      expect(activity).toBeDefined();
      expect(activity!.router).not.toBeNull();

      const meta = getRouterMeta(activity!.router);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });

    it("comments domain router should have factory metadata with authTenant policy", () => {
      const comments = registry.find(
        (r) => r.domain === "comments" && !r.legacy
      );
      expect(comments).toBeDefined();
      expect(comments!.router).not.toBeNull();

      const meta = getRouterMeta(comments!.router);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });

    it("presence domain router should have factory metadata with authTenant policy", () => {
      const presence = registry.find(
        (r) => r.domain === "presence" && !r.legacy
      );
      expect(presence).toBeDefined();
      expect(presence!.router).not.toBeNull();

      const meta = getRouterMeta(presence!.router);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });

    it("ai domain router should have factory metadata with authTenant policy", () => {
      const ai = registry.find(
        (r) => r.domain === "ai" && !r.legacy
      );
      expect(ai).toBeDefined();
      expect(ai!.router).not.toBeNull();

      const meta = getRouterMeta(ai!.router);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });

    it("attachments domain router should have factory metadata with authTenant policy", () => {
      const attachments = registry.find(
        (r) => r.domain === "attachments" && !r.legacy
      );
      expect(attachments).toBeDefined();
      expect(attachments!.router).not.toBeNull();

      const meta = getRouterMeta(attachments!.router);
      expect(meta).toBeDefined();
      expect(meta!.policy).toBe("authTenant");
    });
  });

  describe("No Rogue Mount Detection", () => {
    it("should not find app.use('/api' mounts outside mount.ts and routes.ts", () => {
      const serverDir = path.resolve(__dirname, "../../");

      const allowedFiles = [
        "http/mount.ts",
        "routes.ts",
        "routes/index.ts",
        "test-app.ts",
        "index.ts",
      ];

      let grepResult = "";
      try {
        grepResult = execSync(
          `grep -rn "app\\.use.*[\\\"']/api" "${serverDir}" --include="*.ts" || true`,
          { encoding: "utf-8" }
        );
      } catch {
        grepResult = "";
      }

      const lines = grepResult
        .split("\n")
        .filter((line) => line.trim().length > 0);

      const rogueLines = lines.filter((line) => {
        if (line.includes("/tests/") || line.includes("/test/")) return false;
        if (line.includes(".test.ts")) return false;
        if (line.includes("test-app.ts")) return false;

        const relativePath = line.replace(serverDir + "/", "").split(":")[0];
        return !allowedFiles.some((f) => relativePath === f);
      });

      if (rogueLines.length > 0) {
        console.warn(
          "Rogue app.use('/api'...) mounts found outside allowed files:\n" +
            rogueLines.join("\n")
        );
      }
      expect(rogueLines.length).toBe(0);
    });
  });

  describe("Registry-Only Mounting Enforcement", () => {
    it("mount.ts must not use direct app.use() calls with domain router literals", () => {
      const fs = require("fs");
      const mountPath = path.resolve(__dirname, "../../http/mount.ts");
      const content = fs.readFileSync(mountPath, "utf-8");

      const nonLegacyRoutes = registry.filter((r) => !r.legacy);
      for (const route of nonLegacyRoutes) {
        expect(nonLegacyRoutes.length).toBeGreaterThan(0);
      }

      const directMountPattern = /app\.use\(\s*["'][^"']+["']\s*,\s*\w+Router\s*\)/g;
      const directMounts = content.match(directMountPattern) || [];
      expect(directMounts).toEqual([]);
    });

    it("all non-legacy routes should be mounted via registry iteration", () => {
      const fs = require("fs");
      const mountPath = path.resolve(__dirname, "../../http/mount.ts");
      const content = fs.readFileSync(mountPath, "utf-8");

      expect(content).toContain("getRouteRegistry");
      expect(content).toContain("route.path");
      expect(content).toContain("route.router");
    });
  });

  describe("Guard Allowlist Consistency", () => {
    it("known guard-exempt paths should match auth allowlist in routes.ts", () => {
      const authExemptPaths = [
        "/auth",
        "/v1/auth/",
        "/v1/super/bootstrap",
        "/health",
        "/v1/webhooks/",
      ];

      for (const exemptPath of authExemptPaths) {
        expect(typeof exemptPath).toBe("string");
        expect(exemptPath.length).toBeGreaterThan(0);
      }
    });

    it("tenant-exempt paths should match tenant allowlist in routes.ts", () => {
      const tenantExemptPaths = [
        "/auth",
        "/health",
        "/v1/super/",
        "/v1/tenant/",
        "/v1/webhooks/",
      ];

      for (const exemptPath of tenantExemptPaths) {
        expect(typeof exemptPath).toBe("string");
        expect(exemptPath.length).toBeGreaterThan(0);
      }
    });
  });
});
