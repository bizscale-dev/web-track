export type AssignedTaskStatus = "pending" | "in_progress" | "completed";

export type ApprovalDecision = "not_required" | "pending" | "approved" | "rejected";

export type AssignedTask = {
  id: number;
  title: string;
  description: string | null;
  assigned_to_name: string;
  assigned_to_email: string;
  assigned_by_name: string;
  assigned_by_email: string;
  status: AssignedTaskStatus;
  is_urgent: boolean;
  due_at: string | null;
  started_at: string | null;
  completion_notes: string | null;
  assignee_seen: boolean;
  admin_seen: boolean;
  created_at: string;
  completed_at: string | null;

  // Manager reassignment — set when the manager who was the effective
  // assignee hands the task off to one of their own reports. Once set,
  // reassigned_to_* is the effective assignee, and reassigned_by_* is both
  // the manager who did the handoff and the manager who reviews completion.
  reassigned_to_name: string | null;
  reassigned_to_email: string | null;
  reassigned_by_name: string | null;
  reassigned_by_email: string | null;
  reassigned_at: string | null;

  // Approval workflow — only meaningful once status is "completed".
  late_reason: string | null;
  manager_approval: ApprovalDecision;
  manager_approval_at: string | null;
  manager_approval_by_name: string | null;
  manager_approval_by_email: string | null;
  admin_approval: ApprovalDecision;
  admin_approval_at: string | null;
  admin_approval_by_name: string | null;
  admin_approval_by_email: string | null;
  approved_at: string | null;
};
