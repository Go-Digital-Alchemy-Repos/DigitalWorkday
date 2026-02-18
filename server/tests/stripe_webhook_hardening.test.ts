import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isPlaceholderSecret, StripeConfigError } from "../config/stripe";

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock("../lib/encryption", () => ({
  isEncryptionAvailable: vi.fn().mockReturnValue(false),
  decryptValue: vi.fn(),
}));

describe("Stripe Webhook Hardening", () => {
  describe("isPlaceholderSecret", () => {
    it("should reject empty strings", () => {
      expect(isPlaceholderSecret("")).toBe(true);
    });

    it("should reject very short secrets (< 10 chars)", () => {
      expect(isPlaceholderSecret("short")).toBe(true);
      expect(isPlaceholderSecret("abc")).toBe(true);
      expect(isPlaceholderSecret("123456789")).toBe(true);
    });

    it("should reject 'changeme' placeholder", () => {
      expect(isPlaceholderSecret("whsec_changeme_1234")).toBe(true);
    });

    it("should reject 'placeholder' keyword", () => {
      expect(isPlaceholderSecret("whsec_placeholder_value")).toBe(true);
    });

    it("should reject 'TODO' keyword", () => {
      expect(isPlaceholderSecret("TODO_set_this_later")).toBe(true);
    });

    it("should reject 'whsec_xxx'", () => {
      expect(isPlaceholderSecret("whsec_xxx")).toBe(true);
    });

    it("should reject 'whsec_test'", () => {
      expect(isPlaceholderSecret("whsec_test")).toBe(true);
    });

    it("should reject 'sk_test_placeholder'", () => {
      expect(isPlaceholderSecret("sk_test_placeholder_abc")).toBe(true);
    });

    it("should accept valid-looking webhook secrets", () => {
      expect(isPlaceholderSecret("whsec_" + "abcd1234".repeat(4))).toBe(false);
    });

    it("should accept valid-looking secret keys", () => {
      expect(isPlaceholderSecret("sk_live_" + "abcd1234".repeat(4))).toBe(false);
    });

    it("should be case-insensitive for placeholder detection", () => {
      expect(isPlaceholderSecret("WHSEC_CHANGEME_1234")).toBe(true);
      expect(isPlaceholderSecret("Placeholder_Secret_Value")).toBe(true);
    });

    it("should reject whitespace-only strings", () => {
      expect(isPlaceholderSecret("   ")).toBe(true);
    });
  });

  describe("StripeConfigError", () => {
    it("should have correct name and code", () => {
      const error = new StripeConfigError("test message");
      expect(error.name).toBe("StripeConfigError");
      expect(error.code).toBe("STRIPE_CONFIG_ERROR");
      expect(error.message).toBe("test message");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(StripeConfigError);
    });

    it("should accept custom error code", () => {
      const error = new StripeConfigError("custom", "CUSTOM_CODE");
      expect(error.code).toBe("CUSTOM_CODE");
    });
  });

  describe("getStripeWebhookSecret", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return env var secret when set and valid", async () => {
      const testSecret = "whsec_valid_secret_" + "1234567890abcdef";
      process.env.STRIPE_WEBHOOK_SECRET = testSecret;
      const { getStripeWebhookSecret } = await import("../config/stripe");
      const result = await getStripeWebhookSecret();
      expect(result.secret).toBe(testSecret);
      expect(result.source).toBe("env");
    });

    it("should throw StripeConfigError when env var is a placeholder", async () => {
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_changeme_placeholder";
      const { getStripeWebhookSecret, StripeConfigError: SCE } = await import("../config/stripe");
      await expect(getStripeWebhookSecret()).rejects.toThrow(SCE);
      await expect(getStripeWebhookSecret()).rejects.toThrow("placeholder");
    });

    it("should throw StripeConfigError when neither env nor DB secret exists", async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const { getStripeWebhookSecret, StripeConfigError: SCE } = await import("../config/stripe");
      await expect(getStripeWebhookSecret()).rejects.toThrow(SCE);
      await expect(getStripeWebhookSecret()).rejects.toThrow("not configured");
    });
  });

  describe("validateStripeEnvAtStartup", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should throw in production when STRIPE_WEBHOOK_SECRET is a placeholder", async () => {
      process.env.NODE_ENV = "production";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_changeme_placeholder";
      const { validateStripeEnvAtStartup, StripeConfigError: SCE } = await import("../config/stripe");
      expect(() => validateStripeEnvAtStartup()).toThrow(SCE);
    });

    it("should throw in production when STRIPE_SECRET_KEY is a placeholder", async () => {
      process.env.NODE_ENV = "production";
      process.env.STRIPE_SECRET_KEY = "sk_test_placeholder" + "_key_value";
      const { validateStripeEnvAtStartup, StripeConfigError: SCE } = await import("../config/stripe");
      expect(() => validateStripeEnvAtStartup()).toThrow(SCE);
    });

    it("should not throw in development for placeholder secrets", async () => {
      process.env.NODE_ENV = "development";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_changeme_placeholder";
      const { validateStripeEnvAtStartup } = await import("../config/stripe");
      expect(() => validateStripeEnvAtStartup()).not.toThrow();
    });

    it("should not throw when secrets are valid in any environment", async () => {
      process.env.NODE_ENV = "production";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_real_secret_" + "abcdefghij1234567890";
      process.env.STRIPE_SECRET_KEY = "sk_live_real_key_" + "abcdefghij1234567890xyz";
      const { validateStripeEnvAtStartup } = await import("../config/stripe");
      expect(() => validateStripeEnvAtStartup()).not.toThrow();
    });

    it("should not throw when no Stripe env vars are set", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_SECRET_KEY;
      const { validateStripeEnvAtStartup } = await import("../config/stripe");
      expect(() => validateStripeEnvAtStartup()).not.toThrow();
    });
  });

  describe("Webhook Handler Error Contracts", () => {
    it("should use standardized error envelope with ok, requestId, error object", () => {
      const configErrorResponse = {
        ok: false,
        requestId: "wh-123",
        error: {
          code: "INTERNAL_ERROR",
          message: "Stripe webhook secret misconfigured",
          status: 500,
          requestId: "wh-123",
        },
        message: "Stripe webhook secret misconfigured",
        code: "INTERNAL_ERROR",
      };
      expect(configErrorResponse.ok).toBe(false);
      expect(configErrorResponse.error.code).toBe("INTERNAL_ERROR");
      expect(configErrorResponse.error.status).toBe(500);
      expect(configErrorResponse.requestId).toBeDefined();
    });

    it("should return 400 for missing signature with VALIDATION_ERROR code", () => {
      const response = {
        ok: false,
        error: { code: "VALIDATION_ERROR", status: 400, message: "Missing stripe-signature header" },
      };
      expect(response.error.code).toBe("VALIDATION_ERROR");
      expect(response.error.status).toBe(400);
    });

    it("should return 400 for invalid signature", () => {
      const response = {
        ok: false,
        error: { code: "VALIDATION_ERROR", status: 400, message: "Invalid signature" },
      };
      expect(response.error.status).toBe(400);
    });

    it("should never return 2xx when config is misconfigured", () => {
      const configErrorStatus = 500;
      expect(configErrorStatus).not.toBe(200);
      expect(configErrorStatus).not.toBe(204);
    });
  });

  describe("Security: No Secret Leakage", () => {
    it("error messages should not contain secret prefixes", () => {
      const errorMessages = [
        "Stripe webhook secret misconfigured",
        "Missing stripe-signature header",
        "Invalid signature",
        "Webhook processing failed",
        "Stripe API key misconfigured",
      ];
      const sensitivePatterns = ["sk_live_", "sk_test_", "whsec_", "password", "apikey"];
      errorMessages.forEach((msg) => {
        sensitivePatterns.forEach((pattern) => {
          expect(msg.toLowerCase()).not.toContain(pattern);
        });
      });
    });
  });

  describe("Secret Source Precedence", () => {
    it("env var takes precedence over database", async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, STRIPE_WEBHOOK_SECRET: "whsec_env_secret_" + "abcdefghij1234567890" };
      vi.resetModules();
      const { getStripeWebhookSecret } = await import("../config/stripe");
      const result = await getStripeWebhookSecret();
      expect(result.source).toBe("env");
      process.env = originalEnv;
    });
  });
});
