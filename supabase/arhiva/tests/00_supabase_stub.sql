-- Local permission tests. See supabase/tests/README.md
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true),'')::uuid $$;
create role anon; create role authenticated;
create publication supabase_realtime;
