-- sales_archive natural-key dedup index (item 7, revised Sep 2026). Run once in the Supabase SQL editor.
--
-- Why RM Sotheby's / Bonhams rows came in twice: OldCarsData re-syncs the auction-house feeds and mints
-- a NEW source_record_id for a sale it already sent; the ingest upserted on source_id, so a new id
-- inserted a second row for the same physical sale (same VIN/title, date and price). Sam has already
-- deleted the 729 extra rows (kept the lowest id per group; backup in sales_archive_dupes_backup) and a
-- recheck shows 0 duplicate groups. This file DOES NOT delete anything - it only adds the unique index
-- that stops NEW duplicates at ingest.
--
-- The earlier generated-column approach failed with 42P17 ("generation expression is not immutable")
-- because sale_date::text is not immutable. This version is a UNIQUE PARTIAL EXPRESSION INDEX with no
-- date-to-text cast: sale_date (a date column) is used directly, and every function in the expression
-- (regexp_replace, lower, upper, btrim, round, length) is immutable, so there is no immutability error.
--
-- ident = the 17-char cleaned VIN when present, else the whitespace-normalised lowercased listing_title.
-- The index is PARTIAL: rows with a blank title or a non-positive price are excluded, so they can never
-- collide (a missing title / $0 row will never be treated as a duplicate of another).
--
-- scripts/ingest.js computes the SAME ident/key in memory (dedupeKeyFor) to dedup a batch, and relies on
-- this index to reject cross-run duplicates (the ingest isolates and skips the rejected dup rows).
--
-- Paste and run this single statement. On ~303k rows a functional unique index builds in roughly
-- 15-60 seconds. CONCURRENTLY keeps writes unblocked and cannot run inside a transaction block, so run
-- it on its own (not wrapped in BEGIN/COMMIT). It requires 0 existing duplicate groups (already true).

create unique index concurrently if not exists sales_archive_natkey_uidx
on sales_archive (
  lower(coalesce(source_slug, '')),
  (case
    when length(regexp_replace(coalesce(vin, ''), '[^A-Za-z0-9]', '', 'g')) = 17
      then upper(regexp_replace(vin, '[^A-Za-z0-9]', '', 'g'))
    else lower(btrim(regexp_replace(coalesce(listing_title, ''), '\s+', ' ', 'g')))
  end),
  sale_date,
  round(coalesce(sale_price, 0))
)
where btrim(coalesce(listing_title, '')) <> '' and coalesce(sale_price, 0) > 0;
-- Note: a CASE used as an index expression MUST be wrapped in its own parentheses, else Postgres
-- raises 42601 (syntax error at or near "case"). The (case ... end) brackets above are load-bearing.
-- This index (sales_archive_natkey_uidx) is LIVE in production as of Oct 2026.

-- If CONCURRENTLY errors (e.g. a stray duplicate slipped in after the cleanup), find it with:
--   select lower(coalesce(source_slug,'')) slug,
--          case when length(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))=17
--               then upper(regexp_replace(vin,'[^A-Za-z0-9]','','g'))
--               else lower(btrim(regexp_replace(coalesce(listing_title,''),'\s+',' ','g'))) end ident,
--          sale_date, round(coalesce(sale_price,0)) price, count(*) n, min(id) keep_id
--   from sales_archive
--   where btrim(coalesce(listing_title,'')) <> '' and coalesce(sale_price,0) > 0
--   group by 1,2,3,4 having count(*) > 1;
-- (then remove the extras keeping min(id), as you did before, and re-run the index).

-- CHECK (item 4) - after the index is created, re-ingest one known RM Sotheby's sale from an EXISTING
-- raw_record (no OCD call) under a NEW source_id and confirm no second row is written. Expected result:
--   ERROR: duplicate key value violates unique constraint "sales_archive_natkey_uidx"
-- and count stays the same. Run:
--   with src as (
--     select * from sales_archive
--     where source_slug='rmsothebys' and vin is not null and sale_price>0
--       and btrim(coalesce(listing_title,''))<>'' order by id limit 1)
--   insert into sales_archive (source_id, source_slug, platform, sale_date, sale_price, vin,
--                              listing_title, make, model, year, raw_record)
--   select 'natkey-check-'||source_id, source_slug, platform, sale_date, sale_price, vin,
--          listing_title, make, model, year, raw_record from src;
-- Expect the ERROR above (the dup was rejected). If it somehow inserted, clean it:
--   delete from sales_archive where source_id like 'natkey-check-%';

