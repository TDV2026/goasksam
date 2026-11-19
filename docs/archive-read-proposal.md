# Archive pool read: proposal (Lane B, Nov 2 2026)

Job: lane-b-archiveread. Design only. Nothing here is built, nothing was run against production, no pushes. Code was read from origin/main `cf53ac91`.

The query: `lib/onebox.js` `fetchQualifying` (non-record branch, `modelQ` / `titleQ`), paged by `supabaseSelectAll` (`lib/_supabase.js`): page size 1000, first page alone, then 6 pages at once, 3 attempts per page, 8 s client abort equal to the 8 s statement timeout. The model, title and chassis-alias legs run together.

Nothing below draws a conclusion about the cause. The plans in section 3 come first.

## 1. Options (what each changes, effect, risk, proof)

Order to take them: f1, then g, h, i, then the plans, then a, c, d.

- f1 Attribute calls. `User-Agent: goasksam/<caller>` on every `supabaseFetch`. No load change. Proof: a check that every call carries a tag.
- g Never retry a timeout. Classify 57014 and aborts as non-retryable, stop the whole read on the first one (shared AbortController), carry the reason back. Risk: more visible `read_failed` answers. Proof: fake PostgREST (57014 on page 3 means one request, siblings aborted, null, `queryError`; a connection reset is retried twice and succeeds); red on current code first.
- h Lower `PAGE_CONCURRENCY` (6 to 2 or 3, tunable from `app_config`), serialize the model, title and alias legs. Risk: slower cold big pools (TTFP p50 ~3.9 s, p95 ~16.3 s). Proof: identical rows; time five large cars.
- i Forward the abort. `AbortSignal` through `env` into `supabaseFetch`; `Promise.race` callers abort what they abandon. Unverified: whether the server cancels on disconnect (test in 3.5).
- a `make =` plus `model_family` on the existing family index for the plain-nameplate model leg (chassis-alias legs fold in). Risk: the pool can differ; dark behind an `app_config` flag. Proof: pool-equality script (ids and order, old against new) over the golden list plus HVT-100, run through Actions at 3 heavy reads at a time.
- b Lowercase columns. A functional index on `lower(make)` is not used by PostgREST `ILIKE`; it needs a stored `make_lc` and `make=eq`. Helps the make half only (the model half is a leading-wildcard substring, trigram only). Hold until the plans show `make ilike` costs.
- c Keyset paging on `(sale_date, id)` (or disjoint date windows read in parallel). Linear total work instead of quadratic; sequential keyset pages raise wall time. Proof: identical id sequence including same-date ties.
- d Flip `pool_columns_enabled` (already built). Removes 15 JSONB extracts per row; does not touch the filter or sort. Proof: Block 3(b) diff exactly 0, `poolColumnsCheck.mjs`.
- e One shared pool read per request (widest window, filter in memory). Proof: rung outputs identical, golden diff.
- j Cross-request pool cache keyed by query plus `sales_epoch` (`lib/_epoch.js`), stored `rawPool` first. Risk: staleness (rule 19), egress of large rows. Proof: cached equals fresh on one epoch; a bumped epoch forces a fresh read.
- Class finding: `answerCacheable` (`lib/live/search.js:701-709`) does not refuse a `result` or `thin` answer with `dedup.queryError` set, so a partial failure (one of three legs) is stored. Fix: add `d.dedup && d.dedup.queryError`.

## 2. SQL for Sam (only when an option is approved)

Run each statement on its own. CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

### 2.1 Pre-checks (read only)

```sql
-- Is make stored in one spelling per make? Rows returned = case variants exist (make = would differ from ilike).
select lower(make) as k, count(distinct make) as spellings, array_agg(distinct make) as seen
from public.sales_archive where make is not null
group by 1 having count(distinct make) > 1;

-- How much of the pool scope has model_family? (decides whether option a is possible)
select count(*) filter (where model_family is null) as null_family, count(*) as total
from public.sales_archive where vehicle_type = 'car' and sale_price is not null;

-- The indexes that really exist and the table's statistics state.
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'sales_archive' order by indexname;
select relname, reltuples::bigint, relpages from pg_class where relname = 'sales_archive';
select last_analyze, last_autoanalyze, n_live_tup, n_dead_tup from pg_stat_user_tables where relname = 'sales_archive';
```

### 2.2 Option a (index that serves order by sale_date desc, id asc without a sort step)

```sql
create index concurrently if not exists sales_archive_family_date_id_idx
  on public.sales_archive (make, model_family, sale_date desc, id)
  where model_family is not null and sale_price is not null and vehicle_type = 'car';
```
Reason: the existing family index orders by sale_date only; the pool's order has an id tiebreak. Small (307k rows). Adds a little write cost to the nightly ingest. Index only; no table, so no RLS lines.

### 2.3 Option b (only if the plans point at make ilike)

```sql
alter table public.sales_archive add column if not exists make_lc text;   -- nullable, no default: no table rewrite
-- fill in batches, repeat until 0 rows updated (a single UPDATE of the table times out):
update public.sales_archive set make_lc = lower(make)
where id in (select id from public.sales_archive where make_lc is null and make is not null limit 5000);
create index concurrently if not exists sales_archive_makelc_date_idx
  on public.sales_archive (make_lc, sale_date desc, id)
  where sale_price is not null and vehicle_type = 'car';
```
Reason: PostgREST can filter `make_lc=eq.porsche` and use the index. Every writer (scripts/ingest.js, scripts/pullSources.js) must set make_lc, or a trigger must.

### 2.4 Option j (only if approved; locked down from creation)

```sql
create table if not exists public.pool_cache (
  cache_key  text primary key,
  epoch      text not null,
  n          integer not null,
  rows       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.pool_cache enable row level security;
revoke all on public.pool_cache from anon, authenticated;
```

## 3. EXPLAIN statements (plain EXPLAIN: nothing runs)

Paste into the Supabase SQL Editor and send Lane B the plans. The select list is cut to the observed columns plus three extracts; the plan shape is the same. `explain (verbose)` shows where the `raw_record ->>` extracts are computed (before or after the sort and limit). Dates: today is 2026-11-02, five-year window 2021-11-02.

### 3.1 Common family: Porsche 911 from 2002 on, page 1 and page 6

```sql
explain (verbose)
select id, source_id, sale_price, sale_date, platform, listing_title, year, make, model, vin_norm,
       raw_record ->> 'featured_image_url' as image, raw_record ->> 'mileage' as mileage, raw_record ->> 'modifications' as mods
from public.sales_archive
where make ilike 'Porsche' and model ilike '%911%' and sale_price is not null and vehicle_type = 'car'
  and sale_date >= '2021-11-02' and year >= 2002
order by sale_date desc, id asc
limit 1000 offset 0;
```

```sql
explain (verbose)
select id, source_id, sale_price, sale_date, platform, listing_title, year, make, model, vin_norm,
       raw_record ->> 'featured_image_url' as image, raw_record ->> 'mileage' as mileage, raw_record ->> 'modifications' as mods
from public.sales_archive
where make ilike 'Porsche' and model ilike '%911%' and sale_price is not null and vehicle_type = 'car'
  and sale_date >= '2021-11-02' and year >= 2002
order by sale_date desc, id asc
limit 1000 offset 5000;
```

### 3.2 Rare family: Iso Grifo, page 1

```sql
explain (verbose)
select id, source_id, sale_price, sale_date, platform, listing_title, year, make, model, vin_norm,
       raw_record ->> 'featured_image_url' as image, raw_record ->> 'mileage' as mileage, raw_record ->> 'modifications' as mods
from public.sales_archive
where make ilike 'Iso' and model ilike '%Grifo%' and sale_price is not null and vehicle_type = 'car'
  and sale_date >= '2021-11-02'
order by sale_date desc, id asc
limit 1000 offset 0;
```

### 3.3 The plan PostgREST actually gets (generic plan, bound parameters)

PostgREST sends the values as bound parameters, so after a few executions Postgres can switch to a generic plan that differs from the literal one above. Run these together, in one execution:

```sql
set plan_cache_mode = force_generic_plan;
prepare p911(text, text, date, int, int) as
select id, source_id, sale_price, sale_date, platform, listing_title, year, make, model, vin_norm,
       raw_record ->> 'featured_image_url' as image, raw_record ->> 'mileage' as mileage, raw_record ->> 'modifications' as mods
from public.sales_archive
where make ilike $1 and model ilike $2 and sale_price is not null and vehicle_type = 'car'
  and sale_date >= $3 and year >= $4
order by sale_date desc, id asc
limit 1000 offset $5;
explain (verbose) execute p911('Porsche', '%911%', '2021-11-02', 2002, 0);
explain (verbose) execute p911('Porsche', '%911%', '2021-11-02', 2002, 5000);
deallocate p911;
reset plan_cache_mode;
```

### 3.4 What I will not conclude yet

Whether the cost is the trigram scan, the date-ordered scan with a filter, a sort, the extracts, or a flipped generic plan. Send the plans; I read them before I say.

### 3.5 Does an aborted read stop on the server? (for option i)

Run the first statement from a cold client, abort it at once from the client, then run the second within a second:

```sql
select pid, state, now() - query_start as running, left(query, 90) as q
from pg_stat_activity
where query ilike '%sales_archive%' and state = 'active' and pid <> pg_backend_pid();
```
Rows still active after the abort mean the server does not cancel on disconnect.
