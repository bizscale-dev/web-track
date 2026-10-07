-- Last-known content fingerprint per Website Edits doc tab (= per site),
-- so the hourly poll (app/api/website-edits-poll/route.ts) can tell whether
-- a tab changed since it last checked — including edits made directly in
-- Google Docs, which our app's own "Add entry" button never sees.
create table if not exists website_edits_doc_state (
  tab_id text primary key,
  tab_title text not null,
  content_hash text not null,
  updated_at timestamptz not null default now()
);
