-- Reverb online: churches, networks, members with roles, the song library and the program (as one document).
-- Plan: docs/PLANIFICARE-ONLINE.md. Rules live HERE (row level security), not only in the pages:
--   * a church sees only its own data;
--   * the churches of a network also read the network's library (the songs of its library church), never write them;
--   * phone numbers are in a separate table, read only by coordinators and leaders of that church;
--   * nothing is readable without an account; invites are redeemed by an Edge Function (service role), never by pages.

-- ------------------------------------------------------------------ churches and networks
create table public.networks (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(name) between 1 and 80),
  library_church   uuid,                       -- whose songs the whole network reads (Betleem for its network)
  created_at       timestamptz not null default now()
);

create table public.churches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 80),
  city        text check (city is null or length(city) <= 80),
  network_id  uuid references public.networks(id) on delete set null,
  logo_url    text,
  created_at  timestamptz not null default now()
);
alter table public.networks add constraint networks_library_church_fk
  foreign key (library_church) references public.churches(id) on delete set null;

-- who runs Reverb itself (the owner): can create churches and networks
create table public.reverb_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ------------------------------------------------------------------ members (one row per person per church)
--   coordinator : everything in that church (people, roles, links)
--   leader      : the program and the team (with phone numbers) of the church
--   member      : reads the program, answers his own assignments
create table public.members (
  church_id    uuid not null references public.churches(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('coordinator', 'leader', 'member')),
  department   text check (department is null or length(department) <= 60),
  person_id    text check (person_id is null or length(person_id) <= 80),   -- the person in the program document
  display_name text check (display_name is null or length(display_name) <= 80),
  created_at   timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index members_user_idx on public.members (user_id);

-- ------------------------------------------------------------------ helper checks (security definer: read members without RLS loops)
create or replace function public.is_reverb_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reverb_admins where user_id = (select auth.uid())) $$;

create or replace function public.role_rank(r text) returns int
language sql immutable set search_path = '' as $$
  select case r when 'coordinator' then 3 when 'leader' then 2 when 'member' then 1 else 0 end $$;

-- the caller has at least this role in that church
create or replace function public.has_role(c uuid, min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m
    where m.church_id = c and m.user_id = (select auth.uid())
      and public.role_rank(m.role) >= public.role_rank(min_role)) $$;

-- the caller may read the songs of church c: his own church, or the library church of a network he belongs to
create or replace function public.can_read_songs_of(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(c, 'member') or exists (
    select 1 from public.members m
      join public.churches mine on mine.id = m.church_id
      join public.networks n on n.id = mine.network_id
    where m.user_id = (select auth.uid()) and n.library_church = c) $$;

-- the networks the caller's churches belong to (definer: no RLS loop on churches)
create or replace function public.my_networks() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct c.network_id from public.churches c join public.members m on m.church_id = c.id
  where m.user_id = (select auth.uid()) and c.network_id is not null $$;

revoke all on function public.is_reverb_admin(), public.has_role(uuid, text), public.can_read_songs_of(uuid), public.my_networks() from public, anon;
grant execute on function public.is_reverb_admin(), public.has_role(uuid, text), public.can_read_songs_of(uuid), public.my_networks(), public.role_rank(text) to authenticated;

-- ------------------------------------------------------------------ songs (lyrics: copyrighted, only for the church and its network)
create table public.songs (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  local_id     text,                                  -- the song's id in the desktop app
  title        text not null check (length(title) between 1 and 200),
  author       text,
  key          text,
  bpm          numeric,
  body         text not null default '',
  arrangement  jsonb,
  tags         text[] not null default '{}',
  ccli         text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (church_id, local_id)
);
create index songs_church_idx on public.songs (church_id);

-- ------------------------------------------------------------------ the program of a church, as one document (same plan.js as the app)
-- no phone numbers inside it (they are in people_private)
create table public.plans (
  church_id   uuid primary key references public.churches(id) on delete cascade,
  doc         jsonb not null default '{}'::jsonb,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- every change as a small operation: history, and how the computers catch up
create table public.plan_ops (
  id         bigint generated always as identity primary key,
  church_id  uuid not null references public.churches(id) on delete cascade,
  op         jsonb not null,
  user_id    uuid references auth.users(id) on delete set null,
  at         timestamptz not null default now()
);
create index plan_ops_church_idx on public.plan_ops (church_id, id);

-- phone numbers and e-mails: only coordinators and leaders of that church
create table public.people_private (
  church_id  uuid not null references public.churches(id) on delete cascade,
  person_id  text not null check (length(person_id) <= 80),
  phone      text check (phone is null or length(phone) <= 40),
  email      text check (email is null or length(email) <= 120),
  updated_at timestamptz not null default now(),
  primary key (church_id, person_id)
);

-- personal links: only the fingerprint (sha-256) of the link is kept, never the link
create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  token_hash    text not null unique check (length(token_hash) = 64),
  role          text not null check (role in ('coordinator', 'leader', 'member')),
  department    text,
  person_id     text,
  display_name  text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  user_id       uuid references auth.users(id) on delete set null,   -- the account it opened (one per person)
  last_used_at  timestamptz
);
create index invites_church_idx on public.invites (church_id);

-- ------------------------------------------------------------------ row level security
alter table public.networks       enable row level security;
alter table public.churches       enable row level security;
alter table public.reverb_admins  enable row level security;
alter table public.members        enable row level security;
alter table public.songs          enable row level security;
alter table public.plans          enable row level security;
alter table public.plan_ops       enable row level security;
alter table public.people_private enable row level security;
alter table public.invites        enable row level security;

-- churches: your own churches, the churches of your network (names only matter), everything for the Reverb admin
create policy churches_read on public.churches for select to authenticated using (
  public.is_reverb_admin() or public.has_role(id, 'member')
  or network_id in (select public.my_networks()));
create policy churches_admin on public.churches for all to authenticated
  using (public.is_reverb_admin()) with check (public.is_reverb_admin());
create policy churches_coord_update on public.churches for update to authenticated
  using (public.has_role(id, 'coordinator')) with check (public.has_role(id, 'coordinator'));

create policy networks_read on public.networks for select to authenticated using (
  public.is_reverb_admin() or id in (select public.my_networks()));
create policy networks_admin on public.networks for all to authenticated
  using (public.is_reverb_admin()) with check (public.is_reverb_admin());

create policy reverb_admins_self on public.reverb_admins for select to authenticated using (user_id = (select auth.uid()));

-- members: you see the people of your church; coordinators manage them
create policy members_read on public.members for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role(church_id, 'member') or public.is_reverb_admin());
create policy members_manage on public.members for all to authenticated
  using (public.has_role(church_id, 'coordinator') or public.is_reverb_admin())
  with check (public.has_role(church_id, 'coordinator') or public.is_reverb_admin());

-- songs: read = your church or your network's library; write = leaders of the song's own church
create policy songs_read on public.songs for select to authenticated using (public.can_read_songs_of(church_id));
create policy songs_write on public.songs for insert to authenticated with check (public.has_role(church_id, 'leader'));
create policy songs_update on public.songs for update to authenticated
  using (public.has_role(church_id, 'leader')) with check (public.has_role(church_id, 'leader'));
create policy songs_delete on public.songs for delete to authenticated using (public.has_role(church_id, 'leader'));

-- the program: members read; leaders write
create policy plans_read on public.plans for select to authenticated using (public.has_role(church_id, 'member'));
create policy plans_write on public.plans for insert to authenticated with check (public.has_role(church_id, 'leader'));
create policy plans_update on public.plans for update to authenticated
  using (public.has_role(church_id, 'leader')) with check (public.has_role(church_id, 'leader'));

create policy plan_ops_read on public.plan_ops for select to authenticated using (public.has_role(church_id, 'member'));
create policy plan_ops_write on public.plan_ops for insert to authenticated
  with check (public.has_role(church_id, 'leader') and user_id = (select auth.uid()));

-- phone numbers: coordinators and leaders only
create policy people_private_rw on public.people_private for all to authenticated
  using (public.has_role(church_id, 'leader')) with check (public.has_role(church_id, 'leader'));

-- invites: coordinators see and cancel them (the link itself is never stored)
create policy invites_coord on public.invites for all to authenticated
  using (public.has_role(church_id, 'coordinator')) with check (public.has_role(church_id, 'coordinator'));

-- ------------------------------------------------------------------ API access: only signed-in people, only these tables
revoke all on public.networks, public.churches, public.reverb_admins, public.members, public.songs, public.plans,
  public.plan_ops, public.people_private, public.invites from anon, authenticated;
grant select, insert, update, delete on public.networks, public.churches to authenticated;
grant select on public.reverb_admins to authenticated;
grant select, insert, update, delete on public.members, public.songs, public.people_private, public.invites to authenticated;
grant select, insert, update on public.plans to authenticated;
grant select, insert on public.plan_ops to authenticated;
