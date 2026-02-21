import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "../lib/errors";
import { BaseTenantRepository } from "../storage/baseTenantRepository";

class TestRepository extends BaseTenantRepository {
  getWithTenant(id: string, tenantId: string | null | undefined) {
    const tid = this.requireTenantId(tenantId, "TestRepository.getWithTenant");
    return { id, tenantId: tid };
  }

  checkTenantMatch(resourceTenantId: string | null | undefined, expectedTenantId: string) {
    this.assertTenantMatch(resourceTenantId, expectedTenantId, "TestEntity", "test-id-123");
  }
}

describe("BaseTenantRepository", () => {
  const repo = new TestRepository();

  describe("requireTenantId", () => {
    it("should return tenantId when provided", () => {
      const result = repo.getWithTenant("entity-1", "tenant-abc");
      expect(result.tenantId).toBe("tenant-abc");
    });

    it("should handle null tenantId based on enforcement mode", () => {
      const originalEnv = process.env.TENANCY_ENFORCEMENT;
      
      // In non-strict mode, should not throw
      process.env.TENANCY_ENFORCEMENT = "off";
      expect(() => repo.getWithTenant("entity-1", null)).not.toThrow();
      
      process.env.TENANCY_ENFORCEMENT = originalEnv;
    });

    it("should throw TENANT_REQUIRED in strict mode when tenantId missing", () => {
      const originalEnv = process.env.TENANCY_ENFORCEMENT;
      process.env.TENANCY_ENFORCEMENT = "strict";

      try {
        expect(() => repo.getWithTenant("entity-1", null)).toThrow();
        expect(() => repo.getWithTenant("entity-1", undefined)).toThrow();
        
        try {
          repo.getWithTenant("entity-1", null);
        } catch (err: any) {
          expect(err).toBeInstanceOf(AppError);
          expect(err.code).toBe("TENANT_REQUIRED");
          expect(err.message).toContain("TENANT_SCOPE_REQUIRED");
        }
      } finally {
        process.env.TENANCY_ENFORCEMENT = originalEnv;
      }
    });
  });

  describe("assertTenantMatch", () => {
    it("should pass when tenantIds match", () => {
      expect(() => repo.checkTenantMatch("tenant-abc", "tenant-abc")).not.toThrow();
    });

    it("should throw TENANCY_VIOLATION on cross-tenant access", () => {
      expect(() => repo.checkTenantMatch("tenant-abc", "tenant-xyz")).toThrow();
      
      try {
        repo.checkTenantMatch("tenant-abc", "tenant-xyz");
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe("TENANCY_VIOLATION");
        expect(err.message).toContain("Cross-tenant access denied");
      }
    });

    it("should handle null resourceTenantId based on enforcement mode", () => {
      const originalEnv = process.env.TENANCY_ENFORCEMENT;
      
      process.env.TENANCY_ENFORCEMENT = "off";
      expect(() => repo.checkTenantMatch(null, "tenant-abc")).not.toThrow();

      process.env.TENANCY_ENFORCEMENT = "strict";
      expect(() => repo.checkTenantMatch(null, "tenant-abc")).toThrow();
      
      process.env.TENANCY_ENFORCEMENT = originalEnv;
    });
  });
});

describe("Cross-tenant access prevention", () => {
  it("should reject cross-tenant resource access with TENANCY_VIOLATION", () => {
    const repo = new TestRepository();
    
    try {
      repo.checkTenantMatch("tenant-A", "tenant-B");
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("TENANCY_VIOLATION");
      expect(err.statusCode).toBe(403);
    }
  });

  it("should allow same-tenant resource access", () => {
    const repo = new TestRepository();
    expect(() => repo.checkTenantMatch("tenant-A", "tenant-A")).not.toThrow();
  });
});
