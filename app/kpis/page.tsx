"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { calculateBusinessDuration, formatBusinessDuration } from "@/lib/businessTime";
import type { TaskRevision } from "@/type/taskRevision";
import type { ProductionBug } from "@/type/productionBug";
import type { AssignedTask } from "@/type/assignedTask";
import { effectiveAssigneeEmail, effectiveAssigneeName, isLateCompletion } from "@/lib/taskApproval";
import HrViewBanner from "@/components/HrViewBanner";
import {
  Loader2,
  ShieldAlert,
  BarChart3,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Bug,
  User as UserIcon,
  Users,
  Search,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
} from "lucide-react";

type TeamMember = { name: string; email: string; role: string };
type ActivityFilter = "all" | "revisions" | "open_bugs" | "fixed_bugs";

// Mirrors the locked role filter on Tasks Overview — HR sees Developer
// (+ Manager) for now while the other role views get built out.
const ROLE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "developer", label: "Developer" },
  { value: "content_writer", label: "Content Writer" },
  { value: "seo_person", label: "SEO Person" },
  { value: "manager", label: "Manager" },
  { value: "support", label: "Support" },
  { value: "designer", label: "Designer" },
];

function monthLabel(date: Date): string {
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function monthRange(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function daysAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function formatRole(r: string | undefined) {
  return r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Team Member";
}

// A task counts as currently overdue the same way Tasks/Tasks Overview do:
// not completed, and past its own deadline.
function isTaskOverdue(t: AssignedTask): boolean {
  return t.status !== "completed" && !!t.due_at && new Date(t.due_at) < new Date();
}

type PersonKpi = {
  name: string;
  email: string;
  revisions: TaskRevision[];
  bugs: ProductionBug[];
  tasks: AssignedTask[];
};

export default function KpisPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "admin" || role === "manager" || role === "hr" || role === "designer";

  // Admin can preview the HR-scoped view via ?viewAs=hr from Command Center —
  // see components/HrViewBanner.tsx.
  const [viewingAsHr, setViewingAsHr] = useState(false);
  useEffect(() => {
    setViewingAsHr(new URLSearchParams(window.location.search).get("viewAs") === "hr");
  }, []);
  const effectiveRole = role === "admin" && viewingAsHr ? "hr" : role;

  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [revisions, setRevisions] = useState<TaskRevision[]>([]);
  const [bugs, setBugs] = useState<ProductionBug[]>([]);
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  // HR-only role filter — locked to "developer" for now (see
  // ROLE_FILTER_OPTIONS comment). Doesn't affect admin/manager/designer,
  // who still see everyone.
  const [roleFilter] = useState<string>("developer");

  async function loadTeamMembers() {
    const { data } = await supabase
      .from("team_members")
      .select("name, email, role")
      .neq("role", "admin")
      .order("name", { ascending: true });
    setTeamMembers((data as TeamMember[]) || []);
  }

  async function loadHolidays() {
    const { data } = await supabase.from("company_holidays").select("date");
    if (data) setHolidays(new Set(data.map((h: { date: string }) => h.date)));
  }

  async function loadMonthData() {
    setIsLoading(true);
    const { start, end } = monthRange(monthCursor);

    const [revisionsResult, bugsResult, tasksResult] = await Promise.all([
      supabase
        .from("task_revisions")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
      supabase
        .from("production_bugs")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
      supabase
        .from("assigned_tasks")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
    ]);

    setRevisions((revisionsResult.data as TaskRevision[]) || []);
    setBugs((bugsResult.data as ProductionBug[]) || []);
    setTasks((tasksResult.data as AssignedTask[]) || []);
    setIsLoading(false);
  }

  useEffect(() => {
    if (canView) {
      loadTeamMembers();
      loadHolidays();
    }
  }, [canView]);

  useEffect(() => {
    if (canView) loadMonthData();
  }, [canView, monthCursor]);

  const toggleExpanded = (email: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const roleByEmail = useMemo(() => {
    const roles: Record<string, string> = {};
    for (const m of teamMembers) roles[m.email] = m.role;
    return roles;
  }, [teamMembers]);

  // Employee dropdown stays within the current role scope, same as Tasks
  // Overview — HR never sees people outside the locked role.
  const employeeOptions = useMemo(() => {
    const members =
      effectiveRole === "hr"
        ? teamMembers.filter((m) => m.role === roleFilter || m.role === "manager")
        : teamMembers;
    return [...members].sort((a, b) => a.name.localeCompare(b.name));
  }, [teamMembers, effectiveRole, roleFilter]);

  const people = useMemo<PersonKpi[]>(() => {
    const byEmail: Record<string, PersonKpi> = {};

    for (const m of teamMembers) {
      byEmail[m.email] = { name: m.name, email: m.email, revisions: [], bugs: [], tasks: [] };
    }
    for (const r of revisions) {
      if (!byEmail[r.assignee_email]) {
        byEmail[r.assignee_email] = { name: r.assignee_name, email: r.assignee_email, revisions: [], bugs: [], tasks: [] };
      }
      byEmail[r.assignee_email].revisions.push(r);
    }
    for (const b of bugs) {
      if (!byEmail[b.developer_email]) {
        byEmail[b.developer_email] = { name: b.developer_name, email: b.developer_email, revisions: [], bugs: [], tasks: [] };
      }
      byEmail[b.developer_email].bugs.push(b);
    }
    for (const t of tasks) {
      const taskEmail = effectiveAssigneeEmail(t);
      if (!byEmail[taskEmail]) {
        byEmail[taskEmail] = { name: effectiveAssigneeName(t), email: taskEmail, revisions: [], bugs: [], tasks: [] };
      }
      byEmail[taskEmail].tasks.push(t);
    }

    const everyone = Object.values(byEmail);
    // HR's view is scoped to one role at a time — everyone else (admin,
    // manager, designer) still sees every person. Managers are included
    // alongside Developers since HR tracks them together for now.
    let scoped =
      effectiveRole === "hr"
        ? everyone.filter((p) => roleByEmail[p.email] === roleFilter || roleByEmail[p.email] === "manager")
        : everyone;

    if (activityFilter !== "all") {
      scoped = scoped.filter((p) => {
        if (activityFilter === "revisions") return p.revisions.length > 0;
        if (activityFilter === "open_bugs") return p.bugs.some((b) => b.status !== "fixed");
        return p.bugs.some((b) => b.status === "fixed");
      });
    }

    if (employeeFilter !== "all") scoped = scoped.filter((p) => p.email === employeeFilter);

    const q = searchQuery.trim().toLowerCase();
    if (q) scoped = scoped.filter((p) => p.name.toLowerCase().includes(q));

    return scoped.sort((a, b) => a.name.localeCompare(b.name));
  }, [teamMembers, revisions, bugs, tasks, effectiveRole, roleByEmail, roleFilter, activityFilter, employeeFilter, searchQuery]);

  const summary = useMemo(() => {
    // Scoped to whatever's currently narrowing `people` — role lock, activity
    // filter, the Employee dropdown, or search — so the top cards always
    // match what's actually listed below.
    const scopedEmails = new Set(people.map((p) => p.email));
    const scopedRevisions = revisions.filter((r) => scopedEmails.has(r.assignee_email));
    const scopedBugs = bugs.filter((b) => scopedEmails.has(b.developer_email));
    const scopedTasks = tasks.filter((t) => scopedEmails.has(effectiveAssigneeEmail(t)));
    const openBugs = scopedBugs.filter((b) => b.status !== "fixed").length;
    const fixedBugs = scopedBugs.length - openBugs;
    const overdueTasks = scopedTasks.filter(isTaskOverdue).length;
    const lateTasks = scopedTasks.filter(
      (t) => isTaskOverdue(t) || (t.status === "completed" && isLateCompletion(t))
    ).length;
    const inProgressTasks = scopedTasks.filter((t) => t.status === "in_progress").length;
    const completedTasks = scopedTasks.filter((t) => t.status === "completed").length;
    return {
      totalRevisions: scopedRevisions.length,
      totalBugs: scopedBugs.length,
      openBugs,
      fixedBugs,
      totalTasks: scopedTasks.length,
      overdueTasks,
      lateTasks,
      inProgressTasks,
      completedTasks,
    };
  }, [people, revisions, bugs, tasks]);

  const filtersActive = !!searchQuery || activityFilter !== "all" || employeeFilter !== "all";

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
        <p className="text-gray-600">Only Admin, Manager, and HR can view KPIs.</p>
      </div>
    );
  }

  return (
    <main className="max-w-[1600px] mx-auto w-full p-4 sm:p-6 lg:p-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-[var(--accent)] hover:opacity-80 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <HrViewBanner />

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-[0_8px_20px_-6px_rgba(5,150,105,0.5)]">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[var(--bg-foreground)] flex items-center gap-2 flex-wrap">
              KPIs
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Sync
              </span>
            </h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">
              Revisions and production bugs, per person, per month.{" "}
              <Link href="/production-bugs" className="text-[var(--accent)] hover:opacity-80 font-semibold">
                View Production Bugs →
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            <button
              type="button"
              onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="p-2 rounded-full hover:bg-gray-100 text-[var(--card-muted)]"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-[var(--card-foreground)] px-2 min-w-[140px] text-center">
              {monthLabel(monthCursor)}
            </span>
            <button
              type="button"
              onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="p-2 rounded-full hover:bg-gray-100 text-[var(--card-muted)]"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Tasks Assigned</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.totalTasks}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-sky-600 shrink-0">
                <ListChecks className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">
              {employeeFilter === "all"
                ? "Handed out this month"
                : `For ${employeeOptions.find((m) => m.email === employeeFilter)?.name || "this person"}`}
            </p>
          </div>

          {employeeFilter !== "all" && (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">In Progress</p>
                  <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.inProgressTasks}</p>
                </div>
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                  <ListChecks className="w-5 h-5" />
                </span>
              </div>
              <p className="text-[11px] text-[var(--card-muted)] mt-2">Active work underway</p>
            </div>
          )}

          {employeeFilter !== "all" && (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Completed</p>
                  <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.completedTasks}</p>
                </div>
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
              </div>
              <p className="text-[11px] text-[var(--card-muted)] mt-2">
                {summary.totalTasks > 0 ? Math.round((summary.completedTasks / summary.totalTasks) * 100) : 0}% completed
              </p>
            </div>
          )}

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">
                  {employeeFilter === "all" ? "Overdue Tasks" : "Late Tasks"}
                </p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">
                  {employeeFilter === "all" ? summary.overdueTasks : summary.lateTasks}
                </p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
            </div>
            {(employeeFilter === "all" ? summary.overdueTasks : summary.lateTasks) > 0 ? (
              <p className="text-[11px] text-amber-600 font-semibold mt-2">
                {employeeFilter === "all" ? "Past their deadline" : "Overdue + completed past deadline"}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--card-muted)] mt-2">{employeeFilter === "all" ? "Nothing overdue" : "Nothing late"}</p>
            )}
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Total Revisions</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.totalRevisions}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-50 text-violet-600 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">Sent back for rework this month</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Total Bugs</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.totalBugs}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-600 shrink-0">
                <ClipboardList className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">Logged against production this month</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Open Bugs</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.openBugs}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
            </div>
            {summary.openBugs > 0 ? (
              <p className="text-[11px] text-rose-600 font-semibold mt-2">Still needs a fix</p>
            ) : (
              <p className="text-[11px] text-[var(--card-muted)] mt-2">Nothing outstanding</p>
            )}
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Fixed Bugs</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.fixedBugs}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">Resolved this month</p>
          </div>
        </div>
      )}

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(15,23,42,0.1)] p-4 mb-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name..."
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-full bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] focus:bg-white transition-colors"
            />
          </div>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="all">All Employees</option>
            {employeeOptions.map((m) => (
              <option key={m.email} value={m.email}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
            className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="all">All Activity</option>
            <option value="revisions">Has Revisions</option>
            <option value="open_bugs">Has Open Bugs</option>
            <option value="fixed_bugs">Has Fixed Bugs</option>
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
            Month: {monthLabel(monthCursor)}
          </span>
          {activityFilter !== "all" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
              Activity: {activityFilter.replace("_", " ")}
            </span>
          )}
          {employeeFilter !== "all" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
              Employee: {employeeOptions.find((m) => m.email === employeeFilter)?.name || employeeFilter}
            </span>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActivityFilter("all");
                setEmployeeFilter("all");
              }}
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] hover:opacity-80 px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : people.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
          <p className="text-[var(--card-muted)]">No team members match these filters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {people.map((person) => {
            const isOpen = expanded.has(person.email);
            const revisionCount = person.revisions.length;
            const bugCount = person.bugs.length;
            const openBugCount = person.bugs.filter((b) => b.status !== "fixed").length;
            const taskCount = person.tasks.length;
            const taskOverdueCount = person.tasks.filter(isTaskOverdue).length;
            const taskLateCount = person.tasks.filter((t) => t.status === "completed" && isLateCompletion(t)).length;
            const taskOnTimeCount = person.tasks.filter(
              (t) => t.status === "completed" && !isLateCompletion(t)
            ).length;

            return (
              <div
                key={person.email}
                className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_18px_-10px_rgba(15,23,42,0.1)] overflow-hidden transition-shadow hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)]"
              >
                <button
                  onClick={() => toggleExpanded(person.email)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-sm ring-2 ring-white shadow-sm">
                      {person.name ? person.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-[var(--card-foreground)]">{person.name}</p>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {formatRole(roleByEmail[person.email])}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--card-muted)]">
                        {taskCount} task{taskCount === 1 ? "" : "s"} · {revisionCount} revision{revisionCount === 1 ? "" : "s"} · {bugCount} bug
                        {bugCount === 1 ? "" : "s"}
                        {openBugCount > 0 && ` · ${openBugCount} open`}
                        {taskOverdueCount > 0 && ` · ${taskOverdueCount} overdue`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 border ${
                        taskOverdueCount > 0
                          ? "text-amber-600 bg-amber-50 border-amber-100"
                          : taskCount > 0
                          ? "text-sky-600 bg-sky-50 border-sky-100"
                          : "text-gray-400 bg-gray-50 border-gray-100"
                      }`}
                    >
                      <ListChecks className="w-3 h-3" /> {taskCount} task{taskCount === 1 ? "" : "s"}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 border ${
                        revisionCount > 0
                          ? "text-violet-600 bg-violet-50 border-violet-100"
                          : "text-gray-400 bg-gray-50 border-gray-100"
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" /> {revisionCount} revision{revisionCount === 1 ? "" : "s"}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 border ${
                        bugCount > 0
                          ? "text-rose-600 bg-rose-50 border-rose-100"
                          : "text-gray-400 bg-gray-50 border-gray-100"
                      }`}
                    >
                      <Bug className="w-3 h-3" /> {bugCount} bug{bugCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>

                {isOpen && (taskCount > 0 || revisionCount > 0 || bugCount > 0) && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {taskCount > 0 && (
                      <div className="px-5 py-2.5 bg-slate-50/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-[var(--card-muted)]">
                        <span className="text-emerald-600">{taskOnTimeCount} on time</span>
                        <span className="text-amber-600">{taskLateCount} completed late</span>
                        <span className="text-rose-600">{taskOverdueCount} overdue</span>
                      </div>
                    )}
                    {person.tasks.map((t) => {
                      const isCompleted = t.status === "completed";
                      const overdue = isTaskOverdue(t);
                      const late = isCompleted && isLateCompletion(t);
                      const statusLabel = overdue
                        ? "Overdue"
                        : late
                        ? "Completed Late"
                        : isCompleted
                        ? "Completed On Time"
                        : t.status === "in_progress"
                        ? "In Progress"
                        : "Pending";
                      const statusClass = overdue
                        ? "bg-rose-100 text-rose-600"
                        : late
                        ? "bg-amber-100 text-amber-700"
                        : isCompleted
                        ? "bg-emerald-100 text-emerald-700"
                        : t.status === "in_progress"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-500";

                      return (
                        <div key={`task-${t.id}`} className="px-5 py-3">
                          <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5 flex-wrap">
                            <ListChecks className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            <Link href={`/tasks?taskId=${t.id}`} className="hover:text-[var(--accent)] hover:underline">
                              {t.title}
                            </Link>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </p>
                          <p className="text-xs text-[var(--card-muted)] mt-1">
                            assigned {daysAgo(t.created_at)}
                            {t.due_at && ` · due ${new Date(t.due_at).toLocaleDateString()}`}
                          </p>
                        </div>
                      );
                    })}
                    {person.revisions.map((r) => {
                      const duration = r.resolved_at
                        ? formatBusinessDuration(
                            calculateBusinessDuration(new Date(r.created_at), new Date(r.resolved_at), holidays),
                            true
                          )
                        : formatBusinessDuration(calculateBusinessDuration(new Date(r.created_at), new Date(), holidays));

                      return (
                        <div key={`rev-${r.id}`} className="px-5 py-3">
                          <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5 flex-wrap">
                            <RotateCcw className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <Link href={`/tasks?taskId=${r.task_id}`} className="hover:text-[var(--accent)] hover:underline">
                              {r.task_title}
                            </Link>
                            {!r.resolved_at && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                Still In Revision
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[var(--card-muted)] mt-1">
                            requested by {r.requested_by_name} · {daysAgo(r.created_at)} · {r.resolved_at ? "took" : "ongoing"} {duration}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{r.reason}</p>
                        </div>
                      );
                    })}
                    {person.bugs.map((b) => (
                      <div key={`bug-${b.id}`} className="px-5 py-3">
                        <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5">
                          <Bug className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <Link href={`/production-bugs?bugId=${b.id}`} className="hover:text-[var(--accent)] hover:underline">
                            {b.title}
                          </Link>
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              b.status === "fixed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"
                            }`}
                          >
                            {b.status === "fixed" ? "Fixed" : "Open"}
                          </span>
                        </p>
                        <p className="text-xs text-[var(--card-muted)] mt-1">
                          reported by {b.reported_by_name} · {daysAgo(b.created_at)}
                          {b.site_name && (
                            <>
                              {" · "}
                              {b.site_domain ? (
                                <a
                                  href={b.site_domain}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-[var(--accent)] hover:underline"
                                >
                                  {b.site_name}
                                </a>
                              ) : (
                                b.site_name
                              )}
                            </>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
