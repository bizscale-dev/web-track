"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  Home,
  ClipboardCheck,
  ShieldCheck,
  FileEdit,
  Globe,
  LifeBuoy,
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  Bug,
  BarChart3,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  show: boolean;
  color: string;
  badge?: boolean;
  disabled?: boolean;
  disabledHint?: string;
};

// Shared between the persistent desktop sidebar (AppSidebar) and the
// off-canvas mobile drawer (NavDrawer) — one source of truth for which
// links a role sees and whether any of them has a pending notification.
export function useNavItems() {
  const { role, email } = useAuth();
  const [hasTaskNotification, setHasTaskNotification] = useState(false);
  const [hasBugNotification, setHasBugNotification] = useState(false);
  const [hasEditNotification, setHasEditNotification] = useState(false);

  useEffect(() => {
    if (!email || role === "user" || !role) return;
    (async () => {
      let taskCount = 0;
      if (role === "admin") {
        const { count } = await supabase
          .from("assigned_tasks")
          .select("id", { count: "exact", head: true })
          .eq("assigned_by_email", email)
          .eq("status", "completed")
          .eq("admin_seen", false);
        taskCount = count || 0;
      } else if (role === "manager") {
        // Managers also need a ping for reassigned tasks awaiting their
        // approval — those aren't "assigned to" the manager, so the plain
        // assignee_seen check below would otherwise miss them entirely.
        const [assigneeResult, approvalResult] = await Promise.all([
          supabase
            .from("assigned_tasks")
            .select("id", { count: "exact", head: true })
            .eq("assigned_to_email", email)
            .eq("assignee_seen", false),
          supabase
            .from("assigned_tasks")
            .select("id", { count: "exact", head: true })
            .eq("reassigned_by_email", email)
            .eq("status", "completed")
            .eq("manager_approval", "pending"),
        ]);
        taskCount = (assigneeResult.count || 0) + (approvalResult.count || 0);
      } else {
        const { count } = await supabase
          .from("assigned_tasks")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to_email", email)
          .eq("assignee_seen", false);
        taskCount = count || 0;
      }
      setHasTaskNotification(taskCount > 0);

      const { count: bugCount } = await supabase
        .from("production_bugs")
        .select("id", { count: "exact", head: true })
        .eq("developer_email", email)
        .eq("developer_seen", false);
      setHasBugNotification((bugCount || 0) > 0);

      const { count: editCount } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_email", email)
        .eq("source", "website_edit")
        .eq("is_read", false);
      setHasEditNotification((editCount || 0) > 0);
    })();
  }, [role, email]);

  if (role === "user" || !role) {
    return { items: [] as NavItem[], hasAnyNotification: false };
  }

  // HR and Designer share the exact same pure-tracker view — neither owns
  // websites, submits EOD, or assigns work. Both get Tasks Overview, EOD
  // Overview, Production Bugs, and KPIs; nothing operational.
  const isHr = role === "hr";
  const isDesigner = role === "designer";
  const isViewOnly = isHr || isDesigner;
  const isManagerOrAdmin = role === "admin" || role === "manager";
  const isDevManagerAdmin = role === "developer" || role === "manager" || role === "admin";

  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: Home,
      show: !isViewOnly,
      color: "bg-slate-100 text-slate-700 border-slate-200",
    },
    {
      href: "/websites/new",
      label: "Add Website",
      icon: Globe,
      show: !isViewOnly,
      color: "bg-blue-50 text-blue-600 border-blue-200",
      disabled: !isManagerOrAdmin,
      disabledHint: "Manager clearance required",
    },
    {
      href: isViewOnly ? "/tasks/overview" : "/tasks",
      label: isViewOnly ? "Tasks Overview" : "Tasks",
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
      badge: hasEditNotification,
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
      show: isManagerOrAdmin || isViewOnly,
      color: "bg-teal-50 text-teal-600 border-teal-200",
    },
    {
      href: "/production-bugs",
      label: "Production Bugs",
      icon: Bug,
      show: true,
      color: "bg-rose-50 text-rose-600 border-rose-200",
      badge: hasBugNotification,
    },
    {
      href: "/kpis",
      label: "KPIs",
      icon: BarChart3,
      show: isManagerOrAdmin || isViewOnly,
      color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    },
  ].filter((item) => item.show);

  return {
    items,
    hasAnyNotification: hasTaskNotification || hasBugNotification || hasEditNotification,
  };
}
