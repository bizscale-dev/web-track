-- Lets Tasks Overview (and anywhere else showing "who") display each
-- person's profile picture instead of just an initial. Avatars are set in
-- Settings (Supabase Auth user_metadata.avatar_url) but that's only
-- readable by the user themselves — this denormalized copy on
-- team_members is what makes it visible to everyone else. Kept in sync
-- by cascadeAvatarUpdate() in app/actions.ts, same pattern as name.

alter table team_members
  add column if not exists avatar_url text;
