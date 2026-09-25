# Sam Desk record / coverage timeout — EXPLAIN investigation findings (Sep 24, 2026)

Read-only, no fixes applied (per instruction: "Fix nothing until you have that evidence"). Evidence
gathered via the `deskexplain` ops task (task=deskexplain), which times the exact query shapes and,
once `docs/supabase-desk-explain.sql` is applied, will also return the real `EXPLAIN (ANALYZE)` plan.

## Correction to the earlier (wrong) diagnosis

My first hypothesis was "missing indexes." That was **wrong** — Sam confirmed `pg_indexes` shows
`idx_sales_archive_make_price`, `idx_sales_archive_platform_saledate` and `idx_sales_archive_sale_price`
all present, with no invalid indexes. The timing evidence below agrees: the index-served shapes are fast.
The timeout has a different cause.

## What EXPLAIN-via-PostgREST could not do

PostgREST's plan media type (`application/vnd.pgrst.plan`) is **disabled on Supabase** (`PGRST107`,
`db-plan-enabled=false`), so the ops task cannot pull a plan through the REST API. To get a true
`EXPLAIN (ANALYZE, VERBOSE, BUFFERS)` server-side, apply `docs/supabase-desk-explain.sql` (a read-only
`desk_explain(q)` RPC restricted to `SELECT ... sales_archive`); `deskexplain` calls it automatically
once present. Until then, the **timings** below localize the cost (two consecutive runs shown).

## The evidence (two runs, production)

| Query shape | Run 1 | Run 2 | Result |
|---|---|---|---|
| **record, make=eq only** — `make='BMW' and sale_price is not null order by sale_price desc limit 200` | 1152 ms | 878 ms | 200 rows, HTTP 200 — **fast** |
| **record, make=eq + title ILIKE '%M3%' + price sort** (the real badged-model record query) | 8959 ms | 8507 ms | **HTTP 500, statement timeout** |
| **coverage, BaT earliest** — `platform='Bring a Trailer' and sale_price is not null order by sale_date asc limit 1` | 172 ms | 218 ms | 1 row, HTTP 200 — **fast** |
| count=exact, BMW (`21,734` rows) | 1045 ms | — | HTTP 206 |
| count=exact, BaT (`~149,528` rows) | 8614 ms | — | **HTTP 500, statement timeout** |
| count=estimated, BaT | 1571 ms | — | planner estimate, fast |

## Root cause

**The record all-time scan for a BADGED model is the failure, and the cause is the query SHAPE, not a
missing index.**

- `make=eq` **alone**, ordered by `sale_price desc`, is fast (~0.9–1.2 s): the `(make, sale_price)`
  index serves it index-ordered, exactly as intended.
- The **real** record query for "BMW M3" adds a **leading-wildcard `listing_title ILIKE '%M3%'`** on top
  of `make=eq` **and** the `sale_price desc` sort. The planner cannot use the `(make, sale_price)` btree
  (for the ordered scan) and the `listing_title` trigram GIN (for the ILIKE) at the same time, so it
  picks a plan that filters + sorts a large set and **exceeds the 8 s statement timeout** (reproducible:
  8.5 s and 9.0 s → HTTP 500). The code's `catch` then falls back to the 24-month window and reports
  "the all-time scan timed out, so this is a recent-window record" — which is exactly the Desk Golden
  `(e)` assertion failure. Deterministic on high-volume badged models (M3), which is what the golden tests.

- **Coverage is NOT the problem.** The actual `coverage.js` query (`asc, limit 1`) is index-served and
  fast (172–218 ms). The earlier Desk-Golden coverage-empty failures for BaT/C&B were **not** this query
  timing out on its own; the most likely explanation is collateral timeout/contention while the record
  scan above was holding/timing-out connections in the same run (the golden runs record + coverage
  together). What DOES time out on BaT is `count=exact` (8.6 s on ~149,528 rows) — but coverage does not
  use `count=exact`, so that is a separate, latent cost, not the coverage-date failure.

## Confirming index usage (the one open step)

The timings strongly imply `make=eq`-only uses `idx_sales_archive_make_price` and the coverage query uses
`idx_sales_archive_platform_saledate`. To turn "strongly imply" into "confirmed," apply
`docs/supabase-desk-explain.sql` and re-run `task=deskexplain`; it will print, per query, the node types
(Index Scan vs Seq Scan + Sort), the index name, and the actual execution time.

## Fix direction (NOT implemented — evidence first, per instruction)

For the record path on a badged model, avoid asking the planner to serve the leading-wildcard title
ILIKE and the `sale_price desc` sort from one query. Options to weigh (do not build yet):
1. Scan `(make, sale_price)` index-ordered (fast, as proven) and filter the badge (`M3`) in application
   code over the top-N rows — the record is the max, so a modest N (e.g. 500) almost always contains it.
2. A partial/expression index matching the badge pattern, or a normalized `model`/`badge` column so the
   badge is an equality filter instead of a leading-wildcard ILIKE.
3. Split: one cheap `make=eq` price-sorted pass, intersect with a cheap trigram-only `M3` id set.

Option 1 is the least invasive and matches how the make=eq scan already behaves.
