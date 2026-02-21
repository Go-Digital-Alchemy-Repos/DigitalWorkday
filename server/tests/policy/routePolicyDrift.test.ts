import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import http from "http";
import { getRouteRegistry, clearRouteRegistry } from "../../http/routeRegistry";

describe("Route Policy Drift Detection", () => {
  beforeAll(async () => {
    clearRouteRegistry();
    const app = express();
    const httpServer = http.createServer(app);
    const { mountAllRoutes } = await import("../../http/mount");
    await mountAllRoutes(httpServer, app);
  });

  it("should have zero legacy routes in the registry", () => {
    const registry = getRouteRegistry();
    const legacyRoutes = registry.filter(r => r.legacy);
    expect(legacyRoutes).toHaveLength(0);
  });

  it("should have all core domains registered", () => {
    const registry = getRouteRegistry();
    const domains = new Set(registry.map(r => r.domain));

    const expectedCoreDomains = [
      "tags", "activity", "comments", "presence", "ai",
      "attachments", "uploads", "chat", "time",
      "projects", "tasks", "subtasks", "workspaces", "teams",
      "users", "crm", "clients", "search", "features",
      "super-admin", "super-debug", "webhooks",
      "tenant-onboarding", "tenant-billing",
      "jobs", "support", "assets",
    ];

    for (const domain of expectedCoreDomains) {
      expect(domains.has(domain)).toBe(true);
    }
  });

  it("should not have duplicate path+domain combinations", () => {
    const registry = getRouteRegistry();
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const route of registry) {
      const key = `${route.path}::${route.domain}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    expect(duplicates).toHaveLength(0);
  });

  it("every registered route should have a valid policy", () => {
    const registry = getRouteRegistry();
    const validPolicies = ["public", "authOnly", "authTenant", "superUser"];

    for (const route of registry) {
      expect(validPolicies).toContain(route.policy);
    }
  });

  it("every registered route should have a non-null router", () => {
    const registry = getRouteRegistry();
    for (const route of registry) {
      expect(route.router).toBeTruthy();
    }
  });

  it("every registered route path should start with /api", () => {
    const registry = getRouteRegistry();
    for (const route of registry) {
      expect(route.path.startsWith("/api")).toBe(true);
    }
  });

  it("super admin routes should use superUser policy", () => {
    const registry = getRouteRegistry();
    const superRoutes = registry.filter(r => 
      r.path.includes("/super") && 
      !r.domain.includes("status") &&
      !r.domain.includes("tenancy-health")
    );

    for (const route of superRoutes) {
      expect(route.policy).toBe("superUser");
    }
  });

  it("webhook routes should use public policy", () => {
    const registry = getRouteRegistry();
    const webhookRoutes = registry.filter(r => r.domain === "webhooks");
    expect(webhookRoutes.length).toBeGreaterThan(0);
    
    for (const route of webhookRoutes) {
      expect(route.policy).toBe("public");
    }
  });
});
