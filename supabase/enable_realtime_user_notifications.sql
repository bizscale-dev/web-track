-- Run this if notifications (desktop popup, bell dropdown, sidebar badge
-- dots) don't update live and only show up after a reload: Supabase
-- Realtime only streams changes for tables explicitly added to the
-- supabase_realtime publication. Row-level security (whatever policy
-- already lets each user select their own rows) still applies to realtime,
-- so no separate policy is needed here.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications'
  ) then
    alter publication supabase_realtime add table user_notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assigned_tasks'
  ) then
    alter publication supabase_realtime add table assigned_tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'production_bugs'
  ) then
    alter publication supabase_realtime add table production_bugs;
  end if;
end $$;
