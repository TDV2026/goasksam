-- spec_market_cache (Lane C, Oct 2026): what each exact spec sells for, precomputed so /buy's
-- search_live and card lines never run the One Box engine live. One row per spec key, the same key
-- the budget rule and the card's market line use: JSON [make, model, trim, generation code, body,
-- gearbox]. `market` holds the engine's answer reduced to what /buy needs (range or count, window,
-- family label, the sold cards' miles, the last three sales, where it mostly sells, the pattern
-- sentence). Refreshed nightly by scripts/buildSpecMarketCache.js after buildVinIndex; a missing key
-- is filled on first miss. Run once in the Supabase SQL editor.
create table if not exists spec_market_cache (
  spec_key    text primary key,
  market      jsonb,                 -- null = the engine answered with nothing to say for this spec
  low_usd     numeric,               -- the sold range (null when there is no range)
  high_usd    numeric,
  sale_count  integer,
  computed_at timestamptz not null default now()
);
create index if not exists spec_market_cache_computed_idx on spec_market_cache (computed_at);

-- Standing DB-security rule: locked from creation. Server code uses the service role (bypasses RLS).
alter table spec_market_cache enable row level security;
revoke all on spec_market_cache from anon, authenticated;
