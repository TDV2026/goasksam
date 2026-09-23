-- sales_archive count / backfill indexes (Sep 2026)  -- RUN FIRST, before anything else
-- =====================================================================
-- WHY: the 2023-2025 backfill upsert died on statement timeout (57014), and
-- the same timeout kills the per-platform / per-sale_date COUNT scans and the
-- hvt100 archive probes. Those queries all have the shape:
--     WHERE platform = $1 AND sale_price IS NOT NULL AND sale_date BETWEEN $2 AND $3
-- and a plain count(*) over a 3-year window already times out.
--
-- NOTE there is a SEPARATE, older doc (docs/supabase-sales-archive-indexes.sql,
-- the "One Box comp pool" indexes) that already DEFINES a bare sale_date index
-- (idx_sa_sale_date ON sales_archive (sale_date DESC)) plus trigram/year
-- indexes. That was for the leading-wildcard ILIKE comp reads, and it was very
-- likely applied when One Box shipped. Do NOT blindly re-run that older file:
-- its CREATE INDEX statements are the PLAIN (locking) form, and on today's
-- larger table a plain build would take a write lock. THIS file is the
-- CONCURRENTLY, no-lock addition the count/backfill path needs.
--
-- The real fix here is a COMPOSITE (platform, sale_date). A bare (sale_date)
-- index serves the ordering but the planner tends to seq-scan when the query
-- ALSO filters platform over a wide date range (most of the table). The
-- composite lets it go straight to one platform's date slice.
--
-- ---------------------------------------------------------------------
-- STEP 0 - LOOK BEFORE YOU BUILD (these do not scan the table)
-- ---------------------------------------------------------------------
-- What indexes already exist (is idx_sa_sale_date really there? is there a
-- unique index on source_id, which ON CONFLICT (source_id) needs?):
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sales_archive';
--
-- Any INVALID index left behind by a previously timed-out build (drop+rebuild):
--   SELECT c.relname FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
--   WHERE i.indisvalid = false AND i.indrelid = 'sales_archive'::regclass;
--
-- ---------------------------------------------------------------------
-- EDITOR TIMEOUT - yes, it is a real risk on this table
-- ---------------------------------------------------------------------
-- The table is 200k+ rows (that older doc measured ~200k; the backfill added
-- more) and a plain count(*) already times out, which is the tell that a
-- naive build will be slow. CREATE INDEX CONCURRENTLY does two passes (no
-- table lock, ~2-3x slower) and holds the editor connection the whole time.
-- If the SQL editor's gateway timeout fires mid-build, Postgres ABORTS and
-- leaves an INVALID index (shows up, never used). So:
--
--   1. CONCURRENTLY cannot run inside a transaction. The editor wraps a
--      multi-statement Run in one txn, so run EACH statement below BY ITSELF
--      (select just that statement, then Run). Never run the whole file at once.
--
--   2. Raise the timeout so the DB does not kill the build. Run this by itself
--      first, in the same tab:
--          SET statement_timeout = '3600s';
--      If the editor opens a fresh session per Run and that does not stick, set
--      it at the role level once (then reconnect; RESET afterwards):
--          ALTER ROLE postgres SET statement_timeout = '3600s';
--
--   3. If a build errors on timeout, it left an INVALID index: run the STEP 0
--      invalid-index query, DROP INDEX CONCURRENTLY <name>, and retry. If the
--      editor keeps timing out, run these over a direct psql connection using
--      the Supabase connection string (no HTTP gateway timeout).
--
-- Trade-off: one more index means each INSERT maintains one more btree. With
-- the re-run using --ignore-dupes (ON CONFLICT DO NOTHING, no JSONB rewrite),
-- that is a cheap index-entry append per new row, nowhere near the DO UPDATE
-- rewrite that caused the 57014. Reads get much faster; writes stay well
-- inside the timeout.
-- =====================================================================


-- (run this by itself first)
SET statement_timeout = '3600s';


-- PRIMARY FIX - the composite the count/probe/backfill queries need.
-- Run this statement ALONE. This one alone unblocks the count scans and the
-- gap-sizing measurement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_archive_platform_saledate
  ON sales_archive (platform, sale_date);


-- ONLY IF STEP 0 shows NO plain sale_date index exists (i.e. the older One Box
-- doc was never applied). Run ALONE. If idx_sa_sale_date already exists, SKIP this.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_archive_saledate
--   ON sales_archive (sale_date);


-- After the build(s), refresh planner stats (fast, safe):
ANALYZE sales_archive;
