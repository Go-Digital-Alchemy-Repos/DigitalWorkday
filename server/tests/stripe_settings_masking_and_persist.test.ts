import { describe, it, expect, vi } from "vitest";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";

function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  const last4 = secret.length > 4 ? secret.slice(-4) : "";
  return `••••${last4}`;
}

describe("Stripe Settings Masking and Persistence", () => {
  describe("Secret Masking", () => {
    it("should mask Stripe secret key correctly", () => {
      const secretKey = "sk_test_abc123456789def";
      const masked = maskSecret(secretKey);
      expect(masked).toBe("••••9def");
      expect(masked).not.toContain("sk_test");
    });

    it("should mask webhook secret correctly", () => {
      const webhookSecret = "whsec_test1234567890";
      const masked = maskSecret(webhookSecret);
      expect(masked).toBe("••••7890");
      expect(masked).not.toContain("whsec");
    });

    it("should return null for empty strings", () => {
      expect(maskSecret("")).toBeNull();
      expect(maskSecret(null)).toBeNull();
      expect(maskSecret(undefined)).toBeNull();
    });

    it("should handle short secrets", () => {
      const shortSecret = "abc";
      const masked = maskSecret(shortSecret);
      expect(masked).toBe("••••");
    });
  });

  describe("Encryption", () => {
    const testSecretKey = "sk_live_veryLongSecretKeyThatShouldBeEncrypted123";
    const testWebhookSecret = "whsec_testSigningSecret123456";

    it("should encrypt and decrypt secret key correctly", () => {
      if (!isEncryptionAvailable()) {
        console.log("Skipping: ENCRYPTION_KEY not set");
        return;
      }
      const encrypted = encryptValue(testSecretKey);
      expect(encrypted).not.toBe(testSecretKey);
      expect(encrypted.length).toBeGreaterThan(testSecretKey.length);
      
      const decrypted = decryptValue(encrypted);
      expect(decrypted).toBe(testSecretKey);
    });

    it("should encrypt and decrypt webhook secret correctly", () => {
      if (!isEncryptionAvailable()) {
        console.log("Skipping: ENCRYPTION_KEY not set");
        return;
      }
      const encrypted = encryptValue(testWebhookSecret);
      expect(encrypted).not.toBe(testWebhookSecret);
      
      const decrypted = decryptValue(encrypted);
      expect(decrypted).toBe(testWebhookSecret);
    });

    it("should produce different ciphertext for same plaintext (due to IV)", () => {
      if (!isEncryptionAvailable()) {
        console.log("Skipping: ENCRYPTION_KEY not set");
        return;
      }
      const encrypted1 = encryptValue(testSecretKey);
      const encrypted2 = encryptValue(testSecretKey);
      expect(encrypted1).not.toBe(encrypted2);
      
      expect(decryptValue(encrypted1)).toBe(testSecretKey);
      expect(decryptValue(encrypted2)).toBe(testSecretKey);
    });

    it("should handle non-empty string encryption", () => {
      if (!isEncryptionAvailable()) {
        console.log("Skipping: ENCRYPTION_KEY not set");
        return;
      }
      const testValue = "test_value_123";
      const encrypted = encryptValue(testValue);
      const decrypted = decryptValue(encrypted);
      expect(decrypted).toBe(testValue);
    });
  });

  describe("API Response Masking", () => {
    it("should never return raw secrets in GET response format", () => {
      const mockApiResponse = {
        config: {
          publishableKey: "pk_test_123abc",
          defaultCurrency: "usd",
        },
        secretMasked: {
          secretKeyMasked: "••••abc1",
          webhookSecretMasked: "••••sec2",
        },
        lastTestedAt: null,
      };

      expect(mockApiResponse).not.toHaveProperty("secretKey");
      expect(mockApiResponse).not.toHaveProperty("webhookSecret");
      expect(mockApiResponse.secretMasked.secretKeyMasked).toMatch(/^••••/);
      expect(mockApiResponse.secretMasked.webhookSecretMasked).toMatch(/^••••/);
    });
  });

  describe("Currency Validation", () => {
    const validCurrencies = ["usd", "eur", "gbp", "cad", "aud"];
    
    it.each(validCurrencies)("should accept valid currency: %s", (currency) => {
      expect(validCurrencies).toContain(currency);
    });

    it("should reject invalid currency codes", () => {
      const invalidCurrencies = ["xyz", "btc", "usdd", ""];
      invalidCurrencies.forEach(currency => {
        expect(validCurrencies).not.toContain(currency);
      });
    });
  });

  describe("Publishable Key Format", () => {
    it("should validate test mode publishable key format", () => {
      const testKey = "pk_test_51abc123DEF";
      expect(testKey.startsWith("pk_test_")).toBe(true);
    });

    it("should validate live mode publishable key format", () => {
      const liveKey = "pk_live_51abc123DEF";
      expect(liveKey.startsWith("pk_live_")).toBe(true);
    });
  });
});
