/**
 * Server-side access to users' AI provider keys (public.user_api_keys).
 *
 * Keys are stored AES-256-GCM encrypted (see lib/crypto.ts) and only ever
 * decrypted here, on the server. Reads and writes go through the service-role
 * client because the browser roles are not allowed to touch `encrypted_key`
 * (migration 008). Never import this module from client components.
 *
 * Rows saved before encryption shipped hold the raw key. Those are still
 * accepted as-is and re-encrypted the first time they are read.
 */

import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/lib/crypto";

export const PROVIDERS = ["anthropic", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type UserApiKeys = Partial<Record<Provider, string>>;

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

// encrypt() output: iv (32 hex) + authTag (32 hex) + ciphertext (≥ 2 hex).
// Real provider keys (sk-ant-…, AIza…) never match this, so anything that
// doesn't is legacy plaintext.
const PACKED_HEX = /^[0-9a-f]{66,}$/i;

export function isEncrypted(value: string): boolean {
  return PACKED_HEX.test(value) && value.length % 2 === 0;
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set to manage API keys");
  }
  return createServiceClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Load and decrypt every provider key the user has saved. */
export async function getUserApiKeys(userId: string): Promise<UserApiKeys> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("user_api_keys")
    .select("provider, encrypted_key")
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to load API keys: ${error.message}`);

  const keys: UserApiKeys = {};
  for (const row of data ?? []) {
    if (!isProvider(row.provider)) continue;
    const stored: string = row.encrypted_key;

    if (isEncrypted(stored)) {
      try {
        keys[row.provider] = decrypt(stored);
      } catch {
        throw new Error(
          "Your saved API key could not be decrypted. Please re-save it in Settings."
        );
      }
      continue;
    }

    // Legacy plaintext row — use it, and upgrade it in place.
    keys[row.provider] = stored;
    const { error: upgradeError } = await admin
      .from("user_api_keys")
      .update({ encrypted_key: encrypt(stored) })
      .eq("user_id", userId)
      .eq("provider", row.provider)
      .eq("encrypted_key", stored);
    if (upgradeError) {
      console.error(`Failed to re-encrypt legacy ${row.provider} key:`, upgradeError.message);
    }
  }
  return keys;
}

/** Encrypt and upsert a user's key for one provider. */
export async function saveUserApiKey(userId: string, provider: Provider, key: string) {
  const { error } = await adminClient()
    .from("user_api_keys")
    .upsert(
      { user_id: userId, provider, encrypted_key: encrypt(key) },
      { onConflict: "user_id,provider" }
    );
  if (error) throw new Error(error.message);
}

export async function deleteUserApiKey(userId: string, provider: Provider) {
  const { error } = await adminClient()
    .from("user_api_keys")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(error.message);
}
