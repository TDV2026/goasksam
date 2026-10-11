# Weekly sales report

Read-only. Produces items 1 to 8 plus the same-model pairs (item 9) for a Sunday-to-Saturday
week, with the prior week shown alongside as a labelled reference. No writes, no free-form SQL:
the script only calls the two existing read-only ops tasks below and does every computation
locally from the rows they return.

## How to run it

```
BASE=https://goasksam.com PROBE_KEY=<key> node scripts/weeklyReport.mjs \
  --from 2026-10-11 --to 2026-10-17 --lastFrom 2026-10-04 --lastTo 2026-10-10
```

`--from`/`--to` is the week being reported (Pacific dates, Sunday to Saturday). `--lastFrom`/
`--lastTo` is the prior week, shown only as a labelled reference for the reconciliation note, never
mixed into the same table as the reporting week. `BASE` defaults to `https://goasksam.com`.
`PROBE_KEY` is read from the environment only and is never printed, logged, or passed on the
command line as a literal - export it in the shell before running. The key is the same ops key
used by every other ops task (`x-ops-key` header, checked server-side against `PROBE_KEY` /
`CRON_SECRET`).

Each Monday, only the four dates change.

## The two ops tasks

- `task=weeklysales` (`GET /api/usageDashboard?view=ops&task=weeklysales&from=YYYY-MM-DD&to=YYYY-MM-DD`):
  every `sales_archive` row with `sale_date` in range and a non-null `sale_price`. Returns id,
  source, make, model, year, sale date, price (native and USD), currency, miles, VIN, VIN-norm,
  listing title, and `created_at` (the row's archive-insertion timestamp, not the sale date - used
  for the arrival-lag and late-arrival reconciliation work). No writes, no free-form SQL.
- `task=vinhistory` (`GET /api/usageDashboard?view=ops&task=vinhistory&from=YYYY-MM-DD&to=YYYY-MM-DD`):
  for every VIN that sold on a non-live platform in range, every earlier record for that VIN -
  prior sold rows from `sales_archive` (`sale_date < from`) and prior not-sold rows from
  `auction_attempts` (`attempt_date < from`), each tagged `live:true/false`. Bounded at 2,000 VINs
  looked up and 6,000 total history rows; the response carries `vinsBound`/`historyBound` booleans
  so truncation is always visible, never silent.

Both tasks are read-only, require the same ops key as every other task, and never touch the
product/engine code path.

## Platform rule (applies to every figure)

"Online platforms only." The six live-auction houses are excluded from every figure in every
item: RM Sotheby's (`rmsothebys`), Broad Arrow (`broadarrow`), Gooding (`gooding`), Bonhams
(`bonhams`), Mecum (`mecum`), Barrett-Jackson (`barrettjackson`). Sotheby's Motorsport
(`sothebysmotorsport`) is UNSURE whether it counts as a live house or an online platform; it is
held out of the main figures and shown on its own line, with a combined online+UNSURE figure
given for reference. This mirrors `lib/_houseComps.js` `HOUSE_SOURCES`, which is the live-house
set the product code itself uses (the report's `LIVE` set matches it exactly except it is
hand-pinned in the script, not imported, so an engine change to that set does not silently change
report scope without a matching script update).

## "Published basis" / "restating last week"

The published weekly email figures are **not** purely an archive query: per Sam, the published
total also includes duPont cars added by hand that never enter `sales_archive`. This script can
only report what is in the archive. When a figure here is described as "published basis," it
means: online-platform rule applied, Sotheby's Motorsport excluded from the main figure, archive
rows only - it is the closest archive-only reconstruction of the published number, not a claim
that it equals the published number. Differences between this script's archive-only total and the
published total are expected and are not a bug; see the reconciliation findings below for the
specific gap drivers found for the week of 2026-09-27 to 2026-10-03.

"Restating last week" means: the prior week's items 1-5 are recomputed with the same `weeklysales`
query and the same platform rule, shown in their own clearly labelled block, and never merged into
the reporting week's tables.

## Collecting Cars scope

Collecting Cars runs multiple currency pools (EUR, GBP, USD, AUD, NZD observed in the archive) -
it is not a single-currency platform. A currency-scoped read (e.g. EUR+GBP only, to approximate a
UK/EU-only cut) will produce a different count than the full Collecting Cars total the archive
holds; for the week of 2026-09-27 to 2026-10-03, EUR+GBP alone was 79 cars against an archive total
of 112 and a published figure of 78. The script's item 5 reports the full Collecting Cars total,
not a currency-scoped cut; narrow by currency separately if a like-for-like comparison is needed.

Whether Collecting Cars' stored price includes a buyer's premium **cannot be determined from the
stored fields**: `lib/_houseComps.js` treats every non-house source as premium-free by code
convention ("online rows have no premium, hammer === total in native"), but there is no column in
`sales_archive` that independently confirms this for Collecting Cars (or any other online
platform) - it is an assumption built into the ingest/comparison logic, not a verified fact per
platform. Say so plainly rather than asserting it either way.

## duPont cars

The published total includes cars added by hand from duPont Registry listings that are not
ingested into `sales_archive` at all. This script has no way to see or reproduce that adjustment;
treat any gap between this script's archive total and the published total as partly (not
necessarily wholly) explained by duPont additions, on top of the platform-rule and currency-scope
effects above.

## What this script does not do

It does not change any product/engine code path, write to any table, or accept free-form SQL. It
is a local, read-only aggregation over two existing ops-task responses.
