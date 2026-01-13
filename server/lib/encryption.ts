import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
}

function getEncryptionKey(): Buffer | null {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    return null;
  }
  const keyBuffer = Buffer.from(key, "base64");
  if (keyBuffer.length !== 32) {
    console.error("[encryption] APP_ENCRYPTION_KEY must be 32 bytes (256 bits) base64-encoded");
    return null;
  }
  return keyBuffer;
}

export function isEncryptionAvailable(): boolean {
  return getEncryptionKey() !== null;
}

export function requireEncryptionInProduction(): void {
  if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
    console.error("[encryption] FATAL: APP_ENCRYPTION_KEY is required in production");
    throw new Error("Encryption key not configured");
  }
  if (!isEncryptionAvailable()) {
    console.warn("[encryption] WARNING: APP_ENCRYPTION_KEY not set - settings will be stored unencrypted (development mode only)");
  }
}

export function encryptValue(plaintext: string): string {
  const key = getEncryptionKey();
  
  if (!key) {
    throw new Error("Encryption key not configured. Set APP_ENCRYPTION_KEY environment variable.");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    ciphertext,
    authTag: authTag.toString("base64"),
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decryptValue(encryptedBase64: string): string {
  const key = getEncryptionKey();
  
  if (!key) {
    throw new Error("Encryption key not configured. Set APP_ENCRYPTION_KEY environment variable.");
  }
  
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(Buffer.from(encryptedBase64, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid encrypted data format");
  }

  if (!payload.iv || !payload.ciphertext || !payload.authTag) {
    throw new Error("Invalid encrypted data format - missing required fields");
  }

  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = payload.ciphertext;

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, "base64", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}
