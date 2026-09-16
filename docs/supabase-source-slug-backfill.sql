-- One-time backfill: populate sales_archive.source_slug from the platform LABEL for rows
-- ingested before the source_slug column existed (FLAG B, Sep 2026). 11 of 19 sources currently
-- have source_slug NULL and are only findable by platform label; any code that queries
-- source_slug=eq.X directly (partner-premium recompute, canonical build's source keying) silently
-- misses them - notably the houses Gooding / Mecum / Broad Arrow.
--
-- IDEMPOTENT: only touches rows where source_slug IS NULL, so it is safe to re-run and it also
-- catches any stragglers in the eight sources that are mostly populated. Labels below must match
-- sales_archive.platform exactly (the ingest DISPLAY map).

update sales_archive s set source_slug = m.slug
from (values
  ('Bring a Trailer',      'bringatrailer'),
  ('Cars & Bids',          'carsandbids'),
  ('Hagerty',              'hagerty'),
  ('PCARMarket',           'pcarmarket'),
  ('All Collector Cars',   'acc'),
  ('Gooding & Co',         'gooding'),
  ('RM Sotheby''s',        'rmsothebys'),
  ('Hemmings',             'hemmings'),
  ('Sotheby''s Motorsport','sothebysmotorsport'),
  ('MB Market',            'mbmarket'),
  ('AutoHunter',           'autohunter'),
  ('Barrett-Jackson',      'barrettjackson'),
  ('Mecum Auctions',       'mecum'),
  ('Bonhams',              'bonhams'),
  ('Broad Arrow',          'broadarrow'),
  ('Car & Classic',        'carandclassic'),
  ('Collecting Cars',      'collectingcars'),
  ('The Market',           'themarket'),
  ('PistonHeads',          'pistonheads')
) as m(label, slug)
where s.platform = m.label and s.source_slug is null;

-- Verify afterwards (should return zero rows):
--   select platform, count(*) from sales_archive where source_slug is null group by platform;
