"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { calculateBusinessDuration, formatBusinessDuration } from "@/lib/businessTime";
import {
  effectiveAssigneeName,
  effectiveAssigneeEmail,
  isLateCompletion,
  requiresManagerApproval,
  computeApprovalState,
} from "@/lib/taskApproval";
import type { AssignedTask } from "@/type/assignedTask";
import type { TaskRevision } from "@/type/taskRevision";
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
  Repeat,
  ShieldCheck,
  XCircle,
  MessageSquareWarning,
  RotateCcw,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep link from KPIs ("view this task") — when present, show only that
  // task regardless of which tab it'd normally fall under, since a manager
  // viewing a revision they didn't assign has no tab that would surface it.
  const highlightTaskId = searchParams.get("taskId") ? Number(searchParams.get("taskId")) : null;
  const { role, name, email, loading: authLoading } = useAuth();
  const canView = role !== "user" && !!role;
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isHr = role === "hr";
  const canAssign = isAdmin || isManager;

  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null means "no explicit choice yet" — falls back to a role-appropriate
  // default below, without needing an effect to sync it once role loads.
  const [tabOverride, setTabOverride] = useState<Tab | null>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [taskRevisions, setTaskRevisions] = useState<TaskRevision[]>([]);

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
  const [lateReasonDraft, setLateReasonDraft] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [reassigningId, setReassigningId] = useState<number | null>(null);
  const [reassignToEmail, setReassignToEmail] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const [decidingId, setDecidingId] = useState<number | null>(null);

  const [revisingId, setRevisingId] = useState<number | null>(null);
  const [revisionReasonDraft, setRevisionReasonDraft] = useState("");
  const [revisionDueAtDraft, setRevisionDueAtDraft] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);

  // Admin never has tasks assigned to them, so they don't get a "mine" tab —
  // default them straight into tracking what they've handed out. Managers
  // both receive work and hand it off, so they keep "mine" as the default.
  // HR has no tasks of their own at all — it's a pure tracker, so they land
  // straight on "all".
  const tab: Tab = tabOverride ?? (isHr ? "all" : isAdmin ? "assigned" : "mine");
  const setTab = setTabOverride;

  useEffect(() => {
    if (canView && email) {
      loadTasks();
      loadHolidays();
      loadRevisions();
      markTasksSeen();
      if (canAssign) loadTeamMembers();
    }
  }, [canView, canAssign, email]);

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
      await supabase
        .from("assigned_tasks")
        .update({ assignee_seen: true })
        .eq("reassigned_to_email", email)
        .eq("assignee_seen", false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setClockTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // HR's tracker view is the grouped-by-person overview, not this
  // assign/act-on-tasks page — send them there whichever way they arrived,
  // unless they followed a shared task link from KPIs, in which case let
  // them view that one task here (read-only, same as everything else HR sees).
  useEffect(() => {
    if (isHr && highlightTaskId === null) router.replace("/tasks/overview");
  }, [isHr, highlightTaskId, router]);

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

  const loadRevisions = async () => {
    const { data } = await supabase
      .from("task_revisions")
      .select("*")
      .order("created_at", { ascending: false });
    setTaskRevisions((data as TaskRevision[]) || []);
  };

  const loadTeamMembers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select("name, email, role")
      .neq("role", "admin")
      .order("name", { ascending: true });
    setTeamMembers((data as TeamMember[]) || []);
  };

  // Admin can assign to anyone (any non-admin). A manager can only assign or
  // reassign to their own non-manager reports — never to another manager.
  const assignableMembers = useMemo(
    () => (isAdmin ? teamMembers : teamMembers.filter((m) => m.role !== "manager")),
    [teamMembers, isAdmin]
  );

  const submitAssign = async () => {
    if (!assignTitle.trim() || !assignToEmail) return;
    const assignee = assignableMembers.find((m) => m.email === assignToEmail);
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
    setLateReasonDraft("");
    setCompleteError(null);
  };

  const submitComplete = async (taskId: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!completionNotesDraft.trim()) return;

    const now = new Date();
    const late = !!task.due_at && now > new Date(task.due_at);
    if (late && !lateReasonDraft.trim()) {
      setCompleteError("A reason is required since this is past its deadline.");
      return;
    }

    setIsCompleting(true);
    setCompleteError(null);

    const hasManager = requiresManagerApproval(task);
    const update: Record<string, unknown> = {
      status: "completed",
      completion_notes: completionNotesDraft.trim(),
      completed_at: now.toISOString(),
      admin_seen: false,
    };

    if (late) {
      update.late_reason = lateReasonDraft.trim();
    }

    if (hasManager) {
      // Reassigned tasks always go through the manager first, even when
      // delivered on time — only the manager can vouch for their report's
      // work. Admin still gets the final say after that.
      update.manager_approval = "pending";
      update.admin_approval = "not_required";
    } else if (late) {
      update.manager_approval = "not_required";
      update.admin_approval = "pending";
    } else {
      // On-time, never reassigned — no manager in the chain, so this
      // auto-approves with no manual review needed.
      update.manager_approval = "not_required";
      update.admin_approval = "approved";
      update.approved_at = now.toISOString();
    }

    const { error: updateError } = await supabase.from("assigned_tasks").update(update).eq("id", taskId);

    if (updateError) {
      setIsCompleting(false);
      setCompleteError(updateError.message);
      return;
    }

    // Closes out the timing on whichever revision sent this task back, if any.
    if (task.revision_count > 0) {
      await supabase
        .from("task_revisions")
        .update({ resolved_at: now.toISOString() })
        .eq("task_id", taskId)
        .is("resolved_at", null);
    }

    setIsCompleting(false);
    setCompletingId(null);
    setCompletionNotesDraft("");
    setLateReasonDraft("");
    await Promise.all([loadTasks(), loadRevisions()]);
  };

  const startReassigning = (task: AssignedTask) => {
    setReassigningId(task.id);
    setReassignToEmail("");
    setReassignError(null);
  };

  const submitReassign = async (taskId: number) => {
    const assignee = assignableMembers.find((m) => m.email === reassignToEmail);
    if (!assignee) return;

    setIsReassigning(true);
    setReassignError(null);

    const { error: updateError } = await supabase
      .from("assigned_tasks")
      .update({
        reassigned_to_name: assignee.name,
        reassigned_to_email: assignee.email,
        reassigned_by_name: name || "Unknown Manager",
        reassigned_by_email: email || "",
        reassigned_at: new Date().toISOString(),
        status: "pending",
        started_at: null,
        assignee_seen: false,
      })
      .eq("id", taskId);

    setIsReassigning(false);

    if (updateError) {
      setReassignError(updateError.message);
      return;
    }

    setReassigningId(null);
    setReassignToEmail("");
    await loadTasks();
  };

  // Manager's call on a late completion: approve the reason, or mark it not
  // delivered on time. Either way it then moves to the admin for the final
  // say — the manager alone can't finalize approval.
  const submitManagerDecision = async (taskId: number, decision: "approved" | "rejected") => {
    setDecidingId(taskId);
    await supabase
      .from("assigned_tasks")
      .update({
        manager_approval: decision,
        manager_approval_at: new Date().toISOString(),
        manager_approval_by_name: name || "Unknown Manager",
        manager_approval_by_email: email || "",
        admin_approval: "pending",
      })
      .eq("id", taskId);
    setDecidingId(null);
    await loadTasks();
  };

  const submitAdminDecision = async (taskId: number, decision: "approved" | "rejected") => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    setDecidingId(taskId);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      admin_approval: decision,
      admin_approval_at: now,
      admin_approval_by_name: name || "Unknown Admin",
      admin_approval_by_email: email || "",
    };
    if (decision === "approved" && (task.manager_approval === "approved" || task.manager_approval === "not_required")) {
      update.approved_at = now;
    }
    await supabase.from("assigned_tasks").update(update).eq("id", taskId);
    setDecidingId(null);
    await loadTasks();
  };

  const deleteTask = async (taskId: number) => {
    if (!window.confirm("Delete this task assignment? This can't be undone.")) return;
    const { error: deleteError } = await supabase.from("assigned_tasks").delete().eq("id", taskId);
    if (!deleteError) {
      setTasks((current) => current.filter((t) => t.id !== taskId));
    }
  };

  const startRevision = (task: AssignedTask) => {
    setRevisingId(task.id);
    setRevisionReasonDraft("");
    // The old deadline belonged to the finished round — don't carry a
    // stale/passed date into the new one; start blank (no deadline) and let
    // the requester set a fresh one if this round needs one.
    setRevisionDueAtDraft("");
    setRevisionError(null);
  };

  // Sends a completed task back for rework — logs a permanent revision
  // record (for per-person monthly KPIs) and reopens the task for whoever
  // is currently the effective assignee, clearing its completion/approval
  // state so it goes through a fresh review cycle once redone.
  const submitRevision = async (taskId: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !revisionReasonDraft.trim()) return;

    setIsSubmittingRevision(true);
    setRevisionError(null);

    const { error: logError } = await supabase.from("task_revisions").insert({
      task_id: task.id,
      task_title: task.title,
      assignee_name: effectiveAssigneeName(task),
      assignee_email: effectiveAssigneeEmail(task),
      requested_by_name: name || "Unknown Operator",
      requested_by_email: email || "",
      reason: revisionReasonDraft.trim(),
    });

    if (logError) {
      setIsSubmittingRevision(false);
      setRevisionError(logError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("assigned_tasks")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        completed_at: null,
        due_at: revisionDueAtDraft ? new Date(revisionDueAtDraft).toISOString() : null,
        late_reason: null,
        manager_approval: "not_required",
        admin_approval: "not_required",
        approved_at: null,
        revision_count: task.revision_count + 1,
        assignee_seen: false,
      })
      .eq("id", taskId);

    setIsSubmittingRevision(false);

    if (updateError) {
      setRevisionError(updateError.message);
      return;
    }

    setRevisingId(null);
    setRevisionReasonDraft("");
    setRevisionDueAtDraft("");
    await Promise.all([loadTasks(), loadRevisions()]);
  };

  // Only the most recent revision per task matters for the live/final
  // duration badge — older rounds are still in the log for KPIs, just not
  // shown here.
  const latestRevisionByTask = useMemo(() => {
    const map: Record<number, TaskRevision> = {};
    for (const r of taskRevisions) {
      if (!map[r.task_id]) map[r.task_id] = r; // already sorted newest-first
    }
    return map;
  }, [taskRevisions]);

  const filteredTasks = useMemo(() => {
    if (highlightTaskId !== null) {
      return tasks.filter((t) => t.id === highlightTaskId);
    }

    const base =
      tab === "mine"
        ? tasks.filter((t) => effectiveAssigneeEmail(t) === email)
        : tab === "assigned"
        ? tasks.filter((t) => t.assigned_by_email === email || t.reassigned_by_email === email)
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
    (t) => effectiveAssigneeEmail(t) === email && t.status !== "completed"
  ).length;

  if (authLoading || (isHr && highlightTaskId === null)) {
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
        <p className="text-gray-600">Please sign in to view your tasks.</p>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-[var(--accent)] hover:opacity-80 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-sm">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--bg-foreground)]">Tasks</h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">
              {canAssign ? "Assign tasks and track completion notes" : isHr ? "Track every task and its approval status" : "Tasks assigned to you"}
            </p>
          </div>
        </div>

        {canAssign && (
          <button
            type="button"
            onClick={() => setShowAssignForm((v) => !v)}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-[var(--button)] text-[var(--button-text)] text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--button-hover)] shrink-0"
          >
            <Plus className="w-4 h-4" /> Assign Task
          </button>
        )}
      </div>

      {canAssign && showAssignForm && (
        <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-2xl shadow-sm p-5 mb-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--card-muted)]">New Task</p>

          <input
            type="text"
            value={assignTitle}
            onChange={(e) => setAssignTitle(e.target.value)}
            placeholder="Task title"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
          />
          <textarea
            value={assignDescription}
            onChange={(e) => setAssignDescription(e.target.value)}
            placeholder="Details (optional)"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] resize-none"
          />
          <select
            value={assignToEmail}
            onChange={(e) => setAssignToEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] bg-white"
          >
            <option value="">Assign to...</option>
            {assignableMembers.map((m) => (
              <option key={m.email} value={m.email}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--card-muted)] mb-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Deadline (optional)
            </label>
            <input
              type="datetime-local"
              value={assignDueAt}
              onChange={(e) => setAssignDueAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={() => setAssignUrgent((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50/50"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--card-foreground)]">
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
              className="px-4 py-2 bg-[var(--button)] text-[var(--button-text)] rounded-lg text-sm font-bold hover:bg-[var(--button-hover)] disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Assign
            </button>
            <button
              type="button"
              onClick={() => setShowAssignForm(false)}
              disabled={isAssigning}
              className="px-4 py-2 text-[var(--card-muted)] rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {highlightTaskId !== null && (
        <div className="flex items-center justify-between gap-3 mb-6 px-4 py-2.5 rounded-xl bg-[var(--accent-light)] border border-[var(--accent)]/30 text-sm">
          <span className="text-[var(--card-foreground)] font-medium">Viewing a single task shared from KPIs</span>
          <Link
            href={isHr ? "/tasks/overview" : "/tasks"}
            className="font-bold text-[var(--accent)] hover:opacity-80 shrink-0"
          >
            {isHr ? "Back to Tasks Overview" : "View all tasks"}
          </Link>
        </div>
      )}

      <div className={`inline-flex rounded-2xl bg-slate-100/95 p-1 border border-slate-200/40 shadow-inner mb-6 ${highlightTaskId !== null ? "hidden" : ""}`}>
        {!isAdmin && !isHr && (
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
              tab === "mine" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Assigned to Me{pendingMineCount > 0 ? ` (${pendingMineCount})` : ""}
          </button>
        )}
        {canAssign && (
          <button
            type="button"
            onClick={() => setTab("assigned")}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
              tab === "assigned" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Assigned by Me
          </button>
        )}
        {(isAdmin || isHr) && (
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
              tab === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
      ) : (
        <div className="space-y-2.5">
          {filteredTasks.map((task) => {
            const isMine = effectiveAssigneeEmail(task) === email;
            const isPending = task.status === "pending";
            const isInProgress = task.status === "in_progress";
            const isCompleted = task.status === "completed";
            const isCompletingThis = completingId === task.id;
            const isStartingThis = startingId === task.id;
            const isReassigningThis = reassigningId === task.id;
            const isDecidingThis = decidingId === task.id;
            const isRevisingThis = revisingId === task.id;

            const wasReassigned = !!task.reassigned_to_email;
            const canReassign =
              isManager && task.assigned_to_email === email && !wasReassigned && !isCompleted;

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
            const completedLate = isCompleted && isLateCompletion(task);
            const lateByDuration = completedLate
              ? formatBusinessDuration(calculateBusinessDuration(new Date(task.due_at!), new Date(task.completed_at!), holidays))
              : null;

            const latestRevision = latestRevisionByTask[task.id];
            const revisionLiveDuration =
              latestRevision && !latestRevision.resolved_at
                ? formatBusinessDuration(calculateBusinessDuration(new Date(latestRevision.created_at), new Date(), holidays))
                : null;
            const revisionFinalDuration =
              latestRevision && latestRevision.resolved_at
                ? formatBusinessDuration(
                    calculateBusinessDuration(new Date(latestRevision.created_at), new Date(latestRevision.resolved_at), holidays),
                    true
                  )
                : null;

            const approvalState = computeApprovalState(task);
            const managerNeedsToDecide =
              isManager && task.reassigned_by_email === email && approvalState === "pending_manager";
            const adminNeedsToDecide = isAdmin && approvalState === "pending_admin";

            // Status-tinted rows (late/completed/urgent/rejected) sit on a
            // fixed light pastel regardless of theme, so their hardcoded dark
            // text stays correct. Only the plain/default row uses the themed
            // --card background, so only it needs theme-aware text color.
            const isDefaultCard =
              approvalState !== "rejected" && !completedLate && !isCompleted && !isOverdue && !task.is_urgent;

            return (
              <div
                key={task.id}
                className={`rounded-2xl border shadow-sm p-4 transition-all ${
                  approvalState === "rejected"
                    ? "bg-rose-50/50 border-rose-200"
                    : completedLate
                    ? "bg-amber-50/50 border-amber-200"
                    : isCompleted
                    ? "bg-emerald-50/50 border-emerald-200"
                    : isOverdue || task.is_urgent
                    ? "bg-rose-50/40 border-rose-200"
                    : "bg-[var(--card)] border-[var(--card-border)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold flex items-center gap-1.5 flex-wrap ${isDefaultCard ? "text-[var(--card-foreground)]" : "text-gray-800"}`}>
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
                      {approvalState === "approved" && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Approved
                        </span>
                      )}
                      {approvalState === "rejected" && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Not Delivered On Time
                        </span>
                      )}
                      {approvalState === "pending_manager" && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          Awaiting Manager Review
                        </span>
                      )}
                      {approvalState === "pending_admin" && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          Awaiting Admin Approval
                        </span>
                      )}
                      {task.revision_count > 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" /> Revised {task.revision_count}x
                        </span>
                      )}
                      {task.title}
                    </p>
                    {task.description && (
                      <p className={`text-sm mt-1 whitespace-pre-wrap ${isDefaultCard ? "text-[var(--card-muted)]" : "text-gray-600"}`}>{task.description}</p>
                    )}
                    <div className={`flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs ${isDefaultCard ? "text-[var(--card-muted)]" : "text-gray-400"}`}>
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3 h-3" /> {effectiveAssigneeName(task)}
                      </span>
                      <span>assigned by {task.assigned_by_name}</span>
                      {wasReassigned && (
                        <span className="flex items-center gap-1 text-indigo-500 font-semibold">
                          <Repeat className="w-3 h-3" /> reassigned to {task.reassigned_to_name} by{" "}
                          {task.reassigned_by_name}
                        </span>
                      )}
                      <span>{daysAgo(task.created_at)}</span>
                      {dueLabel && (
                        <span
                          className={`flex items-center gap-1 font-semibold ${
                            isOverdue || completedLate
                              ? "text-rose-600"
                              : isDefaultCard
                              ? "text-[var(--card-muted)]"
                              : "text-gray-500"
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
                      {revisionLiveDuration && (
                        <span className="flex items-center gap-1 text-violet-600 font-semibold">
                          <RotateCcw className="w-3 h-3" /> in revision {revisionLiveDuration}
                        </span>
                      )}
                      {revisionFinalDuration && (
                        <span className="flex items-center gap-1 text-violet-600 font-semibold">
                          <RotateCcw className="w-3 h-3" /> revision took {revisionFinalDuration}
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

                {isCompleted && task.late_reason && (
                  <div className="mt-3 pt-3 border-t border-amber-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1 flex items-center gap-1">
                      <MessageSquareWarning className="w-3 h-3" /> Reason for Missing Deadline
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.late_reason}</p>
                  </div>
                )}

                {isCompleted && canAssign && !isRevisingThis && (
                  <div className="mt-3 pt-3 border-t border-violet-100">
                    <button
                      type="button"
                      onClick={() => startRevision(task)}
                      className="text-sm font-bold text-violet-600 hover:text-violet-800 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" /> Request Revision
                    </button>
                  </div>
                )}

                {isCompleted && canAssign && isRevisingThis && (
                  <div className="mt-3 pt-3 border-t border-violet-100 space-y-2">
                    <textarea
                      value={revisionReasonDraft}
                      onChange={(e) => setRevisionReasonDraft(e.target.value)}
                      placeholder="What needs to be revised?"
                      rows={2}
                      autoFocus
                      className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-none bg-violet-50/40"
                    />
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-violet-700 mb-1.5">
                        <CalendarClock className="w-3.5 h-3.5" /> New Deadline (optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={revisionDueAtDraft}
                        onChange={(e) => setRevisionDueAtDraft(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-violet-50/40"
                      />
                    </div>
                    {revisionError && <p className="text-xs font-bold text-rose-600">{revisionError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => submitRevision(task.id)}
                        disabled={isSubmittingRevision || !revisionReasonDraft.trim()}
                        className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        {isSubmittingRevision ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        Send Back for Revision
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevisingId(null)}
                        disabled={isSubmittingRevision}
                        className="px-4 py-2 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {isPending && isMine && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => startTask(task.id)}
                      disabled={isStartingThis}
                      className="text-sm font-bold text-[var(--accent)] hover:opacity-80 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isStartingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Start Task
                    </button>
                    {canReassign && !isReassigningThis && (
                      <button
                        type="button"
                        onClick={() => startReassigning(task)}
                        className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
                      >
                        <Repeat className="w-4 h-4" /> Reassign
                      </button>
                    )}
                  </div>
                )}

                {canReassign && isReassigningThis && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <select
                      value={reassignToEmail}
                      onChange={(e) => setReassignToEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                    >
                      <option value="">Reassign to...</option>
                      {assignableMembers
                        .filter((m) => m.email !== email)
                        .map((m) => (
                          <option key={m.email} value={m.email}>
                            {m.name} ({m.role})
                          </option>
                        ))}
                    </select>
                    {reassignError && <p className="text-xs font-bold text-rose-600">{reassignError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => submitReassign(task.id)}
                        disabled={isReassigning || !reassignToEmail}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        {isReassigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
                        Reassign
                      </button>
                      <button
                        type="button"
                        onClick={() => setReassigningId(null)}
                        disabled={isReassigning}
                        className="px-4 py-2 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
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
                        {task.due_at && new Date() > new Date(task.due_at) && (
                          <textarea
                            value={lateReasonDraft}
                            onChange={(e) => setLateReasonDraft(e.target.value)}
                            placeholder="This is past its deadline — explain why (required)..."
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none bg-amber-50/40"
                          />
                        )}
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

                {managerNeedsToDecide && (
                  <div className="mt-3 pt-3 border-t border-amber-100 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                      {task.late_reason
                        ? "Review the reason above, then decide"
                        : "Reassigned task completed — review and decide"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => submitManagerDecision(task.id, "approved")}
                        disabled={isDecidingThis}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        {isDecidingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => submitManagerDecision(task.id, "rejected")}
                        disabled={isDecidingThis}
                        className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" /> Not Delivered On Time
                      </button>
                    </div>
                  </div>
                )}

                {adminNeedsToDecide && (
                  <div className="mt-3 pt-3 border-t border-amber-100 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                      {requiresManagerApproval(task)
                        ? `Manager ${task.manager_approval === "approved" ? "approved" : "marked this not delivered on time"} — final admin approval needed`
                        : "Review the reason above, then decide"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => submitAdminDecision(task.id, "approved")}
                        disabled={isDecidingThis}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        {isDecidingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => submitAdminDecision(task.id, "rejected")}
                        disabled={isDecidingThis}
                        className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" /> Not Delivered On Time
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredTasks.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">
              {highlightTaskId !== null
                ? "That task couldn't be found — it may have been deleted."
                : tab === "mine"
                ? "No tasks assigned to you."
                : "No tasks here."}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
