-- Running counter mirrored on the task itself so the UI can show "Revised
-- 2x" without a join to task_revisions — the log table remains the source
-- of truth for the actual history/reasons/KPIs.
alter table assigned_tasks
  add column if not exists revision_count integer not null default 0;
