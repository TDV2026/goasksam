-- Sam Desk — Stage C, step 3: the nightly aggregates cube (Core + venue scope)
-- =====================================================================
-- Run ONCE in the Supabase SQL editor. Secrets are not pullable locally, so Sam
-- runs all DDL. Tiny at creation (empty); the nightly builder (scripts/deskCube.js,
-- run as a job in .github/workflows/nightly.yml AFTER ingest + backfill) fills it.
--
-- WHY: spec section 15. Ranking / trend / comparison over a multi-member set is N
-- pools per question on raw scans (a 4-generation F-body ranking is 4-8 archive
-- reads), which clears correctness but not p95 < 5s. Precomputing per family here
-- turns those questions into a single indexed lookup. Unusual filters (a price cap,
-- a mileage band, a by-month series, a custom window) still fall back to the raw
-- scan with a "still working" line — the cube covers the standard shapes only.
--
-- SCOPE (Core + venue, agreed Sep 2026): auction houses are the first customer and
-- "which house sold the most" is on the home screen, so per-venue rows are precomputed
-- (instant). By-month time series is intentionally NOT precomputed (raw-scan fallback).
--
-- BASIS: identical to One Box / the Desk executor — implied hammer, house premiums
-- backed out, set-asides removed (halo / race / restomod / tuner / parts), medians
-- and quartiles only, NEVER a mean or a midpoint. The builder computes on the same
-- engine so the cube can never disagree with a raw read of the same scope.
--
-- KEY / SENTINELS (so the unique index upserts cleanly — Postgres treats NULLs as
-- distinct, which breaks ON CONFLICT, so "all" is a non-null sentinel, never NULL):
--   generation = ''      -> the whole family (all generations)
--   model_year = 0       -> all model years in the family/generation scope
--   channel    = 'all'   -> online + house combined ('online' / 'house' also stored)
--   venue      = 'all'   -> every source combined (a source slug stored for per-venue)
--   window_key in ('ytd','12mo','24mo','36mo','prior12')   -- prior12 = the 12 months
--                          before the last 12, for the trend (last-12-vs-prior-12) read
-- =====================================================================

create table if not exists desk_aggregates (
  id            bigserial primary key,
  make          text    not null,
  model_family  text    not null,            -- normalized grouping token (see model-family DDL)
  generation    text    not null default '', -- '' = whole family
  model_year    int     not null default 0,  -- 0 = all years in scope
  channel       text    not null default 'all',  -- 'all' | 'online' | 'house'
  venue         text    not null default 'all',  -- source slug, or 'all'
  window_key    text    not null,            -- 'ytd'|'12mo'|'24mo'|'36mo'|'prior12'
  n             int     not null,            -- qualifying sale count in the slice
  median_usd    bigint,                      -- null when n < thin threshold (5)
  q1_usd        bigint,
  q3_usd        bigint,
  min_usd       bigint,
  max_usd       bigint,
  newest_sale   date,
  set_aside     jsonb   not null default '{}'::jsonb,  -- {halo,race,restomod,tuner,parts}
  computed_at   timestamptz not null default now(),
  unique (make, model_family, generation, model_year, channel, venue, window_key)
);

-- Lookup path: a single family/generation slice for a window (single read, comparison
-- member, ranking member). The unique index already covers exact lookups; this index
-- serves the common "one family, all its rows for a window" fan-read.
create index if not exists desk_aggregates_family_idx
  on desk_aggregates (make, model_family, window_key, generation, model_year);

-- "Which house sold the most" (home screen): venue rows for a family/generation, a
-- window, ranked by n. channel='all', venue=<slug>, ordered by count descending.
create index if not exists desk_aggregates_venue_idx
  on desk_aggregates (make, model_family, generation, window_key, venue)
  where venue <> 'all';

-- ---- Locked down FROM CREATION (CLAUDE.md standing rule) ----
-- Server-side code uses the service role key (bypasses RLS). The browser never gets
-- a grant. A leaked anon/authenticated key can do nothing with this table.
alter table desk_aggregates enable row level security;
revoke all on desk_aggregates from anon, authenticated;
-- (No PostgREST RPC function ships with this table, so no function-execute revoke is
-- needed here; the builder and the Desk read the table directly via the service role.)

-- NOTE ON THE BUILDER (not SQL — needs the JS engine for set-asides + hammer):
--   scripts/deskCube.js recomputes this table nightly, AFTER ingest + the model_family
--   backfill, over the tracked family list. It computes each slice on the same One Box
--   engine the Desk uses, then upserts (on conflict on the unique key) so a slice is
--   never half-written. It runs as a job in .github/workflows/nightly.yml. Until it
--   first runs, the table is empty and the Desk transparently uses the raw-scan path
--   for every question (no regression, just not the fast path).
