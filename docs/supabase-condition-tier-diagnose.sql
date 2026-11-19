-- CONDITION TIER, READ-ONLY DIAGNOSIS (Lane B, Nov 5 2026). Run in the Supabase SQL editor, ONE block at a time, with the tier job stopped. Nothing here writes. Paste the results to Lane B.
-- WHY 500 rows took 40 to 66 s. PROVEN FROM THE CODE: the old job read each model's mileage (up to 1000 rows) INSIDE the timed batch, and the walk is in uuid order, so a batch of 500 sales met
-- hundreds of different models; the three logged batches fell 66 s, 48 s, 41 s on the same 500 rows as the per-run memo filled. NEEDS THESE QUERIES: whether the UPDATE itself is slow (indexes, no HOT updates, bloat, triggers, locks).

-- 1. Size, bloat and how updates have gone: n_tup_hot_upd close to n_tup_upd = cheap updates; near 0 = every update rewrote every index.
select relname, pg_size_pretty(pg_total_relation_size(relid)) as total, pg_size_pretty(pg_relation_size(relid)) as heap, n_live_tup, n_dead_tup, n_tup_upd, n_tup_hot_upd, last_autovacuum, last_vacuum
  from pg_stat_user_tables where relname = 'sales_archive';

-- 2. Every index on the table with its size (each non-HOT update writes to ALL of them), and the table's fillfactor (null = 100, no room for HOT).
select i.indexrelname, pg_size_pretty(pg_relation_size(i.indexrelid)) as size, i.idx_scan, x.indexdef
  from pg_stat_user_indexes i join pg_indexes x on x.indexname = i.indexrelname and x.schemaname = i.schemaname
 where i.relname = 'sales_archive' order by pg_relation_size(i.indexrelid) desc;
select reloptions from pg_class where relname = 'sales_archive';

-- 3. Triggers on the table (anything that fires per updated row).
select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'sales_archive'::regclass and not tgisinternal;

-- 4. What else is running or waiting right now (ingest, archive reads, locks). Run this WHILE the job runs if you can.
select pid, state, wait_event_type, wait_event, now() - query_start as running, left(query, 120) as query
  from pg_stat_activity where datname = current_database() and state <> 'idle' and pid <> pg_backend_pid() order by query_start;

-- 5. The plan of the job's read (a SELECT, safe). The old read had `or=(condition_version.is.null, condition_version.neq.X)`, which cannot use the partial index; the new one is `condition_version is null` first.
explain (analyze, buffers) select id from sales_archive where id > '00000000-0000-0000-0000-000000000000' and condition_version is null order by id limit 100;

-- 6. OPTIONAL, only if query 1 shows n_tup_hot_upd near 0: the partial index names condition_version, so every update of that column is a non-HOT update and writes to every index.
--    The job works without it. Uncomment and run once ONLY after you have seen the numbers:
-- drop index if exists sales_archive_condition_todo_idx;

-- ===== THE RESULT FOR SENSE (Desk Valuations spec, condition tier review) =====
set statement_timeout = '120s';
-- A. Counts by tier at the current version (null = Untiered).
select condition_tier, count(*) from sales_archive where condition_version = 'ct3-20261105' group by 1 order by 1;
-- B. What drives Untiered: how many signals the listing showed (the evidence array length), and the share by venue.
select jsonb_array_length(condition_evidence) as signals_seen, count(*) from sales_archive where condition_version = 'ct3-20261105' and condition_tier is null group by 1 order by 1;
select source_slug, count(*) filter (where condition_tier is null) as untiered, count(*) as all_rows, round(100.0 * count(*) filter (where condition_tier is null) / count(*), 1) as pct_untiered,
       count(*) filter (where description is null or btrim(description) = '') as no_description
  from sales_archive where condition_version = 'ct3-20261105' group by 1 order by 3 desc;
-- C. Ten sales per tier (a stable pseudo-random pick), with the evidence lines that produced the tier.
select * from (
  select condition_tier, source_slug, left(listing_title, 70) as title, mileage_text, title_status,
         (select string_agg(e->>'points' || ' ' || (e->>'line'), ' | ') from jsonb_array_elements(condition_evidence) e) as evidence,
         row_number() over (partition by condition_tier order by md5(id::text)) as n
    from sales_archive where condition_version = 'ct3-20261105' and condition_tier is not null) t
 where n <= 10 order by condition_tier, n;
-- D. Ten Untiered, with what little was seen.
select source_slug, left(listing_title, 70) as title, left(coalesce(description, ''), 60) as description_start, (select string_agg(e->>'line', ' | ') from jsonb_array_elements(condition_evidence) e) as seen
  from sales_archive where condition_version = 'ct3-20261105' and condition_tier is null order by md5(id::text) limit 10;
