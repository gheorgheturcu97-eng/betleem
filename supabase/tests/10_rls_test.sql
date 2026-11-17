\set ON_ERROR_STOP 0
grant usage on schema public, auth to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function auth.uid() to authenticated, anon;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222'),('33333333-3333-3333-3333-333333333333'),('44444444-4444-4444-4444-444444444444');
insert into church_members values
 ('00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','leader','Lider'),
 ('00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','operator','Op'),
 ('00000000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','musician','Muz'),
 ('00000000-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','leader','Pestera');
insert into services(id,church_id,starts_at) values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001', now());
insert into songs(id,title,body,default_key) values ('bbbbbbbb-0000-0000-0000-000000000001','Mare e Domnul','[G]Mare','G');
insert into service_items(id,service_id,position,kind,song_id,song_key) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',0,'song','bbbbbbbb-0000-0000-0000-000000000001','G');
insert into contacts(church_id,first_name,consent_contact,consent_text) values ('00000000-0000-0000-0000-000000000001','Ana',true,'Sunt de acord');

set role authenticated;
-- OPERATOR
set request.jwt.uid = '22222222-2222-2222-2222-222222222222';
\echo T1 operator changes layout (expect UPDATE 1)
update service_items set slide_layout='{"maxLines":3}' where id='cccccccc-0000-0000-0000-000000000001';
\echo T2 operator changes key (expect ERROR)
update service_items set song_key='A' where id='cccccccc-0000-0000-0000-000000000001';
\echo T3 operator creates service (expect ERROR rls)
insert into services(church_id,starts_at) values ('00000000-0000-0000-0000-000000000001', now());
\echo T4 operator edits shared song (expect UPDATE 1)
update songs set body='[G]Mare e Domnul' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo T5 operator sees contacts (expect 0)
select count(*) from contacts;
-- MUSICIAN
set request.jwt.uid = '33333333-3333-3333-3333-333333333333';
\echo T6 musician adds note (expect INSERT)
insert into item_notes(item_id,text) values ('cccccccc-0000-0000-0000-000000000001','intro lent');
\echo T7 musician edits song (expect UPDATE 0)
update songs set body='x' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo T8 musician reads plan (expect 1)
select count(*) from service_items;
-- OTHER CHURCH LEADER
set request.jwt.uid = '44444444-4444-4444-4444-444444444444';
\echo T9 other church sees our services (expect 0) and shared song (expect 1)
select (select count(*) from services) svc, (select count(*) from songs) songs;
-- LEADER
set request.jwt.uid = '11111111-1111-1111-1111-111111111111';
\echo T10 leader changes key (expect UPDATE 1) and sees contacts (1)
update service_items set song_key='A' where id='cccccccc-0000-0000-0000-000000000001';
select count(*) from contacts;
\echo T11 song history kept (expect 1)
select count(*) from song_versions;
reset role;
set role anon;
\echo T12 anon connect card ok, then without consent (ERROR)
select submit_connect_card('00000000-0000-0000-0000-000000000001','Ion','Pop','ION@x.ro','',true,'Sunt de acord să fiu contactat');
select submit_connect_card('00000000-0000-0000-0000-000000000001','Ion','Pop','',null,false,'');
\echo T13 anon reads contacts (expect permission denied)
select count(*) from contacts;
