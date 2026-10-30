-- Lets an admin/manager extend an overdue EOD draft's deadline so it stops
-- showing as "Past Due" / counting toward Action Required.
-- Run this in the Supabase SQL editor.

alter table eod_reports
  add column if not exists extended_due_at timestamptz;
