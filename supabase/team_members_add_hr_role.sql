-- Widens team_members_role_check to allow the new read-only "hr" role
-- (tracker access to Tasks + EOD Overview only — see app/admin/page.tsx
-- role dropdowns and components/NavDrawer.tsx).
--
-- The existing constraint's exact allowed list isn't in this repo (the
-- team_members table itself was created directly in Supabase, not via a
-- checked-in migration), so this drops whatever it currently is and
-- recreates it with the full known role set, admin included.

alter table team_members
  drop constraint if exists team_members_role_check;

alter table team_members
  add constraint team_members_role_check
    check (role in (
      'admin',
      'manager',
      'developer',
      'content_writer',
      'seo_person',
      'support',
      'hr'
    ));
