-- Phase 3 / 2C: enforcement core. Run once in the Supabase SQL editor.
-- Account-keyed columns are named user_id everywhere, matching accounts.user_id.
-- Tables are server-controlled (RLS on, no policies -> service-role only).

-- ---- the dial: monthly search limits per tier (change numbers here, no deploy)
create table if not exists public.rate_limits (
  tier text primary key,
  monthly_searches integer not null
);
insert into public.rate_limits (tier, monthly_searches)
  values ('free', 5), ('tdv', 15)
  on conflict (tier) do nothing;

-- ---- operational config singletons
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config (key, value) values
  ('day_timezone', '"America/New_York"'::jsonb),
  ('tier_recheck_days', '7'::jsonb),
  ('ocd_auth_reserved_requests', '8'::jsonb)   -- FLAG 1: top N of the daily OCD budget reserved for authenticated searches
  on conflict (key) do nothing;

-- ---- the reservation/consumption ledger (authenticated searches only)
create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  make text, model text, year integer,
  created_at timestamptz not null default now()
);
create index if not exists search_events_user_created_idx on public.search_events (user_id, created_at);

-- ---- saved results (FLAG 2): every signed-in result; the anonymous free result
--      is stored with user_id null and claimed on sign-in. Never re-run (11a).
create table if not exists public.saved_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.accounts(user_id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);
create index if not exists saved_results_user_idx on public.saved_results (user_id);

-- ---- funnel events, deduped by a stable key where dup firing is likely (11e)
create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  event text not null,
  anon_session_id text,
  user_id uuid,
  dedup_key text,
  created_at timestamptz not null default now()
);
create unique index if not exists funnel_events_dedup_idx on public.funnel_events (event, dedup_key) where dedup_key is not null;
create index if not exists funnel_events_event_created_idx on public.funnel_events (event, created_at);

alter table public.rate_limits    enable row level security;
alter table public.app_config     enable row level security;
alter table public.search_events  enable row level security;
alter table public.saved_results  enable row level security;
alter table public.funnel_events  enable row level security;

-- ---- atomic monthly reserve (11b). Counts this calendar month's searches (in
--      the configured timezone) under a row lock; if under the tier limit +
--      bonus, inserts a reservation and returns it. Exactly-once, race-safe.
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

-- ---- refund a reservation when the search fails server-side (11b)
create or replace function public.release_search(p_event_id bigint)
returns void language sql security definer as $$
  delete from public.search_events where id = p_event_id;
$$;

-- ---- claim an anonymous saved result onto an account on sign-in (11a). Never
--      re-runs; a no-op when missing/expired/already claimed.
create or replace function public.claim_result(p_result_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer as $$
declare v_count integer;
begin
  update public.saved_results
    set user_id = p_user_id
    where id = p_result_id and user_id is null and expires_at > now();
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;
