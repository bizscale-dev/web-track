"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import {
  effectiveAssigneeName,
  effectiveAssigneeEmail,
  isLateCompletion,
  computeApprovalState,
} from "@/lib/taskApproval";
import { calculateBusinessDuration, formatBusinessDuration } from "@/lib/businessTime";
import HrViewBanner from "@/components/HrViewBanner";
import type { AssignedTask } from "@/type/assignedTask";
import type { TaskRevision } from "@/type/taskRevision";
import {
  Loader2,
  ShieldAlert,
  ClipboardCheck,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  Timer,
  Flame,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  MessageSquareWarning,
  User as UserIcon,
  ListChecks,
  ClipboardList,
  Users,
  Search,
  RotateCcw,
  ArrowRightLeft,
  Eye,
} from "lucide-react";

type DateFilter = "today" | "week" | "all";
type WorkStatusFilter = "all" | "pending" | "in_progress" | "completed";
type ApprovalsFilter = "all" | "pending" | "approved" | "rejected";
type ViewTab = "overview" | "approvals";

type AuditEvent = {
  label: string;
  by: string;
  at: string;
  detail?: string | null;
  tone?: "default" | "success" | "warning" | "danger";
};

// Mirrors the role values used across the rest of the app (admin/page.tsx
// role dropdowns, useNavItems). HR locks this to "developer" (+ manager) for
// now — the dropdown itself stays disabled until the other role views are
// ready.
const ROLE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "developer", label: "Developer" },
  { value: "content_writer", label: "Content Writer" },
  { value: "seo_person", label: "SEO Person" },
  { value: "manager", label: "Manager" },
  { value: "support", label: "Support" },
  { value: "designer", label: "Designer" },
];

const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  today: "Today",
  week: "This Week",
  all: "All Time",
};

function isWithinDays(dateStr: string, days: number) {
  const date = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

// Reconstructs a chronological handover trail for the detail panel from
// whatever timestamps the task and its revisions already carry — there's no
// separate audit-log table, so this is derived, not stored. Mirrors the
// builder on the admin Tasks page.
function buildAuditTrail(task: AssignedTask, revisions: TaskRevision[]): AuditEvent[] {
  const events: AuditEvent[] = [
    { label: "Created", by: task.assigned_by_name, at: task.created_at, detail: task.description || null },
  ];

  if (task.reassigned_at) {
    events.push({
      label: `Reassigned to ${task.reassigned_to_name}`,
      by: task.reassigned_by_name || "Unknown Manager",
      at: task.reassigned_at,
    });
  }

  if (task.started_at) {
    events.push({ label: "Started", by: effectiveAssigneeName(task), at: task.started_at });
  }

  for (const r of revisions.filter((rev) => rev.task_id === task.id).slice().reverse()) {
    events.push({ label: "Sent back for revision", by: r.requested_by_name, at: r.created_at, detail: r.reason, tone: "warning" });
    if (r.resolved_at) {
      events.push({ label: "Revision resolved", by: r.assignee_name, at: r.resolved_at, tone: "success" });
    }
  }

  if (task.completed_at) {
    events.push({
      label: "Submitted for review",
      by: effectiveAssigneeName(task),
      at: task.completed_at,
      detail: task.late_reason ? `Late submission reason: ${task.late_reason}` : null,
      tone: task.late_reason ? "warning" : "default",
    });
  }

  if (task.manager_approval_at) {
    events.push({
      label: task.manager_approval === "approved" ? "Manager approved" : "Manager marked not delivered on time",
      by: task.manager_approval_by_name || "Unknown Manager",
      at: task.manager_approval_at,
      tone: task.manager_approval === "approved" ? "success" : "danger",
    });
  }

  if (task.admin_approval_at) {
    events.push({
      label: task.admin_approval === "approved" ? "Admin approved" : "Admin marked not delivered on time",
      by: task.admin_approval_by_name || "Unknown Admin",
      at: task.admin_approval_at,
      tone: task.admin_approval === "approved" ? "success" : "danger",
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

type PersonGroup = {
  name: string;
  email: string;
  role: string;
  tasks: AssignedTask[];
};

export default function TasksOverviewPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "admin" || role === "manager" || role === "hr" || role === "designer";

  // Admin can preview the HR-scoped view via ?viewAs=hr from Command Center —
  // see components/HrViewBanner.tsx.
  const [viewingAsHr, setViewingAsHr] = useState(false);
  useEffect(() => {
    setViewingAsHr(new URLSearchParams(window.location.search).get("viewAs") === "hr");
  }, []);
  const effectiveRole = role === "admin" && viewingAsHr ? "hr" : role;

  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [revisions, setRevisions] = useState<TaskRevision[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [avatarsByEmail, setAvatarsByEmail] = useState<Record<string, string>>({});
  const [roleByEmail, setRoleByEmail] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<ViewTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [workStatusFilter, setWorkStatusFilter] = useState<WorkStatusFilter>("all");
  const [approvalsFilter, setApprovalsFilter] = useState<ApprovalsFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  // HR-only role filter — locked to "developer" for now (see
  // ROLE_FILTER_OPTIONS comment). Doesn't affect admin/manager/designer,
  // who still see everyone.
  const [roleFilter] = useState<string>("developer");

  async function fetchTasks() {
    setIsLoading(true);
    const { data } = await supabase
      .from("assigned_tasks")
      .select("*")
      .order("created_at", { ascending: false });
    setTasks((data as AssignedTask[]) || []);
    setIsLoading(false);
  }

  async function fetchRevisions() {
    const { data } = await supabase
      .from("task_revisions")
      .select("*")
      .order("created_at", { ascending: false });
    setRevisions((data as TaskRevision[]) || []);
  }

  async function fetchHolidays() {
    const { data } = await supabase.from("company_holidays").select("date");
    if (data) setHolidays(new Set(data.map((h: { date: string }) => h.date)));
  }

  async function fetchTeamMembers() {
    const { data } = await supabase.from("team_members").select("email, avatar_url, role");
    const avatars: Record<string, string> = {};
    const roles: Record<string, string> = {};
    for (const m of (data as { email: string; avatar_url: string | null; role: string }[]) || []) {
      if (m.avatar_url) avatars[m.email] = m.avatar_url;
      roles[m.email] = m.role;
    }
    setAvatarsByEmail(avatars);
    setRoleByEmail(roles);
  }

  useEffect(() => {
    if (canView) {
      fetchTasks();
      fetchRevisions();
      fetchHolidays();
      fetchTeamMembers();
    }
  }, [canView]);

  const toggleExpanded = (email: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const formatRole = (r: string | undefined) =>
    r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Team Member";

  // HR's view is scoped to one role at a time — everyone else (admin,
  // manager, designer) still sees every person. Managers are included
  // alongside Developers since HR tracks them together for now.
  const roleScopedTasks = useMemo(() => {
    if (effectiveRole !== "hr") return tasks;
    return tasks.filter((t) => {
      const email = effectiveAssigneeEmail(t);
      return roleByEmail[email] === roleFilter || roleByEmail[email] === "manager";
    });
  }, [tasks, effectiveRole, roleByEmail, roleFilter]);

  const dateScopedTasks = useMemo(() => {
    if (dateFilter === "all") return roleScopedTasks;
    const days = dateFilter === "today" ? 1 : 7;
    return roleScopedTasks.filter((t) => isWithinDays(t.created_at, days));
  }, [roleScopedTasks, dateFilter]);

  const isPendingReviewState = (t: AssignedTask) => {
    const st = computeApprovalState(t);
    return st === "pending_manager" || st === "pending_admin";
  };
  const isOverdueTask = (t: AssignedTask) =>
    t.status !== "completed" && !!t.due_at && new Date(t.due_at) < new Date();

  // Search/employee/status filters apply everywhere; the approvals filter
  // only narrows the Tasks Overview list (the Approvals Queue tab is
  // already scoped to pending items on its own).
  const statsScopedTasks = useMemo(() => {
    let list = dateScopedTasks;
    if (employeeFilter !== "all") list = list.filter((t) => effectiveAssigneeEmail(t) === employeeFilter);
    if (workStatusFilter !== "all") list = list.filter((t) => t.status === workStatusFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          effectiveAssigneeName(t).toLowerCase().includes(q)
      );
    }
    return list;
  }, [dateScopedTasks, employeeFilter, workStatusFilter, searchQuery]);

  const overviewTasks = useMemo(() => {
    if (approvalsFilter === "all") return statsScopedTasks;
    return statsScopedTasks.filter((t) => {
      const st = computeApprovalState(t);
      if (approvalsFilter === "pending") return st === "pending_manager" || st === "pending_admin";
      if (approvalsFilter === "approved") return st === "approved" || st === "auto_approved";
      return st === "rejected";
    });
  }, [statsScopedTasks, approvalsFilter]);

  const approvalsQueueTasks = useMemo(
    () =>
      [...statsScopedTasks]
        .filter(isPendingReviewState)
        .sort((a, b) => new Date(a.due_at || a.created_at).getTime() - new Date(b.due_at || b.created_at).getTime()),
    [statsScopedTasks]
  );

  const groupedByPerson = useMemo(() => {
    const groups: Record<string, PersonGroup> = {};
    for (const task of overviewTasks) {
      const email = effectiveAssigneeEmail(task);
      const name = effectiveAssigneeName(task);
      if (!email) continue;
      if (!groups[email]) groups[email] = { name, email, role: roleByEmail[email] || "", tasks: [] };
      groups[email].tasks.push(task);
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [overviewTasks, roleByEmail]);

  // Employee dropdown is scoped to whoever's actually in the current
  // role/date scope, so HR never sees people outside the locked role.
  const employeeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of dateScopedTasks) {
      const email = effectiveAssigneeEmail(t);
      if (email && !seen.has(email)) seen.set(email, effectiveAssigneeName(t));
    }
    return Array.from(seen.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dateScopedTasks]);

  // Company-wide counters for the summary strip.
  const summary = useMemo(() => {
    const total = statsScopedTasks.length;
    const completed = statsScopedTasks.filter((t) => t.status === "completed").length;
    const inProgress = statsScopedTasks.filter((t) => t.status === "in_progress").length;
    const notStarted = total - completed - inProgress;
    const overdue = statsScopedTasks.filter(isOverdueTask).length;
    const pendingReview = statsScopedTasks.filter(isPendingReviewState).length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, notStarted, overdue, pendingReview, completionPct };
  }, [statsScopedTasks]);

  const filtersActive =
    !!searchQuery || employeeFilter !== "all" || workStatusFilter !== "all" || approvalsFilter !== "all" || dateFilter !== "all";

  // Keeps a task open by default, and swaps to the next visible one if the
  // current selection gets filtered out.
  const activeList = tab === "approvals" ? approvalsQueueTasks : overviewTasks;
  useEffect(() => {
    if (selectedTaskId !== null && activeList.some((t) => t.id === selectedTaskId)) return;
    setSelectedTaskId(activeList[0]?.id ?? null);
  }, [activeList, selectedTaskId]);

  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  const selectedDerived = useMemo(() => {
    if (!selectedTask) return null;
    const task = selectedTask;
    const isCompleted = task.status === "completed";
    const isInProgress = task.status === "in_progress";
    const wasReassigned = !!task.reassigned_to_email;
    const isOverdue = isOverdueTask(task);
    const completedLate = isCompleted && isLateCompletion(task);
    const approvalState = computeApprovalState(task);
    const liveDuration =
      isInProgress && task.started_at
        ? formatBusinessDuration(calculateBusinessDuration(new Date(task.started_at), new Date(), holidays))
        : null;
    const finalDuration =
      isCompleted && task.completed_at
        ? formatBusinessDuration(
            calculateBusinessDuration(new Date(task.started_at || task.created_at), new Date(task.completed_at), holidays),
            true
          )
        : null;
    return {
      isCompleted,
      isInProgress,
      wasReassigned,
      isOverdue,
      completedLate,
      approvalState,
      liveDuration,
      finalDuration,
      auditTrail: buildAuditTrail(task, revisions),
    };
  }, [selectedTask, holidays, revisions]);

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center mt-20 bg-rose-50 border border-rose-100 rounded-2xl">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clearance Required</h1>
        <p className="text-gray-600">Only Admin, Manager, HR, and Designer can view the Tasks overview.</p>
      </div>
    );
  }

  return (
    <main className="max-w-[1600px] mx-auto w-full p-4 sm:p-6 lg:p-8">
      {role === "hr" || role === "designer" ? (
        <Link
          href="/eod/overview"
          className="inline-flex items-center text-sm text-[var(--accent)] hover:opacity-80 mb-4 transition-colors"
        >
          <ListChecks className="w-4 h-4 mr-1" /> View EOD Overview
        </Link>
      ) : (
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-[var(--accent)] hover:opacity-80 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
      )}

      <HrViewBanner />

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-600 text-white rounded-2xl shadow-[0_8px_20px_-6px_rgba(2,132,199,0.5)]">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[var(--bg-foreground)] flex items-center gap-2 flex-wrap">
              Tasks Overview
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Sync
              </span>
            </h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">
              Every person&apos;s tasks, status, and approval — in one place.
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {effectiveRole === "hr" && (
            <div className="relative" title="More roles are coming soon — locked to Developer (+ Manager) for now">
              <Users className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={roleFilter}
                disabled
                className="pl-8 pr-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full bg-white border border-gray-200 text-gray-500 appearance-none cursor-not-allowed"
              >
                {ROLE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--card-border)] rounded-full shadow-sm p-1">
            {(["today", "week", "all"] as DateFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
                  dateFilter === filter
                    ? "bg-[var(--button)] text-[var(--button-text)]"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Total</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.total}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-600 shrink-0">
                <ClipboardList className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">All tasks in current scope</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Completed</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.completed}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-emerald-50 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${summary.completionPct}%` }} />
            </div>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">{summary.completionPct}% completed</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">In Progress</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.inProgress}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <Timer className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">Active work underway</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Not Started / Overdue</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.notStarted}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
            </div>
            {summary.overdue > 0 ? (
              <p className="text-[11px] text-rose-600 font-semibold mt-2">{summary.overdue} overdue — needs attention</p>
            ) : (
              <p className="text-[11px] text-[var(--card-muted)] mt-2">Nothing overdue</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap border-b border-[var(--card-border)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`inline-flex items-center gap-2 px-3 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === "overview"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--bg-muted)] hover:text-[var(--bg-foreground)]"
            }`}
          >
            <ListChecks className="w-4 h-4" /> Tasks Overview
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{summary.total}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("approvals")}
            className={`inline-flex items-center gap-2 px-3 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === "approvals"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--bg-muted)] hover:text-[var(--bg-foreground)]"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Approvals Queue
            {approvalsQueueTasks.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {approvalsQueueTasks.length}
              </span>
            )}
          </button>
        </div>
        <p className="text-xs font-semibold text-[var(--bg-muted)] pb-2.5">
          {groupedByPerson.length} active member{groupedByPerson.length === 1 ? "" : "s"} · {summary.total} total tasks
        </p>
      </div>

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(15,23,42,0.1)] p-4 mb-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name, task title..."
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-full bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] focus:bg-white transition-colors"
            />
          </div>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="all">All Employees</option>
            {employeeOptions.map((opt) => (
              <option key={opt.email} value={opt.email}>
                {opt.name}
              </option>
            ))}
          </select>
          <select
            value={workStatusFilter}
            onChange={(e) => setWorkStatusFilter(e.target.value as WorkStatusFilter)}
            className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="all">Task Status: All</option>
            <option value="pending">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={approvalsFilter}
            onChange={(e) => setApprovalsFilter(e.target.value as ApprovalsFilter)}
            className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="all">Approvals: All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Not On Time</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)] mr-1">
            Active Criteria:
          </span>
          {effectiveRole === "hr" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-600">
              Role: Developer + Manager
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
            Timeframe: {DATE_FILTER_LABEL[dateFilter]}
          </span>
          {employeeFilter !== "all" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
              Employee: {employeeOptions.find((o) => o.email === employeeFilter)?.name || employeeFilter}
            </span>
          )}
          {workStatusFilter !== "all" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
              Status: {workStatusFilter.replace("_", " ")}
            </span>
          )}
          {approvalsFilter !== "all" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
              Approvals: {approvalsFilter}
            </span>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setEmployeeFilter("all");
                setWorkStatusFilter("all");
                setApprovalsFilter("all");
                setDateFilter("all");
              }}
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] hover:opacity-80 px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
        <div className="min-w-0">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
            </div>
          ) : tab === "approvals" ? (
            approvalsQueueTasks.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
                <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-[var(--card-muted)]">Nothing waiting on approval right now.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {approvalsQueueTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isSelected={task.id === selectedTaskId}
                    onSelect={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </div>
            )
          ) : groupedByPerson.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
              <p className="text-[var(--card-muted)]">No tasks match these filters.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {groupedByPerson.map((person) => {
                const isOpen = expanded.has(person.email);
                const total = person.tasks.length;
                const completed = person.tasks.filter((t) => t.status === "completed").length;
                const approved = person.tasks.filter(
                  (t) => computeApprovalState(t) === "approved" || computeApprovalState(t) === "auto_approved"
                ).length;
                const overdue = person.tasks.filter(isOverdueTask).length;
                const velocity = total > 0 ? Math.round((completed / total) * 100) : 0;

                const directCount = person.tasks.filter((t) => t.reassigned_to_email !== person.email).length;
                const delegatedCount = total - directCount;
                const executedForOthers = person.tasks.filter(
                  (t) => t.reassigned_to_email === person.email && t.assigned_to_email !== person.email
                );

                return (
                  <div key={person.email} className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleExpanded(person.email)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white font-bold flex items-center justify-center shrink-0 text-sm overflow-hidden ring-2 ring-white shadow-sm">
                          {avatarsByEmail[person.email] ? (
                            <img src={avatarsByEmail[person.email]} alt={person.name} className="w-full h-full object-cover" />
                          ) : person.name ? (
                            person.name.charAt(0).toUpperCase()
                          ) : (
                            <UserIcon className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--card-foreground)]">{person.name}</p>
                          <p className="text-xs text-[var(--card-muted)]">
                            {formatRole(person.role)} · {total} task{total === 1 ? "" : "s"} · {completed} completed · {velocity}% velocity
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {approved > 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100">
                            <ShieldCheck className="w-3 h-3" /> {approved} approved
                          </span>
                        )}
                        {overdue > 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-100">
                            <AlertTriangle className="w-3 h-3" /> {overdue} overdue
                          </span>
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 pb-4">
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)]">Personal Execution</p>
                              <span className="text-[10px] font-bold text-emerald-600">{velocity}% Velocity</span>
                            </div>
                            <p className="text-sm font-black text-[var(--card-foreground)] mt-1">{completed} Completed by {person.name.split(" ")[0]}</p>
                            <p className="text-[11px] text-[var(--card-muted)] mt-0.5">{total - completed} remaining</p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)]">Assignment Sources</p>
                              <span className="text-[10px] font-bold text-[var(--card-foreground)]">{total} Total</span>
                            </div>
                            <p className="text-sm font-black text-[var(--card-foreground)] mt-1">
                              {directCount} Direct · {delegatedCount} Delegated
                            </p>
                            <p className="text-[11px] text-[var(--card-muted)] mt-0.5">
                              {delegatedCount > 0 ? `${delegatedCount} received via reassignment` : "All assigned directly"}
                            </p>
                          </div>
                          <div className="bg-violet-50/60 border border-violet-100 rounded-xl p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Ownership vs Execution</p>
                              <ArrowRightLeft className="w-3.5 h-3.5 text-violet-400" />
                            </div>
                            <p className="text-sm font-black text-violet-700 mt-1">
                              {executedForOthers.length} Reassigned Execution Credit
                            </p>
                            <p className="text-[11px] text-violet-500 mt-0.5">
                              {executedForOthers.length > 0
                                ? `TSK-${executedForOthers[0].id} owned by ${executedForOthers[0].assigned_to_name}, executed by ${person.name}`
                                : "No delegated work this period"}
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-gray-100 divide-y divide-gray-100">
                          {person.tasks.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              isSelected={task.id === selectedTaskId}
                              onSelect={() => setSelectedTaskId(task.id)}
                              compact
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-[calc(var(--app-header-h,96px)+16px)] min-w-0">
          {selectedTask && selectedDerived ? (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_48px_-16px_rgba(15,23,42,0.18)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--card-border)] bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 font-mono tracking-wide">TSK-{selectedTask.id} · Task Inspector</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                  <Eye className="w-3 h-3" /> View Only
                </span>
              </div>

              <div className="p-5 space-y-5 max-h-[calc(100vh-var(--app-header-h,96px)-60px)] overflow-y-auto">
                <div>
                  <h2 className="text-xl font-black text-[var(--card-foreground)]">{selectedTask.title}</h2>
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    {selectedTask.is_urgent && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-rose-100 text-rose-600 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Urgent
                      </span>
                    )}
                    {selectedDerived.completedLate && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Completed Late
                      </span>
                    )}
                    {(selectedDerived.approvalState === "approved" || selectedDerived.approvalState === "auto_approved") && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Approved
                      </span>
                    )}
                    {selectedDerived.approvalState === "rejected" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-rose-100 text-rose-700 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Not Delivered On Time
                      </span>
                    )}
                    {selectedDerived.approvalState === "pending_manager" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-amber-100 text-amber-700">
                        Awaiting Manager Review
                      </span>
                    )}
                    {selectedDerived.approvalState === "pending_admin" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-amber-100 text-amber-700">
                        Awaiting Admin Approval
                      </span>
                    )}
                    {selectedTask.revision_count > 0 && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-violet-100 text-violet-700 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" /> Revised {selectedTask.revision_count}x
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Assignee</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white text-xs font-bold shrink-0">
                        {effectiveAssigneeName(selectedTask).charAt(0).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--card-foreground)] truncate">{effectiveAssigneeName(selectedTask)}</p>
                        <p className="text-[11px] text-[var(--card-muted)] truncate">
                          {formatRole(roleByEmail[effectiveAssigneeEmail(selectedTask)])}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Assigned By</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-xs font-bold shrink-0">
                        {selectedTask.assigned_by_name.charAt(0).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--card-foreground)] truncate">{selectedTask.assigned_by_name}</p>
                        {selectedTask.reassigned_by_name && (
                          <p className="text-[11px] text-[var(--card-muted)] truncate">reassigned by {selectedTask.reassigned_by_name}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {selectedTask.due_at && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Scheduled Deadline</p>
                    <p className={`text-sm font-bold mt-1 ${selectedDerived.isOverdue ? "text-rose-600" : "text-[var(--card-foreground)]"}`}>
                      {formatDateTime(selectedTask.due_at)}
                    </p>
                  </div>
                )}

                {(selectedDerived.liveDuration || selectedDerived.finalDuration) && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">
                      {selectedDerived.isCompleted ? "Time Taken" : "Elapsed"}
                    </p>
                    <p className="text-sm font-bold text-[var(--card-foreground)] mt-1">
                      {selectedDerived.finalDuration || selectedDerived.liveDuration}
                    </p>
                  </div>
                )}

                {selectedTask.description && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)] mb-1.5">Scope &amp; Description</p>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm text-[var(--card-foreground)] whitespace-pre-wrap">
                      {selectedTask.description}
                    </div>
                  </div>
                )}

                {selectedTask.completion_notes && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)] mb-1.5">Submission Deliverables</p>
                    <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-sm text-[var(--card-foreground)] whitespace-pre-wrap">
                      {selectedTask.completion_notes}
                    </div>
                  </div>
                )}

                {selectedTask.late_reason && (
                  <p className="text-xs text-amber-700 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <MessageSquareWarning className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {selectedTask.late_reason}
                  </p>
                )}

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)] mb-2">Assignment &amp; Lifecycle Audit</p>
                  <div className="space-y-3">
                    {selectedDerived.auditTrail.map((event, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              event.tone === "success"
                                ? "bg-emerald-500"
                                : event.tone === "warning"
                                ? "bg-amber-500"
                                : event.tone === "danger"
                                ? "bg-rose-500"
                                : "bg-slate-300"
                            }`}
                          />
                          {i < selectedDerived.auditTrail.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
                        </div>
                        <div className="pb-3 min-w-0">
                          <p className="text-sm font-bold text-[var(--card-foreground)]">{event.label}</p>
                          <p className="text-[11px] text-[var(--card-muted)] mt-0.5">
                            {event.by} · {formatDateTime(event.at)}
                          </p>
                          {event.detail && <p className="text-xs text-[var(--card-muted)] mt-1 italic">&ldquo;{event.detail}&rdquo;</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
              <p className="text-[var(--card-muted)]">Select a task to inspect it.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function TaskRow({
  task,
  isSelected,
  onSelect,
  compact,
}: {
  task: AssignedTask;
  isSelected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const isPending = task.status === "pending";
  const isInProgress = task.status === "in_progress";
  const isCompleted = task.status === "completed";
  const completedLate = isCompleted && isLateCompletion(task);
  const approvalState = computeApprovalState(task);
  const dueLabel = task.due_at ? formatDateTime(task.due_at) : null;
  const isOverdue = task.status !== "completed" && !!task.due_at && new Date(task.due_at) < new Date();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left transition-colors ${
        compact
          ? `px-5 py-3 ${isSelected ? "bg-sky-50/70" : "hover:bg-gray-50/50"}`
          : `rounded-2xl border border-l-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_18px_-10px_rgba(15,23,42,0.1)] p-4 bg-[var(--card)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)] ${
              isSelected ? "border-l-[var(--accent)] border-[var(--accent)] ring-2 ring-[var(--accent)]/20" : "border-l-slate-200 border-[var(--card-border)]"
            }`
      } ${isSelected && compact ? "border-l-4 border-l-[var(--accent)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5 flex-wrap">
            {task.is_urgent && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 flex items-center gap-1">
                <Flame className="w-3 h-3" /> Urgent
              </span>
            )}
            {task.reassigned_to_email && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                Reassigned to {task.reassigned_to_name?.split(" ")[0]}
              </span>
            )}
            {task.title}
          </p>
          <p className="text-xs text-[var(--card-muted)] mt-1">
            {!compact && `${effectiveAssigneeName(task)} · `}
            assigned by {task.assigned_by_name}
            {task.reassigned_by_name && ` · reassigned by ${task.reassigned_by_name}`}
            {dueLabel && ` · due ${dueLabel}`}
          </p>
          {task.late_reason && (
            <p className="text-xs text-amber-700 mt-1.5 flex items-start gap-1">
              <MessageSquareWarning className="w-3 h-3 mt-0.5 shrink-0" /> {task.late_reason}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 ${
              isCompleted
                ? "text-emerald-600 bg-emerald-50 border border-emerald-100"
                : isInProgress
                ? "text-blue-600 bg-blue-50 border border-blue-100"
                : isOverdue
                ? "text-rose-600 bg-rose-50 border border-rose-100"
                : "text-amber-600 bg-amber-50 border border-amber-100"
            }`}
          >
            {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : isInProgress ? <Timer className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {isCompleted ? "Completed" : isInProgress ? "In Progress" : "Not Started"}
          </span>

          {completedLate && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-100">
              <AlertTriangle className="w-3 h-3" /> Late
            </span>
          )}
          {(approvalState === "approved" || approvalState === "auto_approved") && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100">
              <ShieldCheck className="w-3 h-3" /> Approved
            </span>
          )}
          {approvalState === "rejected" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-100">
              <XCircle className="w-3 h-3" /> Not Delivered On Time
            </span>
          )}
          {approvalState === "pending_manager" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-amber-600 bg-amber-50 border border-amber-100">
              Awaiting Manager
            </span>
          )}
          {approvalState === "pending_admin" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-amber-600 bg-amber-50 border border-amber-100">
              Awaiting Admin
            </span>
          )}
          {isPending && !isCompleted && <span className="text-[10px] text-gray-300 font-semibold">not started yet</span>}
        </div>
      </div>
    </button>
  );
}
