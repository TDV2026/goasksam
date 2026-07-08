-- Market-fetch cache (Phase 3). One row per make|model-family records the
-- last time we fetched that family from OldCarsData. Within 24 hours,
-- sellerDecision serves records from vehicle_market_records instead of
-- burning metered /auctions requests. Run once in the Supabase SQL editor.

create table if not exists market_fetch_cache (
  cache_key text primary key,
  make text,
  model_family text,
  fetched_at timestamptz not null default now(),
  metered_requests integer not null default 0
);

alter table market_fetch_cache enable row level security;
