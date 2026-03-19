/**
 * AES-256-GCM encryption for user API keys.
 * Keys are encrypted before storing in Supabase and decrypted server-side only.
 * The encryption secret comes from AI_KEY_ENCRYPTION_SECRET env var.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getSecret(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AI_KEY_ENCRYPTION_SECRET must be set and at least 32 characters"
    );
  }
  // Use first 32 bytes as the key
  return Buffer.from(secret.slice(0, 32), "utf-8");
}

/**
 * Encrypt a plaintext string. Returns a hex-encoded string:
 * iv (32 hex) + authTag (32 hex) + ciphertext (variable hex)
 */
export function encrypt(plaintext: string): string {
  const key = getSecret();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext
  return iv.toString("hex") + authTag.toString("hex") + encrypted;
}

/**
 * Decrypt a hex-encoded string produced by encrypt().
 */
export function decrypt(packed: string): string {
  const key = getSecret();

  const iv = Buffer.from(packed.slice(0, IV_LENGTH * 2), "hex");
  const authTag = Buffer.from(
    packed.slice(IV_LENGTH * 2, IV_LENGTH * 2 + TAG_LENGTH * 2),
    "hex"
  );
  const ciphertext = packed.slice(IV_LENGTH * 2 + TAG_LENGTH * 2);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Mask an API key for display (e.g., "sk-ant-...abc123")
 */
export function maskKey(key: string): string {
  if (key.length <= 10) return "****";
  return key.slice(0, 7) + "..." + key.slice(-4);
}
