-- Spec A: DAILY SEARCH CAPS. Run once in the Supabase SQL editor.
-- Adds a per-tier daily cap alongside the existing monthly quota and upgrades
-- reserve_search to enforce BOTH (daily AND monthly) atomically, in the
-- configured day timezone (app_config.day_timezone, default America/New_York, so
-- "reset at midnight US Eastern" is exact). Daily caps ride on the same
-- search_events ledger the monthly quota already uses - no new state store.
--
-- Dials (change numbers here, no deploy): daily_cap_free = 1, daily_cap_tdv = 3.
-- Crew devices bypass the whole gate in the API (never reach this function).
-- Anonymous free search is unaffected (it never calls reserve_search).

-- ---- the daily dial, next to the monthly one -------------------------------
alter table public.rate_limits add column if not exists daily_searches integer;
update public.rate_limits set daily_searches = 1 where tier = 'free';
update public.rate_limits set daily_searches = 3 where tier = 'tdv';

-- ---- reserve_search v2: monthly THEN daily, both under the same row lock -----
-- Return contract:
--   allowed=true  -> { allowed, event_id, tier, used, limit, daily_used, daily_limit }
--   monthly hit   -> { allowed:false, reason:'monthly_limit', tier, used, limit }
--   daily hit     -> { allowed:false, reason:'daily_limit',  tier, daily_used, daily_limit }
-- (reason is new; the API maps monthly_limit -> limit_reached, daily_limit ->
--  daily_limit_reached. A missing reason still reads as the monthly wall, so an
--  un-upgraded client degrades safely.)
create or replace function public.reserve_search(p_user_id uuid, p_make text, p_model text, p_year integer)
returns jsonb language plpgsql security definer as $$
declare
  v_tier text; v_bonus integer; v_limit integer; v_daily_limit integer;
  v_tz text; v_month_start timestamptz; v_day_start timestamptz;
  v_used integer; v_daily_used integer; v_event_id bigint;
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
  v_day_start   := date_trunc('day',   (now() at time zone v_tz)) at time zone v_tz;

  select coalesce(monthly_searches, 0), daily_searches
    into v_limit, v_daily_limit
    from public.rate_limits where tier = v_tier;
  v_limit := coalesce(v_limit, 0) + coalesce(v_bonus, 0);

  -- monthly first (an exhausted month is the monthly wall)
  select count(*) into v_used from public.search_events
    where user_id = p_user_id and created_at >= v_month_start;
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit',
      'tier', v_tier, 'used', v_used, 'limit', v_limit);
  end if;

  -- then daily (only when a daily cap is configured for the tier)
  if v_daily_limit is not null then
    select count(*) into v_daily_used from public.search_events
      where user_id = p_user_id and created_at >= v_day_start;
    if v_daily_used >= v_daily_limit then
      return jsonb_build_object('allowed', false, 'reason', 'daily_limit',
        'tier', v_tier, 'daily_used', v_daily_used, 'daily_limit', v_daily_limit);
    end if;
  end if;

  insert into public.search_events (user_id, make, model, year)
    values (p_user_id, p_make, p_model, p_year) returning id into v_event_id;
  return jsonb_build_object('allowed', true, 'event_id', v_event_id,
    'tier', v_tier, 'used', v_used + 1, 'limit', v_limit,
    'daily_used', coalesce(v_daily_used, 0) + 1, 'daily_limit', v_daily_limit);
end; $$;
