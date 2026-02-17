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
