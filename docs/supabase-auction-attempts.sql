-- auction_attempts (Sep 2026): NON-SOLD auction outcomes, kept STRICTLY SEPARATE from
-- sales_archive (which stays sold-only). Never a status column on sales_archive. Populated
-- by scripts/ingestAttempts.js for the FIVE platforms that report non-sold cleanly (BaT,
-- Cars & Bids, Hagerty, SOMO, MB Market). PCARMarket / Collecting Cars / ACC / PistonHeads
-- and all auction houses are excluded BY RULE (result-unavailable / opaque) - never write
-- them here, so no sell-through can ever be implied for them.
--
-- Run this DDL once. Enable RLS with NO policies afterwards (service-role only, like
-- canonical_sales): access is exclusively server-side (Actions ingest + keyed ops reads).

CREATE TABLE IF NOT EXISTS auction_attempts (
  source_slug       text NOT NULL,
  source_record_id  text NOT NULL,
  chassis_vin_norm  text,                       -- normalized VIN/chassis, null if none/placeholder
  make              text,
  model             text,
  year              integer,
  attempt_date      date,                       -- when the auction ended without a sale
  auction_status    text,                       -- reserve_not_met | withdrawn
  high_bid          numeric,                    -- the top bid that did NOT clear reserve (OCD `price`)
  currency          text,
  has_reserve       boolean,
  bids              integer,                     -- stats.bids (engagement)
  canonical_id      text REFERENCES canonical_sales(id) ON DELETE SET NULL,  -- the same car's later SALE, if any
  created_at        timestamptz DEFAULT now(),
  PRIMARY KEY (source_slug, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_vin ON auction_attempts (chassis_vin_norm) WHERE chassis_vin_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attempts_mmy ON auction_attempts (make, model, year);
CREATE INDEX IF NOT EXISTS idx_attempts_src_date ON auction_attempts (source_slug, attempt_date DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_canon ON auction_attempts (canonical_id) WHERE canonical_id IS NOT NULL;

-- After creating: ALTER TABLE auction_attempts ENABLE ROW LEVEL SECURITY;  (no policies)
