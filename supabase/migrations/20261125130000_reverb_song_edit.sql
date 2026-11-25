-- ✎ Songs written and corrected from the personal link: leaders, coordinators and the people of the worship
-- department (Închinare) of the church that owns the song. Every change keeps the previous text (song_versions),
-- so a wrong chord can always be put back. The church computer brings the changes into its library.
alter table public.songs add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function private.can_edit_songs(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(c, 'leader') or exists (select 1 from public.members m
    where m.church_id = c and m.user_id = (select auth.uid()) and 'Închinare' = any(m.departments)) $$;
revoke all on function private.can_edit_songs(uuid) from public, anon;
grant execute on function private.can_edit_songs(uuid) to authenticated;

alter policy songs_write on public.songs with check (private.can_edit_songs(church_id));
alter policy songs_update on public.songs using (private.can_edit_songs(church_id)) with check (private.can_edit_songs(church_id));

create table if not exists public.song_versions (
  id         bigint generated always as identity primary key,
  song_id    uuid not null references public.songs(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade,
  title      text, key text, body text,
  by_user    uuid references auth.users(id) on delete set null,
  at         timestamptz not null default now()
);
create index if not exists song_versions_song_idx on public.song_versions (song_id, id desc);
alter table public.song_versions enable row level security;
create policy song_versions_read on public.song_versions for select to authenticated using (private.can_read_songs_of(church_id));
revoke all on public.song_versions from anon, authenticated;
grant select on public.song_versions to authenticated;
grant select, insert on public.song_versions to service_role;

create or replace function private.keep_song_version() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.body is distinct from new.body or old.title is distinct from new.title or old.key is distinct from new.key then
    insert into public.song_versions (song_id, church_id, title, key, body, by_user) values (old.id, old.church_id, old.title, old.key, old.body, old.updated_by);
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger songs_keep_version before update on public.songs for each row execute function private.keep_song_version();
grant select, insert, update on public.songs to service_role;
