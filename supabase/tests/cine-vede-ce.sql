-- „Cine vede ce”: rulează în SQL Editor. Face oameni și date de probă, verifică regulile și ANULEAZĂ totul
-- (se termină cu o eroare care conține rezultatul; nimic nu rămâne în baza de date).
-- Rezultatul corect (2026-11-24):
--   A_songs=1 A_plans=1 A_phones=0 A_churches=8 A_write=nu | B_songs=2 B_edit_betleem=0 B_plans=0 |
--   C_songs=1 C_churches=1 C_join_betleem=nu | D_phones=1 | anon_songs=interzis
-- A = membru Betleem, B = lider Rhema (rețea), C = coordonator al unei biserici din afară, D = lider Betleem.
do $$
declare
  betleem uuid := (select id from public.churches where name = 'Betleem');
  rhema uuid := (select id from public.churches where name = 'Rhema');
  outside uuid; uA uuid := gen_random_uuid(); uB uuid := gen_random_uuid(); uC uuid := gen_random_uuid(); uD uuid := gen_random_uuid();
  r text := ''; n int;
begin
  insert into public.churches (name, city) values ('Biserica din afară', 'Test') returning id into outside;
  insert into auth.users (id, aud, role, email) values (uA,'authenticated','authenticated','a@t.invalid'),(uB,'authenticated','authenticated','b@t.invalid'),(uC,'authenticated','authenticated','c@t.invalid'),(uD,'authenticated','authenticated','d@t.invalid');
  insert into public.members (church_id, user_id, role, person_id) values (betleem, uA, 'member', 'p1'), (rhema, uB, 'leader', null), (outside, uC, 'coordinator', null), (betleem, uD, 'leader', null);
  insert into public.songs (church_id, title, body) values (betleem, 'Cântare Betleem', 'x'), (rhema, 'Cântare Rhema', 'y'), (outside, 'Cântare din afară', 'z');
  insert into public.plans (church_id, doc) values (betleem, '{"t":1}'), (outside, '{"t":2}');
  insert into public.people_private (church_id, person_id, phone) values (betleem, 'p1', '0700');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  select count(*) into n from public.songs; r := r || ' A_songs=' || n;
  select count(*) into n from public.plans; r := r || ' A_plans=' || n;
  select count(*) into n from public.people_private; r := r || ' A_phones=' || n;
  select count(*) into n from public.churches; r := r || ' A_churches=' || n;
  begin insert into public.songs (church_id, title) values (betleem, 'hack'); r := r || ' A_write=DA'; exception when others then r := r || ' A_write=nu'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  select count(*) into n from public.songs; r := r || ' | B_songs=' || n;
  update public.songs set title = 'schimbat' where church_id = betleem; get diagnostics n = row_count; r := r || ' B_edit_betleem=' || n;
  select count(*) into n from public.plans; r := r || ' B_plans=' || n;
  perform set_config('request.jwt.claims', json_build_object('sub', uC, 'role', 'authenticated')::text, true);
  select count(*) into n from public.songs; r := r || ' | C_songs=' || n;
  select count(*) into n from public.churches; r := r || ' C_churches=' || n;
  begin insert into public.members (church_id, user_id, role) values (betleem, uC, 'coordinator'); r := r || ' C_join_betleem=DA'; exception when others then r := r || ' C_join_betleem=nu'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', uD, 'role', 'authenticated')::text, true);
  select count(*) into n from public.people_private; r := r || ' | D_phones=' || n;
  perform set_config('role', 'anon', true); perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin select count(*) into n from public.songs; r := r || ' | anon_songs=' || n; exception when others then r := r || ' | anon_songs=interzis'; end;
  raise exception 'REZULTAT:%', r;
end $$;
