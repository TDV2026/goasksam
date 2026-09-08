-- VIN / chassis exact-match index (Sep 2026).
--
-- WHY: findVinArchiveMatch does `vin=eq.<normalized>` against sales_archive. After the
-- C&B/BaT/Hagerty/PCM backfills grew the table ~26k -> ~200k rows, that lookup began
-- FULL-SCANNING (the vin column had no index) and hitting the Postgres statement timeout
-- (57014), so it returned null -> the "I know this exact car" prior-sale callout silently
-- stopped firing for essentially the whole archive (VIN coverage is ~96%). These three
-- statements restore it. Run them in the Supabase SQL editor. Safe + idempotent.
--
-- Run order matters: (1) fixes 17-char VINs immediately with the CURRENT code; (2)+(3) add
-- the normalized column the updated findVinArchiveMatch will read so separator-stored chassis
-- ("1E 31588", "DB6 MK2 2478") also match fast. Do NOT deploy the vin_norm-reading code until
-- statement (2) has completed and the column is confirmed present.

-- (1) Plain btree on vin: makes `vin=eq.<clean 17-char VIN>` instant (VINs are stored clean/
--     uppercase, so the normalized query already equals the stored value). Fixes the Murcielago
--     and every 17-char VIN the moment it lands, with zero code change.
CREATE INDEX IF NOT EXISTS idx_sales_archive_vin ON sales_archive (vin);

-- (2) Normalized, generated, STORED column: uppercased and stripped of every non-alphanumeric
--     character, matching findVinArchiveMatch's input normalization. This lets a chassis stored
--     WITH separators ("1E 31588") match a separator-free query ("1E31588") via an indexed
--     equality instead of the slow interspersed-ILIKE fallback. regexp_replace + upper are
--     IMMUTABLE, so a STORED generated column is valid. Null/empty vin -> ''.
ALTER TABLE sales_archive
  ADD COLUMN IF NOT EXISTS vin_norm text
  GENERATED ALWAYS AS (upper(regexp_replace(coalesce(vin, ''), '[^A-Za-z0-9]', '', 'g'))) STORED;

-- (3) Index the normalized column so `vin_norm=eq.<normalized>` is instant for both VINs and
--     separator-stored chassis.
CREATE INDEX IF NOT EXISTS idx_sales_archive_vin_norm ON sales_archive (vin_norm);

-- Verify (should return the exact car; must be fast, not a timeout):
--   select platform, sale_date, sale_price, make, model, vin
--   from sales_archive where vin_norm = 'ZHWBC8AH7ALA03815';
