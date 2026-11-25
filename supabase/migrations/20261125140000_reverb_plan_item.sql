-- 🎼 Prepare from home: the worship team (Închinare) sets the key and the order of the sections of a song in a
-- service, without being a leader. Leaders change everything else through the whole document (version check).
-- Only the song items' key and arrangement can be touched here; nothing else in the program.
create or replace function public.reverb_plan_item(c uuid, service text, item text, new_key text, new_arrangement text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare d jsonb; i int; j int; arr jsonb;
begin
  if not private.can_edit_songs(c) then return 'Doar liderii și echipa de închinare pot schimba tonul și ordinea'; end if;
  if new_key is not null and (length(new_key) > 8) then return 'Ton greșit'; end if;
  if new_arrangement is not null and (cardinality(new_arrangement) > 60 or exists (select 1 from unnest(new_arrangement) x where length(x) > 40)) then
    return 'Ordine prea lungă'; end if;
  select doc into d from public.plans where church_id = c for update;
  if d is null then return 'Nu există program'; end if;
  select ord - 1 into i from jsonb_array_elements(d->'services') with ordinality s(v, ord) where v->>'id' = service;
  if i is null then return 'Serviciul nu mai există'; end if;
  select ord - 1 into j from jsonb_array_elements(d->'services'->i->'items') with ordinality s(v, ord) where v->>'id' = item and v->>'kind' = 'song';
  if j is null then return 'Cântarea nu mai e în program'; end if;
  if new_key is not null then d := jsonb_set(d, array['services', i::text, 'items', j::text, 'key'], to_jsonb(new_key)); end if;
  if new_arrangement is not null then
    arr := to_jsonb(new_arrangement);
    if cardinality(new_arrangement) = 0 then d := d #- array['services', i::text, 'items', j::text, 'arrangement'];
    else d := jsonb_set(d, array['services', i::text, 'items', j::text, 'arrangement'], arr); end if;
  end if;
  update public.plans set doc = d, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where church_id = c;
  insert into public.plan_ops (church_id, op, user_id)
    values (c, jsonb_build_object('op', 'songPrep', 'id', service, 'item', item, 'key', new_key, 'arrangement', arr), (select auth.uid()));
  return null;
end $$;
revoke all on function public.reverb_plan_item(uuid, text, text, text, text[]) from public, anon;
grant execute on function public.reverb_plan_item(uuid, text, text, text, text[]) to authenticated;
