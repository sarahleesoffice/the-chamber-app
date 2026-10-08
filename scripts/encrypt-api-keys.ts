/**
 * One-off backfill: encrypt any user_api_keys rows still holding a plaintext key.
 *
 * The AI routes already re-encrypt legacy rows the first time they read them
 * (lib/api-keys.ts); this sweeps rows for users who haven't used AI since.
 * Safe to re-run — already-encrypted rows are skipped. Never prints key values.
 *
 * Usage:
 *   npx tsx scripts/encrypt-api-keys.ts            # dry run, reports counts
 *   npx tsx scripts/encrypt-api-keys.ts --apply    # writes ciphertext
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * AI_KEY_ENCRYPTION_SECRET in .env.local — the SAME secret production uses,
 * or production won't be able to decrypt the rows.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { encrypt, decrypt } from "../lib/crypto";
import { isEncrypted } from "../lib/api-keys";

// Load .env.local manually (no dotenv dependency needed)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadEnv();

const apply = process.argv.includes("--apply");

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } }
  );

  const { data: rows, error } = await supabase
    .from("user_api_keys")
    .select("id, provider, encrypted_key");
  if (error) throw new Error(error.message);

  let encrypted = 0;
  let undecryptable = 0;
  const legacy = [];
  for (const row of rows ?? []) {
    if (!isEncrypted(row.encrypted_key)) {
      legacy.push(row);
      continue;
    }
    encrypted++;
    try {
      decrypt(row.encrypted_key);
    } catch {
      undecryptable++;
      console.warn(`Row ${row.id} (${row.provider}) does not decrypt with this secret`);
    }
  }

  console.log(
    `${rows?.length ?? 0} rows: ${encrypted} encrypted (${undecryptable} undecryptable), ${legacy.length} plaintext`
  );
  if (!apply) {
    if (legacy.length) console.log("Dry run — re-run with --apply to encrypt them.");
    return;
  }

  let updated = 0;
  for (const row of legacy) {
    const { error: updateError } = await supabase
      .from("user_api_keys")
      .update({ encrypted_key: encrypt(row.encrypted_key) })
      .eq("id", row.id)
      .eq("encrypted_key", row.encrypted_key);
    if (updateError) console.error(`Row ${row.id}: ${updateError.message}`);
    else updated++;
  }
  console.log(`Encrypted ${updated}/${legacy.length} plaintext rows.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
