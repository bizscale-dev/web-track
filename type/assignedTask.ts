export type AssignedTaskStatus = "pending" | "in_progress" | "completed";

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
};
