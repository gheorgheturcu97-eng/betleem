-- 🔔 Notifications on the phone (Web Push) when someone is placed in a service.
-- push_subs: each phone/laptop that said "yes" (only its owner reads or deletes it).
-- push_sent: what was already announced (once per person, service and place), read only by the functions.
-- app_secrets: server-side keys (the private Web Push key); nobody reads it through the API, only the functions.
create table if not exists public.push_subs (
  endpoint   text primary key check (endpoint like 'https://%' and length(endpoint) < 1000),
  user_id    uuid not null references auth.users(id) on delete cascade,
  keys       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);
alter table public.push_subs enable row level security;
create policy push_subs_own on public.push_subs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_subs from anon, authenticated;
grant select, insert, update, delete on public.push_subs to authenticated;
grant select, delete on public.push_subs to service_role;

create table if not exists public.push_sent (
  church_id  uuid not null references public.churches(id) on delete cascade,
  person_id  text not null,
  service_id text not null,
  place      text not null,
  at         timestamptz not null default now(),
  primary key (church_id, person_id, service_id, place)
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;
grant select, insert, update on public.push_sent to service_role;

create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
grant select, insert, update on public.app_secrets to service_role;
grant select on public.members, public.plans to service_role;
