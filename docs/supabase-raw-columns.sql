-- sales_archive: real columns for the pool read (Sam's egress job, Oct 16 2026).
-- The engine's pool read pulls 17 raw_record->> extracts per row; EXPLAIN showed the extracts cost about ten
-- times the page reads (5,908 buffers against 523) because every extract detoasts the row's jsonb, which also
-- holds the description. This gives the pool read real columns and nothing from the jsonb.
--
-- What already exists as a column and is written by the ingest from the SAME OldCarsData field the jsonb holds
-- (scripts/ingest.js toFullRow): body_style, modifications, exterior_color, title_status, known_flaws,
-- recent_service_history, listing_title (= raw_record->>'title'). Those are reused; rows older than the column
-- get filled from raw_record. transmission and mileage are NOT reused: the ingest writes a parsed value there
-- (transmission from the description when OldCarsData has none, mileage parsed from text), and the engine must
-- keep reading exactly what it read before, the raw text. So they get their own raw-text columns.
--
-- Steps, each with its rollback. Run nothing until Sam says OK. The fill runs outside any warm or sweep.

-- ================================================================================================
-- STEP 1. Columns (instant: nullable, no default, no rewrite).
-- ================================================================================================
alter table public.sales_archive
  add column if not exists image_url         text,   -- raw_record->>'featured_image_url'
  add column if not exists mileage_text      text,   -- raw_record->>'mileage' (the raw text the engine parses)
  add column if not exists transmission_text text,   -- raw_record->>'transmission' (raw, not the parsed column)
  add column if not exists currency          text,   -- raw_record->>'currency'
  add column if not exists listing_url       text,   -- raw_record->>'url'
  add column if not exists source_url        text,   -- raw_record->>'source_url'
  add column if not exists city              text,   -- raw_record->>'city'
  add column if not exists state             text,   -- raw_record->>'state'
  add column if not exists country_code      text,   -- raw_record->>'country_code'
  add column if not exists end_precision     text;   -- raw_record->>'auction_end_precision'

-- Rollback step 1 (only while nothing reads them, i.e. before the pool select change ships):
-- alter table public.sales_archive
--   drop column if exists image_url, drop column if exists mileage_text, drop column if exists transmission_text,
--   drop column if exists currency, drop column if exists listing_url, drop column if exists source_url,
--   drop column if exists city, drop column if exists state, drop column if exists country_code,
--   drop column if exists end_precision;

-- ================================================================================================
-- STEP 2. The fill, inside the database, in batches by id (uuid order on the primary key), resumable.
-- One CALL fills up to max_batches x batch_rows rows (default 10 x 5,000 = 50,000) and records where it
-- stopped; call it again until it reports done. About seven calls for 308,100 rows. Each CALL is one
-- transaction of row updates; reads are never blocked (MVCC), and 5,000-row batches keep each statement
-- short. The jsonb is NOT rewritten (TOAST pointers stay), only the main tuple, so the transient bloat is
-- about the main heap (roughly 300 MB) until autovacuum runs; run VACUUM (ANALYZE) once at the end.
-- ================================================================================================
create table if not exists public.sales_archive_fill_progress (
  job        text primary key,
  last_id    uuid,
  done_rows  bigint not null default 0,
  finished   boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.sales_archive_fill_progress enable row level security;
revoke all on public.sales_archive_fill_progress from anon, authenticated;

create or replace procedure public.fill_sales_archive_raw_columns(batch_rows int default 5000, max_batches int default 10)
language plpgsql
as $$
declare
  v_last   uuid;
  v_next   uuid;
  v_n      int;
  v_i      int := 0;
  v_total  bigint := 0;
begin
  insert into public.sales_archive_fill_progress (job) values ('raw_columns') on conflict (job) do nothing;
  select last_id into v_last from public.sales_archive_fill_progress where job = 'raw_columns';
  loop
    exit when v_i >= max_batches;
    -- the next batch_rows ids after the last one done, in primary-key order
    select max(id) into v_next from (
      select id from public.sales_archive where (v_last is null or id > v_last) order by id limit batch_rows
    ) t;
    exit when v_next is null;   -- nothing left: done
    update public.sales_archive s set
      image_url         = coalesce(s.image_url,         s.raw_record->>'featured_image_url'),
      mileage_text      = coalesce(s.mileage_text,      s.raw_record->>'mileage'),
      transmission_text = coalesce(s.transmission_text, s.raw_record->>'transmission'),
      currency          = coalesce(s.currency,          s.raw_record->>'currency'),
      listing_url       = coalesce(s.listing_url,       s.raw_record->>'url'),
      source_url        = coalesce(s.source_url,        s.raw_record->>'source_url'),
      city              = coalesce(s.city,              s.raw_record->>'city'),
      state             = coalesce(s.state,             s.raw_record->>'state'),
      country_code      = coalesce(s.country_code,      s.raw_record->>'country_code'),
      end_precision     = coalesce(s.end_precision,     s.raw_record->>'auction_end_precision'),
      -- the four reused columns: filled only where the row predates the column
      body_style        = coalesce(s.body_style,        s.raw_record->>'body_style'),
      modifications     = coalesce(s.modifications,     s.raw_record->>'modifications'),
      exterior_color    = coalesce(s.exterior_color,    s.raw_record->>'exterior_color'),
      title_status      = coalesce(s.title_status,      s.raw_record->>'title_status')
    where (v_last is null or s.id > v_last) and s.id <= v_next;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    v_last := v_next;
    v_i := v_i + 1;
    update public.sales_archive_fill_progress
       set last_id = v_last, done_rows = done_rows + v_n, updated_at = now()
     where job = 'raw_columns';
  end loop;
  if v_next is null then
    update public.sales_archive_fill_progress set finished = true, updated_at = now() where job = 'raw_columns';
    raise notice 'fill_sales_archive_raw_columns: done (this call % rows)', v_total;
  else
    raise notice 'fill_sales_archive_raw_columns: % rows this call, call again (last id %)', v_total, v_last;
  end if;
end $$;
revoke execute on procedure public.fill_sales_archive_raw_columns(int, int) from public, anon, authenticated;

-- Run (repeat until the notice says done; check progress between calls):
-- call public.fill_sales_archive_raw_columns(5000, 10);
-- select * from public.sales_archive_fill_progress;
-- When done:
-- vacuum (analyze) public.sales_archive;

-- Rollback step 2: the fill is idempotent and only writes null cells, so a stopped fill needs no undo;
-- to start over: update public.sales_archive_fill_progress set last_id = null, done_rows = 0, finished = false
--   where job = 'raw_columns';  (the new columns can also be nulled: update ... set image_url = null, ... )
-- drop procedure if exists public.fill_sales_archive_raw_columns(int, int);
-- drop table if exists public.sales_archive_fill_progress;

-- ================================================================================================
-- STEP 3. Verification. (a) a random 10,000 rows, column against the jsonb value, every column;
-- (b) the same over ALL rows, run once after the fill, outside any warm or sweep (one full scan).
-- Every *_diff must be 0. For the four reused columns a non-zero diff means a row whose column was written
-- from a different value than the jsonb holds; list them with (c) before deciding.
-- ================================================================================================
-- (a)
with s as (select * from public.sales_archive tablesample system (6)),
     t as (select * from s order by random() limit 10000)
select count(*) as sampled,
  count(*) filter (where image_url         is distinct from raw_record->>'featured_image_url')   as image_url_diff,
  count(*) filter (where mileage_text      is distinct from raw_record->>'mileage')              as mileage_text_diff,
  count(*) filter (where transmission_text is distinct from raw_record->>'transmission')         as transmission_text_diff,
  count(*) filter (where currency          is distinct from raw_record->>'currency')             as currency_diff,
  count(*) filter (where listing_url       is distinct from raw_record->>'url')                  as listing_url_diff,
  count(*) filter (where source_url        is distinct from raw_record->>'source_url')           as source_url_diff,
  count(*) filter (where city              is distinct from raw_record->>'city')                 as city_diff,
  count(*) filter (where state             is distinct from raw_record->>'state')                as state_diff,
  count(*) filter (where country_code      is distinct from raw_record->>'country_code')         as country_code_diff,
  count(*) filter (where end_precision     is distinct from raw_record->>'auction_end_precision') as end_precision_diff,
  count(*) filter (where body_style        is distinct from raw_record->>'body_style')           as body_style_diff,
  count(*) filter (where modifications     is distinct from raw_record->>'modifications')        as modifications_diff,
  count(*) filter (where exterior_color    is distinct from raw_record->>'exterior_color')       as exterior_color_diff,
  count(*) filter (where title_status      is distinct from raw_record->>'title_status')         as title_status_diff,
  count(*) filter (where listing_title     is distinct from raw_record->>'title')                as listing_title_diff
from t;
-- (b) all rows: the same select with "from public.sales_archive" in place of the two CTEs and "from t".
-- (c) the rows behind a non-zero reused-column diff, for a look:
-- select id, source_slug, listing_title, body_style, raw_record->>'body_style' as rr_body_style
-- from public.sales_archive where body_style is distinct from raw_record->>'body_style' limit 50;

-- ================================================================================================
-- STEP 4. Ingest (code, scripts/ingest.js toFullRow): write the ten new columns from the same record fields:
--   image_url: r.featured_image_url, mileage_text: r.mileage (raw), transmission_text: r.transmission (raw),
--   currency: r.currency, listing_url: r.url, source_url: r.source_url, city: r.city, state: r.state,
--   country_code: r.country_code, end_precision: r.auction_end_precision.
-- Rollback: revert the ingest commit; the columns simply stop being written (the pool select, if already on the
-- columns, must be reverted first).
--
-- STEP 5. Pool select (code, lib/onebox.js fetchQualifying cols): every raw_record->> extract replaced by its
-- column (image:image_url, mileage:mileage_text, body:body_style, mods:modifications, rtitle:listing_title,
-- currency, transmission:transmission_text, color:exterior_color, ts:title_status, srcurl:listing_url,
-- srcurl2:source_url, city, state, cc:country_code, precision:end_precision). Ships as its own engine bump ONLY
-- after step 3(b) shows zero diffs on all rows, with the sweep before and after.
-- Rollback: revert that commit (the extracts come back; the columns stay, unread).
