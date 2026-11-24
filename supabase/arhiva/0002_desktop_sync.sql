-- Betleem desktop app <-> cloud
--  * churches have a secret code; knowing it makes you a leader of that church
--  * songs and service items carry updated_at so PCs can sync changes
--  * one "current" service per church mirrors the Sunday program in the app

-- ------------------------------------------------------------ church codes
alter table churches add column if not exists code_hash text;
alter table churches add column if not exists updated_at timestamptz not null default now();

create table if not exists join_attempts (
  user_id   uuid not null,
  church_id uuid not null,
  at        timestamptz not null default now()
);
create index if not exists join_attempts_idx on join_attempts(user_id, church_id, at);
alter table join_attempts enable row level security;   -- no policies: only the functions below touch it

-- everyone signed in sees the list of churches (names only), to pick one
create or replace function list_churches()
returns table (id uuid, name text, city text, is_member boolean, role text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, m.user_id is not null, m.role
  from churches c left join church_members m on m.church_id = c.id and m.user_id = auth.uid()
  order by c.name $$;

create or replace function create_church(p_name text, p_city text, p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Trebuie să fii conectat'; end if;
  if length(coalesce(trim(p_name), '')) < 2 then raise exception 'Scrie numele bisericii'; end if;
  if length(coalesce(p_code, '')) < 4 then raise exception 'Codul trebuie să aibă cel puțin 4 caractere'; end if;
  insert into churches(name, city, code_hash) values (trim(p_name), nullif(trim(p_city), ''), crypt(p_code, gen_salt('bf', 10)))
  returning id into new_id;
  insert into church_members(church_id, user_id, role) values (new_id, auth.uid(), 'leader');
  return new_id;
end $$;

-- enter a church with its code; 5 wrong codes in 10 minutes = locked out for a while.
-- Returns 'ok' | 'wrong' | 'locked' (no exception for a wrong code, so the attempt is recorded).
create or replace function join_church(p_church uuid, p_code text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c churches; fails int;
begin
  if auth.uid() is null then raise exception 'Trebuie să fii conectat'; end if;
  select * into c from churches where id = p_church;
  if not found then raise exception 'Biserica nu există'; end if;
  if exists (select 1 from church_members where church_id = p_church and user_id = auth.uid()) then return 'ok'; end if;
  select count(*) into fails from join_attempts where user_id = auth.uid() and church_id = p_church and at > now() - interval '10 minutes';
  if fails >= 5 then return 'locked'; end if;
  if c.code_hash is null or crypt(coalesce(p_code, ''), c.code_hash) <> c.code_hash then
    insert into join_attempts(user_id, church_id) values (auth.uid(), p_church);
    return 'wrong';
  end if;
  delete from join_attempts where user_id = auth.uid() and church_id = p_church;
  insert into church_members(church_id, user_id, role) values (p_church, auth.uid(), 'leader');
  return 'ok';
end $$;

create or replace function update_church(p_church uuid, p_name text, p_city text, p_new_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not has_role(p_church, 'leader') then raise exception 'Doar liderii bisericii pot schimba asta'; end if;
  if p_new_code is not null and p_new_code <> '' and length(p_new_code) < 4 then raise exception 'Codul trebuie să aibă cel puțin 4 caractere'; end if;
  update churches set
    name = coalesce(nullif(trim(p_name), ''), name),
    city = coalesce(p_city, city),
    code_hash = case when coalesce(p_new_code, '') <> '' then crypt(p_new_code, gen_salt('bf', 10)) else code_hash end,
    updated_at = now()
  where id = p_church;
end $$;

revoke all on function list_churches, create_church(text, text, text), join_church(uuid, text), update_church(uuid, text, text, text) from public, anon;
grant execute on function list_churches, create_church(text, text, text), join_church(uuid, text), update_church(uuid, text, text, text) to authenticated;
-- never expose the code hash to clients (a column revoke alone is not enough when the table is granted)
revoke select on churches from anon, authenticated;
grant select (id, name, city, logo_url, created_at, updated_at) on churches to authenticated;

-- ------------------------------------------------------------ song sync
alter table songs add column if not exists arrangement text[];
alter table songs add column if not exists deleted boolean not null default false;
create index if not exists songs_updated_idx on songs(updated_at);

-- ------------------------------------------------------------ program sync
alter table services add column if not exists updated_at timestamptz not null default now();
alter table services add column if not exists is_current boolean not null default false;
create unique index if not exists one_current_service on services(church_id) where is_current;

create or replace function touch_service() returns trigger language plpgsql as $$
begin
  update services set updated_at = now() where id = coalesce(new.service_id, old.service_id);
  return coalesce(new, old);
end $$;
drop trigger if exists t_touch_service on service_items;
create trigger t_touch_service after insert or update or delete on service_items for each row execute function touch_service();

create or replace function touch_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists t_services_updated on services;
create trigger t_services_updated before update on services for each row execute function touch_updated();

-- replace a church's current program in one step (the desktop app sends the whole list)
create or replace function save_program(p_church uuid, p_title text, p_starts_at timestamptz, p_items jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare sid uuid; it jsonb; pos int := 0; ts timestamptz;
begin
  if not has_role(p_church, 'leader') then raise exception 'Doar liderii pot schimba programul'; end if;
  select id into sid from services where church_id = p_church and is_current;
  if sid is null then
    insert into services(church_id, title, starts_at, is_current) values (p_church, coalesce(p_title, 'Serviciu duminică'), coalesce(p_starts_at, now()), true)
    returning id into sid;
  else
    update services set title = coalesce(p_title, title), starts_at = coalesce(p_starts_at, starts_at) where id = sid;
  end if;
  delete from service_items where service_id = sid;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into service_items(id, service_id, position, kind, title, song_id, song_key, duration_min, leader_name, slide_layout)
    values (coalesce((it->>'id')::uuid, gen_random_uuid()), sid, pos,
            case when it->>'kind' in ('song','sermon','prayer','announcement','reading','video','other') then it->>'kind' else 'other' end,
            it->>'title',
            case when it->>'songId' ~ '^[0-9a-f-]{36}$' and exists (select 1 from songs where id = (it->>'songId')::uuid) then (it->>'songId')::uuid end,
            nullif(it->>'key', ''), coalesce((it->>'minutes')::int, 5), it->>'leader',
            jsonb_strip_nulls(jsonb_build_object('arrangement', it->'arrangement', 'maxLines', it->'maxLines', 'background', it->'background')));
    pos := pos + 1;
  end loop;
  select updated_at into ts from services where id = sid;
  return ts;
end $$;

create or replace function get_program(p_church uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not has_role(p_church, 'musician') then null else (
    select jsonb_build_object(
      'title', s.title, 'startsAt', s.starts_at, 'updatedAt', s.updated_at,
      'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', i.id, 'kind', i.kind, 'title', i.title, 'songId', i.song_id, 'key', coalesce(i.song_key, ''),
          'minutes', i.duration_min, 'leader', i.leader_name,
          'arrangement', i.slide_layout->'arrangement', 'maxLines', i.slide_layout->'maxLines', 'background', i.slide_layout->'background'
        )) order by i.position) from service_items i where i.service_id = s.id), '[]'::jsonb))
    from services s where s.church_id = p_church and s.is_current) end $$;

revoke all on function save_program(uuid, text, timestamptz, jsonb), get_program(uuid) from public, anon;
grant execute on function save_program(uuid, text, timestamptz, jsonb), get_program(uuid) to authenticated;
