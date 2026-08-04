-- Phase 3 / 2C DEFINITIVE fix. Run in the Supabase SQL editor for the PRODUCTION
-- project (otkmxyrglikdoychnmvy.supabase.co - confirm the project name top-left).
-- An earlier partial run left public.search_events without make/model/year and
-- the ALTER didn't take, so reserve_search errors and every authenticated search
-- reads back as (fail-open) unmetered. This drops + recreates search_events with
-- the correct schema and rebinds reserve_search. search_events holds only test
-- reservations (nothing user-facing), so the drop loses nothing real.

drop table if exists public.search_events cascade;

create table public.search_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  make text, model text, year integer,
  created_at timestamptz not null default now()
);
create index if not exists search_events_user_created_idx on public.search_events (user_id, created_at);
alter table public.search_events enable row level security;

-- Re-seed the limits in case they are missing.
insert into public.rate_limits (tier, monthly_searches)
  values ('free', 5), ('tdv', 15)
  on conflict (tier) do nothing;

-- Recreate the reserve function so its plan binds to the fresh table.
create or replace function public.reserve_search(p_user_id uuid, p_make text, p_model text, p_year integer)
returns jsonb language plpgsql security definer as $$
declare
  v_tier text; v_bonus integer; v_limit integer;
  v_tz text; v_month_start timestamptz; v_used integer; v_event_id bigint;
begin
  select tier, bonus_searches into v_tier, v_bonus
    from public.accounts where user_id = p_user_id for update;
  if v_tier is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_account');
  end if;
  select coalesce(value #>> '{}', 'America/New_York') into v_tz
    from public.app_config where key = 'day_timezone';
  v_tz := coalesce(v_tz, 'America/New_York');
  v_month_start := date_trunc('month', (now() at time zone v_tz)) at time zone v_tz;
  select coalesce(monthly_searches, 0) into v_limit from public.rate_limits where tier = v_tier;
  v_limit := coalesce(v_limit, 0) + coalesce(v_bonus, 0);
  select count(*) into v_used from public.search_events
    where user_id = p_user_id and created_at >= v_month_start;
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'tier', v_tier, 'used', v_used, 'limit', v_limit);
  end if;
  insert into public.search_events (user_id, make, model, year)
    values (p_user_id, p_make, p_model, p_year) returning id into v_event_id;
  return jsonb_build_object('allowed', true, 'event_id', v_event_id, 'tier', v_tier, 'used', v_used + 1, 'limit', v_limit);
end; $$;
