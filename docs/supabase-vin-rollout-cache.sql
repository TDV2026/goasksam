-- vin_rollout_cache: the nightly-precomputed rollout() result (api/history.js) that sitemap-vins.xml,
-- sitemap-motorcycles.xml, sitemap-other.xml and sitemap-vins-hubs.xml all read from, instead of
-- computing it live on every request (the 504-at-300s fix, Oct 2026). Single row, keyed 'current'.
-- Written by scripts/buildVinRolloutCache.js, which calls the SAME rollout() the live sitemap
-- endpoints fall back to - never a second implementation. Run this file once in the Supabase SQL editor.

create table if not exists vin_rollout_cache (
  key text primary key,
  data jsonb not null,
  computed_at timestamptz not null default now()
);

alter table vin_rollout_cache enable row level security;
revoke all on vin_rollout_cache from anon, authenticated;
