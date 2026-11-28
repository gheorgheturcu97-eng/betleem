-- 📎 The preacher puts his presentation for the sermon from Reverb online (PowerPoint, Keynote, PDF, pictures) or a Canva link.
-- The file goes to the bucket "prezentari" under <church>/<service>/<random>-<name>; the church computer downloads it into
-- 📥 Primite on its next sync. The path holds a random part nobody can guess; only members of that church can upload there.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prezentari', 'prezentari', true, 209715200, array[
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
  'application/pdf', 'application/x-iwork-keynote-sffkey', 'application/vnd.apple.keynote', 'application/octet-stream',
  'application/vnd.oasis.opendocument.presentation', 'image/jpeg', 'image/png', 'image/heic', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists prezentari_upload on storage.objects;
create policy prezentari_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'prezentari' and private.has_role(((storage.foldername(name))[1])::uuid, 'member'));

-- the preacher (his place is Predicator / Pastor / Vorbitor / Mesaj in that service) or a leader marks the sermon's presentation
create or replace function public.reverb_plan_attach(c uuid, service text, url text, name text, canva text) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := public.reverb_me(c); d jsonb; i int; j int; ok boolean := false; nm text; base text := '';
begin
  if me is null then return 'Nu ești în această biserică'; end if;
  select doc into d from public.plans where church_id = c for update;
  if d is null then return 'Nu există program'; end if;
  select ord - 1 into i from jsonb_array_elements(d->'services') with ordinality s(v, ord) where v->>'id' = service;
  if i is null then return 'Serviciul nu mai există'; end if;
  -- is one of my places in this service a preaching one?
  select true into ok
    from jsonb_each(coalesce(d #> array['services', i::text, 'assignments'], '{}')) a(k, v),
         jsonb_array_elements(coalesce(d->'departments', '[]')) dep(x), jsonb_array_elements(coalesce(dep.x->'positions', '[]')) p(y)
   where a.v->>'volunteer' = me and split_part(a.k, '#', 1) = p.y->>'id' and p.y->>'name' ~* '(predic|pastor|vorbitor|mesaj)'
   limit 1;
  if not coalesce(ok, false) and not private.has_role(c, 'leader') then return 'Poți pune prezentarea doar pentru predica ta.'; end if;
  if coalesce(url, '') <> '' and url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/prezentari/' then return 'Fișier greșit'; end if;
  if coalesce(canva, '') <> '' and canva !~ '^https://(www\.)?canva\.(com|link)/' then return 'Linkul nu e de la Canva'; end if;
  select m.display_name into nm from public.members m where m.church_id = c and m.user_id = (select auth.uid());
  -- the first sermon of the service; if there is none, a sermon is added at the end
  select ord - 1 into j from jsonb_array_elements(d #> array['services', i::text, 'items']) with ordinality s(v, ord) where v->>'kind' = 'sermon' order by ord limit 1;
  if j is null then
    d := jsonb_set(d, array['services', i::text, 'items'], coalesce(d #> array['services', i::text, 'items'], '[]') ||
      jsonb_build_object('id', gen_random_uuid()::text, 'kind', 'sermon', 'title', 'Predica', 'minutes', 35));
    j := jsonb_array_length(d #> array['services', i::text, 'items']) - 1;
  end if;
  if coalesce(url, '') = '' and coalesce(canva, '') = '' then
    d := d #- array['services', i::text, 'items', j::text, 'incoming'];
  else
    d := jsonb_set(d, array['services', i::text, 'items', j::text, 'incoming'], jsonb_strip_nulls(jsonb_build_object(
      'from', coalesce(nm, ''), 'url', nullif(left(coalesce(url, ''), 600), ''), 'name', nullif(left(regexp_replace(coalesce(name, ''), '[/\\]', '_', 'g'), 120), ''),
      'canva', nullif(left(coalesce(canva, ''), 400), ''), 'at', to_jsonb(now()))));
  end if;
  update public.plans set doc = d, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where church_id = c;
  insert into public.plan_ops (church_id, op, user_id) values (c, jsonb_build_object('op', 'attach', 'id', service, 'by', me, 'name', name, 'canva', canva is not null), (select auth.uid()));
  return null;
end $$;

revoke all on function public.reverb_plan_attach(uuid, text, text, text, text) from public, anon;
grant execute on function public.reverb_plan_attach(uuid, text, text, text, text) to authenticated;

-- 🎵 someone who said "Pot" for a service proposes one song for it (one per person; a new one replaces his old one).
-- The leaders see the proposals on the service and put them in the program with one tap.
create or replace function public.reverb_plan_propose(c uuid, service text, song text, title text, skey text) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := public.reverb_me(c); d jsonb; i int; ok boolean; nm text; props jsonb;
begin
  if me is null then return 'Nu ești în această biserică'; end if;
  if coalesce(trim(title), '') = '' then return 'Alege cântarea'; end if;
  select doc into d from public.plans where church_id = c for update;
  if d is null then return 'Nu există program'; end if;
  select ord - 1 into i from jsonb_array_elements(d->'services') with ordinality s(v, ord) where v->>'id' = service;
  if i is null then return 'Serviciul nu mai există'; end if;
  select true into ok from jsonb_each(coalesce(d #> array['services', i::text, 'assignments'], '{}')) a(k, v)
   where a.v->>'volunteer' = me and a.v->>'status' = 'confirmed' limit 1;
  if not coalesce(ok, false) then return 'Poți propune după ce ai confirmat că vii.'; end if;
  select m.display_name into nm from public.members m where m.church_id = c and m.user_id = (select auth.uid());
  select coalesce(jsonb_agg(p), '[]') into props from jsonb_array_elements(coalesce(d #> array['services', i::text, 'proposals'], '[]')) p where p->>'by' <> me;
  props := props || jsonb_build_object('by', me, 'name', coalesce(nm, ''), 'songId', left(coalesce(song, ''), 60), 'title', left(title, 200), 'key', left(coalesce(skey, ''), 8), 'at', to_jsonb(now()));
  d := jsonb_set(d, array['services', i::text, 'proposals'], props);
  update public.plans set doc = d, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where church_id = c;
  insert into public.plan_ops (church_id, op, user_id) values (c, jsonb_build_object('op', 'propose', 'id', service, 'by', me, 'title', title), (select auth.uid()));
  return null;
end $$;

revoke all on function public.reverb_plan_propose(uuid, text, text, text, text) from public, anon;
grant execute on function public.reverb_plan_propose(uuid, text, text, text, text) to authenticated;

-- ✓ After "Pot" nobody takes himself off alone: "Nu pot" becomes a request ("leave"); the leader approves or refuses it.
create or replace function public.reverb_plan_answer(c uuid, service text, place text, answer text) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := public.reverb_me(c); d jsonb; i int; now_s text;
begin
  if me is null then return 'Nu ești în această biserică'; end if;
  if answer not in ('confirmed', 'declined', 'pending') then return 'Răspuns greșit'; end if;
  select doc into d from public.plans where church_id = c for update;
  if d is null then return 'Nu există program'; end if;
  select ord - 1 into i from jsonb_array_elements(d->'services') with ordinality s(v, ord) where v->>'id' = service;
  if i is null then return 'Serviciul nu mai există'; end if;
  if d #>> array['services', i::text, 'assignments', place, 'volunteer'] is distinct from me then return 'Locul nu e al tău'; end if;
  now_s := d #>> array['services', i::text, 'assignments', place, 'status'];
  if answer = 'declined' and now_s in ('confirmed', 'leave') then answer := 'leave'; end if;     -- a request, not a change
  if answer = 'pending' and now_s in ('confirmed', 'leave') then return 'Ai confirmat deja; cere liderului să te scoată.'; end if;
  d := jsonb_set(d, array['services', i::text, 'assignments', place, 'status'], to_jsonb(answer));
  if answer = 'leave' then d := jsonb_set(d, array['services', i::text, 'assignments', place, 'leaveAt'], to_jsonb(now()));
  else d := d #- array['services', i::text, 'assignments', place, 'leaveAt']; end if;
  update public.plans set doc = d, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where church_id = c;
  insert into public.plan_ops (church_id, op, user_id) values (c, jsonb_build_object('op', 'answer', 'id', service, 'place', place, 'status', answer, 'by', me), (select auth.uid()));
  return null;
end $$;

-- 🗓 "Când pot sluji": for each day of the period, the posts I can take (an empty list = I can't that day)
create or replace function public.reverb_plan_offer(c uuid, day_from text, day_to text, offers jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := public.reverb_me(c); d jsonb; i int; clean jsonb := '{}'; k text; val jsonb; nm text;
begin
  if me is null then return 'Nu ești în această biserică'; end if;
  if day_from !~ '^\d{4}-\d{2}-\d{2}$' or day_to !~ '^\d{4}-\d{2}-\d{2}$' or day_to < day_from then return 'Perioadă greșită'; end if;
  for k, val in select * from jsonb_each(coalesce(offers, '{}')) loop
    -- a day ("2026-12-06") or one program of that day ("s:<id>": a Sunday can hold several programs)
    if ((k ~ '^\d{4}-\d{2}-\d{2}$' and k between day_from and day_to) or k ~ '^s:[A-Za-z0-9-]{1,60}$') and jsonb_typeof(val) = 'array' then
      clean := clean || jsonb_build_object(k, (select coalesce(jsonb_agg(left(x, 40)), '[]') from jsonb_array_elements_text(val) x limit 30));
    end if;
  end loop;
  insert into public.plans (church_id, doc) values (c, '{"services":[],"departments":[],"volunteers":[]}') on conflict (church_id) do nothing;
  select doc into d from public.plans where church_id = c for update;
  d := jsonb_set(d, '{volunteers}', coalesce(d->'volunteers', '[]'));
  select ord - 1 into i from jsonb_array_elements(d->'volunteers') with ordinality s(v, ord) where v->>'id' = me;
  if i is null then
    select m.display_name into nm from public.members m where m.church_id = c and m.user_id = (select auth.uid());
    d := jsonb_set(d, '{volunteers}', (d->'volunteers') || jsonb_build_object('id', me, 'name', coalesce(nm, ''), 'positions', '[]'::jsonb, 'away', '[]'::jsonb, 'maxPerMonth', 0));
    i := jsonb_array_length(d->'volunteers') - 1;
  end if;
  d := jsonb_set(d, array['volunteers', i::text, 'offer'], clean);
  d := jsonb_set(d, array['volunteers', i::text, 'offerFrom'], to_jsonb(day_from));
  d := jsonb_set(d, array['volunteers', i::text, 'offerTo'], to_jsonb(day_to));
  update public.plans set doc = d, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where church_id = c;
  return null;
end $$;

revoke all on function public.reverb_plan_offer(uuid, text, text, jsonb) from public, anon;
grant execute on function public.reverb_plan_offer(uuid, text, text, jsonb) to authenticated;
