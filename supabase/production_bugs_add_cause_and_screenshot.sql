-- Adds "what caused this" (a person's mistake vs. a technical/update issue
-- nobody's to blame for) and an optional screenshot, pasted in via Ctrl+V
-- rather than a file picker.

alter table production_bugs
  add column if not exists cause_type text not null default 'technical_issue',
  add column if not exists caused_by_name text,
  add column if not exists caused_by_email text,
  add column if not exists screenshot_url text;

-- Storage bucket for pasted screenshots. Public read so the image renders
-- directly in <img>/<a> tags without signed URLs; only logged-in app users
-- can upload.
insert into storage.buckets (id, name, public)
values ('bug-screenshots', 'bug-screenshots', true)
on conflict (id) do nothing;

drop policy if exists "Public read bug screenshots" on storage.objects;
create policy "Public read bug screenshots"
on storage.objects for select
using (bucket_id = 'bug-screenshots');

drop policy if exists "Authenticated upload bug screenshots" on storage.objects;
create policy "Authenticated upload bug screenshots"
on storage.objects for insert
to authenticated
with check (bucket_id = 'bug-screenshots');
