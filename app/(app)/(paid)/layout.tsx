import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

// Paywall for the members' area. Layouts don't re-run on client navigation,
// so this is the front door; the paid API routes check access on every call.
export default async function PaidLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getAccess(user);
  if (!access.allowed) redirect("/join");

  return children;
}
