-- =====================================================================
-- Business analytics: seller JOURNEYS (search -> sale). Forward-only from
-- deploy; nothing historical is backfilled. Three tables + two RPCs.
--
-- journeys       - the mutable spine, one row per (person + vehicle) attempt.
-- journey_events - append-only structured business events, deduped.
-- journey_audit  - one row per manual field change (who/what/old/new/when).
--
-- Identity: canonical anon_id = the first-party localStorage "gas_anon";
-- user_id filled the first time a signed-in event arrives (anon -> signed-in
-- continuity). Internal-only; no third-party/cross-site identifiers.
--
-- Access: server endpoints call these as SERVICE ROLE (bypasses RLS). RLS is
-- ON with NO policies, so the anon/public key can neither read nor write.
-- Run once in the Supabase SQL editor.
-- =====================================================================

-- ---------- stage ranking (furthest-reached label lives in journeys.stage) ----------
create or replace function public.journey_rank(p text) returns int language sql immutable as $$
  select case p
    when 'seller_journey_started'     then 10
    when 'vehicle_identified'         then 20
    when 'seller_questions_completed' then 30
    when 'recommendation_started'     then 35
    when 'recommendation_completed'   then 40
    when 'platform_recommended'       then 40
    when 'powerseller_recommended'    then 40
    when 'platform_cta_viewed'        then 45
    when 'powerseller_card_viewed'    then 45
    when 'platform_cta_clicked'       then 50
    when 'powerseller_intro_clicked'  then 52
    when 'powerseller_intro_requested' then 55
    when 'powerseller_intro_sent'     then 60
    when 'powerseller_contacted'      then 70
    when 'powerseller_engaged'        then 80
    when 'consignment_accepted'       then 90
    when 'vehicle_listed'             then 100
    when 'vehicle_sold'               then 110
    when 'journey_closed_no_sale'     then 5   -- terminal-negative; tracked via sale_status, never masks positive progress
    else 0
  end;
$$;

-- ---------- journeys (spine) ----------
create table if not exists public.journeys (
  journey_id          uuid primary key,
  anon_id             text,
  user_id             uuid,                 -- references accounts(user_id); soft (no FK) so an anon journey survives account deletion
  created_at          timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),

  -- attribution (Phase 4 fills these; columns exist now so no later migration)
  first_touch         jsonb,                -- {source, utm_source, utm_medium, utm_campaign, referrer, at}
  last_touch          jsonb,

  -- vehicle (from the resolved vehicle; filled once, refined only if still null)
  vehicle_year        integer,
  vehicle_make        text,
  vehicle_model       text,
  vehicle_trim        text,
  vehicle_generation  text,
  vehicle_location    text,
  vehicle_mileage     text,
  vehicle_attrs       jsonb,                -- condition, records, title, price, timeline, ...

  -- recommendation snapshot (from the seller_decision)
  rec_status          text,                 -- 'completed' | 'failed' | null
  rec_platform        text,
  rec_powerseller     text,
  rec_scope           text,                 -- landed ladder rung / scope label
  rec_window          text,                 -- analysis window e.g. '90d'
  rec_estimated_value numeric,              -- comps estimate (context for GMV; never a valuation shown to users)

  -- furthest stage reached (an event_type string, ranked by journey_rank)
  stage               text not null default 'seller_journey_started',

  -- event-driven convenience timestamps
  platform_cta_clicked_at    timestamptz,
  powerseller_card_viewed_at timestamptz,
  intro_requested_at         timestamptz,

  -- MANUAL downstream lifecycle (set only via journey_manual_update; never inferred)
  intro_sent_at       timestamptz,
  contacted_at        timestamptz,
  engaged_at          timestamptz,
  consignment_at      timestamptz,
  listed_at           timestamptz,
  actual_platform     text,
  listing_url         text,
  listing_date        date,
  sale_status         text,                 -- null(unknown) | 'listed' | 'sold' | 'no_sale'  (explicit; a listing NEVER implies a sale)
  sold_at             timestamptz,
  sale_price          numeric,
  gas_revenue         numeric,
  closed_no_sale_at   timestamptz,
  internal_notes      text,                 -- INTERNAL ONLY; never returned to consumer-facing surfaces

  updated_at          timestamptz not null default now()
);
create index if not exists journeys_anon_idx    on public.journeys (anon_id);
create index if not exists journeys_user_idx     on public.journeys (user_id);
create index if not exists journeys_created_idx  on public.journeys (created_at desc);
create index if not exists journeys_stage_idx    on public.journeys (stage);
create index if not exists journeys_make_model_idx on public.journeys (vehicle_make, vehicle_model);

-- ---------- journey_events (append-only, deduped) ----------
create table if not exists public.journey_events (
  event_id      uuid primary key default gen_random_uuid(),
  journey_id    uuid not null,
  occurred_at   timestamptz not null default now(),
  event_type    text not null,
  anon_id       text,
  user_id       uuid,
  platform_id   text,
  powerseller_id text,
  dedup_key     text,
  metadata      jsonb not null default '{}'::jsonb
);
-- Idempotency: at most one row per (journey, event_type, natural key). A null
-- dedup_key collapses to one-per-(journey,event_type) which is what the
-- once-per-journey events want; keyed events differentiate by the key.
create unique index if not exists journey_events_dedup_idx
  on public.journey_events (journey_id, event_type, (coalesce(dedup_key, '')));
create index if not exists journey_events_journey_idx on public.journey_events (journey_id, occurred_at);
create index if not exists journey_events_type_idx    on public.journey_events (event_type, occurred_at desc);

-- ---------- journey_audit (manual-change log) ----------
create table if not exists public.journey_audit (
  id           bigint generated always as identity primary key,
  journey_id   uuid not null,
  changed_by   text not null,
  field        text not null,
  old_value    text,
  new_value    text,
  changed_at   timestamptz not null default now(),
  note         text
);
create index if not exists journey_audit_journey_idx on public.journey_audit (journey_id, changed_at desc);

-- ---------- RPC 1: record a journey event (upsert spine + append event, idempotent) ----------
create or replace function public.record_journey_event(
  p_journey_id     uuid,
  p_event_type     text,
  p_anon_id        text        default null,
  p_user_id        uuid        default null,
  p_platform_id    text        default null,
  p_powerseller_id text        default null,
  p_dedup_key      text        default null,
  p_metadata       jsonb       default '{}'::jsonb,
  p_vehicle        jsonb       default null,   -- {year,make,model,trim,generation,location,mileage,attrs}
  p_snapshot       jsonb       default null,   -- {rec_status,rec_platform,rec_powerseller,rec_scope,rec_window,rec_estimated_value}
  p_occurred_at    timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inserted int := 0;
begin
  if p_journey_id is null or p_event_type is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_journey_or_type');
  end if;

  -- 1) upsert the spine. Manual downstream fields are NEVER touched here.
  insert into public.journeys (
    journey_id, anon_id, user_id, created_at, last_activity_at,
    vehicle_year, vehicle_make, vehicle_model, vehicle_trim, vehicle_generation, vehicle_location, vehicle_mileage, vehicle_attrs,
    rec_status, rec_platform, rec_powerseller, rec_scope, rec_window, rec_estimated_value,
    stage, updated_at
  ) values (
    p_journey_id, p_anon_id, p_user_id, p_occurred_at, p_occurred_at,
    nullif(p_vehicle->>'year','')::int, p_vehicle->>'make', p_vehicle->>'model', p_vehicle->>'trim',
    p_vehicle->>'generation', p_vehicle->>'location', p_vehicle->>'mileage', p_vehicle->'attrs',
    p_snapshot->>'rec_status', p_snapshot->>'rec_platform', p_snapshot->>'rec_powerseller',
    p_snapshot->>'rec_scope', p_snapshot->>'rec_window', nullif(p_snapshot->>'rec_estimated_value','')::numeric,
    p_event_type, p_occurred_at
  )
  on conflict (journey_id) do update set
    last_activity_at = greatest(public.journeys.last_activity_at, excluded.last_activity_at),
    user_id  = coalesce(public.journeys.user_id, excluded.user_id),    -- learn the account once; never unset
    anon_id  = coalesce(public.journeys.anon_id, excluded.anon_id),
    vehicle_year       = coalesce(public.journeys.vehicle_year, excluded.vehicle_year),
    vehicle_make       = coalesce(public.journeys.vehicle_make, excluded.vehicle_make),
    vehicle_model      = coalesce(public.journeys.vehicle_model, excluded.vehicle_model),
    vehicle_trim       = coalesce(public.journeys.vehicle_trim, excluded.vehicle_trim),
    vehicle_generation = coalesce(public.journeys.vehicle_generation, excluded.vehicle_generation),
    vehicle_location   = coalesce(public.journeys.vehicle_location, excluded.vehicle_location),
    vehicle_mileage    = coalesce(public.journeys.vehicle_mileage, excluded.vehicle_mileage),
    vehicle_attrs      = coalesce(excluded.vehicle_attrs, public.journeys.vehicle_attrs),
    rec_status          = coalesce(excluded.rec_status, public.journeys.rec_status),
    rec_platform        = coalesce(excluded.rec_platform, public.journeys.rec_platform),
    rec_powerseller     = coalesce(excluded.rec_powerseller, public.journeys.rec_powerseller),
    rec_scope           = coalesce(excluded.rec_scope, public.journeys.rec_scope),
    rec_window          = coalesce(excluded.rec_window, public.journeys.rec_window),
    rec_estimated_value = coalesce(excluded.rec_estimated_value, public.journeys.rec_estimated_value),
    stage = case when public.journey_rank(excluded.stage) > public.journey_rank(public.journeys.stage)
                 then excluded.stage else public.journeys.stage end,
    updated_at = now();

  -- anon -> signed-in continuity: the first time we learn the account behind an
  -- anon_id, attribute that anon's OTHER journeys (that have no account yet) to it.
  -- Bounded to one anon_id; the known limitation is a shared browser profile.
  if p_user_id is not null and p_anon_id is not null then
    update public.journeys set user_id = p_user_id, updated_at = now()
     where anon_id = p_anon_id and user_id is null and journey_id <> p_journey_id;
  end if;

  -- event-driven timestamps (manual ones are set by journey_manual_update)
  if p_event_type = 'platform_cta_clicked' then
    update public.journeys set platform_cta_clicked_at = coalesce(platform_cta_clicked_at, p_occurred_at) where journey_id = p_journey_id;
  elsif p_event_type = 'powerseller_card_viewed' then
    update public.journeys set powerseller_card_viewed_at = coalesce(powerseller_card_viewed_at, p_occurred_at) where journey_id = p_journey_id;
  elsif p_event_type = 'powerseller_intro_requested' then
    update public.journeys set intro_requested_at = coalesce(intro_requested_at, p_occurred_at) where journey_id = p_journey_id;
  end if;

  -- 2) append the event, idempotent (dedup)
  insert into public.journey_events (journey_id, occurred_at, event_type, anon_id, user_id, platform_id, powerseller_id, dedup_key, metadata)
  values (p_journey_id, p_occurred_at, p_event_type, p_anon_id, p_user_id, p_platform_id, p_powerseller_id, p_dedup_key, coalesce(p_metadata, '{}'::jsonb))
  on conflict (journey_id, event_type, (coalesce(dedup_key, ''))) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('ok', true, 'event_inserted', v_inserted > 0);
end;
$$;

-- ---------- RPC 2: manual field update + audit (Phase 3 admin) ----------
create or replace function public.journey_manual_update(
  p_journey_id uuid, p_field text, p_value text, p_changed_by text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'intro_sent_at','contacted_at','engaged_at','consignment_at','listed_at',
    'actual_platform','listing_url','listing_date','sale_status','sold_at',
    'sale_price','gas_revenue','closed_no_sale_at','internal_notes','stage'];
  v_old text;
begin
  if not (p_field = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'reason', 'field_not_allowed');
  end if;
  execute format('select (%I)::text from public.journeys where journey_id = $1', p_field) into v_old using p_journey_id;
  execute format('update public.journeys set %I = $1, updated_at = now() where journey_id = $2', p_field)
    using nullif(p_value, ''), p_journey_id;
  insert into public.journey_audit (journey_id, changed_by, field, old_value, new_value, note)
    values (p_journey_id, p_changed_by, p_field, v_old, nullif(p_value, ''), p_note);
  return jsonb_build_object('ok', true, 'field', p_field, 'old', v_old, 'new', nullif(p_value, ''));
end;
$$;

-- ---------- lock down: RLS on (no policies -> service role only); RPCs to service_role ----------
alter table public.journeys       enable row level security;
alter table public.journey_events enable row level security;
alter table public.journey_audit  enable row level security;

revoke all on function public.record_journey_event(uuid,text,text,uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.journey_manual_update(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_journey_event(uuid,text,text,uuid,text,text,text,jsonb,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.journey_manual_update(uuid,text,text,text,text) to service_role;
