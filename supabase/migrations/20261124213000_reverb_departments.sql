-- departments: each church has its own list (Betleem: Închinare, Copii, Asimilare și ospitalitate, Media)
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  sort       int not null default 0,
  unique (church_id, name)
);
alter table public.departments enable row level security;
create policy departments_read on public.departments for select to authenticated using (private.has_role(church_id, 'member'));
create policy departments_manage on public.departments for all to authenticated
  using (private.has_role(church_id, 'coordinator')) with check (private.has_role(church_id, 'coordinator'));
grant select, insert, update, delete on public.departments to authenticated, service_role;

-- a person can serve in several departments; a leader leads one or more of them
alter table public.members add column departments text[] not null default '{}', add column leads text[] not null default '{}';
update public.members set departments = array[department] where department is not null;
alter table public.members drop column department;
alter table public.invites add column departments text[] not null default '{}', add column leads text[] not null default '{}';
update public.invites set departments = array[department] where department is not null;
alter table public.invites drop column department;

-- phone numbers: the coordinator sees all; a leader sees the people of the departments he leads
alter table public.people_private add column departments text[] not null default '{}';
create or replace function private.leads_any(c uuid, deps text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.church_id = c and m.user_id = (select auth.uid())
    and m.role = 'leader' and m.leads && deps) $$;
grant execute on function private.leads_any(uuid, text[]) to authenticated;
drop policy people_private_rw on public.people_private;
create policy people_private_read on public.people_private for select to authenticated
  using (private.has_role(church_id, 'coordinator') or private.leads_any(church_id, departments));
create policy people_private_write on public.people_private for all to authenticated
  using (private.has_role(church_id, 'coordinator')) with check (private.has_role(church_id, 'coordinator'));
