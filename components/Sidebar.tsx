"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ChamberLogo from "./ChamberLogo";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

interface NavSection {
  title: string;
  items: { href: string; label: string; icon?: string }[];
}

const navSections: NavSection[] = [
  {
    title: "TRADE",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "grid_view" },
      { href: "/enter-trade", label: "Enter Trade", icon: "edit_note" },
      { href: "/trade-history", label: "Trade History", icon: "history" },
      { href: "/pre-trade", label: "Pre-Trade Checklist", icon: "checklist" },
      { href: "/import-trades", label: "Import Trades", icon: "upload_file" },
    ],
  },
  {
    title: "REFLECT",
    items: [
      { href: "/journal", label: "Daily Journal", icon: "menu_book" },
      { href: "/performance", label: "Performance", icon: "trending_up" },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { href: "/ai-analysis", label: "AI Analysis", icon: "psychology" },
      { href: "/ai-chat", label: "AI ICT Chat", icon: "smart_toy" },
      { href: "/market-review", label: "Market Review", icon: "candlestick_chart" },
    ],
  },
  {
    title: "MARKET STUDY",
    items: [
      { href: "/sessions", label: "Sessions", icon: "schedule" },
      { href: "/learning-hub", label: "Learning Hub", icon: "school" },
      { href: "/knowledge-base", label: "Knowledge Base", icon: "local_library" },
    ],
  },
  {
    title: "MARKET WATCH",
    items: [
      { href: "/economic-calendar", label: "Economic Calendar", icon: "event_note" },
      { href: "/live-news", label: "Live News", icon: "newspaper" },
      { href: "/watchlist", label: "Watchlist", icon: "visibility" },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/risk-disclaimer", label: "Risk Disclaimer", icon: "gavel" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-8 left-4 z-40 p-2 rounded-lg bg-[#0f0f0f] border border-chamber-border text-chamber-orange md:hidden"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {open && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed left-0 top-7 h-[calc(100vh-28px)] w-60 bg-[#0f0f0f] border-r border-chamber-border flex flex-col z-50 transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <button onClick={() => setOpen(false)} className="absolute top-4 right-4 p-1 text-chamber-text-muted hover:text-chamber-orange md:hidden">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Brand */}
        <div className="px-5 pt-5 pb-4 border-b border-chamber-border">
          <div className="flex items-center gap-2.5">
            <ChamberLogo size={28} />
            <h1 className="text-base font-bold tracking-[3px] text-chamber-orange" style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}>
              THE CHAMBER
            </h1>
          </div>
        </div>

        {/* Nav — matching 8501 style */}
        <nav className="flex-1 px-4 py-4 overflow-y-auto space-y-5">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="px-2 mb-2 text-[0.55rem] font-semibold tracking-[3px] text-chamber-orange/50 uppercase">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-[0.85rem] transition-all ${
                        active
                          ? "bg-chamber-orange/10 text-chamber-orange font-medium shadow-[0_0_12px_rgba(232,101,26,0.15)]"
                          : "text-[#ccc] hover:text-white hover:bg-chamber-orange/5 hover:shadow-[0_0_8px_rgba(232,101,26,0.1)]"
                      }`}
                      style={active ? { textShadow: "0 0 12px rgba(232,101,26,0.5)" } : undefined}
                    >
                      {item.icon && <span className="material-icons-outlined w-5 text-center" style={{ fontSize: "18px", opacity: 0.7 }}>{item.icon}</span>}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="px-3 pb-4 border-t border-chamber-border pt-3 space-y-3">
          {/* Discord */}
          <a
            href="https://discord.gg/EPn5MAJh"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all hover:brightness-125"
            style={{ background: "rgba(88,101,242,0.12)", border: "1px solid rgba(88,101,242,0.3)", color: "#5865F2" }}
          >
            <svg width="18" height="14" viewBox="0 0 71 55" fill="currentColor">
              <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.2a58.9 58.9 0 0017.7 9 .2.2 0 00.3-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.3 47.3 0 003.6 5.9.2.2 0 00.3.1A58.7 58.7 0 0070.7 45.7v-.2c1.4-15-2.3-28.4-9.8-40.1a.2.2 0 00-.1-.1zM23.7 37.3c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.8 7.1-6.3 7.1zm23.3 0c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.7 7.1-6.3 7.1z"/>
            </svg>
            Join Discord
          </a>

          {/* Logout */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-chamber-text-muted hover:text-red-400 hover:bg-red-400/5 transition-all"
          >
            Logout
          </button>

          {/* Tagline */}
          <p className="text-center text-[0.5rem] tracking-[3px] uppercase text-chamber-orange/40 pt-1">
            Where Trading Evolves
          </p>
        </div>
      </aside>
    </>
  );
}
