-- Bethlehem Network Churches — full database schema (Supabase / Postgres)
-- One shared database for the whole network. Each church only sees its own data,
-- except the shared song library and network-level meeting/objectives.
--
-- Roles per church:
--   leader   : everything in that church (plan, people, teams, contacts)
--   operator : edit songs/lyrics and slide arrangements, run screens; cannot change the order
--   musician : read everything in that church, add notes, sign up for slots
-- Network role:
--   network_admin : can manage churches and network meeting (e.g. senior pastor, coordinator)

create extension if not exists pgcrypto;

-- =============================================================== churches & members
create table churches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  logo_url    text,
  created_at  timestamptz not null default now()
);

create table church_members (
  church_id  uuid not null references churches(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('leader','operator','musician')),
  display_name text,
  primary key (church_id, user_id)
);

create table network_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function role_rank(r text) returns int language sql immutable as $$
  select case r when 'leader' then 3 when 'operator' then 2 when 'musician' then 1 else 0 end $$;

create or replace function is_network_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from network_admins where user_id = auth.uid()) $$;

create or replace function has_role(c uuid, min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_network_admin() or exists (select 1 from church_members
    where church_id = c and user_id = auth.uid() and role_rank(role) >= role_rank(min_role)) $$;

create or replace function has_role_any(min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_network_admin() or exists (select 1 from church_members
    where user_id = auth.uid() and role_rank(role) >= role_rank(min_role)) $$;

-- =============================================================== songs (shared library)
create table songs (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid references churches(id) on delete cascade, -- null = shared with whole network
  title        text not null,
  author       text,
  default_key  text,
  tempo        int,
  body         text not null,          -- ChordPro: "[G]Mare e [D]Domnul"
  language     text default 'ro',
  source_url   text,
  ccli         text,
  tags         text[] default '{}',
  updated_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index songs_title_idx on songs using gin (to_tsvector('simple', title || ' ' || body));

create table song_versions (            -- history, so a bad edit can be undone
  id         bigint generated always as identity primary key,
  song_id    uuid not null references songs(id) on delete cascade,
  body       text not null,
  edited_by  uuid references auth.users(id),
  edited_at  timestamptz not null default now()
);
create or replace function keep_song_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.body is distinct from old.body then
    insert into song_versions(song_id, body, edited_by) values (old.id, old.body, auth.uid());
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger t_song_version before update on songs for each row execute function keep_song_version();

create table media (                    -- backgrounds, logos, flyers (files in Supabase Storage)
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references churches(id) on delete cascade, -- null = shared
  kind        text not null check (kind in ('background','logo','flyer','document','other')),
  name        text not null,
  storage_path text not null,
  created_at  timestamptz not null default now()
);

-- =============================================================== services (Sunday planning)
create table services (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references churches(id) on delete cascade,
  title      text not null default 'Serviciu duminică',
  starts_at  timestamptz not null,
  status     text not null default 'draft' check (status in ('draft','published','live','done')),
  created_at timestamptz not null default now()
);

create table service_items (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references services(id) on delete cascade,
  position      int not null,
  kind          text not null check (kind in ('song','sermon','prayer','announcement','reading','video','other')),
  title         text,
  song_id       uuid references songs(id) on delete set null,
  song_key      text,
  duration_min  int not null default 5,
  leader_name   text,
  notes         text,
  slide_layout  jsonb not null default '{}'::jsonb   -- operator: {arrangement:[], maxLines:4, background:""}
);
create index on service_items(service_id, position);

-- operators may only change slide_layout
create or replace function operator_only_layout() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from services s where s.id = new.service_id and has_role(s.church_id,'leader')) then
    if (new.service_id, new.position, new.kind, new.title, new.song_id, new.song_key, new.duration_min, new.leader_name, new.notes)
       is distinct from
       (old.service_id, old.position, old.kind, old.title, old.song_id, old.song_key, old.duration_min, old.leader_name, old.notes)
    then raise exception 'Operatorii pot schimba doar aranjamentul slide-urilor';
    end if;
  end if;
  return new;
end $$;
create trigger t_operator_layout before update on service_items for each row execute function operator_only_layout();

create table item_notes (               -- musicians: "intro mai lent", "refren de 2 ori"
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references service_items(id) on delete cascade,
  author     uuid not null references auth.users(id) default auth.uid(),
  text       text not null check (length(text) <= 500),
  created_at timestamptz not null default now()
);

-- =============================================================== teams & scheduling
create table departments (              -- Ospitalitate, Asimilare, Închinare, Media, Follow-up, Predicare…
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references churches(id) on delete cascade,
  name       text not null,
  color      text
);

create table positions (                -- roles inside a department: Vocal, Chitară, Proiecție, Ușă…
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references departments(id) on delete cascade,
  name           text not null,
  needed         int not null default 1
);

create table volunteers (               -- team members (may or may not have a login)
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references churches(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  phone      text,
  email      text,
  active     boolean not null default true
);

create table volunteer_positions (      -- who CAN serve where
  volunteer_id uuid references volunteers(id) on delete cascade,
  position_id  uuid references positions(id) on delete cascade,
  primary key (volunteer_id, position_id)
);

create table blockout_dates (           -- "I'm away on 14 Dec"
  id           uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  starts_on    date not null,
  ends_on      date not null,
  reason       text
);

create table assignments (              -- the monthly grid: service x position -> volunteer
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references services(id) on delete cascade,
  position_id   uuid not null references positions(id) on delete cascade,
  volunteer_id  uuid references volunteers(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','confirmed','declined','open')),
  unique (service_id, position_id, volunteer_id)
);

-- =============================================================== network hub (Thursday meeting)
create table meetings (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references churches(id) on delete cascade,   -- null = network-wide meeting
  title       text not null default 'Ședința de joi',
  held_on     date not null,
  summary     text,                                             -- AI or secretary summary
  created_at  timestamptz not null default now()
);

create table agenda_items (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  position    int not null default 0,
  title       text not null,
  details     text,
  church_id   uuid references churches(id) on delete set null,  -- which church raised it
  source      text not null default 'manual' check (source in ('manual','photo','ai')),
  created_by  uuid references auth.users(id) default auth.uid()
);

create table tasks (                    -- shared to-do list
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references churches(id) on delete cascade,   -- null = network task
  meeting_id  uuid references meetings(id) on delete set null,
  title       text not null,
  owner       uuid references auth.users(id),
  due_on      date,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table objectives (               -- monthly objectives per church / per leader
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references churches(id) on delete cascade,
  owner       uuid not null references auth.users(id) default auth.uid(),
  month       date not null check (extract(day from month) = 1),  -- first day of the month
  title       text not null,
  vision      text,
  measure     text,                                  -- how we know it's done
  progress    int not null default 0 check (progress between 0 and 100),
  ai_review   text,                                  -- end-of-month review from the local AI
  created_at  timestamptz not null default now()
);

create table documents (                -- vision docs, PDFs, Word files; text extracted for the AI
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid references churches(id) on delete cascade,  -- null = network
  title        text not null,
  storage_path text,
  external_url text,                                -- Google Drive link
  text_content text,                                -- extracted text for local AI search
  uploaded_by  uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);

-- =============================================================== people (connect card, GDPR)
create table contacts (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null references churches(id) on delete cascade,
  first_name       text not null,
  last_name        text,
  email            text,
  phone            text,
  status           text not null default 'guest' check (status in ('guest','regular','member')),
  first_visit      date default current_date,
  notes            text,
  consent_contact  boolean not null,                 -- GDPR: must be ticked on the form
  consent_at       timestamptz not null default now(),
  consent_text     text not null,                    -- exact wording they agreed to
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now(),
  check (consent_contact)
);

create table follow_ups (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  assigned_to uuid references auth.users(id),
  kind        text not null check (kind in ('email','call','visit','gift','other')),
  done_at     timestamptz,
  notes       text
);

create table campaigns (                -- e.g. Christmas invitation
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references churches(id) on delete cascade,
  title       text not null,
  message     text not null,
  flyer_id    uuid references media(id),
  channel     text not null default 'email' check (channel in ('email','sms','whatsapp')),
  sent_at     timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);

-- Public connect card: anonymous visitors may INSERT only, through this function.
create or replace function submit_connect_card(
  p_church uuid, p_first text, p_last text, p_email text, p_phone text, p_consent boolean, p_consent_text text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not p_consent then raise exception 'Consimțământul este obligatoriu'; end if;
  if length(coalesce(p_first,'')) < 1 or length(p_first) > 80 then raise exception 'Nume invalid'; end if;
  insert into contacts(church_id, first_name, last_name, email, phone, consent_contact, consent_text)
  values (p_church, trim(p_first), nullif(trim(p_last),''), nullif(lower(trim(p_email)),''), nullif(trim(p_phone),''), true, p_consent_text);
end $$;
revoke all on function submit_connect_card from public;
grant execute on function submit_connect_card to anon, authenticated;

-- =============================================================== row level security
alter table churches            enable row level security;
alter table church_members      enable row level security;
alter table network_admins      enable row level security;
alter table songs               enable row level security;
alter table song_versions       enable row level security;
alter table media               enable row level security;
alter table services            enable row level security;
alter table service_items       enable row level security;
alter table item_notes          enable row level security;
alter table departments         enable row level security;
alter table positions           enable row level security;
alter table volunteers          enable row level security;
alter table volunteer_positions enable row level security;
alter table blockout_dates      enable row level security;
alter table assignments         enable row level security;
alter table meetings            enable row level security;
alter table agenda_items        enable row level security;
alter table tasks               enable row level security;
alter table objectives          enable row level security;
alter table documents           enable row level security;
alter table contacts            enable row level security;
alter table follow_ups          enable row level security;
alter table campaigns           enable row level security;

-- churches: members see their church; every logged-in network member sees the list of churches
create policy ch_read  on churches for select using (has_role_any('musician'));
create policy ch_admin on churches for all using (is_network_admin()) with check (is_network_admin());

create policy cm_read  on church_members for select using (has_role(church_id,'musician'));
create policy cm_lead  on church_members for all using (has_role(church_id,'leader')) with check (has_role(church_id,'leader'));
create policy na_read  on network_admins for select using (is_network_admin());

-- songs: shared library readable by all network members; operators+ edit
create policy so_read on songs for select using ((church_id is null and has_role_any('musician')) or has_role(church_id,'musician'));
create policy so_ins  on songs for insert with check ((church_id is null and has_role_any('operator')) or has_role(church_id,'operator'));
create policy so_upd  on songs for update using ((church_id is null and has_role_any('operator')) or has_role(church_id,'operator'));
create policy so_del  on songs for delete using ((church_id is null and is_network_admin()) or has_role(church_id,'leader'));
create policy sv_read on song_versions for select using (exists (select 1 from songs s where s.id = song_id));

create policy me_read on media for select using ((church_id is null and has_role_any('musician')) or has_role(church_id,'musician'));
create policy me_write on media for all using ((church_id is null and has_role_any('operator')) or has_role(church_id,'operator'))
  with check ((church_id is null and has_role_any('operator')) or has_role(church_id,'operator'));

-- services
create policy se_read on services for select using (has_role(church_id,'musician'));
create policy se_lead on services for all using (has_role(church_id,'leader')) with check (has_role(church_id,'leader'));

create policy si_read on service_items for select using (exists (select 1 from services s where s.id = service_id and has_role(s.church_id,'musician')));
create policy si_lead on service_items for all using (exists (select 1 from services s where s.id = service_id and has_role(s.church_id,'leader')))
  with check (exists (select 1 from services s where s.id = service_id and has_role(s.church_id,'leader')));
create policy si_oper on service_items for update using (exists (select 1 from services s where s.id = service_id and has_role(s.church_id,'operator')));

create policy in_read on item_notes for select using (exists (select 1 from service_items i join services s on s.id = i.service_id where i.id = item_id and has_role(s.church_id,'musician')));
create policy in_add  on item_notes for insert with check (author = auth.uid() and exists (select 1 from service_items i join services s on s.id = i.service_id where i.id = item_id and has_role(s.church_id,'musician')));
create policy in_del  on item_notes for delete using (author = auth.uid() or exists (select 1 from service_items i join services s on s.id = i.service_id where i.id = item_id and has_role(s.church_id,'leader')));

-- teams
create policy de_read on departments for select using (has_role(church_id,'musician'));
create policy de_lead on departments for all using (has_role(church_id,'leader')) with check (has_role(church_id,'leader'));
create policy po_read on positions for select using (exists (select 1 from departments d where d.id = department_id and has_role(d.church_id,'musician')));
create policy po_lead on positions for all using (exists (select 1 from departments d where d.id = department_id and has_role(d.church_id,'leader')))
  with check (exists (select 1 from departments d where d.id = department_id and has_role(d.church_id,'leader')));
create policy vo_read on volunteers for select using (has_role(church_id,'musician'));
create policy vo_lead on volunteers for all using (has_role(church_id,'leader')) with check (has_role(church_id,'leader'));
create policy vp_read on volunteer_positions for select using (exists (select 1 from volunteers v where v.id = volunteer_id and has_role(v.church_id,'musician')));
create policy vp_lead on volunteer_positions for all using (exists (select 1 from volunteers v where v.id = volunteer_id and has_role(v.church_id,'leader')))
  with check (exists (select 1 from volunteers v where v.id = volunteer_id and has_role(v.church_id,'leader')));
-- volunteers manage their own blockouts; leaders see all
create policy bo_read on blockout_dates for select using (exists (select 1 from volunteers v where v.id = volunteer_id and (v.user_id = auth.uid() or has_role(v.church_id,'leader'))));
create policy bo_own  on blockout_dates for all using (exists (select 1 from volunteers v where v.id = volunteer_id and (v.user_id = auth.uid() or has_role(v.church_id,'leader'))))
  with check (exists (select 1 from volunteers v where v.id = volunteer_id and (v.user_id = auth.uid() or has_role(v.church_id,'leader'))));
create policy as_read on assignments for select using (exists (select 1 from services s where s.id = service_id and has_role(s.church_id,'musician')));
create policy as_lead on assignments for all using (exists (select 1 from services s where s.id = service_id and has_role(s.church_id,'leader')))
  with check (exists (select 1 from services s where s.id = service_id and has_role(s.church_id,'leader')));
-- a volunteer may confirm/decline their own slot, or take an 'open' slot (sign-up)
create policy as_self on assignments for update using (
  exists (select 1 from volunteers v where v.id = volunteer_id and v.user_id = auth.uid()) or status = 'open')
  with check (exists (select 1 from volunteers v where v.id = volunteer_id and v.user_id = auth.uid()));

-- network hub: network meetings visible to every leader in the network; church meetings to that church
create policy mt_read on meetings for select using ((church_id is null and has_role_any('leader')) or has_role(church_id,'musician'));
create policy mt_write on meetings for all using ((church_id is null and is_network_admin()) or has_role(church_id,'leader'))
  with check ((church_id is null and is_network_admin()) or has_role(church_id,'leader'));
create policy ag_read on agenda_items for select using (exists (select 1 from meetings m where m.id = meeting_id and ((m.church_id is null and has_role_any('leader')) or has_role(m.church_id,'musician'))));
create policy ag_add  on agenda_items for insert with check (exists (select 1 from meetings m where m.id = meeting_id and ((m.church_id is null and has_role_any('leader')) or has_role(m.church_id,'leader'))));
create policy ag_edit on agenda_items for update using (created_by = auth.uid() or is_network_admin());
create policy ag_del  on agenda_items for delete using (created_by = auth.uid() or is_network_admin());

create policy tk_read on tasks for select using ((church_id is null and has_role_any('leader')) or has_role(church_id,'musician'));
create policy tk_write on tasks for all using ((church_id is null and has_role_any('leader')) or has_role(church_id,'leader') or owner = auth.uid())
  with check ((church_id is null and has_role_any('leader')) or has_role(church_id,'leader') or owner = auth.uid());

-- objectives: every leader writes their own; all network leaders can read (accountability)
create policy ob_read on objectives for select using (has_role_any('leader'));
create policy ob_own  on objectives for all using (owner = auth.uid() or is_network_admin()) with check (owner = auth.uid() or is_network_admin());

create policy dc_read on documents for select using ((church_id is null and has_role_any('leader')) or has_role(church_id,'leader'));
create policy dc_write on documents for all using ((church_id is null and has_role_any('leader')) or has_role(church_id,'leader'))
  with check ((church_id is null and has_role_any('leader')) or has_role(church_id,'leader'));

-- personal data: leaders only (plus follow-up assignee for their own follow-ups)
create policy co_lead on contacts for all using (has_role(church_id,'leader')) with check (has_role(church_id,'leader'));
create policy fu_read on follow_ups for select using (assigned_to = auth.uid() or exists (select 1 from contacts c where c.id = contact_id and has_role(c.church_id,'leader')));
create policy fu_write on follow_ups for all using (assigned_to = auth.uid() or exists (select 1 from contacts c where c.id = contact_id and has_role(c.church_id,'leader')))
  with check (assigned_to = auth.uid() or exists (select 1 from contacts c where c.id = contact_id and has_role(c.church_id,'leader')));
create policy cp_lead on campaigns for all using (has_role(church_id,'leader')) with check (has_role(church_id,'leader'));

-- live updates for the app
alter publication supabase_realtime add table service_items, item_notes, assignments, tasks, agenda_items;
