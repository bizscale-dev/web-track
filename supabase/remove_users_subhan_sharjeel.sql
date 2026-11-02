-- Removes all data tied to subhan@businessupscalers.com and
-- sharjeel@businessupscalers.com from every table that references them.
--
-- Run this FIRST or AFTER using the "Delete" (trash icon) button on the
-- Admin > Command Center team list for each of these two people — that
-- button removes their Supabase Auth account + team_members row, but does
-- NOT touch the historical rows below, which would otherwise be left
-- pointing at an email that no longer has an account.
--
-- Review before running — these deletes are permanent. Run in the Supabase
-- SQL editor.

do $$
declare
  target_emails text[] := array['subhan@businessupscalers.com', 'sharjeel@businessupscalers.com'];
begin
  -- Task revisions they were the assignee on
  delete from task_revisions where assignee_email = any(target_emails);

  -- Production bugs assigned to them as developer
  delete from production_bugs where developer_email = any(target_emails);

  -- EOD reports (eod_entries cascade-delete via the report_id FK)
  delete from eod_reports where team_member_email = any(target_emails);

  -- Assigned tasks: delete tasks they created, and clear their
  -- assignment/reassignment/approval fields on tasks created by others
  delete from assigned_tasks where assigned_by_email = any(target_emails);

  update assigned_tasks
  set reassigned_to_name = null,
      reassigned_to_email = null,
      reassigned_at = null
  where reassigned_to_email = any(target_emails);

  update assigned_tasks
  set reassigned_by_name = null,
      reassigned_by_email = null
  where reassigned_by_email = any(target_emails);

  update assigned_tasks
  set manager_approval_by_name = null,
      manager_approval_by_email = null
  where manager_approval_by_email = any(target_emails);

  update assigned_tasks
  set admin_approval_by_name = null,
      admin_approval_by_email = null
  where admin_approval_by_email = any(target_emails);

  -- Any remaining tasks still assigned_to one of these emails as the
  -- primary (non-reassigned) assignee: delete them too, since there's no
  -- one left to own them.
  delete from assigned_tasks where assigned_to_email = any(target_emails);

  -- team_members / auth.users: leave to the Admin page's delete button,
  -- which also removes the Supabase Auth account cleanly.
  delete from team_members where email = any(target_emails);
end $$;

-- websites.developer / content_writer / seo_person store NAMES, not emails,
-- and reassigning those to someone else is a judgment call this script
-- won't make for you. Check for leftover assignments with:
--   select id, name, developer, content_writer, seo_person from websites
--   where developer in ('Subhan', 'Sharjeel')
--      or content_writer in ('Subhan', 'Sharjeel')
--      or seo_person in ('Subhan', 'Sharjeel');
-- (swap in their actual display names from team_members before they're
-- deleted) and reassign those websites to someone else manually.
