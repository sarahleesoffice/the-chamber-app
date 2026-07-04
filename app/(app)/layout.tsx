"use client";

import Sidebar from "@/components/Sidebar";
import Ticker from "@/components/Ticker";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pt-7">
      <Ticker />
      <Sidebar />
      <main className="md:ml-60 p-4 md:p-8 pt-[92px] md:pt-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
