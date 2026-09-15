"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { calculateBusinessDuration, formatBusinessDuration } from "@/lib/businessTime";
import type { AssignedTask } from "@/type/assignedTask";
import {
  Loader2,
  ShieldAlert,
  ClipboardCheck,
  ArrowLeft,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  User as UserIcon,
  Play,
  Flame,
  Timer,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";

type TeamMember = { name: string; email: string; role: string };
type Tab = "mine" | "assigned" | "all";

function daysAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function TasksPage() {
  const { role, name, email, loading: authLoading } = useAuth();
  const canView = role !== "user" && !!role;
  const isAdmin = role === "admin";

  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("mine");

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  // Ticks once a minute so any in-progress elapsed-time display stays current
  // while the page is left open, without needing a real per-second timer.
  const [, setClockTick] = useState(0);

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDescription, setAssignDescription] = useState("");
  const [assignToEmail, setAssignToEmail] = useState("");
  const [assignUrgent, setAssignUrgent] = useState(false);
  const [assignDueAt, setAssignDueAt] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [startingId, setStartingId] = useState<number | null>(null);

  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completionNotesDraft, setCompletionNotesDraft] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  useEffect(() => {
    if (canView && email) {
      loadTasks();
      loadHolidays();
      markTasksSeen();
      if (isAdmin) loadTeamMembers();
    }
  }, [canView, isAdmin, email]);

  // Clears the notification dot — visiting this page means the assignee has
  // now seen whatever's newly assigned to them, and the admin has now seen
  // whatever's newly completed by someone they assigned.
  const markTasksSeen = async () => {
    if (!email) return;
    if (isAdmin) {
      await supabase
        .from("assigned_tasks")
        .update({ admin_seen: true })
        .eq("assigned_by_email", email)
        .eq("status", "completed")
        .eq("admin_seen", false);
    } else {
      await supabase
        .from("assigned_tasks")
        .update({ assignee_seen: true })
        .eq("assigned_to_email", email)
        .eq("assignee_seen", false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setClockTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadTasks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("assigned_tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setTasks((data as AssignedTask[]) || []);
      }
    } catch {
      setError("Could not load tasks — check connectivity.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadHolidays = async () => {
    const { data } = await supabase.from("company_holidays").select("date");
    if (data) setHolidays(new Set(data.map((h: { date: string }) => h.date)));
  };

  const loadTeamMembers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select("name, email, role")
      .neq("role", "admin")
      .order("name", { ascending: true });
    setTeamMembers((data as TeamMember[]) || []);
  };

  const submitAssign = async () => {
    if (!assignTitle.trim() || !assignToEmail) return;
    const assignee = teamMembers.find((m) => m.email === assignToEmail);
    if (!assignee) return;

    setIsAssigning(true);
    setAssignError(null);

    const { error: insertError } = await supabase.from("assigned_tasks").insert({
      title: assignTitle.trim(),
      description: assignDescription.trim() || null,
      assigned_to_name: assignee.name,
      assigned_to_email: assignee.email,
      assigned_by_name: name || "Unknown Operator",
      assigned_by_email: email || "",
      status: "pending",
      is_urgent: assignUrgent,
      due_at: assignDueAt ? new Date(assignDueAt).toISOString() : null,
      assignee_seen: false,
    });

    setIsAssigning(false);

    if (insertError) {
      setAssignError(insertError.message);
      return;
    }

    setAssignTitle("");
    setAssignDescription("");
    setAssignToEmail("");
    setAssignUrgent(false);
    setAssignDueAt("");
    setShowAssignForm(false);
    await loadTasks();
  };

  const startTask = async (taskId: number) => {
    setStartingId(taskId);
    const { error: updateError } = await supabase
      .from("assigned_tasks")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", taskId);
    setStartingId(null);
    if (!updateError) await loadTasks();
  };

  const startCompleting = (task: AssignedTask) => {
    setCompletingId(task.id);
    setCompletionNotesDraft("");
    setCompleteError(null);
  };

  const submitComplete = async (taskId: number) => {
    if (!completionNotesDraft.trim()) return;

    setIsCompleting(true);
    setCompleteError(null);

    const { error: updateError } = await supabase
      .from("assigned_tasks")
      .update({
        status: "completed",
        completion_notes: completionNotesDraft.trim(),
        completed_at: new Date().toISOString(),
        admin_seen: false,
      })
      .eq("id", taskId);

    setIsCompleting(false);

    if (updateError) {
      setCompleteError(updateError.message);
      return;
    }

    setCompletingId(null);
    setCompletionNotesDraft("");
    await loadTasks();
  };

  const deleteTask = async (taskId: number) => {
    if (!window.confirm("Delete this task assignment? This can't be undone.")) return;
    const { error: deleteError } = await supabase.from("assigned_tasks").delete().eq("id", taskId);
    if (!deleteError) {
      setTasks((current) => current.filter((t) => t.id !== taskId));
    }
  };

  const filteredTasks = useMemo(() => {
    const base =
      tab === "mine"
        ? tasks.filter((t) => t.assigned_to_email === email)
        : tab === "assigned"
        ? tasks.filter((t) => t.assigned_by_email === email)
        : tasks;

    // Urgent first, then anything not yet completed, newest first within each group.
    return [...base].sort((a, b) => {
      if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
      const aDone = a.status === "completed";
      const bDone = b.status === "completed";
      if (aDone !== bDone) return aDone ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [tasks, tab, email]);

  const pendingMineCount = tasks.filter(
    (t) => t.assigned_to_email === email && t.status !== "completed"
  ).length;

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center mt-20 bg-rose-50 border border-rose-100 rounded-2xl">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clearance Required</h1>
        <p className="text-gray-600">Please sign in to view your tasks.</p>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-sm">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
            <p className="text-gray-500 text-sm mt-1">
              {isAdmin ? "Assign tasks and track completion notes" : "Tasks assigned to you"}
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAssignForm((v) => !v)}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-blue-600 text-white text-sm font-semibold shadow-[0_10px_30px_rgba(37,99,235,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-700 shrink-0"
          >
            <Plus className="w-4 h-4" /> Assign Task
          </button>
        )}
      </div>

      {isAdmin && showAssignForm && (
        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm p-5 mb-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">New Task</p>

          <input
            type="text"
            value={assignTitle}
            onChange={(e) => setAssignTitle(e.target.value)}
            placeholder="Task title"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          <textarea
            value={assignDescription}
            onChange={(e) => setAssignDescription(e.target.value)}
            placeholder="Details (optional)"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
          />
          <select
            value={assignToEmail}
            onChange={(e) => setAssignToEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
          >
            <option value="">Assign to...</option>
            {teamMembers.map((m) => (
              <option key={m.email} value={m.email}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Deadline (optional)
            </label>
            <input
              type="datetime-local"
              value={assignDueAt}
              onChange={(e) => setAssignDueAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setAssignUrgent((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50/50"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Flame className={`w-4 h-4 ${assignUrgent ? "text-rose-500" : "text-gray-400"}`} />
              Mark as Urgent
            </span>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                assignUrgent ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  assignUrgent ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>

          {assignError && <p className="text-xs font-bold text-rose-600">{assignError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitAssign}
              disabled={isAssigning || !assignTitle.trim() || !assignToEmail}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Assign
            </button>
            <button
              type="button"
              onClick={() => setShowAssignForm(false)}
              disabled={isAssigning}
              className="px-4 py-2 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="inline-flex rounded-2xl bg-slate-100/95 p-1 border border-slate-200/40 shadow-inner mb-6">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
            tab === "mine" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Assigned to Me{pendingMineCount > 0 ? ` (${pendingMineCount})` : ""}
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setTab("assigned")}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                tab === "assigned" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Assigned by Me
            </button>
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                tab === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All
            </button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
      ) : (
        <div className="space-y-2.5">
          {filteredTasks.map((task) => {
            const isMine = task.assigned_to_email === email;
            const isPending = task.status === "pending";
            const isInProgress = task.status === "in_progress";
            const isCompleted = task.status === "completed";
            const isCompletingThis = completingId === task.id;
            const isStartingThis = startingId === task.id;

            const liveDuration =
              isInProgress && task.started_at
                ? formatBusinessDuration(calculateBusinessDuration(new Date(task.started_at), new Date(), holidays))
                : null;

            const finalDuration =
              isCompleted && task.completed_at
                ? formatBusinessDuration(
                    calculateBusinessDuration(
                      new Date(task.started_at || task.created_at),
                      new Date(task.completed_at),
                      holidays
                    ),
                    true
                  )
                : null;

            const isOverdue = !isCompleted && !!task.due_at && new Date(task.due_at) < new Date();
            const dueLabel = task.due_at
              ? new Date(task.due_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
              : null;

            // A task completed after its deadline stays flagged even once
            // done — isOverdue alone clears the moment status flips, which
            // would otherwise hide that it was actually late.
            const completedLate =
              isCompleted && !!task.due_at && !!task.completed_at && new Date(task.completed_at) > new Date(task.due_at);
            const lateByDuration = completedLate
              ? formatBusinessDuration(calculateBusinessDuration(new Date(task.due_at!), new Date(task.completed_at!), holidays))
              : null;

            return (
              <div
                key={task.id}
                className={`rounded-2xl border shadow-sm p-4 transition-all ${
                  completedLate
                    ? "bg-amber-50/50 border-amber-200"
                    : isCompleted
                    ? "bg-emerald-50/50 border-emerald-200"
                    : isOverdue || task.is_urgent
                    ? "bg-rose-50/40 border-rose-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5 flex-wrap">
                      {task.is_urgent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 flex items-center gap-1">
                          <Flame className="w-3 h-3" /> Urgent
                        </span>
                      )}
                      {completedLate && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Completed Late
                        </span>
                      )}
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{task.description}</p>
                    )}
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3 h-3" /> {task.assigned_to_name}
                      </span>
                      <span>assigned by {task.assigned_by_name}</span>
                      <span>{daysAgo(task.created_at)}</span>
                      {dueLabel && (
                        <span
                          className={`flex items-center gap-1 font-semibold ${
                            isOverdue || completedLate ? "text-rose-600" : "text-gray-500"
                          }`}
                        >
                          {isOverdue || completedLate ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <CalendarClock className="w-3 h-3" />
                          )}
                          {isOverdue ? "Overdue —" : "Due"} {dueLabel}
                        </span>
                      )}
                      {liveDuration && (
                        <span className="flex items-center gap-1 text-blue-600 font-semibold">
                          <Timer className="w-3 h-3" /> {liveDuration} elapsed
                        </span>
                      )}
                      {finalDuration && (
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <Timer className="w-3 h-3" /> took {finalDuration}
                        </span>
                      )}
                      {lateByDuration && (
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                          <AlertTriangle className="w-3 h-3" /> {lateByDuration} late
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 ${
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
                    {isAdmin && task.assigned_by_email === email && (
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="text-gray-300 hover:text-rose-500"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {isCompleted && task.completion_notes && (
                  <div className="mt-3 pt-3 border-t border-emerald-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                      Completion Notes
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.completion_notes}</p>
                  </div>
                )}

                {isPending && isMine && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => startTask(task.id)}
                      disabled={isStartingThis}
                      className="text-sm font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isStartingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Start Task
                    </button>
                  </div>
                )}

                {isInProgress && isMine && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {isCompletingThis ? (
                      <div className="space-y-2">
                        <textarea
                          value={completionNotesDraft}
                          onChange={(e) => setCompletionNotesDraft(e.target.value)}
                          placeholder="Add notes about how this was completed..."
                          rows={3}
                          autoFocus
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                        />
                        {completeError && <p className="text-xs font-bold text-rose-600">{completeError}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => submitComplete(task.id)}
                            disabled={isCompleting || !completionNotesDraft.trim()}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                          >
                            {isCompleting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            Mark Complete
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompletingId(null)}
                            disabled={isCompleting}
                            className="px-4 py-2 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startCompleting(task)}
                        className="text-sm font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Mark Complete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredTasks.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">
              {tab === "mine" ? "No tasks assigned to you." : "No tasks here."}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
