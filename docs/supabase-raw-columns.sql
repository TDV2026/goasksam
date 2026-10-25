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
-- STEP 1b. The marker column (added after step 1 had been run; instant, nullable, no default, no rewrite).
-- ================================================================================================
alter table public.sales_archive
  add column if not exists raw_cols_at timestamptz;   -- set when this row's new columns were copied from (or written with) its raw_record; null = not yet, and the engine reads such a row from raw_record

-- Rollback step 1b:
-- alter table public.sales_archive drop column if exists raw_cols_at;

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
    select id into v_next from (
      select id from public.sales_archive where (v_last is null or id > v_last) order by id limit batch_rows
    ) t order by id desc limit 1;   -- the last id of the batch (no max(uuid): that aggregate does not exist in Postgres)
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
      modifications     = coalesce(s.modifications,     nullif(s.raw_record->'modifications', 'null'::jsonb)),   -- jsonb column: copy the jsonb (->), never text (->>)
      exterior_color    = coalesce(s.exterior_color,    s.raw_record->>'exterior_color'),
      title_status      = coalesce(s.title_status,      s.raw_record->>'title_status'),
      raw_cols_at       = now()
    where (v_last is null or s.id > v_last) and s.id <= v_next
      and s.raw_cols_at is null;   -- only a row not yet marked is written, so the catch-up pass touches nothing already filled
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

-- Run (the editor may not show notices, so end EVERY call with the progress select and read last_id, done_rows and finished from it;
-- repeat the pair until finished is true):
-- call public.fill_sales_archive_raw_columns(5000, 1);
-- select * from public.sales_archive_fill_progress;
-- When finished is true:
-- vacuum (analyze) public.sales_archive;

-- CATCH-UP (rows ingest wrote while the fill ran): the fill walks ids in order and ids are random uuids, so a row ingest adds with an id
-- below the cursor is skipped, and until Block 4 ships a new row carries null in the new columns. After Block 4 is on and the fill says
-- done, run once more from the start; only rows still needing a value are written (the where clause above), so it is cheap:
-- update public.sales_archive_fill_progress set last_id = null, finished = false where job = 'raw_columns';
-- call public.fill_sales_archive_raw_columns(5000, 10);
-- select * from public.sales_archive_fill_progress;   -- repeat the pair until finished is true again, then Block 3(b)

-- Rollback step 2 (the fill is idempotent and only writes null cells, so a stopped fill needs no undo). To undo what it wrote (the four reused
-- columns are NOT touched: they existed before and ingest wrote them), then remove the procedure and the table:
-- update public.sales_archive set image_url = null, mileage_text = null, transmission_text = null, currency = null, listing_url = null,
--   source_url = null, city = null, state = null, country_code = null, end_precision = null, raw_cols_at = null where raw_cols_at is not null;
-- drop procedure if exists public.fill_sales_archive_raw_columns(int, int);
-- drop table if exists public.sales_archive_fill_progress;
-- To start the walk over without undoing: update public.sales_archive_fill_progress set last_id = null, done_rows = 0, finished = false where job = 'raw_columns';

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
  count(*) filter (where modifications     is distinct from nullif(raw_record->'modifications', 'null'::jsonb)) as modifications_diff,
  count(*) filter (where exterior_color    is distinct from raw_record->>'exterior_color')       as exterior_color_diff,
  count(*) filter (where title_status      is distinct from raw_record->>'title_status')         as title_status_diff,
  count(*) filter (where listing_title     is distinct from raw_record->>'title')                as listing_title_diff_informational,   -- INFORMATIONAL: listing_title is a reused column that ingest corrections (lib/_corrections.js) may legitimately change; a non-zero count here is not a failure
  count(*) filter (where jsonb_typeof(raw_record->'modifications') = 'string')                    as modifications_string_rows,          -- must be 0: for a string value ->> unquotes and ::text quotes, so the engine's read would differ
  count(*) filter (where raw_cols_at is null)                                                      as not_marked_rows                     -- must be 0 after the fill and the catch-up
from t;
-- (b) all rows: the same select with "from public.sales_archive" in place of the two CTEs and "from t".
-- (c) the rows behind a non-zero reused-column diff, one query per column (read only, limit 50):
-- select id, source_slug, listing_title, body_style, raw_record->>'body_style' as raw_value
--   from public.sales_archive where body_style is distinct from raw_record->>'body_style' limit 50;
-- select id, source_slug, listing_title, modifications, raw_record->'modifications' as raw_value
--   from public.sales_archive where modifications is distinct from nullif(raw_record->'modifications', 'null'::jsonb) limit 50;
-- select id, source_slug, listing_title, exterior_color, raw_record->>'exterior_color' as raw_value
--   from public.sales_archive where exterior_color is distinct from raw_record->>'exterior_color' limit 50;
-- select id, source_slug, listing_title, title_status, raw_record->>'title_status' as raw_value
--   from public.sales_archive where title_status is distinct from raw_record->>'title_status' limit 50;
--
-- HOW TO READ BLOCK 3 (a) AND (b)
--   Must be exactly 0:
--     the ten new columns: image_url_diff, mileage_text_diff, transmission_text_diff, currency_diff, listing_url_diff, source_url_diff,
--       city_diff, state_diff, country_code_diff, end_precision_diff;
--     the four reused columns: body_style_diff, modifications_diff, exterior_color_diff, title_status_diff;
--     modifications_string_rows and not_marked_rows.
--   Informational only (not a failure): listing_title_diff_informational.
--   If a NEW column shows a count: the fill or the catch-up missed rows, or a writer wrote a different value. Run the catch-up pair, read
--     block 3 again; if it stays above 0, list a few rows by hand (select ... where the_column is distinct from the raw extract) and tell Lane B.
--   If a REUSED column shows a count (body_style, modifications, exterior_color, title_status): ingest wrote that column from a different value
--     than the record holds, so the engine would read a different value from the column than it reads today. Run its query from (c), do NOT flip
--     pool_columns_enabled, and send the rows to Lane B. Nothing is changed by the fill for these four except where the column was null.
--   If modifications_string_rows is above 0: some record holds modifications as a plain string; the engine's text for it would differ. Do not flip the flag.
--   If not_marked_rows is above 0 after the fill and the catch-up: run the catch-up pair again.

-- ================================================================================================
-- STEP 4. The writers (code, lib/_rawColumns.js, used by scripts/ingest.js and scripts/pullSources.js): the ten columns and the marker raw_cols_at,
-- from the same record fields raw_record holds. OFF unless the environment variable INGEST_RAW_COLUMNS is exactly 1 (writing a column that is not
-- there yet fails the whole insert, so set it only after steps 1 and 1b have run).
--   * nightly ingest (GitHub Actions, .github/workflows/nightly.yml, job "ingest"): repository VARIABLE INGEST_RAW_COLUMNS = 1 (Settings >
--     Secrets and variables > Actions > Variables), read by the line  INGEST_RAW_COLUMNS: ${{ vars.INGEST_RAW_COLUMNS }}  in that job's env
--     (the line is in docs/nightly-workflow.yml; Sam copies it into the workflow file, which the CI token cannot push).
--   * scripts/pullSources.js (run by hand): export INGEST_RAW_COLUMNS=1 in the shell that runs it. Vercel is not involved: no Vercel function writes
--     sales_archive.raw_record.
-- These two are the only writers of sales_archive.raw_record; backfillModelFamily, the USD backfill and the descfacts task write other columns and
-- never touch raw_record, so they cannot leave a stale copy.
-- Rollback: set the variable to 0 or delete it; the columns simply stop being written (rows keep their marker, and a row ingest re-writes after that
-- would leave its columns stale, so turn the pool flag off first).
--
-- STEP 5. Pool select (code, lib/onebox.js fetchQualifying, DARK): with app_config pool_columns_enabled on, every raw_record->> extract is replaced by
-- its column (mods reads modifications::text). A row whose raw_cols_at is null is read again by id with the extracts, so a half-filled table
-- still gives raw_record answers; only those rows pay the extraction. Off by default and fails closed; a failed column read falls back to
-- raw_record. Flip it only after Block 3(b) shows zero differences and not_marked_rows is 0.
-- Rollback: set the app_config row to 0 (no deploy).
