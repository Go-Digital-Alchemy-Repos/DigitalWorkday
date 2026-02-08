import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { decryptValue, isEncryptionAvailable } from "../lib/encryption";

const PLACEHOLDER_PATTERNS = [
  "changeme",
  "placeholder",
  "todo",
  "whsec_xxx",
  "whsec_test",
  "sk_test_placeholder",
  "sk_live_placeholder",
];

const isProduction = process.env.NODE_ENV === "production";

function isPlaceholderSecret(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower || lower.length < 10) return true;
  return PLACEHOLDER_PATTERNS.some((p) => lower.includes(p));
}

export class StripeConfigError extends Error {
  public readonly code: string;
  constructor(message: string, code = "STRIPE_CONFIG_ERROR") {
    super(message);
    this.name = "StripeConfigError";
    this.code = code;
    Object.setPrototypeOf(this, StripeConfigError.prototype);
  }
}

export interface StripeWebhookSecretResult {
  secret: string;
  source: "database" | "env";
}

export async function getStripeWebhookSecret(): Promise<StripeWebhookSecretResult> {
  const envSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (envSecret && envSecret.trim()) {
    if (isPlaceholderSecret(envSecret)) {
      throw new StripeConfigError(
        "STRIPE_WEBHOOK_SECRET environment variable contains a placeholder value"
      );
    }
    return { secret: envSecret.trim(), source: "env" };
  }

  let settings: typeof systemSettings.$inferSelect | null = null;
  try {
    const [row] = await db.select().from(systemSettings).limit(1);
    settings = row || null;
  } catch (err) {
    throw new StripeConfigError(
      "Failed to read Stripe webhook secret from database"
    );
  }

  if (!settings?.stripeWebhookSecretEncrypted) {
    throw new StripeConfigError(
      "Stripe webhook secret is not configured (neither env var nor database)"
    );
  }

  if (!isEncryptionAvailable()) {
    throw new StripeConfigError(
      "Cannot decrypt Stripe webhook secret: APP_ENCRYPTION_KEY is not configured"
    );
  }

  let decrypted: string;
  try {
    decrypted = decryptValue(settings.stripeWebhookSecretEncrypted);
  } catch (err) {
    throw new StripeConfigError(
      "Failed to decrypt Stripe webhook secret from database"
    );
  }

  if (!decrypted || !decrypted.trim()) {
    throw new StripeConfigError(
      "Stripe webhook secret decrypted to empty value"
    );
  }

  if (isPlaceholderSecret(decrypted)) {
    throw new StripeConfigError(
      "Stripe webhook secret in database contains a placeholder value"
    );
  }

  return { secret: decrypted.trim(), source: "database" };
}

export async function getStripeSecretKey(): Promise<string> {
  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey && envKey.trim() && !isPlaceholderSecret(envKey)) {
    return envKey.trim();
  }

  let settings: typeof systemSettings.$inferSelect | null = null;
  try {
    const [row] = await db.select().from(systemSettings).limit(1);
    settings = row || null;
  } catch {
    throw new StripeConfigError(
      "Failed to read Stripe secret key from database"
    );
  }

  if (!settings?.stripeSecretKeyEncrypted) {
    throw new StripeConfigError(
      "Stripe secret key is not configured"
    );
  }

  if (!isEncryptionAvailable()) {
    throw new StripeConfigError(
      "Cannot decrypt Stripe secret key: APP_ENCRYPTION_KEY is not configured"
    );
  }

  let decrypted: string;
  try {
    decrypted = decryptValue(settings.stripeSecretKeyEncrypted);
  } catch {
    throw new StripeConfigError(
      "Failed to decrypt Stripe secret key from database"
    );
  }

  if (!decrypted || !decrypted.trim() || isPlaceholderSecret(decrypted)) {
    throw new StripeConfigError(
      "Stripe secret key is empty or contains a placeholder value"
    );
  }

  return decrypted.trim();
}

export function validateStripeEnvAtStartup(): void {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (isProduction) {
    if (webhookSecret && isPlaceholderSecret(webhookSecret)) {
      throw new StripeConfigError(
        "FATAL: STRIPE_WEBHOOK_SECRET contains a placeholder value in production"
      );
    }
    if (secretKey && isPlaceholderSecret(secretKey)) {
      throw new StripeConfigError(
        "FATAL: STRIPE_SECRET_KEY contains a placeholder value in production"
      );
    }
  } else {
    if (webhookSecret && isPlaceholderSecret(webhookSecret)) {
      console.warn(
        "[stripe-config] WARNING: STRIPE_WEBHOOK_SECRET contains a placeholder value"
      );
    }
    if (secretKey && isPlaceholderSecret(secretKey)) {
      console.warn(
        "[stripe-config] WARNING: STRIPE_SECRET_KEY contains a placeholder value"
      );
    }
  }

  const hasEnvWebhookSecret = !!webhookSecret && !isPlaceholderSecret(webhookSecret || "");
  const hasEnvSecretKey = !!secretKey && !isPlaceholderSecret(secretKey || "");

  if (hasEnvWebhookSecret || hasEnvSecretKey) {
    console.log(
      `[stripe-config] Stripe env vars: secretKey=${hasEnvSecretKey ? "configured" : "not set"}, webhookSecret=${hasEnvWebhookSecret ? "configured" : "not set"}`
    );
  }
}

export { isPlaceholderSecret };
