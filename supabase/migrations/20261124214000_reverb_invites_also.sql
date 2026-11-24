-- someone who serves in several churches: one link, one account, a membership in each church
-- also = [{ "church_id": "...", "role": "member|leader|coordinator", "departments": [], "leads": [] }]
alter table public.invites add column also jsonb not null default '[]'::jsonb;
