-- Widens team_members_role_check to allow the new read-only "designer" role
-- (view-only access to Tasks Overview only, no edit/delete anywhere — see
-- app/admin/page.tsx role dropdowns and components/NavDrawer.tsx).

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
      'hr',
      'designer'
    ));
