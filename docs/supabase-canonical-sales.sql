-- Canonical transaction layer (approved Sep 2026). One row per real-world transaction;
-- every source_archive row is an alias pointing at it. Populated by scripts/buildCanonical.js
-- AFTER the 12-source backfill lands. Match logic + rules live in lib/_canonical.js.
-- Run this DDL once, then the builder.

CREATE TABLE IF NOT EXISTS canonical_sales (
  id                text PRIMARY KEY,          -- <primary_source_slug>:<primary_source_record_id>
  chassis_vin_norm  text,                      -- normalised VIN/chassis (uppercase, alnum only), null if none
  make              text,
  model             text,
  year              integer,
  hammer_usd        numeric,                   -- implied hammer in USD (house premium backed out); the COMPUTE basis
  native_price      numeric,                   -- as reported by the primary source
  native_currency   text,
  sale_country      text,                      -- derived (currency signal / venue mining); null => platform-default
  vehicle_location  text,                      -- OCD city/state/country_code of the vehicle
  venue             text,                      -- mined from title/description where present, else null
  event             text,
  sale_date         date,
  lot_number        text,
  primary_source    text,                      -- slug of the richest / authoritative alias
  alias_count       integer DEFAULT 1,
  default_classified boolean DEFAULT false,    -- true when geography fell back to the platform default
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_aliases (
  source_slug        text NOT NULL,
  source_record_id   text NOT NULL,
  canonical_id       text NOT NULL REFERENCES canonical_sales(id) ON DELETE CASCADE,
  match_reason       text,                     -- primary | vin_exact | chassis_exact_makeyear | lot_venue_event | shared_url | same_source_price_date_title
  PRIMARY KEY (source_slug, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_make_model_year ON canonical_sales (make, model, year);
CREATE INDEX IF NOT EXISTS idx_canonical_chassis ON canonical_sales (chassis_vin_norm) WHERE chassis_vin_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canonical_sale_date ON canonical_sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_alias_canonical ON sale_aliases (canonical_id);
