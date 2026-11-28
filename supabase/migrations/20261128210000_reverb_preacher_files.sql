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
