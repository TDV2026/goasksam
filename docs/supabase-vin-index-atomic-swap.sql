-- Atomic VIN index build (follow-up to docs/supabase-vin-index.sql). Run once in the Supabase SQL
-- editor. scripts/buildVinIndex.js was DELETE-then-INSERT directly into the live vin_index/vin_summary
-- tables: a cancelled or timed-out run could leave the live tables partially (or fully) empty for
-- every reader until the next successful build. This adds STAGING tables the builder writes into, and
-- a single-transaction swap function that promotes staging to live atomically - a killed run leaves
-- the PREVIOUS live tables completely untouched (Postgres either commits the whole swap or none of
-- it; no concurrent reader can ever observe a half-truncated table).

create table if not exists vin_index_staging (
  id              bigint generated always as identity primary key,
  vin_norm        text not null,
  appearance_date date,
  source          text,
  url             text,
  listing_title   text,
  make            text,
  model           text,
  model_family    text,
  vehicle_type    text,
  year            integer,
  mileage         integer,
  result          text,
  price_usd       numeric,
  currency        text,
  country         text,
  photo_url       text,
  src_table       text,
  src_row_id      text,
  created_at      timestamptz default now()
);

create table if not exists vin_summary_staging (
  vin_norm                    text primary key,
  appearances                 integer not null default 0,
  first_seen                  date,
  last_seen                   date,
  last_sold_price_usd         numeric,
  last_sold_date              date,
  miles_delta_since_last_sale integer,
  days_since_last_sale        integer,
  make                        text,
  model                       text,
  model_family                text,
  vehicle_type                text,
  updated_at                  timestamptz default now()
);

-- Promotes the fully-written staging tables to live, in ONE transaction (a plpgsql function body is
-- one transaction by default): TRUNCATE + INSERT on both tables, then clear staging for the next build.
-- Postgres guarantees this entire block commits together or not at all - a killed caller (network drop,
-- GitHub Actions cancellation, Vercel timeout) either never triggers the swap (live tables untouched)
-- or the swap's single transaction is rolled back server-side (still untouched); it can never observe
-- vin_index or vin_summary mid-truncate.
create or replace function swap_vin_index()
returns void
language plpgsql
security definer
as $$
begin
  truncate vin_index;
  insert into vin_index (vin_norm, appearance_date, source, url, listing_title, make, model, model_family,
    vehicle_type, year, mileage, result, price_usd, currency, country, photo_url, src_table, src_row_id)
  select vin_norm, appearance_date, source, url, listing_title, make, model, model_family,
    vehicle_type, year, mileage, result, price_usd, currency, country, photo_url, src_table, src_row_id
  from vin_index_staging;

  truncate vin_summary;
  insert into vin_summary (vin_norm, appearances, first_seen, last_seen, last_sold_price_usd, last_sold_date,
    miles_delta_since_last_sale, days_since_last_sale, make, model, model_family, vehicle_type)
  select vin_norm, appearances, first_seen, last_seen, last_sold_price_usd, last_sold_date,
    miles_delta_since_last_sale, days_since_last_sale, make, model, model_family, vehicle_type
  from vin_summary_staging;

  truncate vin_index_staging;
  truncate vin_summary_staging;
end;
$$;

-- Standing DB-security rule: locked from creation.
alter table vin_index_staging   enable row level security;
alter table vin_summary_staging enable row level security;
revoke all on vin_index_staging   from anon, authenticated;
revoke all on vin_summary_staging from anon, authenticated;
revoke execute on function swap_vin_index() from public, anon, authenticated;
grant execute on function swap_vin_index() to service_role;
