-- Analytics event store and daily summaries (Oct 2026, Lane C). Schema: docs/analytics-events.md.
-- Run the parts in order in the Supabase SQL editor. Every part is safe to run again.
--
-- PART 1  The event store: analytics_events, its indexes, locked down (RLS on, nothing for anon or
--         authenticated). Writes come only from the server with the service role, idempotent on event_id.
-- PART 2  The daily summary tables, locked down the same way. Counts and sums only, no id of any person.
-- PART 3  analytics_refresh_day(day): recomputes every summary table for one Pacific day from the store.
--         The hourly cron runs it for today, the nightly cron for yesterday (finalized = true).
-- PART 4  analytics_refresh_retention(), analytics_width_behavior(days), analytics_repeats(days): weekly cohorts,
--         range width against what people did next, and cars searched again on another day (read by the dashboard).
-- PART 5  Retention and deletion: analytics_purge() (raw events older than 13 months, run nightly),
--         analytics_forget(anon_id, user_id) (a person's deletion request), analytics_link_anon(anon_id,
--         user_id) (sign-in link; never touches declined rows).
-- PART 6  (added Oct 12) Retention by person: analytics_weekly_retention_people, where a signed-in person counts once
--         across devices (the sign-in link ties an anon_id to its account). analytics_refresh_retention() now fills
--         both tables. Run part 6 alone if parts 1 to 5 are already in.
-- Every function is callable by the service role only.

-- ============================================================================================ PART 1
create table if not exists public.analytics_events (
  event_id        uuid primary key,
  ts              timestamptz not null,
  received_at     timestamptz not null default now(),
  name            text not null,
  schema_version  smallint not null default 1,
  product         text not null check (product in ('buy','market_check','sell','tasks','site','email')),
  surface         text,
  anon_id         text,
  user_id         uuid,
  session_id      text,
  region_class    text check (region_class in ('restricted','open')),
  consent         text not null check (consent in ('granted','declined','not_required')),
  ref_domain      text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  launch_wave     text,
  browser_family  text,
  device_class    text,
  is_bot          boolean not null default false,
  internal        boolean not null default false,
  engine_version  text,
  props           jsonb not null default '{}'::jsonb,
  vin             text,   -- admin only: never returned except to an ADMIN_EMAILS viewer of one journey
  -- A declined visitor is never linkable: no anon, session or user id on any of their rows.
  constraint analytics_declined_unlinked check (consent <> 'declined' or (anon_id is null and session_id is null and user_id is null))
);
create index if not exists analytics_events_ts_idx       on public.analytics_events (ts);
create index if not exists analytics_events_name_ts_idx  on public.analytics_events (name, ts);
create index if not exists analytics_events_prod_ts_idx  on public.analytics_events (product, ts);
create index if not exists analytics_events_anon_idx     on public.analytics_events (anon_id, ts) where anon_id is not null;
create index if not exists analytics_events_user_idx     on public.analytics_events (user_id, ts) where user_id is not null;

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;

-- ============================================================================================ PART 2
create table if not exists public.analytics_daily_counts (
  day date not null, product text not null, name text not null,
  events int not null default 0, visitors int not null default 0, sessions int not null default 0,
  finalized boolean not null default false, refreshed_at timestamptz not null default now(),
  primary key (day, product, name)
);
create table if not exists public.analytics_daily_search (
  day date not null, product text not null,
  searches int not null default 0, answered int not null default 0, identity_q int not null default 0,
  not_enough int not null default 0, zero_result int not null default 0, failed int not null default 0,
  catching_breath int not null default 0, fallback_used int not null default 0, year_widened int not null default 0,
  model_used int not null default 0, latency_p50 int, latency_p95 int, width_median numeric,
  finalized boolean not null default false, refreshed_at timestamptz not null default now(),
  primary key (day, product)
);
create table if not exists public.analytics_daily_demand (
  day date not null, make text not null, model text not null, year_band text not null,
  price_band text not null, transmission text not null,
  searches int not null default 0, buy_searches int not null default 0, mc_searches int not null default 0,
  sell_searches int not null default 0, answered int not null default 0, not_enough int not null default 0,
  zero_live int not null default 0, market_checked int not null default 0, tasks_created int not null default 0,
  finalized boolean not null default false, refreshed_at timestamptz not null default now(),
  primary key (day, make, model, year_band, price_band, transmission)
);
create table if not exists public.analytics_daily_cost (
  day date not null, product text not null,
  model_calls int not null default 0, tokens_in bigint not null default 0, tokens_out bigint not null default 0,
  cache_hits int not null default 0, cost_usd numeric not null default 0,
  finalized boolean not null default false, refreshed_at timestamptz not null default now(),
  primary key (day, product)
);
create table if not exists public.analytics_daily_errors (
  day date not null, route text not null, status int not null, errors int not null default 0,
  finalized boolean not null default false, refreshed_at timestamptz not null default now(),
  primary key (day, route, status)
);
create table if not exists public.analytics_daily_cross (
  day date not null, products text not null, visitors int not null default 0,
  finalized boolean not null default false, refreshed_at timestamptz not null default now(),
  primary key (day, products)
);
create table if not exists public.analytics_weekly_retention (
  cohort_week date not null, weeks_after int not null, visitors int not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (cohort_week, weeks_after)
);

alter table public.analytics_daily_counts enable row level security;     revoke all on public.analytics_daily_counts from anon, authenticated;
alter table public.analytics_daily_search enable row level security;     revoke all on public.analytics_daily_search from anon, authenticated;
alter table public.analytics_daily_demand enable row level security;     revoke all on public.analytics_daily_demand from anon, authenticated;
alter table public.analytics_daily_cost enable row level security;       revoke all on public.analytics_daily_cost from anon, authenticated;
alter table public.analytics_daily_errors enable row level security;     revoke all on public.analytics_daily_errors from anon, authenticated;
alter table public.analytics_daily_cross enable row level security;      revoke all on public.analytics_daily_cross from anon, authenticated;
alter table public.analytics_weekly_retention enable row level security; revoke all on public.analytics_weekly_retention from anon, authenticated;

-- ============================================================================================ PART 3
-- One Pacific day. Excludes internal and bot traffic. Deletes the day's rows and writes them again, so a
-- rerun is always safe. p_final marks the day finalized (the nightly run for yesterday).
create or replace function public.analytics_refresh_day(p_day date, p_final boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz := (p_day::timestamp at time zone 'America/Los_Angeles');
  t1 timestamptz := ((p_day + 1)::timestamp at time zone 'America/Los_Angeles');
  n int;
begin
  create temporary table if not exists _ae on commit drop as
    select * from analytics_events where false;
  truncate _ae;
  insert into _ae select * from analytics_events
    where ts >= t0 and ts < t1 and not internal and not is_bot;
  get diagnostics n = row_count;

  delete from analytics_daily_counts where day = p_day;
  insert into analytics_daily_counts (day, product, name, events, visitors, sessions, finalized)
    select p_day, product, name, count(*), count(distinct anon_id), count(distinct session_id), p_final
    from _ae group by product, name;
  -- Site-wide distinct visitors and sessions for the day (product 'all'), so a person on two products counts once.
  insert into analytics_daily_counts (day, product, name, events, visitors, sessions, finalized)
    select p_day, 'all', 'visitors', count(*), count(distinct anon_id), count(distinct session_id), p_final from _ae;

  delete from analytics_daily_search where day = p_day;
  insert into analytics_daily_search (day, product, searches, answered, identity_q, not_enough, zero_result, failed,
      catching_breath, fallback_used, year_widened, model_used, latency_p50, latency_p95, width_median, finalized)
    select p_day, product, count(*),
      count(*) filter (where props->>'answer_type' = 'range'),
      count(*) filter (where props->>'answer_type' = 'identity_question'),
      count(*) filter (where props->>'answer_type' = 'not_enough_data'),
      count(*) filter (where props->>'answer_type' = 'zero_result'),
      count(*) filter (where props->>'answer_type' = 'failed'),
      count(*) filter (where props->>'failure_state' = 'catching_breath'),
      count(*) filter (where coalesce(props->>'fallback_rung','') not in ('', 'base', 'exact_trim', 'exact_trim_keyword')),
      count(*) filter (where (props->>'year_widened')::boolean is true),
      count(*) filter (where (props->>'model_used')::boolean is true),
      percentile_cont(0.5) within group (order by (props->>'latency_ms')::numeric)::int,
      percentile_cont(0.95) within group (order by (props->>'latency_ms')::numeric)::int,
      percentile_cont(0.5) within group (order by case when (props->>'range_low')::numeric > 0
        then ((props->>'range_high')::numeric - (props->>'range_low')::numeric) / (props->>'range_low')::numeric end),
      p_final
    from _ae where name = 'search_run' group by product;

  delete from analytics_daily_demand where day = p_day;
  insert into analytics_daily_demand (day, make, model, year_band, price_band, transmission, searches, buy_searches,
      mc_searches, sell_searches, answered, not_enough, zero_live, market_checked, tasks_created, finalized)
    select p_day, make, model, year_band, price_band, transmission,
      count(*) filter (where name = 'search_run'),
      count(*) filter (where name = 'search_run' and product = 'buy'),
      count(*) filter (where name = 'search_run' and product = 'market_check'),
      count(*) filter (where name = 'search_run' and product = 'sell'),
      count(*) filter (where name = 'search_run' and props->>'answer_type' = 'range'),
      count(*) filter (where name = 'search_run' and props->>'answer_type' = 'not_enough_data'),
      count(*) filter (where name = 'search_run' and product = 'buy' and coalesce((props->>'live_count')::int, 0) = 0),
      count(*) filter (where name = 'search_run' and product = 'market_check' and props->>'answer_type' = 'range'),
      count(*) filter (where name = 'task_created'),
      p_final
    from (
      select name, product, props,
        lower(split_part(props->>'vehicle_key', '|', 1)) as make,
        lower(coalesce(nullif(split_part(props->>'vehicle_key', '|', 2), ''), '-')) as model,
        case when (props->>'year') ~ '^[0-9]{4}$' then ((props->>'year')::int / 5 * 5)::text || 's' else '-' end as year_band,
        case when (props->>'range_low') is null then '-'
             when (props->>'range_low')::numeric < 25000 then 'under 25k'
             when (props->>'range_low')::numeric < 50000 then '25k to 50k'
             when (props->>'range_low')::numeric < 100000 then '50k to 100k'
             when (props->>'range_low')::numeric < 250000 then '100k to 250k'
             else '250k and up' end as price_band,
        coalesce(props->>'transmission', '-') as transmission
      from _ae where name in ('search_run', 'task_created') and coalesce(props->>'vehicle_key', '') <> ''
    ) x group by make, model, year_band, price_band, transmission;

  delete from analytics_daily_cost where day = p_day;
  insert into analytics_daily_cost (day, product, model_calls, tokens_in, tokens_out, cache_hits, cost_usd, finalized)
    select p_day, product, count(*), coalesce(sum((props->>'tokens_in')::bigint), 0), coalesce(sum((props->>'tokens_out')::bigint), 0),
      count(*) filter (where (props->>'cache_hit')::boolean is true), coalesce(sum((props->>'cost_usd')::numeric), 0), p_final
    from analytics_events
    -- Cost counts internal traffic too: it is real spend and must match the ledger.
    where ts >= t0 and ts < t1 and name = 'model_call' group by product;

  delete from analytics_daily_errors where day = p_day;
  insert into analytics_daily_errors (day, route, status, errors, finalized)
    select p_day, coalesce(props->>'route', '-'), coalesce((props->>'status')::int, 0), count(*), p_final
    from _ae where name = 'error' group by 2, 3;

  delete from analytics_daily_cross where day = p_day;
  insert into analytics_daily_cross (day, products, visitors, finalized)
    select p_day, products, count(*), p_final from (
      select anon_id, string_agg(distinct product, '+' order by product) as products
      from _ae where anon_id is not null and product in ('buy','market_check','sell','tasks') group by anon_id
    ) v group by products;

  return n;
end $$;

-- ============================================================================================ PART 4
create or replace function public.analytics_refresh_retention()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from analytics_weekly_retention;
  insert into analytics_weekly_retention (cohort_week, weeks_after, visitors)
    select f.cohort_week, ((a.wk - f.cohort_week) / 7)::int, count(distinct a.anon_id)
    from (select anon_id, date_trunc('week', min(ts) at time zone 'America/Los_Angeles')::date as cohort_week
            from analytics_events where anon_id is not null and not internal and not is_bot group by anon_id) f
    join (select distinct anon_id, date_trunc('week', ts at time zone 'America/Los_Angeles')::date as wk
            from analytics_events where anon_id is not null and not internal and not is_bot) a using (anon_id)
    group by 1, 2;
  get diagnostics n = row_count;
  return n;
end $$;

-- Range width against behavior: each range answer on Market Check or Buy, bucketed by width (high minus
-- low, over low), with the share of those sessions that went on to open a receipt or click out within
-- the same session afterwards. Session-scoped only, so declined visitors (no session) are not in it.
create or replace function public.analytics_width_behavior(p_days int default 7)
returns table (product text, width_band text, searches bigint, went_on bigint)
language sql security definer set search_path = public as $$
  with s as (
    select event_id, product, session_id, ts,
      case when w < 0.25 then 'under 25%' when w < 0.5 then '25 to 50%' when w < 1 then '50 to 100%' else '100% and up' end as width_band
    from (select *, ((props->>'range_high')::numeric - (props->>'range_low')::numeric) / nullif((props->>'range_low')::numeric, 0) as w
            from analytics_events
           where name = 'search_run' and props->>'answer_type' = 'range' and session_id is not null
             and not internal and not is_bot and ts >= now() - make_interval(days => p_days)
             and product in ('market_check', 'buy')) r
    where w is not null
  )
  select s.product, s.width_band, count(*),
    count(*) filter (where exists (select 1 from analytics_events e where e.session_id = s.session_id and e.ts > s.ts
      and e.name in ('receipt_opened', 'auction_clickout', 'live_car_clicked')))
  from s group by 1, 2 order by 1, 2;
$$;

-- Repeat demand: the cars people searched more than once (same anon_id, two or more separate days, any product).
-- Counts only; the anon ids never leave the function.
create or replace function public.analytics_repeats(p_days int default 30)
returns table (vehicle_key text, visitors bigint, searches bigint)
language sql security definer set search_path = public as $$
  select vk, count(*) filter (where days >= 2), sum(n)
  from (select props->>'vehicle_key' as vk, anon_id, count(*) as n,
               count(distinct (ts at time zone 'America/Los_Angeles')::date) as days
          from analytics_events
         where name = 'search_run' and anon_id is not null and coalesce(props->>'vehicle_key', '') <> ''
           and not internal and not is_bot and ts >= now() - make_interval(days => p_days)
         group by 1, 2) x
  group by vk having count(*) filter (where days >= 2) > 0
  order by 2 desc, 3 desc limit 50;
$$;

-- ============================================================================================ PART 5
create or replace function public.analytics_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from analytics_events where ts < now() - interval '13 months';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.analytics_forget(p_anon text, p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_anon is null and p_user is null then return 0; end if;
  delete from analytics_events where (p_anon is not null and anon_id = p_anon) or (p_user is not null and user_id = p_user);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.analytics_link_anon(p_anon text, p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_anon is null or p_user is null then return 0; end if;
  update analytics_events set user_id = p_user
   where anon_id = p_anon and user_id is null and consent <> 'declined';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.analytics_refresh_day(date, boolean) from public, anon, authenticated;
grant  execute on function public.analytics_refresh_day(date, boolean) to service_role;
revoke execute on function public.analytics_refresh_retention() from public, anon, authenticated;
grant  execute on function public.analytics_refresh_retention() to service_role;
revoke execute on function public.analytics_width_behavior(int) from public, anon, authenticated;
grant  execute on function public.analytics_width_behavior(int) to service_role;
revoke execute on function public.analytics_repeats(int) from public, anon, authenticated;
grant  execute on function public.analytics_repeats(int) to service_role;
revoke execute on function public.analytics_purge() from public, anon, authenticated;
grant  execute on function public.analytics_purge() to service_role;
revoke execute on function public.analytics_forget(text, uuid) from public, anon, authenticated;
grant  execute on function public.analytics_forget(text, uuid) to service_role;
revoke execute on function public.analytics_link_anon(text, uuid) from public, anon, authenticated;
grant  execute on function public.analytics_link_anon(text, uuid) to service_role;

-- ============================================================================================ PART 6
-- A person is their account when any of their rows carries one (directly, or through the sign-in link on the
-- same anon_id), otherwise their anon_id. Declined visitors have neither and are not in it.
create table if not exists public.analytics_weekly_retention_people (
  cohort_week date not null, weeks_after int not null, people int not null default 0, signed_in int not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (cohort_week, weeks_after)
);
alter table public.analytics_weekly_retention_people enable row level security;
revoke all on public.analytics_weekly_retention_people from anon, authenticated;

create or replace function public.analytics_refresh_retention()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from analytics_weekly_retention;
  insert into analytics_weekly_retention (cohort_week, weeks_after, visitors)
    select f.cohort_week, ((a.wk - f.cohort_week) / 7)::int, count(distinct a.anon_id)
    from (select anon_id, date_trunc('week', min(ts) at time zone 'America/Los_Angeles')::date as cohort_week
            from analytics_events where anon_id is not null and not internal and not is_bot group by anon_id) f
    join (select distinct anon_id, date_trunc('week', ts at time zone 'America/Los_Angeles')::date as wk
            from analytics_events where anon_id is not null and not internal and not is_bot) a using (anon_id)
    group by 1, 2;
  get diagnostics n = row_count;

  delete from analytics_weekly_retention_people;
  insert into analytics_weekly_retention_people (cohort_week, weeks_after, people, signed_in)
    with link as (
      select distinct on (anon_id) anon_id, user_id from analytics_events
       where anon_id is not null and user_id is not null order by anon_id, ts desc
    ), ev as (
      select coalesce(e.user_id::text, l.user_id::text, e.anon_id) as person,
             (e.user_id is not null or l.user_id is not null) as known,
             date_trunc('week', e.ts at time zone 'America/Los_Angeles')::date as wk
        from analytics_events e left join link l on l.anon_id = e.anon_id
       where (e.anon_id is not null or e.user_id is not null) and not e.internal and not e.is_bot
    ), f as (select person, bool_or(known) as known, min(wk) as cohort_week from ev group by person)
    select f.cohort_week, ((a.wk - f.cohort_week) / 7)::int, count(distinct a.person), count(distinct a.person) filter (where f.known)
      from f join (select distinct person, wk from ev) a using (person)
     group by 1, 2;
  return n;
end $$;
revoke execute on function public.analytics_refresh_retention() from public, anon, authenticated;
grant  execute on function public.analytics_refresh_retention() to service_role;
