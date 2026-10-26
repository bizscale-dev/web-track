"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { dispatchTaskNotification } from "@/app/actions";
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
  Eye,
  Search,
  ClipboardList,
  ChevronRight,
} from "lucide-react";

type TeamMember = { name: string; email: string; role: string };
type Tab = "mine" | "assigned" | "all";
type WorkStatusFilter = "all" | "pending" | "in_progress" | "completed";
type QuickFilter = "all" | "mine" | "urgent" | "overdue" | "pending_review" | "approved";

type AuditEvent = {
  label: string;
  by: string;
  at: string;
  detail?: string | null;
  tone?: "default" | "success" | "warning" | "danger";
};

function daysAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

// Reconstructs a chronological handover trail for the detail panel from
// whatever timestamps the task and its revisions already carry — there's no
// separate audit-log table, so this is derived, not stored.
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
  const isDesigner = role === "designer";
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

  // Admin/Manager master-detail view only — everyone else keeps the plain
  // card list below.
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [workStatusFilter, setWorkStatusFilter] = useState<WorkStatusFilter>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  // Admin never has tasks assigned to them, so they don't get a "mine" tab —
  // default them straight into tracking what they've handed out. Managers
  // both receive work and hand it off, so they keep "mine" as the default.
  // HR and Designer have no tasks of their own at all — pure trackers, so
  // they land straight on "all".
  const tab: Tab = tabOverride ?? (isHr || isDesigner ? "all" : isAdmin ? "assigned" : "mine");
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

  // HR and Designer get the grouped-by-person overview, not this
  // assign/act-on-tasks page — send them there whichever way they arrived,
  // unless they followed a shared task link from KPIs, in which case let
  // them view that one task here (read-only, same as everything else they see).
  useEffect(() => {
    if ((isHr || isDesigner) && highlightTaskId === null) router.replace("/tasks/overview");
  }, [isHr, isDesigner, highlightTaskId, router]);

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

    const trimmedTitle = assignTitle.trim();
    const { data: inserted, error: insertError } = await supabase
      .from("assigned_tasks")
      .insert({
        title: trimmedTitle,
        description: assignDescription.trim() || null,
        assigned_to_name: assignee.name,
        assigned_to_email: assignee.email,
        assigned_by_name: name || "Unknown Operator",
        assigned_by_email: email || "",
        status: "pending",
        is_urgent: assignUrgent,
        due_at: assignDueAt ? new Date(assignDueAt).toISOString() : null,
        assignee_seen: false,
      })
      .select("id")
      .single();

    setIsAssigning(false);

    if (insertError) {
      setAssignError(insertError.message);
      return;
    }

    dispatchTaskNotification(
      assignee.email,
      `${name || "Someone"} assigned you a task: "${trimmedTitle}"`,
      `/tasks?taskId=${inserted.id}`,
      "task_assigned"
    ).catch(() => {});

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
    const task = tasks.find((t) => t.id === taskId);

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

    dispatchTaskNotification(
      assignee.email,
      `${name || "Someone"} reassigned you a task: "${task?.title || "a task"}"`,
      `/tasks?taskId=${taskId}`,
      "task_assigned"
    ).catch(() => {});

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

    const revisionAssigneeEmail = effectiveAssigneeEmail(task);
    dispatchTaskNotification(
      revisionAssigneeEmail,
      `${name || "Someone"} sent a task back for revision: "${task.title}"`,
      `/tasks?taskId=${taskId}`,
      "task_assigned"
    ).catch(() => {});

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

  const isPendingReviewState = (t: AssignedTask) => {
    const st = computeApprovalState(t);
    return st === "pending_manager" || st === "pending_admin";
  };
  const isOverdueTask = (t: AssignedTask) =>
    t.status !== "completed" && !!t.due_at && new Date(t.due_at) < new Date();
  const isMineForAdmin = (t: AssignedTask) =>
    t.assigned_by_email === email || effectiveAssigneeEmail(t) === email || t.reassigned_by_email === email;

  // Role subtitle under a person's name in the detail panel — real data
  // from team_members, not a fabricated title.
  const roleByEmail = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of teamMembers) map[m.email] = m.role;
    return map;
  }, [teamMembers]);
  const formatRole = (r: string | undefined) =>
    r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;

  const adminStats = useMemo(
    () => ({
      total: tasks.length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      pendingReview: tasks.filter(isPendingReviewState).length,
      overdue: tasks.filter(isOverdueTask).length,
    }),
    [tasks]
  );

  const quickFilterCounts = useMemo(
    () => ({
      all: tasks.length,
      mine: tasks.filter(isMineForAdmin).length,
      urgent: tasks.filter((t) => t.is_urgent).length,
      overdue: tasks.filter(isOverdueTask).length,
      pending_review: tasks.filter(isPendingReviewState).length,
      approved: tasks.filter((t) => {
        const st = computeApprovalState(t);
        return st === "approved" || st === "auto_approved";
      }).length,
    }),
    [tasks, email]
  );

  const adminVisibleTasks = useMemo(() => {
    let list = tasks;
    if (quickFilter === "mine") list = list.filter(isMineForAdmin);
    else if (quickFilter === "urgent") list = list.filter((t) => t.is_urgent);
    else if (quickFilter === "overdue") list = list.filter(isOverdueTask);
    else if (quickFilter === "pending_review") list = list.filter(isPendingReviewState);
    else if (quickFilter === "approved")
      list = list.filter((t) => {
        const st = computeApprovalState(t);
        return st === "approved" || st === "auto_approved";
      });

    if (workStatusFilter !== "all") list = list.filter((t) => t.status === workStatusFilter);
    if (assigneeFilter !== "all") list = list.filter((t) => effectiveAssigneeEmail(t) === assigneeFilter);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
      const aDone = a.status === "completed";
      const bDone = b.status === "completed";
      if (aDone !== bDone) return aDone ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [tasks, quickFilter, workStatusFilter, assigneeFilter, searchQuery, email]);

  // Keeps a task open by default (and swaps to the next visible one if the
  // current selection gets filtered out or deleted) instead of leaving the
  // panel empty whenever possible.
  useEffect(() => {
    if (!canAssign) return;
    if (selectedTaskId !== null && adminVisibleTasks.some((t) => t.id === selectedTaskId)) return;
    setSelectedTaskId(adminVisibleTasks[0]?.id ?? null);
  }, [canAssign, adminVisibleTasks, selectedTaskId]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );

  const selectedDerived = useMemo(() => {
    if (!selectedTask) return null;
    const task = selectedTask;
    const isMine = effectiveAssigneeEmail(task) === email;
    const isPending = task.status === "pending";
    const isInProgress = task.status === "in_progress";
    const isCompleted = task.status === "completed";
    const wasReassigned = !!task.reassigned_to_email;
    const canReassign = isManager && task.assigned_to_email === email && !wasReassigned && !isCompleted;
    const isOverdue = isOverdueTask(task);
    const completedLate = isCompleted && isLateCompletion(task);
    const approvalState = computeApprovalState(task);
    const managerNeedsToDecide =
      isManager && task.reassigned_by_email === email && approvalState === "pending_manager";
    const adminNeedsToDecide = isAdmin && approvalState === "pending_admin";
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
    const auditTrail = buildAuditTrail(task, taskRevisions);
    return {
      isMine,
      isPending,
      isInProgress,
      isCompleted,
      wasReassigned,
      canReassign,
      isOverdue,
      completedLate,
      approvalState,
      managerNeedsToDecide,
      adminNeedsToDecide,
      liveDuration,
      finalDuration,
      auditTrail,
    };
  }, [selectedTask, email, isManager, isAdmin, holidays, taskRevisions]);

  if (authLoading || ((isHr || isDesigner) && highlightTaskId === null)) {
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

  // Admin/Manager get a dedicated master-detail view — a filterable list on
  // the left, and a full inspector panel on the right for whichever task is
  // selected. Every other role keeps the plain card list further below.
  if (canAssign) {
    const quickFilterChips: { key: QuickFilter; label: string; count: number }[] = [
      { key: "all", label: "All Tasks", count: quickFilterCounts.all },
      { key: "mine", label: "My Tasks", count: quickFilterCounts.mine },
      { key: "urgent", label: "Urgent", count: quickFilterCounts.urgent },
      { key: "overdue", label: "Overdue", count: quickFilterCounts.overdue },
      { key: "pending_review", label: "Pending Review", count: quickFilterCounts.pending_review },
      { key: "approved", label: "Approved", count: quickFilterCounts.approved },
    ];
    const filtersActive =
      !!searchQuery || assigneeFilter !== "all" || workStatusFilter !== "all" || quickFilter !== "all";

    return (
      <main className="max-w-[1600px] mx-auto w-full p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)]">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[var(--bg-foreground)]">Tasks &amp; Approvals</h1>
              <p className="text-[var(--bg-muted)] text-sm mt-1">
                Track every task, assignee, deadline, and approval sign-off.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAssignForm((v) => !v)}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-blue-600 text-white text-sm font-bold shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] transition hover:bg-blue-700 hover:-translate-y-0.5 shrink-0"
          >
            <Plus className="w-4 h-4" /> Assign Task
          </button>
        </div>

        {showAssignForm && (
          <div className="bg-[var(--card)] border border-[var(--accent)]/30 rounded-2xl shadow-sm p-5 mb-6 space-y-3 max-w-xl">
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4 flex items-center justify-between gap-3 transition hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Total Tasks</p>
              <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{adminStats.total}</p>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white shrink-0">
              <ClipboardList className="w-5 h-5" />
            </span>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4 flex items-center justify-between gap-3 transition hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">In Progress</p>
              <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{adminStats.inProgress}</p>
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white shrink-0">
              <Timer className="w-5 h-5" />
            </span>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4 flex items-center justify-between gap-3 transition hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Pending Review</p>
              <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{adminStats.pendingReview}</p>
              {adminStats.pendingReview > 0 && (
                <p className="text-[10px] font-semibold text-amber-600 mt-0.5">Sign-off required</p>
              )}
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500 text-white shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4 flex items-center justify-between gap-3 transition hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Overdue</p>
              <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{adminStats.overdue}</p>
              {adminStats.overdue > 0 && (
                <p className="text-[10px] font-semibold text-rose-600 mt-0.5">Immediate action</p>
              )}
            </div>
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-600 text-white shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(15,23,42,0.1)] p-4 mb-5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks by title or description..."
                className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-full bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] focus:bg-white transition-colors"
              />
            </div>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="all">Assignee: All</option>
              {teamMembers.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={workStatusFilter}
              onChange={(e) => setWorkStatusFilter(e.target.value as WorkStatusFilter)}
              className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="all">Status: All</option>
              <option value="pending">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {quickFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setQuickFilter(chip.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  quickFilter === chip.key
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {(chip.key === "urgent" || chip.key === "overdue" || chip.key === "pending_review") && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      chip.key === "pending_review" ? "bg-amber-500" : "bg-rose-500"
                    }`}
                  />
                )}
                {chip.label} {chip.count}
              </button>
            ))}
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setAssigneeFilter("all");
                  setWorkStatusFilter("all");
                  setQuickFilter("all");
                }}
                className="text-xs font-bold text-[var(--accent)] hover:opacity-80 px-2"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--bg-muted)] mb-2">
              Showing {adminVisibleTasks.length} of {tasks.length} tasks
            </p>

            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
              </div>
            ) : error ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
            ) : (
              <div className="space-y-2.5">
                {adminVisibleTasks.map((task) => {
                  const isSelected = task.id === selectedTaskId;
                  const isCompleted = task.status === "completed";
                  const isInProgress = task.status === "in_progress";
                  const approvalState = computeApprovalState(task);
                  const isOverdue = isOverdueTask(task);
                  const completedLate = isCompleted && isLateCompletion(task);

                  const accentBorder = isSelected
                    ? "border-l-[var(--accent)]"
                    : approvalState === "rejected"
                    ? "border-l-rose-500"
                    : completedLate
                    ? "border-l-amber-500"
                    : isCompleted
                    ? "border-l-emerald-500"
                    : isOverdue || task.is_urgent
                    ? "border-l-rose-500"
                    : "border-l-slate-200";
                  // border-l-4 sets only border-left-color; the frame sides
                  // are set independently (border-t/r/b) so the two never
                  // fight over the single "border-color" shorthand.
                  const frameBorder = isSelected
                    ? "border-t-[var(--accent)] border-r-[var(--accent)] border-b-[var(--accent)] ring-2 ring-[var(--accent)]/20"
                    : "border-t-[var(--card-border)] border-r-[var(--card-border)] border-b-[var(--card-border)] hover:border-r-[var(--accent)]/40";

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`w-full text-left rounded-2xl border-t border-r border-b border-l-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_18px_-10px_rgba(15,23,42,0.1)] p-4 transition-all bg-[var(--card)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)] ${accentBorder} ${frameBorder}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-[var(--accent-text)] text-xs font-bold shrink-0 shadow-sm ring-2 ring-white mt-0.5">
                            {effectiveAssigneeName(task).charAt(0).toUpperCase() || "?"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5 flex-wrap">
                                {task.is_urgent && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-rose-100 text-rose-600 flex items-center gap-1">
                                    <Flame className="w-3 h-3" /> Urgent
                                  </span>
                                )}
                                {completedLate && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Late
                                  </span>
                                )}
                                {approvalState === "pending_manager" && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-amber-100 text-amber-700">
                                    Awaiting Manager Review
                                  </span>
                                )}
                                {approvalState === "pending_admin" && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-amber-100 text-amber-700">
                                    Pending Review
                                  </span>
                                )}
                                {(approvalState === "approved" || approvalState === "auto_approved") && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Approved
                                  </span>
                                )}
                                {approvalState === "rejected" && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded-full bg-rose-100 text-rose-700">
                                    Not On Time
                                  </span>
                                )}
                              </p>
                              <span className="text-[10px] font-mono text-slate-300 shrink-0">TSK-{task.id}</span>
                            </div>
                            <p className="text-sm font-bold text-[var(--card-foreground)] truncate">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-[var(--card-muted)] mt-0.5 truncate">{task.description}</p>
                            )}
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-[var(--card-muted)]">
                              <span className="font-semibold text-[var(--card-foreground)]">{effectiveAssigneeName(task)}</span>
                              <span>assigned by {task.assigned_by_name}</span>
                              {task.due_at && (
                                <span className={isOverdue ? "text-rose-600 font-semibold" : ""}>
                                  Due {formatDateTime(task.due_at)}
                                </span>
                              )}
                            </div>
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
                          <ChevronRight className={`w-4 h-4 ${isSelected ? "text-[var(--accent)]" : "text-slate-300"}`} />
                        </div>
                      </div>
                    </button>
                  );
                })}
                {adminVisibleTasks.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-10">No tasks match these filters.</p>
                )}
              </div>
            )}
          </div>

          <div className="lg:sticky lg:top-[calc(var(--app-header-h,96px)+16px)] min-w-0">
            {selectedTask && selectedDerived ? (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_48px_-16px_rgba(15,23,42,0.18)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--card-border)] bg-slate-50/80">
                  <span className="text-xs font-bold text-slate-500 font-mono tracking-wide">
                    TSK-{selectedTask.id} · Task Inspector
                  </span>
                  {(isAdmin || isManager) && selectedTask.assigned_by_email === email && (
                    <button
                      type="button"
                      onClick={() => deleteTask(selectedTask.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 ${
                          selectedDerived.isCompleted
                            ? "text-emerald-600 bg-emerald-50 border border-emerald-100"
                            : selectedDerived.isInProgress
                            ? "text-blue-600 bg-blue-50 border border-blue-100"
                            : "text-amber-600 bg-amber-50 border border-amber-100"
                        }`}
                      >
                        {selectedDerived.isCompleted
                          ? "Completed"
                          : selectedDerived.isInProgress
                          ? "In Progress"
                          : "Not Started"}
                      </span>
                      {selectedDerived.isOverdue && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-100">
                          <AlertTriangle className="w-3 h-3" /> Overdue
                        </span>
                      )}
                    </div>
                    {selectedTask.description && (
                      <p className="text-sm text-[var(--card-muted)] mt-3 whitespace-pre-wrap">
                        {selectedTask.description}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)] mb-1.5">
                        Current Assignee
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-[var(--accent-text)] text-xs font-bold shrink-0 shadow-sm ring-2 ring-white">
                          {effectiveAssigneeName(selectedTask).charAt(0).toUpperCase() || "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--card-foreground)] truncate">
                            {effectiveAssigneeName(selectedTask)}
                          </p>
                          {formatRole(roleByEmail[effectiveAssigneeEmail(selectedTask)]) && (
                            <p className="text-[11px] text-[var(--card-muted)] truncate">
                              {formatRole(roleByEmail[effectiveAssigneeEmail(selectedTask)])}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)] mb-1.5">
                        Approval Manager
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xs font-bold shrink-0 shadow-sm ring-2 ring-white">
                          {(selectedTask.reassigned_by_name || "Admin").charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--card-foreground)] truncate">
                            {selectedTask.reassigned_by_name || "Admin"}
                          </p>
                          {selectedTask.reassigned_by_email && formatRole(roleByEmail[selectedTask.reassigned_by_email]) && (
                            <p className="text-[11px] text-[var(--card-muted)] truncate">
                              {formatRole(roleByEmail[selectedTask.reassigned_by_email])}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)] mb-1">
                        Assigned By
                      </p>
                      <p className="text-sm font-bold text-[var(--card-foreground)]">{selectedTask.assigned_by_name}</p>
                      <p className="text-xs text-[var(--card-muted)]">{formatDateTime(selectedTask.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)] mb-1">
                        Scheduled Deadline
                      </p>
                      {selectedTask.due_at ? (
                        <p
                          className={`text-sm font-bold flex items-center gap-1 ${
                            selectedDerived.isOverdue || selectedDerived.completedLate
                              ? "text-rose-600"
                              : "text-[var(--card-foreground)]"
                          }`}
                        >
                          {(selectedDerived.isOverdue || selectedDerived.completedLate) && (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {formatDateTime(selectedTask.due_at)}
                        </p>
                      ) : (
                        <p className="text-sm text-[var(--card-muted)]">No deadline set</p>
                      )}
                    </div>
                  </div>

                  {(selectedDerived.liveDuration || selectedDerived.finalDuration) && (
                    <div className="flex gap-3 text-xs font-semibold">
                      {selectedDerived.liveDuration && (
                        <span className="text-blue-600 flex items-center gap-1">
                          <Timer className="w-3.5 h-3.5" /> {selectedDerived.liveDuration} elapsed
                        </span>
                      )}
                      {selectedDerived.finalDuration && (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <Timer className="w-3.5 h-3.5" /> took {selectedDerived.finalDuration}
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)] mb-2">
                      Handover Audit Trail
                    </p>
                    <div>
                      {selectedDerived.auditTrail.map((ev, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center shrink-0">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ring-4 ring-[var(--card)] ${
                                ev.tone === "success"
                                  ? "bg-emerald-500 text-white"
                                  : ev.tone === "danger"
                                  ? "bg-rose-500 text-white"
                                  : ev.tone === "warning"
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-400 text-white"
                              }`}
                            >
                              {i + 1}
                            </span>
                            {i < selectedDerived.auditTrail.length - 1 && (
                              <span className="w-px flex-1 bg-gradient-to-b from-slate-200 to-slate-100 mt-1" />
                            )}
                          </div>
                          <div className="pb-4 flex-1 min-w-0">
                            <p className="text-sm font-bold text-[var(--card-foreground)]">{ev.label}</p>
                            <p className="text-xs text-[var(--card-muted)]">
                              {ev.by} · {formatDateTime(ev.at)}
                            </p>
                            {ev.detail && (
                              <p className="text-xs text-[var(--card-muted)] mt-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 whitespace-pre-wrap">
                                {ev.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(selectedTask.completion_notes || selectedTask.late_reason) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--card-muted)] mb-2">
                        Submission Deliverables
                      </p>
                      {selectedTask.completion_notes && (
                        <div className="mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                            Completion Notes
                          </p>
                          <p className="text-sm text-[var(--card-foreground)] bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                            {selectedTask.completion_notes}
                          </p>
                        </div>
                      )}
                      {selectedTask.late_reason && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1 flex items-center gap-1">
                            <MessageSquareWarning className="w-3 h-3" /> Mandatory Late Submission Reason
                          </p>
                          <p className="text-sm text-[var(--card-foreground)] bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                            {selectedTask.late_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-[var(--card-border)] pt-4 space-y-3">
                    {selectedDerived.managerNeedsToDecide && (
                      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-50/60 border border-amber-200/80 p-4 space-y-2.5 shadow-sm">
                        <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" /> Manager Sign-Off Required
                        </p>
                        <p className="text-xs text-amber-700/80">
                          {selectedTask.late_reason
                            ? "Review the reason above, then decide."
                            : "Reassigned task completed — review and decide."}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => submitManagerDecision(selectedTask.id, "approved")}
                            disabled={decidingId === selectedTask.id}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-all hover:-translate-y-0.5 shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)] flex items-center gap-1.5"
                          >
                            {decidingId === selectedTask.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-4 h-4" />
                            )}
                            Approve &amp; Close
                          </button>
                          <button
                            type="button"
                            onClick={() => submitManagerDecision(selectedTask.id, "rejected")}
                            disabled={decidingId === selectedTask.id}
                            className="px-4 py-2 bg-white text-rose-600 border-2 border-rose-200 rounded-full text-sm font-bold hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 transition-all flex items-center gap-1.5"
                          >
                            <XCircle className="w-4 h-4" /> Not Delivered On Time
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedDerived.adminNeedsToDecide && (
                      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-50/60 border border-amber-200/80 p-4 space-y-2.5 shadow-sm">
                        <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" /> Admin Sign-Off Required
                        </p>
                        <p className="text-xs text-amber-700/80">
                          {requiresManagerApproval(selectedTask)
                            ? `Manager ${
                                selectedTask.manager_approval === "approved"
                                  ? "approved"
                                  : "marked this not delivered on time"
                              } — final admin approval needed.`
                            : "Review the reason above, then decide."}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => submitAdminDecision(selectedTask.id, "approved")}
                            disabled={decidingId === selectedTask.id}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-all hover:-translate-y-0.5 shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)] flex items-center gap-1.5"
                          >
                            {decidingId === selectedTask.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-4 h-4" />
                            )}
                            Approve &amp; Close
                          </button>
                          <button
                            type="button"
                            onClick={() => submitAdminDecision(selectedTask.id, "rejected")}
                            disabled={decidingId === selectedTask.id}
                            className="px-4 py-2 bg-white text-rose-600 border-2 border-rose-200 rounded-full text-sm font-bold hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 transition-all flex items-center gap-1.5"
                          >
                            <XCircle className="w-4 h-4" /> Not Delivered On Time
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedDerived.isPending && selectedDerived.isMine && (
                      <div className="flex flex-wrap items-center gap-4">
                        <button
                          type="button"
                          onClick={() => startTask(selectedTask.id)}
                          disabled={startingId === selectedTask.id}
                          className="text-sm font-bold text-[var(--accent)] hover:opacity-80 flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {startingId === selectedTask.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Start Task
                        </button>
                        {selectedDerived.canReassign && reassigningId !== selectedTask.id && (
                          <button
                            type="button"
                            onClick={() => startReassigning(selectedTask)}
                            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
                          >
                            <Repeat className="w-4 h-4" /> Reassign
                          </button>
                        )}
                      </div>
                    )}

                    {selectedDerived.canReassign && reassigningId === selectedTask.id && (
                      <div className="space-y-2">
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
                            onClick={() => submitReassign(selectedTask.id)}
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

                    {selectedDerived.isInProgress && selectedDerived.isMine && (
                      <div>
                        {completingId === selectedTask.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={completionNotesDraft}
                              onChange={(e) => setCompletionNotesDraft(e.target.value)}
                              placeholder="Add notes about how this was completed..."
                              rows={3}
                              autoFocus
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                            />
                            {selectedTask.due_at && new Date() > new Date(selectedTask.due_at) && (
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
                                onClick={() => submitComplete(selectedTask.id)}
                                disabled={isCompleting || !completionNotesDraft.trim()}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-all hover:-translate-y-0.5 shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)] flex items-center gap-1.5"
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
                            onClick={() => startCompleting(selectedTask)}
                            className="text-sm font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Mark Complete
                          </button>
                        )}
                      </div>
                    )}

                    {selectedDerived.isCompleted && !isSubmittingRevision && revisingId !== selectedTask.id && (
                      <button
                        type="button"
                        onClick={() => startRevision(selectedTask)}
                        className="text-sm font-bold text-violet-600 hover:text-violet-800 flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-4 h-4" /> Request Revision
                      </button>
                    )}

                    {selectedDerived.isCompleted && revisingId === selectedTask.id && (
                      <div className="space-y-2">
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
                            onClick={() => submitRevision(selectedTask.id)}
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
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(15,23,42,0.1)] p-10 text-center text-sm text-[var(--card-muted)]">
                Select a task to view its full details.
              </div>
            )}
          </div>
        </div>
      </main>
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
            <h1 className="text-3xl font-bold text-[var(--bg-foreground)] flex items-center gap-2.5 flex-wrap">
              Tasks
              {isDesigner && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                  <Eye className="w-3 h-3" /> View Only
                </span>
              )}
            </h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">
              {canAssign
                ? "Assign tasks and track completion notes"
                : isHr || isDesigner
                ? "Track every task and its approval status"
                : "Tasks assigned to you"}
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
            href={isHr || isDesigner ? "/tasks/overview" : "/tasks"}
            className="font-bold text-[var(--accent)] hover:opacity-80 shrink-0"
          >
            {isHr || isDesigner ? "Back to Tasks Overview" : "View all tasks"}
          </Link>
        </div>
      )}

      <div className={`inline-flex rounded-2xl bg-slate-100/95 p-1 border border-slate-200/40 shadow-inner mb-6 ${highlightTaskId !== null ? "hidden" : ""}`}>
        {!isAdmin && !isHr && !isDesigner && (
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
        {(isAdmin || isHr || isDesigner) && (
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
