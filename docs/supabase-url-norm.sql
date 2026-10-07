-- Indexed normalised listing URL (MCP car_history by listing link, no unindexed scan). Run once.
-- url_norm = lowercase, protocol + leading www stripped, query/fragment dropped, trailing slash removed
-- (lib/_urlNorm.js normalizeListingUrl). Stamped at ingest, backfilled via ops task=urlnorm, matched eq.
alter table sales_archive    add column if not exists url_norm text;
alter table auction_attempts add column if not exists url_norm text;
create index if not exists sales_archive_url_norm_idx    on sales_archive (url_norm)    where url_norm is not null;
create index if not exists auction_attempts_url_norm_idx on auction_attempts (url_norm) where url_norm is not null;

-- Existing tables already ship RLS-enabled with anon/authenticated revoked; adding columns inherits it.
