-- Description-derived fact columns (Fix 5 / descriptions resilience plan). Run ONCE in the Supabase
-- SQL editor BEFORE deploying the ingest stamp, the backfill, or the reader flips. These extract the
-- facts we currently mine LIVE from the free-text listing description into their own columns, so every
-- feature keeps working if OCD/Drew stops sending description text. The raw `description` column is
-- KEPT as-is; we just stop DEPENDING on it at read time.
--
--   stated_mileage  int   - odometer mined from prose for HOUSE rows lacking a structured mileage
--                           (lib/_houseComps.js statedMileageFromText). NULL when none/structured exists.
--   project_flag    text  - project/incomplete/shell reason (lib/_classify.js projectFlagReason), the
--                           keyword that flags the car; NULL for a clean car. Mirrors raw_record._project_flag.
--   desc_facts      jsonb - { markers: [<lib/_classify.js extractMarkers keys>], stated_mileage: <int|null> }
--                           markers = matching_numbers, classiche, massini, documented_history, restored,
--                           original_paint, rhd, alloy_body, long_nose, short_nose, competizione, coachbuilder.
--                           One jsonb keeps new marker phrases schema-free.

alter table sales_archive add column if not exists stated_mileage integer;
alter table sales_archive add column if not exists project_flag    text;
alter table sales_archive add column if not exists desc_facts       jsonb;

-- project_flag is read as an exclusion filter on bounded pools; a partial index keeps that cheap
-- without bloating the common (NULL = clean) case.
create index if not exists sales_archive_project_flag_idx on sales_archive (project_flag) where project_flag is not null;

-- sales_archive is an existing table that already ships RLS-enabled with anon/authenticated revoked
-- (docs/supabase-sales-archive-v2.sql). Adding columns inherits that lock, so no new grant/revoke is
-- needed here; server code uses the service role key and the browser still has no table grant.
