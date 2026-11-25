-- Reverb online: 🗓 the program (plans.doc, the same shape as src/plan.js, without phones / e-mails / links).
-- Leaders write the whole document (RLS plans_update, with a version check in the page). Members do NOT write it:
-- they answer their own assignments and block their own days through the two functions below, which check
-- that the place really is theirs. A person is the same `person_id` in every church he serves in.

-- every link gets a person id (kept on ↻ Link nou); members carry it too
update public.invites set person_id = id::text where person_id is null;
update public.members m set person_id = i.person_id
  from public.invites i where i.user_id = m.user_id and i.revoked_at is null and m.person_id is null;

-- who I am in this church (my person id), or null
create or replace function public.reverb_me(c uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.person_id from public.members m where m.church_id = c and m.user_id = (select auth.uid()) $$;

-- the people of a church (names and departments only, never phones), for the program: everyone with a link in this
-- church, and the people whose link is in another church but who also serve here
create or replace function public.reverb_people(c uuid)
returns table (person_id text, name text, departments text[], role text, joined boolean)
language sql stable security definer set search_path = '' as $$
  select i.person_id, i.display_name, i.departments, i.role, i.user_id is not null
    from public.invites i
   where private.has_role(c, 'member') and i.church_id = c and i.revoked_at is null
  union all
  select i.person_id, i.display_name,
         coalesce((select array_agg(d) from jsonb_array_elements_text(x->'departments') d), '{}'), x->>'role', i.user_id is not null
    from public.invites i, jsonb_array_elements(i.also) x
   where private.has_role(c, 'member') and i.revoked_at is null and (x->>'church_id')::uuid = c $$;

-- ✓ / ✕ on one of MY assignments
create or replace function public.reverb_plan_answer(c uuid, service text, place text, answer text) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := public.reverb_me(c); d jsonb; i int;
begin
  if me is null then return 'Nu ești în această biserică'; end if;
  if answer not in ('confirmed', 'declined', 'pending') then return 'Răspuns greșit'; end if;
  select doc into d from public.plans where church_id = c for update;
  if d is null then return 'Nu există program'; end if;
  select ord - 1 into i from jsonb_array_elements(d->'services') with ordinality s(v, ord) where v->>'id' = service;
  if i is null then return 'Serviciul nu mai există'; end if;
  if d #>> array['services', i::text, 'assignments', place, 'volunteer'] is distinct from me then return 'Locul nu e al tău'; end if;
  d := jsonb_set(d, array['services', i::text, 'assignments', place, 'status'], to_jsonb(answer));
  update public.plans set doc = d, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where church_id = c;
  insert into public.plan_ops (church_id, op, user_id) values (c, jsonb_build_object('op', 'answer', 'id', service, 'place', place, 'status', answer, 'by', me), (select auth.uid()));
  return null;
end $$;

-- 🚫 the days I cannot serve (replaces my list)
create or replace function public.reverb_plan_away(c uuid, days text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := public.reverb_me(c); d jsonb; i int; clean jsonb; nm text;
begin
  if me is null then return 'Nu ești în această biserică'; end if;
  select coalesce(jsonb_agg(distinct x order by x), '[]') into clean
    from unnest(coalesce(days, '{}')) x where x ~ '^\d{4}-\d{2}-\d{2}$';
  if jsonb_array_length(clean) > 120 then return 'Prea multe zile'; end if;
  insert into public.plans (church_id, doc) values (c, '{"services":[],"departments":[],"volunteers":[]}') on conflict (church_id) do nothing;
  select doc into d from public.plans where church_id = c for update;
  d := jsonb_set(d, '{volunteers}', coalesce(d->'volunteers', '[]'));
  select ord - 1 into i from jsonb_array_elements(d->'volunteers') with ordinality s(v, ord) where v->>'id' = me;
  if i is null then
    select m.display_name into nm from public.members m where m.church_id = c and m.user_id = (select auth.uid());
    d := jsonb_set(d, '{volunteers}', (d->'volunteers') || jsonb_build_object('id', me, 'name', coalesce(nm, ''), 'positions', '[]'::jsonb, 'away', clean, 'maxPerMonth', 0));
  else
    d := jsonb_set(d, array['volunteers', i::text, 'away'], clean);
  end if;
  update public.plans set doc = d, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where church_id = c;
  return null;
end $$;

revoke all on function public.reverb_me(uuid), public.reverb_people(uuid), public.reverb_plan_answer(uuid, text, text, text),
  public.reverb_plan_away(uuid, text[]) from public, anon;
grant execute on function public.reverb_me(uuid), public.reverb_people(uuid), public.reverb_plan_answer(uuid, text, text, text),
  public.reverb_plan_away(uuid, text[]) to authenticated;
