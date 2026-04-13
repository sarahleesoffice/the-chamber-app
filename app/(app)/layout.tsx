"use client";

export const dynamic = "force-dynamic";

import Sidebar from "@/components/Sidebar";
import Ticker from "@/components/Ticker";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pt-7">
      <Ticker />
      <Sidebar />
      <main className="md:ml-60 p-6 md:p-8 pt-20 md:pt-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
