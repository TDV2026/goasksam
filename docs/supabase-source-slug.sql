-- source_slug backfill (Sep 2026). The column was added; this fills it for all existing
-- rows from the exact platform-label -> OCD-slug map. Run once. New rows get source_slug
-- directly from the ingest (scripts/ingest.js writes it), so this only touches history.

-- 1) BACKFILL (one statement):
UPDATE sales_archive SET source_slug = CASE lower(platform)
  WHEN 'bring a trailer'      THEN 'bringatrailer'
  WHEN 'cars & bids'          THEN 'carsandbids'
  WHEN 'hagerty'              THEN 'hagerty'
  WHEN 'pcarmarket'           THEN 'pcarmarket'
  WHEN 'all collector cars'   THEN 'acc'
  WHEN 'gooding & co'         THEN 'gooding'
  WHEN 'rm sotheby''s'        THEN 'rmsothebys'
  WHEN 'hemmings'             THEN 'hemmings'
  WHEN 'sotheby''s motorsport' THEN 'sothebysmotorsport'
  WHEN 'mb market'            THEN 'mbmarket'
  WHEN 'autohunter'           THEN 'autohunter'
  WHEN 'barrett-jackson'      THEN 'barrettjackson'
  WHEN 'mecum auctions'       THEN 'mecum'
  WHEN 'bonhams'              THEN 'bonhams'
  WHEN 'broad arrow'          THEN 'broadarrow'
  WHEN 'car & classic'        THEN 'carandclassic'
  WHEN 'collecting cars'      THEN 'collectingcars'
  WHEN 'the market'           THEN 'themarket'
  WHEN 'pistonheads'          THEN 'pistonheads'
  ELSE source_slug
END
WHERE source_slug IS NULL;

-- 2) CONFIRM no rows left null (should return ZERO rows). Any row that appears here has a
--    platform label not in the map above - report it so the map can be extended.
SELECT platform, count(*) AS unmapped_rows
FROM sales_archive
WHERE source_slug IS NULL
GROUP BY platform
ORDER BY unmapped_rows DESC;
