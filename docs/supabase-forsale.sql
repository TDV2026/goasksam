-- for_sale_listings (Nov 2026, Lane D, lane-d-forsale): the vendor's classifieds (dealer cars and classified ads, US only), pulled every 6 hours by
-- api/pullForSale.js into OUR table. The vendor is a supplier and is never in a visitor's request: Find reads only this table.
-- Stores NO seller name, NO listing description and NO zip code. Stores what a card needs, plus the engine's resolved car, the finished read and the car's earlier
-- record (all prepared by the scheduled job, never in a request). An asking price lives only here: no sales pool, range or count reads this table.
-- Run once in the Supabase SQL Editor.
create table if not exists for_sale_listings (
  id bigserial primary key,
  source text not null,
  source_listing_id text not null,
  source_type text not null check (source_type in ('dealer','classified')),
  title text,                           -- the listing's own short title (what the resolver reads); never a description
  url text,
  image_url text,
  asking_price_usd integer,             -- the vendor's current asking price, US dollars only (country US and currency USD)
  mileage integer,                      -- miles
  location text,                        -- "City, ST", no street, no zip
  state text,
  country_code text,
  vin text,
  vin_norm text,
  year integer,
  body text,                            -- short facts a Find filter reads (never a description)
  transmission text,
  exterior_color text,
  make text,                            -- the ENGINE's resolved make once resolved, else the vendor's
  model text,
  car jsonb,                            -- the engine's resolved car: {name, make, model, trim, year, generation, key, engine_version, at}
  car_key text,                         -- the engine's spec key (the car's own market)
  resolve_state text check (resolve_state in ('resolved','unresolved')),   -- null = not tried yet
  read jsonb,                           -- the finished read: {line, kind, low, high, engine_version, at}
  history jsonb,                        -- the VIN's earlier record in our archive: {line, result, date, price_usd, at}, or {none:true,at}
  first_seen timestamptz not null default now(),
  last_seen timestamptz,                -- the vendor's own last_seen_at (when the listing was last seen at its source)
  pulled_at timestamptz,                -- the last pull that listed it
  gone boolean not null default false,  -- a complete pull of its source no longer lists it, or the vendor says it is not active
  gone_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (source, source_listing_id)
);
create index if not exists for_sale_make_idx on for_sale_listings (make) where gone = false;
create index if not exists for_sale_vin_idx on for_sale_listings (vin_norm);
create index if not exists for_sale_todo_idx on for_sale_listings (resolve_state) where gone = false;
alter table for_sale_listings enable row level security;
revoke all on for_sale_listings from anon, authenticated;
