-- the rule helpers leave the public API: callable by the policies, not as /rest/v1/rpc endpoints
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_reverb_admin() set schema private;
alter function public.role_rank(text) set schema private;
alter function public.has_role(uuid, text) set schema private;
alter function public.my_networks() set schema private;
alter function public.can_read_songs_of(uuid) set schema private;
create or replace function private.has_role(c uuid, min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m
    where m.church_id = c and m.user_id = (select auth.uid())
      and private.role_rank(m.role) >= private.role_rank(min_role)) $$;
create or replace function private.can_read_songs_of(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(c, 'member') or exists (
    select 1 from public.members m
      join public.churches mine on mine.id = m.church_id
      join public.networks n on n.id = mine.network_id
    where m.user_id = (select auth.uid()) and n.library_church = c) $$;
-- Supabase's own helper behind "enable RLS automatically": not for the API
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
