-- VIN index (Fix 5, Lane A). Run once in the Supabase SQL editor before the populate job.
-- vin_index: one row per APPEARANCE of a VIN (sales_archive sale + auction_attempts unsold/withdrawn),
--   normalised like findVinArchiveMatch (strip all non-alphanumeric, uppercase). The populate job
--   EXCLUDES non_vehicle rows and any VIN seen on more than one UNRELATED lot (different make/model =
--   a polluted/shared VIN, e.g. a Bonhams automobilia VIN reused across lots). A VIN on multiple lots
--   of the SAME car (consistent make/model) is a real repeat-sale and IS kept.
-- vin_summary: one row per vin_norm, the rolled-up history Lane C's pages read.

create table if not exists vin_index (
  id              bigint generated always as identity primary key,
  vin_norm        text not null,
  appearance_date date,
  source          text,            -- source_slug (bringatrailer, rmsothebys, ...)
  url             text,
  listing_title   text,
  make            text,
  model           text,
  model_family    text,
  vehicle_type    text,            -- car | motorcycle | other  (non_vehicle never enters this table)
  year            integer,
  mileage         integer,
  result          text,            -- sold | not_sold | withdrawn
  price_usd       numeric,         -- dated-FX USD (hammerUsd at the sale month); null for unsold/withdrawn
  currency        text,
  country         text,
  photo_url       text,
  src_table       text,            -- sales_archive | auction_attempts  (provenance)
  src_row_id      text,            -- source_id / attempt id (provenance; for idempotent rebuilds)
  created_at      timestamptz default now()
);
create index if not exists vin_index_vin_norm_idx on vin_index (vin_norm);
create index if not exists vin_index_appearance_date_idx on vin_index (appearance_date);
create index if not exists vin_index_src_idx on vin_index (src_table, src_row_id);

create table if not exists vin_summary (
  vin_norm                   text primary key,
  appearances                integer not null default 0,
  first_seen                 date,
  last_seen                  date,
  last_sold_price_usd        numeric,
  last_sold_date             date,
  miles_delta_since_last_sale integer,   -- mileage(most recent appearance) - mileage(last sale), when both known
  days_since_last_sale       integer,    -- today - last_sold_date
  make                       text,
  model                      text,
  model_family               text,
  vehicle_type               text,
  updated_at                 timestamptz default now()
);

-- Standing DB-security rule: new tables ship locked from creation. Server code uses the service role
-- key (bypasses RLS); the browser never gets a grant. No RPC functions here, so no execute grants.
alter table vin_index   enable row level security;
alter table vin_summary enable row level security;
revoke all on vin_index   from anon, authenticated;
revoke all on vin_summary from anon, authenticated;
