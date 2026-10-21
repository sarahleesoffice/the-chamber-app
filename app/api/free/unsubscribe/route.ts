import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * Stops the free-lessons emails. Two callers:
 *   - the button on /free/unsubscribe (form field "t") → back to that page
 *   - mail apps' one-click unsubscribe (RFC 8058, token in ?t=) → plain 200
 * POST only, so link scanners that prefetch can't unsubscribe anyone.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const fromPage = form?.has("t") ?? false;
  const token = String((fromPage ? form?.get("t") : url.searchParams.get("t")) || "");

  const db = serviceClient();
  if (token && db) {
    const { error } = await db
      .from("free_leads")
      .update({ unsubscribed_at: new Date().toISOString(), next_email_at: null })
      .eq("unsubscribe_token", token);
    if (error) console.error("[free] unsubscribe:", error.message);
  }

  if (fromPage) return NextResponse.redirect(`${url.origin}/free/unsubscribe?done=1`, 303);
  return new NextResponse("Unsubscribed", { status: 200 });
}
