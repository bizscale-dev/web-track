import type { AssignedTask } from "@/type/assignedTask";

// The effective assignee is whoever currently owns the task — the original
// assignee, unless a manager has since reassigned it to one of their reports.
export function effectiveAssigneeName(task: AssignedTask): string {
  return task.reassigned_to_name || task.assigned_to_name;
}
export function effectiveAssigneeEmail(task: AssignedTask): string {
  return task.reassigned_to_email || task.assigned_to_email;
}

export function isLateCompletion(task: AssignedTask): boolean {
  return !!task.due_at && !!task.completed_at && new Date(task.completed_at) > new Date(task.due_at);
}

// A task only involves a manager-approval step if a manager reassigned it —
// that manager is reviewing their report's work, not their own.
export function requiresManagerApproval(task: AssignedTask): boolean {
  return !!task.reassigned_by_email;
}

export type ApprovalState = "auto_approved" | "pending_manager" | "pending_admin" | "approved" | "rejected";

export function computeApprovalState(task: AssignedTask): ApprovalState | null {
  if (task.status !== "completed") return null;

  const needsManager = requiresManagerApproval(task);
  // On-time completion only skips review when there's no manager in the
  // chain — a reassigned task always needs its manager to vouch for the
  // report's work, even if it came in on time.
  if (!isLateCompletion(task) && !needsManager) return "auto_approved";

  if (task.manager_approval === "rejected" || task.admin_approval === "rejected") return "rejected";
  if (task.admin_approval === "approved" && (task.manager_approval === "approved" || task.manager_approval === "not_required")) {
    return "approved";
  }
  if (needsManager && task.manager_approval === "pending") return "pending_manager";
  if (task.admin_approval === "pending") return "pending_admin";
  return "pending_manager";
}
