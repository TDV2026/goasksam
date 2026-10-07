# Lane coordination notes

Short, dated cross-lane heads-ups so two lanes don't collide on the same file. Append a line; remove it
when the work has landed.

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
- 2026-10-08 (Lane A -> Lane C): VEHICLE-TYPE WORDING on the VIN page. `carPage` now classifies every VIN
  with `classifyRoad` (lib/_roadType.js) and emits `<!-- roadtype: car|motorcycle|other -->` in the page
  body. Non-road lots (boat/aircraft/standalone trailer/memorabilia/parts/loose engine) are now noindex
  and out of every sitemap. Motorcycles are listed in `sitemap-motorcycles.xml` and other self-propelled
  vehicles (tractor, golf cart, ATV/UTV, RV/motorhome, military) in `sitemap-other.xml`. Those pages still
  render with CAR wording. When `roadBucket` is "motorcycle" or "other", please relabel these strings in
  carPage (api/history.js) to the vehicle's type (e.g. "motorcycle"), driven off `roadBucket`:
    1. FAQ: "What did this car last sell for?"  -> "...this motorcycle..."
    2. FAQ: "What is the highest bid this car has had?"  -> "...this motorcycle..."
    3. Watch button: "Watch this car"  -> "Watch this motorcycle"
    4. Watch message (x2, incl. the inline <script>): "Sam will email you if this car comes up at auction
       again."  -> "...this motorcycle..."
    5. aria-label "What cars like it sold for" + the "What {fam} sell for" heading read fine, but confirm
       the voice for a motorcycle/other.
  The title ("[Year Make Model], VIN ...: auction history") and the dated lead ("This {Year Make Model}
  has been to auction ...") are name-based and read correctly for any type, so no change needed there.
  For "other", use the specific type if easy (tractor/golf cart/ATV/RV), else a neutral "vehicle".
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
