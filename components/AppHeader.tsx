"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { Search, User as UserIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import NavDrawer from "@/components/NavDrawer";
import NotificationBanner from "@/components/NotificationBanner";
import RouteBreadcrumb from "@/components/RouteBreadcrumb";

export default function AppHeader() {
  const { role, name, avatar } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  // THE INTERCEPTOR: Hide the header entirely on the login page
  if (pathname === "/") return null;

  const submitSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/dashboard?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="sticky top-0 z-[100] w-full bg-white/95 border-b border-slate-200 shadow-[0_4px_30px_rgba(0,0,0,0.03)] transition-all duration-500">
      <div className="w-full px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {role !== "user" && (
            <div className="relative hidden sm:block w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSearch();
                }}
                placeholder="Search websites..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {role === "user" ? (
            <a
              href="/"
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              Secure Login
            </a>
          ) : (
            <div className="flex items-center gap-2 sm:gap-4">
              <NotificationBell />

              <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-slate-200">
                <div className="w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-bold flex items-center justify-center shrink-0 overflow-hidden">
                  {avatar ? (
                    <img src={avatar} alt={name} className="w-full h-full object-cover" />
                  ) : name ? (
                    name.charAt(0).toUpperCase()
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="text-sm font-bold text-slate-900 truncate">{name || "User"}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{role}</p>
                </div>
              </div>

              <NavDrawer />
            </div>
          )}
        </div>
      </div>

      {role !== "user" && (
        <div className="px-4 sm:px-8 pb-3">
          <RouteBreadcrumb />
        </div>
      )}

      {role !== "user" && <NotificationBanner />}
    </div>
  );
}
