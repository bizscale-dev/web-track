export type TaskRevision = {
  id: number;
  task_id: number;
  task_title: string;
  assignee_name: string;
  assignee_email: string;
  requested_by_name: string;
  requested_by_email: string;
  reason: string;
  created_at: string;
  // When the assignee completed the task again after this revision was
  // requested — null while the revision is still in progress.
  resolved_at: string | null;
};
