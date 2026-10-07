-- Tracks how long a revision cycle actually took: created_at is when the
-- revision was requested (task reopened), resolved_at is when the assignee
-- completed the task again. Null resolved_at means the revision is still
-- in progress. Lets the app compute turnaround time instead of just a count.
alter table task_revisions
  add column if not exists resolved_at timestamptz;
