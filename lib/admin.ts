import type { User } from "@supabase/supabase-js";

/**
 * Admin access for owner-only pages (e.g. /admin/usage).
 * Configure on the server (Vercel env + .env.local), comma-separated:
 *   ADMIN_EMAILS   — e.g. "me@example.com,other@example.com"
 *   ADMIN_USER_IDS — Supabase auth user ids, if you'd rather not use emails
 * With neither set, nobody is an admin.
 */
function list(name: string): string[] {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: Pick<User, "id" | "email"> | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase();
  return (!!email && list("ADMIN_EMAILS").includes(email)) || list("ADMIN_USER_IDS").includes(user.id.toLowerCase());
}
