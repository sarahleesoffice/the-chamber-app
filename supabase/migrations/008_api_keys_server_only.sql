-- user_api_keys.encrypted_key is server-only.
--
-- Keys are now encrypted by the app (AES-256-GCM, lib/crypto.ts) and written
-- and read only through the service role (app/api/api-keys, lib/api-keys.ts).
-- Browser roles may still see which providers they have configured, but can
-- no longer read the key column or write rows at all — so a plaintext key can
-- never be written from the client again.
--
-- Run AFTER the app code that uses SUPABASE_SERVICE_ROLE_KEY is deployed;
-- older builds write keys from the browser and would fail to save.

REVOKE ALL ON public.user_api_keys FROM anon, authenticated;
GRANT SELECT (id, user_id, provider, created_at, updated_at)
  ON public.user_api_keys TO authenticated;

DROP POLICY IF EXISTS "Users can insert own keys" ON public.user_api_keys;
DROP POLICY IF EXISTS "Users can update own keys" ON public.user_api_keys;
DROP POLICY IF EXISTS "Users can delete own keys" ON public.user_api_keys;
-- "Users can view own keys" (SELECT, auth.uid() = user_id) stays.
