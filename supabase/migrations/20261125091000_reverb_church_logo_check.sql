-- the church's own logo (shown when Reverb online welcomes its people): a small PNG made by the page, or an https link
alter table public.churches add constraint churches_logo_url_check
  check (logo_url is null or (length(logo_url) < 400000 and (logo_url like 'data:image/png;base64,%' or logo_url like 'https://%')));
