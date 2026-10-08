-- Indexes applied by Sam in the Supabase SQL editor on Oct 8 2026. Recorded here so the file and the
-- live database match (standing rule). "if not exists" makes this file safe to re-run.
--
-- Why: the live pull's final-price step looked each ended listing up in sales_archive by its URL
-- (raw_record->>'url'), an unindexed JSON field; one lookup took 117 seconds and every scheduled pull
-- ended in a 504. sales_archive_raw_url_idx brought one lookup to 0.146 ms. The others were found by
-- the Oct 8 2026 audit of api/ and lib/ for queries that filter on a JSON field, use ilike, or filter on
-- an unindexed column on a table over 100,000 rows (the history hub title search, the /sell market
-- fetch, the partner track record, the usage-event cursor reads, the reserve counts, the source+date reads).
-- Trigram indexes need the pg_trgm extension (already enabled, docs/supabase-sales-archive-indexes.sql).

create index if not exists sales_archive_raw_url_idx on sales_archive ((raw_record->>'url'));

create index if not exists idx_vmr_make_trgm on vehicle_market_records using gin (make gin_trgm_ops);
create index if not exists idx_vmr_model_trgm on vehicle_market_records using gin (model gin_trgm_ops);
create index if not exists idx_vmr_seller_username on vehicle_market_records (seller_username);

create index if not exists idx_app_usage_events_type_created on app_usage_events (event_type, created_at desc);

create index if not exists idx_attempts_title_trgm on auction_attempts using gin ((raw_record->>'title') gin_trgm_ops);
create index if not exists idx_attempts_make_trgm on auction_attempts using gin (make gin_trgm_ops);
create index if not exists idx_attempts_model_trgm on auction_attempts using gin (model gin_trgm_ops);
create index if not exists idx_attempts_src_reserve_date on auction_attempts (source_slug, has_reserve, attempt_date);

create index if not exists idx_sa_source_slug_date on sales_archive (source_slug, sale_date);
