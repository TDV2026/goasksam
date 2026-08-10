-- Spec A + DAILY-ONLY policy: per-user limits are DAILY caps only. Run once in
-- the Supabase SQL editor (re-run safe; it is create-or-replace + idempotent
-- updates). Enforces the daily cap in the configured day timezone
-- (app_config.day_timezone, default America/New_York, so "reset at midnight US
-- Eastern" is exact). Daily caps ride on the same search_events ledger.
--
-- Dials (change numbers here, no deploy): daily_cap_free = 1, daily_cap_tdv = 3.
-- MONTHLY quotas are RETIRED for standard tiers: monthly_searches is NULL for
-- free + tdv, and reserve_search treats a NULL monthly as UNLIMITED, so the
-- monthly wall is unreachable. The column and the check stay in place for any
-- future tier that explicitly sets a monthly cap.
-- Crew devices bypass the whole gate in the API. Anonymous (1/device) never
-- calls reserve_search.

-- ---- daily dial + retire the monthly cap for standard tiers -----------------
alter table public.rate_limits add column if not exists daily_searches integer;
update public.rate_limits set daily_searches = 1 where tier = 'free';
update public.rate_limits set daily_searches = 3 where tier = 'tdv';
-- Monthly retired: NULL = unlimited (reserve_search skips the monthly check).
update public.rate_limits set monthly_searches = null where tier in ('free', 'tdv');

-- ---- reserve_search: OPTIONAL monthly, then daily, under one row lock --------
-- Return contract:
--   allowed=true  -> { allowed, event_id, tier, used, limit, daily_used, daily_limit }
--   monthly hit   -> { allowed:false, reason:'monthly_limit', tier, used, limit }   (only tiers with a monthly cap)
--   daily hit     -> { allowed:false, reason:'daily_limit',  tier, daily_used, daily_limit }
-- The API maps monthly_limit -> limit_reached, daily_limit -> daily_limit_reached.
create or replace function public.reserve_search(p_user_id uuid, p_make text, p_model text, p_year integer)
returns jsonb language plpgsql security definer as $$
declare
  v_tier text; v_bonus integer; v_monthly integer; v_limit integer; v_daily_limit integer;
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

  select monthly_searches, daily_searches
    into v_monthly, v_daily_limit
    from public.rate_limits where tier = v_tier;

  -- MONTHLY is optional now (daily-only policy): a NULL monthly_searches means
  -- unlimited, so the monthly wall is unreachable. Only tiers that explicitly set
  -- a monthly cap are ever checked here.
  if v_monthly is not null then
    v_limit := v_monthly + coalesce(v_bonus, 0);
    select count(*) into v_used from public.search_events
      where user_id = p_user_id and created_at >= v_month_start;
    if v_used >= v_limit then
      return jsonb_build_object('allowed', false, 'reason', 'monthly_limit',
        'tier', v_tier, 'used', v_used, 'limit', v_limit);
    end if;
  end if;

  -- DAILY cap (the only per-user limit for standard tiers).
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
    'tier', v_tier, 'used', coalesce(v_used, 0) + 1, 'limit', v_limit,
    'daily_used', coalesce(v_daily_used, 0) + 1, 'daily_limit', v_daily_limit);
end; $$;
