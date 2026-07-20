-- sales_archive v2: capture the FULL OldCarsData record, not a 7-field slice.
-- Principle: store raw_record (jsonb) so nothing is ever lost, and promote the
-- high-value fields to typed columns for fast filtering.
--
-- Run once in the Supabase SQL editor (after supabase-sales-archive.sql).
-- Idempotent: safe to re-run. Then re-populate via scripts/juneReport.js.

alter table sales_archive
  add column if not exists raw_record             jsonb,   -- entire original record
  add column if not exists year                   integer,
  add column if not exists mileage                integer,
  add column if not exists body_style             text,
  add column if not exists title_status           text,
  add column if not exists vin                    text,
  add column if not exists transmission           text,
  add column if not exists drivetrain             text,
  add column if not exists exterior_color         text,
  add column if not exists interior_color         text,
  add column if not exists seller_type            text,
  add column if not exists listing_title          text,
  add column if not exists description             text,
  add column if not exists has_reserve            boolean,
  add column if not exists views                  integer,
  add column if not exists bids                   integer,
  add column if not exists known_flaws            jsonb,   -- array from source
  add column if not exists recent_service_history jsonb,   -- array from source
  add column if not exists modifications          jsonb;   -- array from source

create index if not exists sales_archive_year_platform_idx on sales_archive (year, platform);
create index if not exists sales_archive_mileage_idx       on sales_archive (mileage);
create index if not exists sales_archive_title_status_idx  on sales_archive (title_status);
create index if not exists sales_archive_seller_type_idx   on sales_archive (seller_type);
