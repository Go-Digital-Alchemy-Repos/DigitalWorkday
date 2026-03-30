import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from "vitest";
import { TenantIntegrationService } from "../services/tenantIntegrations";
import { db } from "../db";
import { tenantIntegrations, tenants, users, TenantStatus, UserRole, IntegrationStatus } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

const testTenant1Id = "test-tenant-int-1";
const testTenant2Id = "test-tenant-int-2";
const testUserId = "test-user-int-1";

describe("Tenant Integrations", () => {
  let service: TenantIntegrationService;

  beforeAll(async () => {
    service = new TenantIntegrationService();
    
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant1Id)
    );
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant2Id)
    );
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenant1Id));
    await db.delete(tenants).where(eq(tenants.id, testTenant2Id));
    
    await db.insert(tenants).values([
      {
        id: testTenant1Id,
        name: "Test Tenant 1",
        slug: "test-tenant-int-1",
        status: TenantStatus.ACTIVE,
      },
      {
        id: testTenant2Id,
        name: "Test Tenant 2",
        slug: "test-tenant-int-2",
        status: TenantStatus.ACTIVE,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant1Id)
    );
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant2Id)
    );
    await db.delete(tenants).where(eq(tenants.id, testTenant1Id));
    await db.delete(tenants).where(eq(tenants.id, testTenant2Id));
  });

  beforeEach(async () => {
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant1Id)
    );
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant2Id)
    );
  });

  describe("Save and reload integration", () => {
    it("saves Mailgun config and reloads with public config", async () => {
      const publicConfig = {
        domain: "mg.example.com",
        fromEmail: "noreply@example.com",
        replyTo: "support@example.com",
      };

      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig,
        secretConfig: { apiKey: "test-api-key-123" },
      });

      const reloaded = await service.getIntegration(testTenant1Id, "mailgun");
      
      expect(reloaded).not.toBeNull();
      expect(reloaded!.provider).toBe("mailgun");
      expect(reloaded!.status).toBe(IntegrationStatus.CONFIGURED);
      expect(reloaded!.publicConfig).toEqual(publicConfig);
      expect(reloaded!.secretConfigured).toBe(true);
    });

    it("saves S3 config and reloads with public config", async () => {
      const publicConfig = {
        bucketName: "my-bucket",
        region: "us-east-1",
        keyPrefixTemplate: "tenants/{tenantId}/",
      };

      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig,
        secretConfig: { accessKeyId: "AKIATEST", secretAccessKey: "secret123" },
      });

      const reloaded = await service.getIntegration(testTenant1Id, "s3");
      
      expect(reloaded).not.toBeNull();
      expect(reloaded!.provider).toBe("s3");
      expect(reloaded!.status).toBe(IntegrationStatus.CONFIGURED);
      expect(reloaded!.publicConfig).toEqual(publicConfig);
      expect(reloaded!.secretConfigured).toBe(true);
    });

    it("updates existing integration without losing data", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "mg1.example.com",
          fromEmail: "old@example.com",
        },
        secretConfig: { apiKey: "old-key" },
      });

      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "mg2.example.com",
          fromEmail: "new@example.com",
        },
      });

      const reloaded = await service.getIntegration(testTenant1Id, "mailgun");
      
      expect(reloaded!.publicConfig).toEqual({
        domain: "mg2.example.com",
        fromEmail: "new@example.com",
      });
      expect(reloaded!.secretConfigured).toBe(true);
    });
  });

  describe("Tenant isolation", () => {
    it("tenant 1 cannot see tenant 2's integrations", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "tenant1.example.com",
          fromEmail: "t1@example.com",
        },
        secretConfig: { apiKey: "tenant1-key" },
      });

      await service.upsertIntegration(testTenant2Id, "mailgun", {
        publicConfig: {
          domain: "tenant2.example.com",
          fromEmail: "t2@example.com",
        },
        secretConfig: { apiKey: "tenant2-key" },
      });

      const tenant1Integration = await service.getIntegration(testTenant1Id, "mailgun");
      const tenant2Integration = await service.getIntegration(testTenant2Id, "mailgun");
      
      expect(tenant1Integration!.publicConfig).toEqual({
        domain: "tenant1.example.com",
        fromEmail: "t1@example.com",
      });
      expect(tenant2Integration!.publicConfig).toEqual({
        domain: "tenant2.example.com",
        fromEmail: "t2@example.com",
      });

      expect(tenant1Integration!.publicConfig).not.toEqual(tenant2Integration!.publicConfig);
    });

    it("lists only integrations for the specified tenant", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "tenant1.example.com",
          fromEmail: "t1@example.com",
        },
        secretConfig: { apiKey: "tenant1-mailgun-key" },
      });

      await service.upsertIntegration(testTenant2Id, "s3", {
        publicConfig: {
          bucketName: "tenant2-bucket",
          region: "eu-west-1",
          keyPrefixTemplate: "t2/",
        },
        secretConfig: { accessKeyId: "t2-key", secretAccessKey: "t2-secret" },
      });

      const tenant1List = await service.listIntegrations(testTenant1Id);
      const tenant2List = await service.listIntegrations(testTenant2Id);
      
      const tenant1Mailgun = tenant1List.find(i => i.provider === "mailgun");
      const tenant1S3 = tenant1List.find(i => i.provider === "s3");
      const tenant2Mailgun = tenant2List.find(i => i.provider === "mailgun");
      const tenant2S3 = tenant2List.find(i => i.provider === "s3");

      expect(tenant1Mailgun!.status).toBe(IntegrationStatus.CONFIGURED);
      expect(tenant1S3!.status).toBe(IntegrationStatus.NOT_CONFIGURED);
      expect(tenant2Mailgun!.status).toBe(IntegrationStatus.NOT_CONFIGURED);
      expect(tenant2S3!.status).toBe(IntegrationStatus.CONFIGURED);
    });

    it("returns null for non-existent tenant integration", async () => {
      const result = await service.getIntegration("non-existent-tenant", "mailgun");
      expect(result).toBeNull();
    });
  });

  describe("Integration status", () => {
    it("returns not_configured for new tenants", async () => {
      const integrations = await service.listIntegrations(testTenant1Id);
      
      for (const integration of integrations) {
        expect(integration.status).toBe(IntegrationStatus.NOT_CONFIGURED);
        expect(integration.publicConfig).toBeNull();
        expect(integration.secretConfigured).toBe(false);
      }
    });

    it("sets configured status when integration is saved with required fields", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "test.example.com",
          fromEmail: "test@example.com",
        },
        secretConfig: { apiKey: "test-api-key" },
      });

      const integration = await service.getIntegration(testTenant1Id, "mailgun");
      expect(integration!.status).toBe(IntegrationStatus.CONFIGURED);
    });

    it("S3 requires secret to be configured", async () => {
      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig: {
          bucketName: "test-bucket",
          region: "us-east-1",
          keyPrefixTemplate: "test/",
        },
      });

      const integration = await service.getIntegration(testTenant1Id, "s3");
      expect(integration!.status).toBe(IntegrationStatus.NOT_CONFIGURED);
    });

    it("S3 is configured with public config and secrets", async () => {
      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig: {
          bucketName: "test-bucket",
          region: "us-east-1",
          keyPrefixTemplate: "test/",
        },
        secretConfig: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
      });

      const integration = await service.getIntegration(testTenant1Id, "s3");
      expect(integration!.status).toBe(IntegrationStatus.CONFIGURED);
    });
  });

  describe("Secret handling", () => {
    it("does not expose secrets in response", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "test.example.com",
          fromEmail: "test@example.com",
        },
        secretConfig: { apiKey: "super-secret-key" },
      });

      const integration = await service.getIntegration(testTenant1Id, "mailgun");
      
      expect(integration!.secretConfigured).toBe(true);
      expect((integration!.publicConfig as any).apiKey).toBeUndefined();
      expect((integration as any).secretConfig).toBeUndefined();
      expect((integration as any).configEncrypted).toBeUndefined();
    });

    it("preserves existing secret when updating public config only", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "old.example.com",
          fromEmail: "old@example.com",
        },
        secretConfig: { apiKey: "my-secret-key" },
      });

      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "new.example.com",
          fromEmail: "new@example.com",
        },
      });

      const integration = await service.getIntegration(testTenant1Id, "mailgun");
      expect(integration!.secretConfigured).toBe(true);
      expect((integration!.publicConfig as any).domain).toBe("new.example.com");
    });
  });

  describe("Secret decryption flow", () => {
    it("getDecryptedSecrets returns correct typed secrets after upsert", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "decrypt-test.example.com",
          fromEmail: "decrypt@example.com",
        },
        secretConfig: { apiKey: "decrypt-test-api-key-123" },
      });

      const secrets = await service.getDecryptedSecrets<{ apiKey: string }>(testTenant1Id, "mailgun");

      expect(secrets).not.toBeNull();
      expect(secrets!.apiKey).toBe("decrypt-test-api-key-123");
    });

    it("getDecryptedSecrets returns correct S3 secrets after upsert", async () => {
      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig: {
          bucketName: "decrypt-bucket",
          region: "us-west-2",
          keyPrefixTemplate: "test/",
        },
        secretConfig: { accessKeyId: "AKIA_DECRYPT", secretAccessKey: "secret_decrypt_123" },
      });

      const secrets = await service.getDecryptedSecrets<{ accessKeyId: string; secretAccessKey: string }>(testTenant1Id, "s3");

      expect(secrets).not.toBeNull();
      expect(secrets!.accessKeyId).toBe("AKIA_DECRYPT");
      expect(secrets!.secretAccessKey).toBe("secret_decrypt_123");
    });

    it("getIntegrationWithSecrets returns both public and secret config", async () => {
      const publicConfig = {
        domain: "with-secrets.example.com",
        fromEmail: "ws@example.com",
        replyTo: "reply@example.com",
      };

      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig,
        secretConfig: { apiKey: "combined-api-key-456" },
      });

      const result = await service.getIntegrationWithSecrets(testTenant1Id, "mailgun");

      expect(result).not.toBeNull();
      expect(result!.publicConfig).toEqual(publicConfig);
      expect(result!.secretConfig).not.toBeNull();
      expect((result!.secretConfig as any).apiKey).toBe("combined-api-key-456");
    });

    it("getDecryptedSecrets returns null for missing integration", async () => {
      const secrets = await service.getDecryptedSecrets(testTenant1Id, "mailgun");
      expect(secrets).toBeNull();
    });

    it("getIntegrationWithSecrets returns null for missing integration", async () => {
      const result = await service.getIntegrationWithSecrets(testTenant1Id, "mailgun");
      expect(result).toBeNull();
    });

    it("handles partial secrets (only accessKeyId, no secretAccessKey)", async () => {
      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig: {
          bucketName: "partial-bucket",
          region: "eu-west-1",
          keyPrefixTemplate: "partial/",
        },
        secretConfig: { accessKeyId: "AKIA_PARTIAL_ONLY", secretAccessKey: "" },
      });

      const secrets = await service.getDecryptedSecrets<{ accessKeyId?: string; secretAccessKey?: string }>(testTenant1Id, "s3");

      expect(secrets).not.toBeNull();
      expect(secrets!.accessKeyId).toBe("AKIA_PARTIAL_ONLY");
      expect(secrets!.secretAccessKey).toBeUndefined();
    });

    it("getIntegrationWithSecrets returns null secretConfig when no secrets stored", async () => {
      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig: {
          bucketName: "no-secret-bucket",
          region: "us-east-1",
          keyPrefixTemplate: "nosecret/",
        },
      });

      const result = await service.getIntegrationWithSecrets(testTenant1Id, "s3");

      expect(result).not.toBeNull();
      expect(result!.publicConfig).not.toBeNull();
      expect(result!.secretConfig).toBeNull();
    });

    it("corrupt encrypted data returns null without throwing", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "corrupt-test.example.com",
          fromEmail: "corrupt@example.com",
        },
        secretConfig: { apiKey: "valid-key-before-corruption" },
      });

      await db
        .update(tenantIntegrations)
        .set({ configEncrypted: "not-valid-encrypted-data" })
        .where(
          and(
            eq(tenantIntegrations.tenantId, testTenant1Id),
            eq(tenantIntegrations.provider, "mailgun")
          )
        );

      const secrets = await service.getDecryptedSecrets(testTenant1Id, "mailgun");
      expect(secrets).toBeNull();

      const withSecrets = await service.getIntegrationWithSecrets(testTenant1Id, "mailgun");
      expect(withSecrets).not.toBeNull();
      expect(withSecrets!.secretConfig).toBeNull();
    });

    it("encrypted storage round-trip preserves all secret fields", async () => {
      const originalSecrets = { accessKeyId: "AKIA_ROUNDTRIP", secretAccessKey: "roundtrip_secret_xyz" };

      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig: {
          bucketName: "roundtrip-bucket",
          region: "ap-southeast-1",
          keyPrefixTemplate: "roundtrip/",
        },
        secretConfig: originalSecrets,
      });

      const decrypted = await service.getDecryptedSecrets<{ accessKeyId: string; secretAccessKey: string }>(testTenant1Id, "s3");
      expect(decrypted).toEqual(originalSecrets);

      const withSecrets = await service.getIntegrationWithSecrets(testTenant1Id, "s3");
      expect(withSecrets!.secretConfig).toEqual(originalSecrets);
    });
  });
});
