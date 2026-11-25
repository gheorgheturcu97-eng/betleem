-- every link has a person id from the start (the program refers to people by it)
create or replace function private.invite_person_id() returns trigger language plpgsql set search_path = '' as $$
begin new.person_id := coalesce(new.person_id, new.id::text); return new; end $$;
drop trigger if exists invites_person_id on public.invites;
create trigger invites_person_id before insert or update on public.invites for each row execute function private.invite_person_id();
update public.invites set person_id = id::text where person_id is null;
