-- Rețeaua Betleem (pusă pe proiectul „Reverb app” pe 2026-11-24). Betleem e biserica a cărei bibliotecă o citește rețeaua.
insert into public.networks (name) values ('Rețeaua Betleem');
insert into public.churches (name, city, network_id)
select x.name, x.city, n.id from public.networks n, (values
  ('Betleem','Medgidia'),('Rhema','Cobadin'),('Râul Vieții','Peștera'),('Izvorul',null),
  ('Mircea Vodă','Mircea Vodă'),('Satul Nou','Satul Nou'),('Cuza Vodă','Cuza Vodă'),('Băneasa','Băneasa')) as x(name, city)
where n.name = 'Rețeaua Betleem';
update public.networks n set library_church = c.id from public.churches c
 where n.name = 'Rețeaua Betleem' and c.name = 'Betleem' and c.network_id = n.id;
