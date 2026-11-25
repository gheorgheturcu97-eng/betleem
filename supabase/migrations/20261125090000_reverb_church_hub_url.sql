-- the address of the church computer on the church Wi-Fi (Proiectez / MD&TRACK from the personal link).
-- Only local network addresses: nothing here opens the computer to the internet.
alter table public.churches add column if not exists hub_url text
  check (hub_url is null or hub_url ~ '^http://((10|127)\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|[A-Za-z0-9-]+\.local)(:[0-9]{2,5})?$');
