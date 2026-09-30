-- USD-normalized price columns (currency bug fix, part 1 groundwork). sale_price / high_bid hold the
-- listing's OWN currency, unconverted. These PLAIN columns (not generated) hold the USD equivalent,
-- filled by scripts/backfillUsd.js for existing rows and by the ingest on the way in for new rows.
-- Conversion uses fx_rates (docs/supabase-fx-rates.sql) by the sale/attempt month.
--
-- Run once in the Supabase SQL editor, after supabase-fx-rates.sql. Idempotent.

alter table sales_archive    add column if not exists sale_price_usd numeric;
alter table auction_attempts add column if not exists high_bid_usd   numeric;

-- Helpful for the backfill's "still null" resumability scan and later read paths.
create index if not exists sales_archive_sale_price_usd_null_idx
  on sales_archive (id) where sale_price_usd is null and sale_price is not null;
