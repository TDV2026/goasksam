-- Phase 3 / 2C corrective. Run once in the Supabase SQL editor.
-- An earlier partial run left public.search_events without the make/model/year
-- columns, so reserve_search's insert errors and every authenticated search
-- reads back as limit_reached. This adds the missing columns (non-destructive)
-- and re-asserts the rate_limits seed.

alter table public.search_events add column if not exists make  text;
alter table public.search_events add column if not exists model text;
alter table public.search_events add column if not exists year  integer;

insert into public.rate_limits (tier, monthly_searches)
  values ('free', 5), ('tdv', 15)
  on conflict (tier) do nothing;
