-- sales_archive natural-key dedup (item 7, Sep 2026). Run once in the Supabase SQL editor.
-- Why RM Sotheby's / Bonhams rows come in twice: OldCarsData re-syncs the auction-house feeds and
-- mints a NEW source_record_id for a sale it already sent, and the ingest upserted on source_id, so a
-- new id inserted a second row for the same physical sale (same VIN, date and price). RM and Bonhams
-- re-sync most, hence the ~360 / ~130-160 dup rows; other sources re-sync rarely, hence single figures.
--
-- The read paths already dedup on the natural key at request time (lib/_houseComps.js saleIdentity +
-- lib/desk/execute.js), so counts/medians/cards are already correct. This DDL makes ingest itself
-- upsert on the natural key so NEW duplicates stop being written, and (STEP 3) lets you clean the
-- existing extras. Nothing here deletes rows except the explicit STEP 3 you run yourself.

-- STEP 1 - natural-key column: source_slug + vin_norm(17) + sale_date + sale_price, else
-- source_slug + listing_title + sale_date + sale_price. Matches scripts/ingest.js dedupeKeyFor exactly.
alter table sales_archive add column if not exists dedupe_key text
  generated always as (
    case
      when length(regexp_replace(coalesce(vin, ''), '[^A-Za-z0-9]', '', 'g')) = 17
        then lower(coalesce(source_slug, '')) || '|'
             || upper(regexp_replace(vin, '[^A-Za-z0-9]', '', 'g')) || '|'
             || left(coalesce(sale_date::text, ''), 10) || '|'
             || round(coalesce(sale_price, 0))::text
      else lower(coalesce(source_slug, '')) || '|'
           || lower(btrim(regexp_replace(coalesce(listing_title, ''), '\s+', ' ', 'g'))) || '|'
           || left(coalesce(sale_date::text, ''), 10) || '|'
           || round(coalesce(sale_price, 0))::text
    end
  ) stored;

-- STEP 2 - unique index so the ingest on_conflict=dedupe_key upsert works. If STEP 3 has not been run
-- yet there ARE duplicates, so build it NON-unique first, run STEP 3, then swap to unique. To do it in
-- one shot, run STEP 3 BEFORE this and use the unique form directly:
--   create unique index if not exists sales_archive_dedupe_key_uidx on sales_archive (dedupe_key);
create index if not exists sales_archive_dedupe_key_idx on sales_archive (dedupe_key);

-- STEP 3 (REVIEW THEN RUN) - delete the extra duplicate rows, keeping the LOWEST id per natural-key
-- group. Preview first, then delete. Do NOT run blindly.
--   preview:
--   select dedupe_key, count(*) n, min(id) keep_id, array_agg(id order by id) ids
--   from sales_archive where dedupe_key is not null group by dedupe_key having count(*) > 1 order by n desc;
--   delete:
delete from sales_archive s
using (
  select dedupe_key, min(id) as keep_id
  from sales_archive
  where dedupe_key is not null
  group by dedupe_key
  having count(*) > 1
) d
where s.dedupe_key = d.dedupe_key and s.id <> d.keep_id;

-- STEP 4 (after STEP 3) - swap the plain index for a UNIQUE one so ingest can upsert on it:
--   drop index if exists sales_archive_dedupe_key_idx;
--   create unique index sales_archive_dedupe_key_uidx on sales_archive (dedupe_key);

-- Standing lockdown (STANDING RULE): sales_archive already has RLS + grants; no new grants here.
