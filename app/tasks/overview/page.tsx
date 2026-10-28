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
import type { AssignedTask } from "@/type/assignedTask";
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
} from "lucide-react";

type DateFilter = "today" | "week" | "all";

// Mirrors the role values used across the rest of the app (admin/page.tsx
// role dropdowns, useNavItems). HR locks this to "developer" for now — the
// dropdown itself stays disabled until the other role views are ready.
const ROLE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "developer", label: "Developer" },
  { value: "content_writer", label: "Content Writer" },
  { value: "seo_person", label: "SEO Person" },
  { value: "manager", label: "Manager" },
  { value: "support", label: "Support" },
  { value: "designer", label: "Designer" },
];

function isWithinDays(dateStr: string, days: number) {
  const date = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

type PersonGroup = {
  name: string;
  email: string;
  tasks: AssignedTask[];
};

export default function TasksOverviewPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "admin" || role === "manager" || role === "hr" || role === "designer";

  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [avatarsByEmail, setAvatarsByEmail] = useState<Record<string, string>>({});
  const [roleByEmail, setRoleByEmail] = useState<Record<string, string>>({});
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

  const filteredTasks = useMemo(() => {
    if (dateFilter === "all") return tasks;
    const days = dateFilter === "today" ? 1 : 7;
    return tasks.filter((t) => isWithinDays(t.created_at, days));
  }, [tasks, dateFilter]);

  const groupedByPerson = useMemo(() => {
    const groups: Record<string, PersonGroup> = {};
    for (const task of filteredTasks) {
      const email = effectiveAssigneeEmail(task);
      const name = effectiveAssigneeName(task);
      if (!email) continue;
      // HR's view is scoped to one role at a time — everyone else (admin,
      // manager, designer) still sees every person.
      if (role === "hr" && roleByEmail[email] !== roleFilter) continue;
      if (!groups[email]) groups[email] = { name, email, tasks: [] };
      groups[email].tasks.push(task);
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredTasks, role, roleByEmail, roleFilter]);

  // Company-wide counters for the summary strip — gives whoever's looking
  // (especially a view-only Designer) the big picture before drilling into
  // any one person's row.
  const summary = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.status === "completed").length;
    const inProgress = filteredTasks.filter((t) => t.status === "in_progress").length;
    const notStarted = total - completed - inProgress;
    return { total, completed, inProgress, notStarted };
  }, [filteredTasks]);

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
    <main className="p-4 sm:p-8 max-w-5xl mx-auto w-full">
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-600 text-white rounded-xl shadow-sm">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--bg-foreground)]">Tasks Overview</h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">Every person&apos;s tasks, status, and approval — in one place.</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {role === "hr" && (
            <div className="relative" title="More roles are coming soon — locked to Developer for now">
              <Users className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={roleFilter}
                disabled
                className="pl-8 pr-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-white border border-gray-200 text-gray-500 appearance-none cursor-not-allowed"
              >
                {ROLE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(["today", "week", "all"] as DateFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setDateFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                dateFilter === filter
                  ? "bg-[var(--button)] text-[var(--button-text)]"
                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && groupedByPerson.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-slate-600 shrink-0">
              <ClipboardList className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xl font-black text-[var(--card-foreground)] leading-none">{summary.total}</p>
              <p className="text-[11px] font-semibold text-[var(--card-muted)] mt-0.5">Total</p>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xl font-black text-[var(--card-foreground)] leading-none">{summary.completed}</p>
              <p className="text-[11px] font-semibold text-[var(--card-muted)] mt-0.5">Completed</p>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <Timer className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xl font-black text-[var(--card-foreground)] leading-none">{summary.inProgress}</p>
              <p className="text-[11px] font-semibold text-[var(--card-muted)] mt-0.5">In Progress</p>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-50 text-amber-600 shrink-0">
              <Clock className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xl font-black text-[var(--card-foreground)] leading-none">{summary.notStarted}</p>
              <p className="text-[11px] font-semibold text-[var(--card-muted)] mt-0.5">Not Started</p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : groupedByPerson.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
          <p className="text-[var(--card-muted)]">No tasks for this range.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupedByPerson.map((person) => {
            const isOpen = expanded.has(person.email);
            const total = person.tasks.length;
            const completed = person.tasks.filter((t) => t.status === "completed").length;
            const approved = person.tasks.filter((t) => computeApprovalState(t) === "approved" || computeApprovalState(t) === "auto_approved").length;
            const notDelivered = person.tasks.filter((t) => computeApprovalState(t) === "rejected").length;
            const awaitingReview = person.tasks.filter(
              (t) => computeApprovalState(t) === "pending_manager" || computeApprovalState(t) === "pending_admin"
            ).length;

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
                    <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-sm overflow-hidden">
                      {avatarsByEmail[person.email] ? (
                        <img
                          src={avatarsByEmail[person.email]}
                          alt={person.name}
                          className="w-full h-full object-cover"
                        />
                      ) : person.name ? (
                        person.name.charAt(0).toUpperCase()
                      ) : (
                        <UserIcon className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-[var(--card-foreground)]">{person.name}</p>
                      <p className="text-xs text-[var(--card-muted)]">
                        {total} task{total === 1 ? "" : "s"} · {completed} completed
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {approved > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100">
                        <ShieldCheck className="w-3 h-3" /> {approved} approved
                      </span>
                    )}
                    {awaitingReview > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-100">
                        <Clock className="w-3 h-3" /> {awaitingReview} awaiting review
                      </span>
                    )}
                    {notDelivered > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-100">
                        <XCircle className="w-3 h-3" /> {notDelivered} not on time
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {person.tasks.map((task) => {
                      const isPending = task.status === "pending";
                      const isInProgress = task.status === "in_progress";
                      const isCompleted = task.status === "completed";
                      const completedLate = isCompleted && isLateCompletion(task);
                      const approvalState = computeApprovalState(task);
                      const dueLabel = task.due_at
                        ? new Date(task.due_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
                        : null;

                      return (
                        <div key={task.id} className="px-5 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5 flex-wrap">
                                {task.is_urgent && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 flex items-center gap-1">
                                    <Flame className="w-3 h-3" /> Urgent
                                  </span>
                                )}
                                {task.title}
                              </p>
                              <p className="text-xs text-[var(--card-muted)] mt-1">
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
                                    : "text-amber-600 bg-amber-50 border border-amber-100"
                                }`}
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : isInProgress ? (
                                  <Timer className="w-3 h-3" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
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
                              {isPending && !isCompleted && (
                                <span className="text-[10px] text-gray-300 font-semibold">not started yet</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
