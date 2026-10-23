"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import { useNavItems } from "./useNavItems";
import { Boxes, Lock, LogOut } from "lucide-react";

const COLLAPSED_KEY = "website-crm-sidebar-collapsed";

// Persistent desktop nav (hidden lg:flex) — the reference image's dark
// sidebar look. NavDrawer still handles mobile with the same items via
// useNavItems(), so role-gating only lives in one place.
export default function AppSidebar() {
  const { role } = useAuth();
  const pathname = usePathname();
  const { items } = useNavItems();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Private browsing / blocked storage — just stay expanded.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Nothing to persist to — the in-memory toggle still works this session.
      }
      return next;
    });
  };

  // THE INTERCEPTOR: Hide the sidebar entirely on the login page, even for
  // an already-authenticated session that hasn't redirected yet.
  if (pathname === "/" || role === "user" || !role) return null;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Local-scope signOut shouldn't depend on network health — fall through regardless.
    }
    window.location.href = "/";
  };

  return (
    <>
      {/* Floating re-open button — fades in once the panel below has
          slid off-screen. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Show sidebar"
        aria-label="Show sidebar"
        className={`hidden lg:flex fixed top-4 left-4 z-[109] items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-opacity duration-200 ${
          collapsed ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <Boxes className="w-[18px] h-[18px]" />
      </button>

      {/* Fixed overlay — sits on top of the header and page content instead
          of pushing them over, so the content column is always full width. */}
      <aside
        className={`hidden lg:flex lg:flex-col fixed inset-y-0 left-0 z-[110] w-64 bg-slate-950 text-slate-300 border-r border-slate-800 shadow-2xl transition-transform duration-200 ease-out ${
          collapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Hide sidebar"
        className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800/80 shrink-0 text-left hover:bg-slate-900/60 transition-colors"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shrink-0">
          <Boxes className="w-[18px] h-[18px]" />
        </span>
        <span className="text-base font-black text-white tracking-tight">Bizscale</span>
      </button>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          if (item.disabled) {
            return (
              <div
                key={item.href}
                title={item.disabledHint}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 cursor-not-allowed"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span className="text-sm font-semibold flex-1">{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                active
                  ? "bg-blue-600/15 text-blue-400 border-l-2 border-blue-500 pl-[10px]"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-100 border-l-2 border-transparent pl-[10px]"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-sm font-semibold flex-1 truncate">{item.label}</span>
              {item.badge && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="text-sm font-bold">Drop Access</span>
        </button>
      </div>
      </aside>
    </>
  );
}
