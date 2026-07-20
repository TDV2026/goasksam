-- sales_archive: cached monthly auction-sale records for free reporting.
-- Populated once per month by scripts/juneReport.js (and future month reports)
-- so follow-up questions query Supabase at zero OldCarsData cost.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists sales_archive (
  id          uuid primary key default gen_random_uuid(),
  -- OldCarsData record id. Unique so re-pulls upsert instead of duplicating.
  source_id   text unique,
  sale_date   date,                       -- from auction_end_date
  platform    text,                       -- "Cars & Bids" or "Bring a Trailer"
  make        text,                       -- ocd_make_name
  model       text,                       -- ocd_model_name
  sale_price  numeric,                    -- sold price (OCD `price`)
  month       text,                       -- "2026-06" for cheap month filtering
  created_at  timestamptz not null default now()
);

create index if not exists sales_archive_platform_month_idx on sales_archive (platform, month);
create index if not exists sales_archive_month_idx           on sales_archive (month);
create index if not exists sales_archive_make_model_idx      on sales_archive (make, model);
