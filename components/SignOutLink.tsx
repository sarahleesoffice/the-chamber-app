"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutLink({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
      }}
      className="hover:text-chamber-orange cursor-pointer"
    >
      {children}
    </button>
  );
}
