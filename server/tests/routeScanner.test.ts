import { describe, expect, it } from "vitest";
import { createStubDocument, generateAutoSection, mergeContent, scanAllRoutes } from "../utils/routeScanner";

describe("App Docs route scanner", () => {
  it("covers the current registry-mounted API architecture", async () => {
    const domains = await scanAllRoutes();
    const routes = [...domains.values()].flatMap(domain => domain.routes);

    expect(domains.size).toBeGreaterThanOrEqual(50);
    expect(routes.length).toBeGreaterThanOrEqual(650);
    expect(domains.has("tasks")).toBe(true);
    expect(domains.has("tenant-default-docs")).toBe(true);
    expect(domains.has("reports-v2-forecasting")).toBe(true);
    expect(domains.has("super-admin")).toBe(true);
  });

  it("emits full mounted paths without duplicates inside a domain", async () => {
    const domains = await scanAllRoutes();

    for (const domain of domains.values()) {
      const keys = domain.routes.map(route => `${route.method}:${route.path}`);
      expect(new Set(keys).size, domain.domain).toBe(keys.length);
      expect(domain.routes.every(route => route.path.startsWith("/api")), domain.domain).toBe(true);
    }
  });

  it("generates replaceable endpoint sections while preserving manual notes", async () => {
    const domains = await scanAllRoutes();

    for (const domain of domains.values()) {
      const generated = generateAutoSection(domain);
      expect(generated).toContain("AUTO-GENERATED SECTION");
      expect(generated).toContain("### Endpoints");
      expect(createStubDocument(domain)).toContain(`# ${domain.displayName} API`);
    }

    const firstDomain = domains.values().next().value;
    expect(firstDomain).toBeDefined();
    const original = `# Manual Notes\n\nKeep this explanation.\n\n${generateAutoSection(firstDomain!)}`;
    const merged = mergeContent(original, generateAutoSection(firstDomain!));
    expect(merged).toContain("Keep this explanation.");
    expect(merged.match(/AUTO-GENERATED SECTION/g)).toHaveLength(2);
  });
});
