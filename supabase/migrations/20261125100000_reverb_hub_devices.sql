-- The church computer (Reverb on the Mac mini) linked to Reverb online: one key per computer, made by a coordinator
-- on the web page and pasted once into the app. Only the SHA-256 of the key is kept. Nobody reads this table through
-- the API (RLS on, no policies): only the reverb-link (makes keys) and reverb-hub (uses them) functions.
create table if not exists public.hub_devices (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  token_hash  text not null unique check (length(token_hash) = 64),
  name        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz,
  revoked_at  timestamptz
);
alter table public.hub_devices enable row level security;
revoke all on public.hub_devices from anon, authenticated;
grant select, insert, update on public.hub_devices to service_role;
grant select, update on public.churches to service_role;
grant select on public.departments to service_role;
