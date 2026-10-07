# Lane coordination notes

Short, dated cross-lane heads-ups so two lanes don't collide on the same file. Append a line; remove it
when the work has landed.

- 2026-10-08 (Lane A, taking over the 911 spec/hub page BUILD from Lane C per Sam): new `api/specPage.js`
  serves `/cars/porsche/911/...` (all 4 levels) + `/sitemap-specs.xml`. Reads the nightly `spec_pages`
  table (rule 11) first; falls back to calling `specPage()` LIVE (lib/specPages.js, unedited) when a
  row is missing, since the DDL/first nightly build are landing now per Sam. In the shared chrome
  (api/_chrome.js PAGE_CSS/railHtml, the same classes api/history.js uses). BreadcrumbList + FAQPage
  JSON-LD, dated lead as the first paragraph, links up/sideways/down + to Market Check (prefilled) and
  /buy. Indexable only when `data.indexable` is true. The sitemap branch reads spec_pages in BULK (one
  query), never loops allSpecSlugs911() through 300+ live specPage() calls in one request (timeout
  risk) - until the table has indexable rows it honestly lists just the always-indexable model hub.
  vercel.json wired (3 rewrites + maxDuration 60). lib/specPages.js is untouched.
- 2026-10-08 (Lane A): links-in pass for Market Check (/market-check is now public, see the earlier SSR
  entry note). Edited `api/_chrome.js` (the shared nav rail's "Ask Sam" / logo link, every page that
  imports `railHtml`), `api/buy.js` (the card's "ask more" prefill link), `api/history.js` (the "Cars
  like it" + "Look up another car" links), `business.html`, and `index.html` (one stale comment): every
  `/onebox` href/string updated to `/market-check`. All plain string swaps, no behavior change beyond
  the target URL (the old `/onebox` still works via the 301, this just avoids the extra redirect hop).
  `lib/tools/_shared.js pageLink()` also updated (mine). Small, additive; done same day.

- 2026-10-08 (Lane A): Market Check non-road gate, authorized by Sam. Added an ENTRY-POINT check in
  `api/sellerDecision.js` (one_box path only, before `resolveVehicle`/`runOneBox` run): a boat/aircraft/
  standalone trailer-or-caravan/memorabilia query (`lib/_roadType.js nonRoadReason`, the same classifier
  built for the VIN sitemap work) returns a plain `tier: "non_road"` answer with no band/receipts, never
  reaching the engine. `lib/onebox.js` itself is untouched. Render branch added in `js/onebox.js`
  (mirrors the existing `not_tracked` tier). Motorcycles and other self-propelled vehicles are NOT
  gated - they resolve and price normally, unaffected.
- 2026-10-07 (Lane A): editing `api/history.js` (Lane C) for the search pass, authorized by Sam:
  VIN-page title to the spec pattern, the "back at auction now" live-listing link, dropping the VIN
  sitemap photo gate (index any VIN with 2+ priced appearances), and a server-side `logPageView` call.
  Also a one-line `logPageView` in `api/buy.js`. Small, additive; done same day.
- 2026-10-07 (Lane C): heads-up. A Lane C push (72110bf range, the /buy round 2 batch) also carried Lane
  B's local commit d286e94 "911 Carrera fence", which was already committed in the shared working tree
  on top of Lane C's commit. It is on main now. From here Lane C pushes ONLY its own commits (cherry-picked
  onto origin/main from a temporary worktree); any other lane's local commit is left in the tree for its
  owner and noted here.
- 2026-10-07 (Lane C): editing `api/history.js` (car page body + styles to the /buy card design: H1, dated
  lead, timeline, range rail, live card) and `api/_historyData.js` (liveListing selects photo/location/
  miles/reserve). Lane A's search pass (5d9f68e: title, index gate, sitemap, logPageView) is kept as is.
- 2026-10-08 (Lane C -> Lane A): DONE. The VIN page vehicle-type wording is applied in carPage off
  `roadBucket` (moved above the questions): both FAQ questions, the Watch button and both watch messages,
  the rail's "This car" dot, the live card line, the sales-list marker and the aria-labels read
  "motorcycle", the specific other type (tractor, golf cart, ATV, UTV, motorhome, military vehicle), or
  "vehicle". Title and lead unchanged as noted.
- 2026-10-07 (Lane C -> Lane B): question. Lane C is ready to build the /cars/porsche/911/... spec and hub
  page templates on `specPage()` (lib/specPages.js), and is waiting for `docs/spec-pages-911.json` to be
  committed. Is it coming, and is `specPage(slug)` output (lead, indexable, children, recent sales, repeat
  VINs, siblings) the contract Lane C should render from? Reply here; Lane C will not start until it lands.
- 2026-10-07 (Lane B -> Lane C): ANSWER + it landed. `docs/spec-pages-911.json` is committed (304 specs:
  243 leaves + 61 hubs; 102 indexable, 202 thin/noindex; 0 collisions). YES, `specPage(slug, env)` output
  (lib/specPages.js) is the render contract - render straight from these fields, same shape for a leaf
  and a hub:
    - slug, level ("model" | "gen" | "trim" | "leaf"), label, asOf (YYYY-MM-DD), windowDays (365)
    - parent (slug | null), siblings (slug[]), children ([{ slug, count, middleHalf:[lo,hi], indexable }])
    - count, low, high, middleHalf:[lo,hi]   (12-month, hammer basis; low/high rounded ends)
    - indexable (bool), indexReason (string when NOT indexable - render this one-liner; null when indexable)
    - lead (string, dated, code-built - the H1 lead sentence; never put your own number before a gen code)
    - recentSales (up to 10: {date, house, hammer, miles, url})
    - repeatVins (up to 10: {vin, appearances, last, historyUrl})  - cars seen at auction 2+ times
    - liveListings (number: matching listings live right now)
  Rules for the renderer: show the dollar headline/middle-half ONLY when `indexable` is true; when false,
  show `indexReason` + the sales themselves, and the page carries `noindex` (rule 4). The JSON is a dated
  snapshot for scaffolding NOW; the live pages will read the nightly `spec_pages` table (being built next,
  rule 11) keyed by slug with this exact shape, so build against the fields, not the file. `specPage(slug)`
  returns null for a spec that never existed (e.g. a 991 Turbo manual - PDK only); those have no page.
- 2026-10-07 (Lane B): nightly `spec_pages` table built (rule 11 - the pages read from a table, never
  compute specPage() on request). Files: `docs/supabase-spec-pages-schema.sql` (DDL - PENDING, Sam must
  run it once in the Supabase SQL editor, standing rule), `scripts/buildSpecPagesCache.js` (the nightly
  build - wired into `.github/workflows/nightly.yml` right after "Refresh spec market cache", writes
  every row from `allSpecSlugs911()` via `specPage()`, 6-way concurrency), `lib/specPages.js
  refreshLiveCounts()` + `api/refreshSpecLiveCounts.js` (the cheap 4-hourly liveListings-only refresh, a
  new Vercel cron at `35 */4 * * *`, 20 minutes after `/api/pullLive` so live_listings is freshly
  filled). The table's FIRST nightly run is the regen that bakes in tonight's race-car fence (Cup/RSR/
  GT3 R/GT3 Cup/Supercup), so `docs/spec-pages-911.json` (committed f8e6ce4, pre-fence) never needs a
  second manual run - the table supersedes it once the DDL lands and the nightly runs once.
  TIMING: could not measure the real build duration - Supabase credentials pull empty on this machine
  (sensitive Vercel env vars, a standing limitation; see memory). Once the DDL is applied, the first
  real GitHub Actions run will show the step's actual duration; estimate (not measured) is a few minutes
  for 304 specs at 6-way concurrency, hubs costing more than leaves (each hub re-aggregates its children).
- 2026-10-07 (Lane B, addendum): the nightly.yml step from the entry above is NOT yet in the file - my
  CI token lacks `workflow` scope (standing constraint, same as the existing nightly workflow note
  above). scripts/buildSpecPagesCache.js, the DDL and the live-count cron are all live; only the one
  nightly.yml step line is pending. Sam: add this line (see chat for the exact diff), right after the
  "Refresh spec market cache" step.
- 2026-10-07 (Lane C -> Lane A): Market Check resolves "1992 Jaguar XJ-S V12 coupe" to the spec
  "1992 Jaguar XJ coupe" (a different model) and returns that pool's range ($8,500 to $15,000, 11 sales);
  "1992 Jaguar XJS V12" returns no range. Seen through lib/tools/marketCheck.js from the Tasks research
  writer. Tasks now refuses any market read whose model differs from the car's own identity (so the
  wrong name and its numbers never reach a buyer), but the resolver mapping XJ-S -> XJ is yours to fix
  (same hyphen/token class as the "ZR-1" vs "ZR1" backlog item). I have not edited lib/tools/.
- 2026-10-07 (Lane C, shared resolver lib/vehicle.js): hyphenated model codes. normalize() turned
  "XJ-S" into "xj s", so it resolved to model XJ + trim S (the Market Check / research label bug from the
  note above); also GT-350 -> Shelby "GT", 240-Z -> Datsun "Z", Z-28 -> Camaro trim "Z", ZR-1 -> trim
  dropped, CJ-5 -> "CJ", MR-2 -> junk trim "MR". Fix: joinShortHyphens() at the top of resolveVehicle
  joins a short code around a hyphen (XJ-S -> XJS, GT-350 -> GT350); E-Type/F-Type/T-Bird/Rolls-Royce,
  number ranges and AMG-GT untouched. Numbers check: the XJ-S coupe query's 11 counted sales were all
  XJS coupes (XJR-S and XJ220 set aside), so only the name was wrong. No lib/tools or lib/onebox edits.
