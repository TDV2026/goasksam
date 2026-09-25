-- Sam Desk — Stage C, step 1: the model_family column + its indexes
-- =====================================================================
-- Run ONCE in the Supabase SQL editor. Secrets are not pullable locally, so Sam
-- runs all DDL. This is ADDITIVE and safe: a new nullable column plus two indexes.
-- No data is rewritten by this file; the backfill is a separate nightly script
-- (scripts/ingest.js --backfill-family, run by Sam / the nightly Action) that
-- populates model_family for existing rows and every new ingest going forward.
--
-- WHY THIS COLUMN
--   Two Stage C needs converge on one column:
--   1. The RECORD path (docs/desk-record-timeout-findings.md): the all-time top
--      sale for a badged car (BMW M3) is a leading-wildcard ILIKE + price sort that
--      the planner runs unstably (2 to 38s). With model_family populated, the query
--      becomes  make='BMW' AND model_family='M3' ORDER BY sale_price DESC LIMIT 1,
--      an exact range scan on the composite index below (sub-second).
--   2. RANKING / GROUPING: a family read (E-Class, ranked-set members) aggregates a
--      badged family whose rows are titled by badge (E350, E550, E320). model_family
--      is the shared grouping key, computed once at ingest from lib/modelFamilies.js
--      (familyFor / familyBadgeMatch) and the performance-badge logic, instead of a
--      per-query scan of every badge variant.
--
-- SEMANTICS (set by the backfill, documented here so nobody rediscovers it)
--   model_family is the NORMALISED grouping token for a row, chosen in this order:
--     a. a badged family head where the row belongs to one (MODEL_FAMILY):
--        Mercedes E350/E550/E320  -> 'E-Class';   BMW M3/335i/328i -> '3 Series'.
--     b. a performance badge that is its own market (BMW M3, Merc 190E 2.3-16,
--        Porsche 944 Turbo): the badge itself -> 'M3', '190E 2.3-16', '944 Turbo'.
--     c. otherwise the base model -> 'Camaro', '911', '240Z'.
--   It is a GROUPING key, never shown to a user and never a substitute for the
--   resolver; the resolver + One Box scope still decide the eligible pool. The cube
--   (a later step) is keyed on (make, model_family, generation) so this column is
--   the join between raw rows and the precomputed aggregates.
-- =====================================================================

alter table sales_archive
  add column if not exists model_family text;

-- Record path: exact family + price-descending range scan (the timeout fix).
create index if not exists sales_archive_family_price_idx
  on sales_archive (make, model_family, sale_price desc)
  where model_family is not null and sale_price is not null;

-- Ranking / trend path: family + recency, so a windowed family read is a range
-- scan on (make, model_family) bounded by sale_date, not a title scan.
create index if not exists sales_archive_family_date_idx
  on sales_archive (make, model_family, sale_date desc)
  where model_family is not null;

-- NOTE ON BACKFILL (do NOT run as SQL — needs the JS family map):
--   after this DDL is applied, Sam runs the one-time backfill locally or in the
--   nightly Action:
--     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run ingest -- --backfill-family
--   It reads every row's make/model/title, computes model_family via
--   lib/modelFamilies.js + the performance-badge logic, and PATCHes model_family in
--   batches (resumable, --ignore-dupes style, floor-safe). New rows get it inline at
--   ingest. Until the backfill runs, model_family is null and the Desk transparently
--   falls back to the current title-scan record path (no regression, just not the
--   fast path). The aggregates cube DDL is a separate file shipped once the executor
--   grouping shapes are settled, so the cube matches exactly what the Desk queries.
