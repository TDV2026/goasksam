# Sam Desk record / coverage timeout — findings (Sep 24, 2026)

Read-only investigation. The earlier "missing indexes" hypothesis was **wrong** (Sam confirmed all three
indexes present, none invalid). Evidence below was gathered by timing the exact query shapes in
production; the temporary `deskexplain` ops task and the `desk_explain` arbitrary-query RPC have been
**removed** (we do not ship an arbitrary-SQL function to prod). To get a real plan, run the exact
`EXPLAIN` statements at the end once in the Supabase SQL editor.

## Root cause of the record timeout (the golden `(e)` failure)

The record all-time scan for a **badged** model is the failure, and it is the query SHAPE, not an index.

| Query (production, two runs) | Time | Result |
|---|---|---|
| `make='BMW'` only, `order by sale_price desc limit 200` | 0.9–1.2 s | fast — `(make, sale_price)` index serves it |
| **`make='BMW' and listing_title ILIKE '%M3%'`, `order by sale_price desc limit 200`** (real record query) | **8.5–9.0 s** | **HTTP 500, statement timeout** |
| coverage: `platform='Bring a Trailer' and sale_price is not null order by sale_date asc limit 1` | 0.17–0.22 s | fast — index-served |

Why the badged query dies: with `order by sale_price desc limit N` the planner walks the
`(make, sale_price)` index from the top and filters `listing_title ILIKE '%M3%'` row by row. **The most
expensive BMWs are not M3s** (507, M1, Z8, 8-Series), so it scans thousands of rows before collecting N
M3s and blows the 8 s statement timeout. The code's `catch` then falls back to the 24-month window
("the all-time scan timed out"), which is the golden `(e)` failure. Deterministic on high-volume badged
models. **Coverage is not the cause** (172–218 ms, index-served); the earlier coverage-empty golden
failures were collateral contention while this scan timed out in the same run. (`count=exact` on BaT,
~149,528 rows, does time out at 8.6 s — but `coverage.js` uses `asc limit 1`, not `count=exact`.)

## Item 4: is the `model` column reliable? NO.

Sampled BMW rows whose title carries "M3" — the `model` column values:

`M3`, `M3 GTS`, `M3 CSL`, `M3 Evolution II`, `M3 Cecotto`, `M3 Coupe`, `M3 Convertible`, `M3 Individual`,
`(E46) M3`, `(E30) M3`, `E30 M3`, `M3 E30`, `M3 (G80)`, `M1`, and `3-Series`.

- `model = 'M3'` (exact) matches only **458** rows and **misses the record** — the all-time BMW M3 top
  sale is a **1992 BMW M3 (E30) DTM at $483,000**, whose `model` is not the literal `"M3"`. So a
  `(make, model, sale_price desc)` btree queried with `model = 'M3'` would return the wrong record. This
  is the same failure the top-N-by-price approach has, just via `model` — do NOT do it.
- `model ILIKE '%M3%'` would also catch `M340i` (harmless for the *record* since M340i is cheap, but
  wrong for a full pool), and there are ~real M3s mis-catalogued as `3-Series` that it misses.

**Conclusion: the `model` column does not identify the model reliably, so an index on
`(make, model, sale_price desc)` with `model = 'M3'` is not the fix.**

## What works

**Verified now, no schema change, < 3 s:** filter the record scope on the `model` column with the
existing model trigram index (`idx_sa_model_trgm`) and order by price:

```
select sale_price, listing_title from sales_archive
where make='BMW' and model ILIKE '%M3%' and sale_price is not null
order by sale_price desc limit 1;
```

Production timing: **230 ms**, and it returns the true record (1992 BMW M3 (E30) DTM, $483,000). The
`model` column is far cleaner than `listing_title` (no VIN/description noise: `listing_title ILIKE '%M3%'`
returns 1,900+ rows, most of them 3-Series with an "m3" substring in a chassis number), so the trigram
filter yields a small set and the price sort is cheap. This is the Stage-B code change to the record path
in `lib/desk/execute.js` / `lib/onebox.js` (scope the badge on `model`, not `listing_title`). It carries
the same completeness caveats the title path already had for chassis-code models (911 filed as 997/991/930),
which the existing chassis-code union handles.

**Optimal long-term (needs a column, so flagged, not a one-line index):** add a normalized
`model_family` (badge) column, populated at ingest by the existing `performanceBadge` logic (it already
derives "M3" from any M3 title, and would also recover the M3s mislabeled `3-Series`), then:

```
CREATE INDEX idx_sales_archive_make_family_price
  ON sales_archive (make, model_family, sale_price DESC);
```

Query becomes `make='BMW' and model_family='M3' order by sale_price desc limit 1` — exact, complete,
sub-100 ms. This is also what the nightly record cube (spec s15) would precompute. Do NOT create this
index before the `model_family` column exists and is backfilled (an ingest task).

## Exact EXPLAIN statements to run once (Supabase SQL editor)

```sql
-- 1) the failing badged record query (expect Seq/Index scan + filter, high time / timeout)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sale_price FROM sales_archive
WHERE make='BMW' AND listing_title ILIKE '%M3%' AND sale_price IS NOT NULL
ORDER BY sale_price DESC LIMIT 200;

-- 2) the proposed model-column fix (expect Bitmap Index Scan on idx_sa_model_trgm, ~ms)
EXPLAIN (ANALYZE, BUFFERS)
SELECT sale_price, listing_title FROM sales_archive
WHERE make='BMW' AND model ILIKE '%M3%' AND sale_price IS NOT NULL
ORDER BY sale_price DESC LIMIT 1;

-- 3) coverage (expect Index Scan on idx_sales_archive_platform_saledate, ~ms)
EXPLAIN (ANALYZE, BUFFERS)
SELECT sale_date FROM sales_archive
WHERE platform='Bring a Trailer' AND sale_price IS NOT NULL
ORDER BY sale_date ASC LIMIT 1;
```
