-- Starter data for Bethlehem Church. Run after 0001_network.sql.
-- Then, in Supabase > Authentication, create your user and run:
--   insert into network_admins(user_id) values ('<your-user-id>');
--   insert into church_members(church_id, user_id, role) values ('00000000-0000-0000-0000-000000000001','<your-user-id>','leader');

insert into churches (id, name, city) values
  ('00000000-0000-0000-0000-000000000001', 'Biserica Bethlehem', null),
  ('00000000-0000-0000-0000-000000000002', 'Bethlehem Peștera', 'Peștera');

insert into departments (church_id, name, color) values
  ('00000000-0000-0000-0000-000000000001', 'Închinare', '#f5b301'),
  ('00000000-0000-0000-0000-000000000001', 'Media',     '#3fa7ff'),
  ('00000000-0000-0000-0000-000000000001', 'Ospitalitate', '#2ecc71'),
  ('00000000-0000-0000-0000-000000000001', 'Asimilare', '#b67cff'),
  ('00000000-0000-0000-0000-000000000001', 'Follow-up', '#ff7a59'),
  ('00000000-0000-0000-0000-000000000001', 'Program',   '#cccccc');

insert into positions (department_id, name, needed)
select d.id, p.name, p.needed from departments d
join (values
  ('Închinare','Lider închinare',1),('Închinare','Vocal',2),('Închinare','Chitară',1),('Închinare','Clape',1),('Închinare','Bas',1),('Închinare','Tobe',1),
  ('Media','Proiecție versuri',1),('Media','Sunet',1),('Media','Live stream',1),
  ('Ospitalitate','Ușă / primire',2),('Ospitalitate','Cafea',1),
  ('Asimilare','Masa pentru oaspeți',1),
  ('Follow-up','Contactare oaspeți noi',1),
  ('Program','Predicator',1),('Program','Moderator program',1)
) as p(dept, name, needed) on p.dept = d.name
where d.church_id = '00000000-0000-0000-0000-000000000001';
