-- Tags each notification with what kind of event produced it, so the
-- NavDrawer can show a per-feature badge (e.g. "Website Edits" specifically)
-- instead of only the bell's one aggregate unread count. Nullable/untagged
-- for existing rows and anything that doesn't need per-feature scoping.
alter table user_notifications
  add column if not exists source text;
