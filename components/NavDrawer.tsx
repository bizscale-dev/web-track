"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  Menu,
  X,
  Home,
  ClipboardCheck,
  ShieldCheck,
  FileEdit,
  Globe,
  Lock,
  LifeBuoy,
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  LogOut,
  User as UserIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  show: boolean;
  color: string;
  badge?: boolean;
  disabled?: boolean;
  disabledHint?: string;
};

export default function NavDrawer() {
  const { role, name, email, avatar } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hasTaskNotification, setHasTaskNotification] = useState(false);

  useEffect(() => {
    if (!email || role === "user" || !role) return;
    (async () => {
      const query = supabase.from("assigned_tasks").select("id", { count: "exact", head: true });
      const { count } =
        role === "admin"
          ? await query.eq("assigned_by_email", email).eq("status", "completed").eq("admin_seen", false)
          : await query.eq("assigned_to_email", email).eq("assignee_seen", false);
      setHasTaskNotification((count || 0) > 0);
    })();
  }, [role, email]);

  // Escape-to-close, and lock page scroll while the drawer covers it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (role === "user" || !role) return null;

  // HR gets a pure tracker view — Tasks + EOD Overview only, none of the
  // operational nav (they don't own websites, submit EOD, or assign work).
  const isHr = role === "hr";
  const isManagerOrAdmin = role === "admin" || role === "manager";
  const isDevManagerAdmin = role === "developer" || role === "manager" || role === "admin";

  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: Home,
      show: !isHr,
      color: "bg-slate-100 text-slate-700 border-slate-200",
    },
    {
      href: "/websites/new",
      label: "Add Website",
      icon: Globe,
      show: !isHr,
      color: "bg-blue-50 text-blue-600 border-blue-200",
      disabled: !isManagerOrAdmin,
      disabledHint: "Manager clearance required",
    },
    {
      href: isHr ? "/tasks/overview" : "/tasks",
      label: isHr ? "Tasks Overview" : "Tasks",
      icon: ClipboardCheck,
      show: true,
      color: "bg-sky-50 text-sky-600 border-sky-200",
      badge: hasTaskNotification,
    },
    {
      href: "/site-reviews",
      label: "Site Reviews",
      icon: ShieldCheck,
      show: isDevManagerAdmin,
      color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    },
    {
      href: "/website-edits",
      label: "Website Edits",
      icon: FileEdit,
      show: isDevManagerAdmin,
      color: "bg-violet-50 text-violet-600 border-violet-200",
    },
    {
      href: "/requirements",
      label: "Requirements Board",
      icon: LifeBuoy,
      show: role === "support" || role === "admin",
      color: "bg-purple-50 text-purple-600 border-purple-200",
    },
    {
      href: "/admin",
      label: "Command Center",
      icon: LayoutDashboard,
      show: isManagerOrAdmin,
      color: "bg-blue-50 text-blue-600 border-blue-200",
    },
    {
      href: "/eod",
      label: "EOD Report",
      icon: ClipboardList,
      show: role === "developer" || role === "manager",
      color: "bg-amber-50 text-amber-600 border-amber-200",
    },
    {
      href: "/eod/overview",
      label: "EOD Overview",
      icon: ListChecks,
      show: isManagerOrAdmin || isHr,
      color: "bg-teal-50 text-teal-600 border-teal-200",
    },
  ].filter((item) => item.show);

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
        title="Menu"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
        {hasTaskNotification && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-rose-500 border-2 border-white rounded-full" />
        )}
      </button>

      <div className={`fixed inset-0 z-[200] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-xs bg-[var(--card)] shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-bold flex items-center justify-center shrink-0 overflow-hidden">
                  {avatar ? (
                    <img src={avatar} alt={name} className="w-full h-full object-cover" />
                  ) : name ? (
                    name.charAt(0).toUpperCase()
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--card-foreground)] truncate">{name || "User"}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{role}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-900 p-1 shrink-0"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      title={item.disabledHint}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
                    >
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 border border-slate-200">
                        <Lock className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-semibold flex-1">{item.label}</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                      active
                        ? "border-transparent bg-[var(--button)] text-[var(--button-text)]"
                        : "border-transparent hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-8 h-8 rounded-lg border shrink-0 ${
                        active ? "bg-white/10 border-white/20 text-[var(--button-text)]" : item.color
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-semibold flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 shrink-0">
                  <LogOut className="w-4 h-4" />
                </span>
                <span className="text-sm font-bold">Drop Access</span>
              </button>
            </div>
          </div>
        </div>
    </>
  );
}


