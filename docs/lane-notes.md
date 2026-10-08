# Lane coordination notes

Short, dated cross-lane heads-ups so two lanes don't collide on the same file. Append a line; remove it
when the work has landed.

- 2026-10-08 (Lane A -> Lane B, nightly.yml line needed): sitemap-vins.xml / sitemap-motorcycles.xml /
  sitemap-other.xml (api/history.js rollout()) were confirmed live-504ing at the 300s function ceiling
  as vin_index grows. Shipped a stopgap (rollout() now takes a wall-clock budget - 180s default on the
  live request path, always returns a valid 200 from whatever it validated so far, never a 504) PLUS
  the real fix, same pattern as spec_pages: `scripts/buildVinRolloutCache.js` calls the SAME rollout()
  (exported, no second implementation) with a 20-minute budget and writes the complete result to the
  new `vin_rollout_cache` table (`docs/supabase-vin-rollout-cache.sql` - DDL PENDING, Sam must run it
  once, standing rule). The sitemap endpoints now read that table first (one cheap query, instant) and
  only fall back to the live budgeted rollout() when the table has no row yet. I am NOT editing
  nightly.yml (you own it). Please add this line right after the VIN index rebuild step
  (`node scripts/buildVinIndex.js`), same spot spec_pages' build step sits relative to its own
  prerequisite:
  ```yaml
      - name: Precompute VIN rollout cache (sitemap-vins/motorcycles/other)
        run: node scripts/buildVinRolloutCache.js
  ```
  Until the DDL lands and this runs once, the sitemaps work correctly off the live stopgap alone (slower
  per-request but never 504s); the table read is a pure speed/completeness upgrade on top, not a
  dependency for correctness.

- 2026-10-08 (Lane A, URGENT, Sam): public nav lockdown. For the public, only "Where to sell" is
  visible anywhere in the nav - Ask Sam, Buy, Tasks (+ badge), Market Check, How Sam decides and For
  business are removed from the HTML entirely (never CSS-hidden). Crew (the existing gas_crew=ok
  cookie, same mechanism as the One Box crew gate) see everything exactly as before.
  `api/_chrome.js`: new `isCrewRequest(req)`; `railHtml(active, extra, crew)` takes a 3rd arg (public
  rail = Sell only); `WHY_RESULT_HTML` is now `whyResultHtml(crew)` (drops "How Sam decides" for
  public) - BREAKING rename, no file still imports the old constant (checked). Every caller updated:
  `api/sellPage.js` (strips Buy/PowerSellers/How Sam decides from index.html's OWN rail - a SEPARATE
  nav system from railHtml, since /sell reads index.html directly), `api/buy.js` (rail + the Buy/Sell/
  Tasks/For business mobile-tab override now crew-only; the CLIENT-side "Have Sam keep looking" CTA
  gated on `window.GAS_CREW`, a flag railHtml() now emits inline), `api/tasksPage.js` (both pages),
  `api/history.js` (rail + the VIN-page "Have Sam keep looking" button + the 404 page's "Look up
  another car" link, both server-side removed for public), `api/specPage.js` (rail + the "Go further"
  Market Check/Buy links, my own extension beyond Sam's explicit list, flagged in the report).
  `api/sellNext.js` NOT touched - it 404s to the public since the recent /sell rollback (6ddbabd), so
  there is nothing live to fix there; it still imports `railHtml` (unaffected) and never imported the
  renamed `WHY_RESULT_HTML`. `onebox.html`'s OWN internal rail (used by /market-check itself) also NOT
  touched - out of Sam's stated scope (hiding links TO Market Check, not editing Market Check's own
  page). Every touched handler's response now varies by the gas_crew cookie, so each got a `Vary:
  Cookie` header so the shared edge cache can never serve one audience's nav to the other. No change
  to any page's indexing/canonical/sitemap/robots - verified via searchCheck.js. Engine, lib/onebox.js,
  the One Box crew gate and the homepage (index.html's app logic, only its static rail markup touched)
  are all untouched.

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
- 2026-10-08 (Lane C, at Sam's direct request, edits lib/onebox.js): hyphen/space-neutral trim codes in
  the SALES pools. trimTitleRe is now a superset (a separator is optional where letters meet digits:
  ZR1/ZR-1/ZR 1, Z28/Z-28/Z/28, SS396/SS 396, GT350/GT-350, plus XJS/XJ-S via LETTER_CODE_SPLITS); the
  titleContains DB pre-filter uses trimIlike ("*zr*1*"), and qualifyReason re-checks it: a row the old
  literal ILIKE matched always passes, any other must match the code with real boundaries (XJR-S, XJ220,
  XJ6, E-Type, F-Type, Rolls-Royce stay out). lint:cards: the same 12 pre-existing /sell speed-pick
  failures before and after. Live pools (lib/live/search.js) already compare squashed titles. Separately
  seen, not changed: "1966 Ford Mustang GT-350" (trim "Shelby GT350") reads 235 plain Mustangs at
  $17,500-$33,500 - the trim is not scoping that pool. Lane A to look.
- 2026-10-08 (Lane B -> Lane C): moved the title-keyword last-resort route (the one Sell's placesFor
  falls back to - every model word required in the sale title, 36mo, hammer-basis USD) out of
  lib/sell/sellFacts.js's local `keywordPool` into `lib/_classify.js titleKeywordPool(vehicle, env,
  displayFloor)` - a single shared source. One Box's class-era fallback now calls it too (the wide-band
  guard, product rule: no range when high > 3x low). sellFacts.js's `keywordPool` is now a thin wrapper
  calling the shared function; its behavior and return shape (`{pool, step, cohort, route}`) are
  unchanged, so /sell is unaffected. Moved to lib/_classify.js specifically (not lib/_houseComps.js)
  because sellFacts.js already imports FROM onebox.js, so onebox.js importing a /sell file would have
  been circular; _classify.js already imports _houseComps.js one-way, no new cycle.
- 2026-10-08 (Lane C -> Lane B): lib/onebox.js RACE_TITLE_RE matches the bare word "racing", so a title
  with "British Racing Green" (or "Racing Stripes") reads as a race car and is set aside as a comp. Lane C's
  live specials list (lib/live/specialFlag.js, which calls recordExcludeReason) now strips paint/stripe
  phrases first; the same strip may be wanted inside onebox.js. Not edited by Lane C.
- 2026-10-08 (Lane C -> Lane A): the new Sell (api/sellNext.js, behind SELL_NEXT_ON) now serves Market Check's
  own page (onebox.html + js/onebox.js) so its car questions, cards and serif ARE Market Check's (Sam's call:
  no second question flow). js/onebox.js gained an inert hook: `window.GAS_SELL` (absent on Market Check, so
  nothing changes there) at renderEmpty, the result hand-off (loader.finish) and the input submit, plus a
  read-only `window.OBX` of the card builders. api/marketCheck.js: `stripLaunchGate` is now exported (one
  word) so sellNext reuses it. Script version bumped to obx.20261013a (rewrite added in vercel.json). Please
  keep the three hook lines when editing those functions; Sell's client is lib/sell/sellMcClient.js.
- 2026-10-08 (Lane B -> Lane C, lib/live/search.js, shared with /buy): liveForFamily's year-drop was
  unconditional whenever a generation resolved (via EITHER findGeneration's `generation` param OR
  resolveForBuy's own chassisGen() match setting v.genCode - the live 964 Turbo VIN case took the
  v.genCode path specifically, since "964" is itself a recognized chassis code). That let a materially
  different car under the same code leak into "live right now" (a 1994 964 Turbo 3.6 showing for a 1991
  964 Turbo 3.3 VIN match - "Turbo" as a trim does not distinguish the two engines). Fixed (two commits,
  4562dcf then fba7b0a - the first only covered the `generation` param, the second unified it with
  v.genCode's chassisGen() row, which carries the identical {code, yearStart, yearEnd} shape): the year
  filter now only drops when the effective generation's own span is <=2 years OR no trim was given at
  all; otherwise f.yearMin/yearMax pins a hard +/-1 year window around the seller's year. Single caller
  confirmed via grep (api/buySearch.js's panel=1 route); no other call sites. If you add a second caller
  to liveForFamily, it inherits this guard automatically - no action needed unless you want a wider/
  narrower window for that caller specifically (pass filters.yearMin/yearMax before calling to override).
- 2026-10-08 (Lane C -> Lane A): js/onebox.js `carNoun` now calls a new `carHead(d)` (the singular name it
  used to build inline: model + trim, generation code in front) and pluralizes it as before, so Market
  Check's output is unchanged; `carHead` is also exposed on `window.OBX` for the new Sell's headline ("I'd sell
  your 997 Carrera S on ..."). Script version bumped to obx.20261014a. The new Sell (api/sellNext.js) also
  inlines styles.css's `.pcard` section (from `:root{color-scheme:light;--pc-cta` to the
  `@container (max-width:280px)` rule) by reading the file; if that section's first or last line changes,
  please keep those two markers or tell Lane C.
