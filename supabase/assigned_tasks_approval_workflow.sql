-- Adds manager reassignment + two-step (manager, then admin) approval
-- workflow on top of the existing assigned_tasks table.
--
-- Reassignment: a manager who is the current assignee of a task can hand it
-- off to one of their own (non-manager) reports. reassigned_to_* becomes the
-- effective assignee; reassigned_by_* records which manager did it, and is
-- also what makes that manager the approver of the eventual completion.
--
-- Approval: on-time completion auto-approves (manager_approval/admin_approval
-- both resolve immediately, no manual step). Late completion requires
-- late_reason from the assignee, then manager_approval (only when the task
-- passed through a manager via reassignment — otherwise 'not_required'),
-- then admin_approval always. A task only counts as finally approved once
-- admin_approval = 'approved' and manager_approval is 'approved' or
-- 'not_required'.

alter table assigned_tasks
  add column if not exists reassigned_to_name text,
  add column if not exists reassigned_to_email text,
  add column if not exists reassigned_by_name text,
  add column if not exists reassigned_by_email text,
  add column if not exists reassigned_at timestamptz,
  add column if not exists late_reason text,
  add column if not exists manager_approval text not null default 'not_required',
  add column if not exists manager_approval_at timestamptz,
  add column if not exists manager_approval_by_name text,
  add column if not exists manager_approval_by_email text,
  add column if not exists admin_approval text not null default 'not_required',
  add column if not exists admin_approval_at timestamptz,
  add column if not exists admin_approval_by_name text,
  add column if not exists admin_approval_by_email text,
  add column if not exists approved_at timestamptz;

alter table assigned_tasks
  drop constraint if exists assigned_tasks_manager_approval_check,
  add constraint assigned_tasks_manager_approval_check
    check (manager_approval in ('not_required', 'pending', 'approved', 'rejected'));

alter table assigned_tasks
  drop constraint if exists assigned_tasks_admin_approval_check,
  add constraint assigned_tasks_admin_approval_check
    check (admin_approval in ('not_required', 'pending', 'approved', 'rejected'));

create index if not exists assigned_tasks_reassigned_to_idx
  on assigned_tasks (reassigned_to_email);

create index if not exists assigned_tasks_reassigned_by_idx
  on assigned_tasks (reassigned_by_email);
