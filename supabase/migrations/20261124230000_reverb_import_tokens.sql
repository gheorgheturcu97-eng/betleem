-- One-time keys for sending a church's song library to Reverb (from the desktop app or by the admin).
-- Only the SHA-256 of the key is kept; nobody can read this table through the API (RLS on, no policies);
-- only the reverb-import function (service role) uses it, and a key works once and for a short time.
create table if not exists public.import_tokens (
  token_hash  text primary key check (length(token_hash) = 64),
  church_id   uuid not null references public.churches(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '2 hours',
  used_at     timestamptz
);
alter table public.import_tokens enable row level security;
revoke all on public.import_tokens from anon, authenticated;
grant select, update, delete on public.import_tokens to service_role;
grant select, insert, update on public.songs to service_role;
