-- Drives the notification dot for the developer a bug is assigned to.
-- Default true so existing/backfilled rows don't suddenly look "new" —
-- only newly inserted bugs are explicitly set to false.
alter table production_bugs
  add column if not exists developer_seen boolean not null default true;
