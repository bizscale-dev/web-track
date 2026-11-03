-- Profile picture uploads (UserProfileSettings.tsx) go to an "avatars"
-- bucket and use getPublicUrl(), but that bucket never got a public-read
-- policy, so the resulting URL 403s and the <img> never loads anywhere
-- the avatar is shown (e.g. Tasks Overview). Same pattern as
-- bug-screenshots in production_bugs_add_cause_and_screenshot.sql.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Authenticated upload avatars" on storage.objects;
create policy "Authenticated upload avatars"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars');
