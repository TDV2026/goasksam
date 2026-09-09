-- One Box comp pool on sales_archive: indexes so the comp queries stop statement-timing-out.
-- =====================================================================================
-- Context: wiring One Box results (Screen 2) to read the COMPREHENSIVE sales_archive (~200k
-- rows) instead of the shallow, search-populated vehicle_market_records. A naive switch
-- measured 15-27s per call and returned empty pools for big marques (Porsche 911, Corvette):
-- the comp query filters make ILIKE + model/title ILIKE '%X%' + a year range + a sale_date
-- cutoff, ordered by sale_date/price. A LEADING-WILDCARD ILIKE ('%M3%', '%Carrera S%') cannot
-- use a btree, so today every such query sequential-scans all 200k rows and trips the
-- statement timeout. Trigram GIN indexes make those ILIKEs index-scannable; btrees serve the
-- year range and the sale_date ordering. E30 M3 verified fast (~500ms) once scoped, so this
-- closes the gap the whole way.
--
-- Run once in the Supabase SQL editor (secrets are not pullable locally, so Sam runs DDL).
-- All CREATE INDEX statements are IF NOT EXISTS and safe to re-run. On a live table prefer
-- CREATE INDEX CONCURRENTLY (cannot run inside a txn block) to avoid a write lock; the plain
-- form below is fine for a maintenance window.

-- Trigram matching for the leading-wildcard ILIKE filters.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The model / title / make ILIKE '%...%' filters (the comp scope). GIN + gin_trgm_ops turns a
-- 200k-row seq scan into an index scan.
CREATE INDEX IF NOT EXISTS idx_sa_model_trgm ON sales_archive USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sa_title_trgm ON sales_archive USING gin (listing_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sa_make_trgm  ON sales_archive USING gin (make gin_trgm_ops);

-- The year range (year BETWEEN a AND b) and the recency cutoff + ORDER BY sale_date DESC.
CREATE INDEX IF NOT EXISTS idx_sa_year       ON sales_archive (year);
CREATE INDEX IF NOT EXISTS idx_sa_sale_date  ON sales_archive (sale_date DESC);

-- Photo gate: One Box only shows comps that carry a listing photo. Filtering
-- raw_record->>'featured_image_url' IS NOT NULL is a JSONB expression, so it needs an
-- expression index (and it also lets the query keep the image filter server-side instead of
-- the JS post-filter the preview used). Partial-on-not-null keeps it small.
CREATE INDEX IF NOT EXISTS idx_sa_has_photo ON sales_archive ((raw_record->>'featured_image_url'))
  WHERE (raw_record->>'featured_image_url') IS NOT NULL;

ANALYZE sales_archive;

-- KNOWN QUIRK (not an index issue): combining the JSONB photo filter AND a sale_date filter in
-- one PostgREST request returned 0 rows during preview data pulls. Once these indexes exist,
-- prefer scoping in ONE order (model/title trgm -> year -> sale_date -> photo) and, if the
-- combo still misbehaves, keep the photo filter in application code. The preview validated the
-- data is there (E30 M3: 52 sales, 34 recent-with-photo) so this is purely query construction.
