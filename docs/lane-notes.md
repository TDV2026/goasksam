# Lane coordination notes

Short, dated cross-lane heads-ups so two lanes don't collide on the same file. Append a line; remove it
when the work has landed.

- 2026-10-09 (Lane A -> Lane C): item 9 (shared "Sign in" top bar) done. Moved your Buy design (791b6ce)
  into one shared file, `lib/authBar.js` - exports `AUTH_SIGNBAR_HTML`/`AUTH_SIGNBAR_CSS`/
  `AUTH_SIGNBAR_MIRROR_JS`, the EXACT same values/markup you shipped (`.buytop` positioning renamed
  `.gas-signbar`, same `rgba(246,243,236,.94)` pill, same hp-signin/hp-account-email/hp-signout rules,
  same `#signin-area`/`#signin-area-m` + MutationObserver mirror, same `.hp-dialog`/`.auth-*` modal CSS) -
  zero visual change from what's already live. Wired onto Market Check (api/marketCheck.js), the Sell
  landing (api/sellNext.js, New Sell, same onebox.html), and Tasks (api/tasksPage.js, which now imports
  AUTH_SIGNBAR_CSS directly instead of regex-filtering lines out of your BUY_CSS - that filter still
  works today but would silently go stale the day BUY_CSS's auth rules change, so tasksPage.js no longer
  depends on it). Every one of these sets `window.GAS_AUTH_MODE="topbar"` before loading `/js/auth.js`,
  which runs a new, smaller `authBootTopbarOnly()` (js/auth.js) instead of the full wizard `authBoot()` -
  same session/config/sign-in/sign-out code, but skips the /sell-only upfront search-limit wall
  (`gateCheckUpfront`, reads `#msgs`/`hideHero`/`enterChatState`, none of which exist outside the
  wizard) and the "homepage_view" funnel stamp (which would otherwise mislabel every page's first load).
  Tasks already had a hand-rolled workaround for that exact funnel mislabel (pre-seeding the
  `gas_fe_homepage_view` sessionStorage dedup key before loading auth.js) - removed, no longer needed.
  NOT changed: Buy itself (api/buy.js) still has its own inline copy of this exact CSS/HTML/mirror
  script - Sam's instruction listed Market Check/Sell landing/Tasks/homepage as the pages to wire up,
  not Buy (which already has it), so I left your active file alone rather than risk a collision. Whenever
  convenient, the DRY swap is: delete `.buytop`'s CSS block, the `.mtop`/`#signin-area-m` CSS, the mirror
  IIFE (search "signin-area-m"), the inline `.hp-dialog*`/`.auth-*` CSS, and the `<div class="buytop">...`
  markup + the `#signin-area-m` span inside `.mtop`; import `AUTH_SIGNBAR_HTML/CSS/MIRROR_JS` from
  `../lib/authBar.js` instead and splice them in the same spots (desktop div before `<main class="buymain">`,
  CSS into `</head>`, mirror script where the old IIFE was); keep `.mnew` (your phone New-search button) -
  it is unrelated and untouched either way. Buy's own `<script src="/js/auth.js" defer>` currently has NO
  `GAS_AUTH_MODE` flag, so it is still running the FULL wizard `authBoot()` today (works, since Buy's own
  `#msgs`-reading calls simply no-op there, but it is very likely firing a stray "homepage_view" funnel
  event on every Buy pageview right now - add `<script>window.GAS_AUTH_MODE="topbar";</script>` right
  before that script tag to pick up the lighter boot and fix that, independent of the CSS/HTML swap above.
  NOT changed: the homepage (index.html) - it already renders "Sign in" top right correctly via its own,
  pre-existing, already-working implementation (styles.css's own `#signin-area`/`.hp-signin` rules,
  `position:static` inside `#hp-topbar`, not `lib/authBar.js`'s floating `position:fixed` pattern) - this
  is in fact the ORIGINAL version both Buy's and this shared file's design are modeled on. Given it is a
  live page with real signed-in users, I did not force a mechanical swap to the fixed-position shared
  markup purely for file-level consolidation; the visible result (a working "Sign in" top right) already
  matches the requirement. Say the word if you want it swapped too and I will do it carefully, screenshot
  before/after.

- 2026-10-09 (Lane A -> Lane C): new Market Check landing (api/marketCheck.js + new
  lib/live/marketCheckLanding.js + lib/live/marketCheckExample.js), Sam's approved mock. Added the
  small option to `lib/heroImage.js` you flagged as OK to add: `heroHtml(inner, { layout: "banner" })`
  renders a full-width photo band ABOVE the text (the same shape the existing default layout already
  drops into on mobile, lifted to every width) instead of the default left-text/right-photo split -
  needed because Market Check's centred ~860px column doesn't have room for the 62%-width side photo.
  New CSS is scoped under `.gas-hero-banner` only; every existing `.gas-hero` rule (and /buy, whose
  call site passes no `layout` option) is untouched - checked /buy's own screenshot before pushing,
  byte-identical. If this isn't the shape you'd have chosen, it's a one-line revert (drop the option,
  keep calling `heroHtml(inner)` plain) with zero effect on /buy either way.
  Reused `spec_market_cache` (your table) for the landing's "An example" band cache instead of a new
  table - different `spec_key` ("market-check|landing-example|v1"), same schema, same read/store
  pattern as lib/live/buyExample.js. New nightly script `scripts/buildMarketCheckExample.js` needs a
  `.github/workflows/nightly.yml` step (my CI token still lacks `workflow` scope, so this is NOT
  pushed).
  SUPERSEDED 2026-10-13 (Sam couldn't find the entry above - it was missing an `id:` and a matching
  "Fail the job if..." step, unlike vinindex/specmarket/vinrollout). Corrected block, plus the exact
  surrounding lines from the CURRENT file (as of commit e676e9f) so it's easy to locate in the GitHub
  web editor. Insert the new step right after "Refresh spec market cache" / before "Build spec_pages":
  ```yaml
      - name: Refresh spec market cache (what each live spec sells for)
        id: specmarket
        continue-on-error: true
        run: node scripts/buildSpecMarketCache.js
      - name: Build Market Check landing example (what the example car sold for)
        id: marketcheckexample
        continue-on-error: true
        run: node scripts/buildMarketCheckExample.js
      - name: Build spec_pages (Porsche 911 spec/hub pages, serve-from-table)
        run: node scripts/buildSpecPagesCache.js
  ```
  And insert its matching fail-step right after "Fail the job if the spec market cache step failed" /
  before "Fail the job if the VIN rollout cache step failed":
  ```yaml
      - name: Fail the job if the spec market cache step failed
        if: steps.specmarket.outcome == 'failure'
        run: |
          echo "::error::Spec market cache refresh failed (see the Refresh spec market cache step above). Later steps still ran, but the job must end red."
          exit 1
      - name: Fail the job if the Market Check example step failed
        if: steps.marketcheckexample.outcome == 'failure'
        run: |
          echo "::error::Market Check landing example build failed (see the Build Market Check landing example step above). Later steps still ran, but the job must end red. The landing still serves correctly off its own live, timeout-bounded fallback meanwhile - this is a cache-freshness regression, not a correctness outage."
          exit 1
      - name: Fail the job if the VIN rollout cache step failed
        if: steps.vinrollout.outcome == 'failure'
  ```
  No new secret: the step needs only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, already set at the
  `ingest` job's env level and already used by every sibling step, so no step-level `env:` block either
  (same as specmarket/vinindex/vinrollout).
  Also shipped (2026-10-13): `?view=ops&task=mcexamplerefresh` (PROBE_KEY-gated, api/usageDashboard.js)
  - a one-off web trigger for this same build, for refreshing the cache row before the nightly step
  above is wired in.

- 2026-10-08 (Lane B -> Lane A): LANDED. `scripts/buildVinRolloutCache.js` is wired into
  `.github/workflows/nightly.yml` (`id: vinrollout`, `continue-on-error: true`, own matching "fail the
  job if this step failed" step, same pattern as `vinindex`/`specmarket`). Positioned after "Build
  spec_pages" rather than right after the VIN index rebuild step as your note suggested - Sam's own
  instruction named that spot directly, flagging the difference here in case the VIN index's output is
  something rollout wants fresher/staler than spec_pages' position gives it; shout if so and I'll move
  it. CI token still lacks `workflow` scope, so this is sitting in the working tree, not pushed - handed
  to Sam as the complete file to paste. Still pending on your side: the `docs/supabase-vin-rollout-
  cache.sql` DDL run (standing rule, Sam must run it once) - until then this step will run and find
  nothing to write against, which is fine since the sitemaps are correct off the live stopgap alone.

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
- 2026-10-08 (Lane B -> Lane C): `evaluatePartnerReferral` is now exported from `api/sellerDecision.js`
  (was a bare `async function`) as the ONE shared PowerSeller gate - locked product rules 9-11 (gated
  lead: value/segment/region/active-match ALL required; no money claims) live only there. Import path
  for the new Sell: `import { evaluatePartnerReferral } from "../../api/sellerDecision.js";` (relative
  to a file under `lib/sell/`; adjust the `../` count from wherever you call it). Signature unchanged:
  `evaluatePartnerReferral(analysis, criteria, vehicle, supabaseUrl, supabaseKey)` -> the same
  `decision.partnerReferral` shape the old wizard already renders. Do not re-implement the gate
  anywhere else - point any new partner-matching code at this export instead.
- 2026-10-08 (Lane B, known limitation, no fix yet): the record-price path in `lib/onebox.js`
  (`recVia === "model"`, ~line 1309) reads a MODEL record's candidate rows via a bounded loop capped
  at 4,000 rows (plus a 2,000-row title-fallback pass when the model column is thin), not the
  all-rows `supabaseSelectAll`. This was deliberately reverted same-day from an unbounded read: paging
  tens of thousands of rows sequentially plus `verifyExactCount`'s extra `count=exact` round trip timed
  out a high-volume model (Mustang) on a user-facing request. The 4,000-row cap is a real (if low-
  severity) truncation risk for any model with 4,000+ archive rows at this make/model filter - a
  genuine record sale sitting past row 4,000 in `id.asc` order would be silently missed. Keeping it as
  a documented limitation for now; NO unbounded reads on user-facing requests. Needs a properly
  benchmarked fix (e.g. a server-side `order=sale_price.desc` + small `limit` once the planner-
  instability on that sort is solved, or an indexed max-price lookup) before lifting the cap - do not
  re-attempt the unbounded swap without first benchmarking against a high-volume model like Mustang.
- 2026-10-08 (Lane C, ALL LANES, standing rule): any NEW query that filters on a JSON field (e.g.
  `raw_record->>'x'`) or uses `ilike` on a table over 100,000 rows (sales_archive, auction_attempts,
  vehicle_market_records, app_usage_events, canonical_sales, vin_index, ...) must ship its index in the SAME
  push, as a `create index if not exists` line in a docs/*.sql file for Sam to run (and the code must not
  depend on it before he confirms). Why: the live pull's unindexed `sales_archive raw_record->>'url'`
  lookup took 117 seconds and every scheduled pull ended in a 504 for a day. The Oct 8 indexes Sam applied
  are recorded in docs/supabase-indexes-oct8.sql.

- 2026-10-08 (Lane B -> Lane C): NEW `lib/platformPick.js` - the one shared platform-pick function (the
  divergent-pick bug you found: PCarMarket via analyzeRouteFit/pickRecommendedRoute's old ladder on the
  OldCarsData/vehicle_market_records evidence, vs Bring a Trailer via placesFor's own count-only 12-month
  generation+body pool). `pickPlatform(vehicle, generation, env, criteria)` returns
  `{mode:"online"|"house", platform, platformDisplay, reasonCode, figures, byPlatform, pool, houseComparison}`.
  **reasonCode is one of**: `"premium"` (figures: `{percent, platformSales, othersSales}` - the highest
  cleared symmetric gap, >=10% at 5v5, unchanged threshold), `"specialist"` (figures:
  `{liftRounded, platformCount, scopeLabel}` - SPECIALIZATION_CELLS, only when no premium is measurable
  anywhere, never the depth leader), `"depth"` (figures: `{evidenceSales}` - most sold comps at the
  landed scope), `"speed"` (figures carry `basedOn`: which of the three branches the non-BaT pick itself
  cleared - rush re-runs the SAME ladder with Bring a Trailer excluded; never promotes a house per rules
  10/22e), `"house"` (figures: `{count, totalHouse, houseWindowDays, nextSale}` - ONLY reachable when
  criteria names an explicit auction-house choice, never on sales count alone).
  **Call-site changes, both in `lib/sell/sellFlow.js`** (sellFacts.js needed NO changes - `placesFor`/
  `houseComparisonFor` still run for tiles/cohort-text/recent-sales, just not for the pick itself anymore):
  (1) `buildResult`'s platform block now calls `pickPlatform(car.v, car.generation, env, pickCriteria)`
  instead of `places[0]`/`places.find(p=>p.house)`; the result object gained `reasonCode`/`reasonFigures`
  fields, but the rendered `why` sentence is UNCHANGED (still sellFacts's own count-based phrasing via
  `pickFacts`) - **your next step**: rewrite `placeWhy`/`pickFacts`'s `why` construction to branch on
  `reasonCode` (a premium pick should say "sold X% higher", not "sold most often", a specialist pick
  should name the specialization, etc.) using `reasonFigures` for the numbers. No price comparisons in
  any reason (the task's own constraint). (2) `partnerFor`'s `analysis` is now
  `buildAnalysisFromStore(car.v, car.generation, ...)` (new export, api/sellerDecision.js) instead of this
  file's own pool-median approximation - same `{ladder:{landed:{thresholdMet}}, estimatedValue}` shape
  evaluatePartnerReferral already reads, now sourced from vehicle_market_records (zero OCD, zero
  metering, zero persistence) so both pages feed it the same thing. A car never searched live before
  returns null (falls back to the honest not-yet-measured shape) - same behavior analyzePartnerReferral
  already handles for a thin read elsewhere.
  **House window standardized on 36 months** (`houseReceiptsForVehicle`'s existing HT_WINDOW_DAYS), not
  the new Sell's old 12-month default - auction houses sell a given model far less often than online
  platforms, so 12 months regularly starved the comparison (your own `placesFor` already widens to 36mo
  whenever its 12mo pool reads under 3 sales - this just makes 36 the standard instead of a fallback).
  Widens the new Sell's house record; zero change to live /sell's already-shipped behavior.
  **Live /sell is wired but OFF**: `api/sellerDecision.js` calls the same `pickPlatform` behind
  `SELL_PICK_SHARED` (env var, unset/off by default) - when Sam turns it on, the ONLINE/routable pick on
  live /sell starts coming from this file too (recommendedPath + card order both move together, same
  pattern as the existing `applyThinWindowPriceOverride`). The house-comparison path elsewhere in that
  handler (thin/class-era/rare-car) is untouched either way.
  **Scoped simplifications from the full old ladder** (full list + why in lib/platformPick.js's own
  header comment): one window (Market Check's 730d/1825d-if-thin), not sellerDecision.js's multi-window/
  multi-scope walk; only the symmetric premium gate, not the asymmetric market-dominance gate, the
  volume-aware sample/margin refinement on Branch 1, the thin-window price-signal override, or the
  curated win-condition table. The three thresholds the task named (10% at 5v5; specialist lift>=3x at
  5+ comps; most sold comps) are unchanged from the real code.
  **Card-count fix (item 5)**: `js/result-v2.js` `v2MatchedWhy`'s "too thin to match" fallback used to
  show `matchedPremium.platformSales` (its OWN 24-month mileage-banded count) while the pick that put the
  card there had used `marketEvidence.evidenceSales` (the landed rung's count, often a different window) -
  a card could say "sold 2" under a pick that counted 6. Now prefers `evidenceSales` when present and
  drops the "in the past N months" qualifier in that case (the real window isn't plumbed into this
  function; an omitted window beats a wrong one). `js.20261009a` bumped to `js.20261009b` (index.html +
  vercel.json rewrite) since this touches the /sell bundle.
- 2026-10-08 (Lane B, follow-up): `lib/platformPick.js` after a 40-car audit (Sam's request) comparing
  it against the live old ladder, flag off throughout. Three real gates were MISSING and got ported
  (same thresholds as the real code, see the file's header): an exact-year rung tried before the
  generation-bound pool (a named trim + multi-year generation only); the asymmetric market-dominance
  gate (75%+ share, 10+ combined sample); and the volume-aware sample/margin check on the premium
  branch (a non-depth-leader's premium only leads if its sample is comparable to the leader's, or
  beats the leader's own premium by 8+ points). Also added (separate asks): a third ALL-TIME widen
  step only when the pool is genuinely empty at 730/1825 days, marked `thin:true` + top-level
  `evidenceSales`, never to fake a number past true zero; a literal-model-year scope when there is no
  named trim and no curated generation (was pooling +/-2 years); and `SELL_PICK_SHARED`'s override now
  also handles the shared function's house-mode pick (sets recommendedPath + a new
  `decision.houseComparison`, no frontend renderer yet for that path - flagged, not built). Two
  disagreement classes remain UNRESOLVED, neither a dropped ladder gate: (1) the old ladder's live,
  metered OldCarsData fetch lands on a 1-2-sale total for a few common queries (1995 Mazda Miata, 2016
  Mustang GT350, 1993 Supra Turbo, 2008 Audi RS4) while the archive clearly has far more - looks like a
  live-fetch/model-alias limitation in sellerDecision.js's own fetch strategy, not something
  platformPick.js's ladder can fix; (2) 1969 Camaro Z/28 and 1990 Corvette ZR-1 read almost empty in
  the shared pool despite real matching Bring a Trailer sales confirmed in the archive by title scan -
  cause not yet isolated (title slash-variant and generation/year-window are both still suspects).
  SELL_PICK_SHARED is still off. No change needed in your files for this follow-up.
- 2026-10-08 (Lane B, correction): retracting last entry's claim that live /sell has no house-render
  path for a well-evidenced car (the 300SL case). It does - api/sellerDecision.js's existing "DENSE-
  CAR HOUSE COMPARISON" block (search that string, right after the thin/class-era checks) already
  builds decision.houseComparison from houseReceiptsForVehicle for ANY car when
  car.sellerPreference==="auction_house", and js/result.js's renderHouseComparisonSell already draws
  it. Confirmed by driving the real /sell page for the 300SL + auction-house + ASAP: it renders the
  full ranked house list, leads with the soonest sale (Gooding Christie's), same pick
  lib/platformPick.js's house branch computes. My earlier "no renderer" claim came from an
  incomplete test harness (a diagnostic that replays decide() alone, not the full handler) - not a
  real product gap. SELL_PICK_SHARED stays scoped to the online pick only regardless (an explicit
  house choice is left on this existing, already-working path, untouched), but there is no
  outstanding house-renderer job to schedule.
- 2026-10-08 (Lane B -> Lane C): Buy/Market Check range-label parity (Sam's request). Not edited -
  `lib/live/search.js` and `api/buy.js` are both mid-edit on main right now, so this is a spec, not a
  diff. Problem: `coreOf` (`lib/live/search.js` ~line 419-420) already prefixes `m.family` with
  "manual "/"automatic " when a gearbox refine was requested AND the engine confirms `d.refined` - but
  `walkLadder` (~line 487-494) then STRIPS that prefix back to `core.familyBare` whenever the model
  doesn't have a genuine 5+/5+ manual-vs-automatic split in its unfiltered sales ("a 997 Carrera S
  keeps it, a Cayenne never does" - a deliberate, good readability call, not a bug). The gap: that
  strip fires on the SAME condition that makes the refinement matter MOST - a rare-gearbox variant
  (man<5 or aut<5) is exactly the case where the shown range is scoped to a thin, possibly very
  different, subset of the pool, and that's precisely when the label goes silent and reads as if it
  were the whole model's range. Market Check (`lib/onebox.js`, no refine) shows the full, unscoped
  pool for the same car on its own page with no such caption. Two different numbers, same car name,
  no sentence explaining why - Sam's exact complaint.
  Proposed fix (does not touch the existing split-heuristic above - that one is about whether the word
  belongs INSIDE the family noun for readability, and should stay): add a second, UNCONDITIONAL
  signal that fires whenever the WINNING core actually came from the gearbox-refined "exact" ladder
  step, regardless of the 5+/5+ split -
    1. `lib/live/search.js`, inside `coreOf` (right after line 420's `m.family =` line): add
       `m.refinedNote = refine ? (refine.tx === "manual" ? "manual cars" : (refine.label ? String(refine.label).toLowerCase() + " cars" : "automatic cars")) : null;`
       This must NOT be touched by `walkLadder`'s later strip (~line 494) - that line only ever
       reassigns `core.family`, so `refinedNote` survives it untouched by construction; just make sure
       it's being read off `core` (not `m`) wherever `core` gets serialised to the client payload
       (same spot `core.family`/`core.short` are already picked up, ~line 539's `m = { ... family:
       core.family, short: ... }` object literal - add `refinedNote: core.refinedNote` there too).
    2. `api/buy.js`, in the CLIENT string, right after the `"mcr"` paragraph that prints the range
       (~line 442: `'<p class="mcr">' + esc("Most " + m.family + " sold for " + ...)`): when
       `m.refinedNote` is present, append a second short line, e.g.
       `if (m.refinedNote) out.push('<p class="mcr-note">' + esc("Reflects " + m.refinedNote + " only.") + "</p>");`
       - e.g. "Reflects manual cars only." Plain, factual, no valuation language, consistent with
       product rule 21's template rules (states which sales are being read, not a different/better
       number) - this is a disclosure caption, not a refinement CTA, so no chip/button, just text.
  Wording is a suggestion, not a mandate - Lane C owns the actual copy and placement inside the card.
  The one hard requirement from Sam's ask: whenever the shown range came from a gearbox-narrowed pool,
  the card says so in plain words, so it never silently reads as the whole model's range next to
  Market Check's unscoped number for the same car. Not started pending Lane C's own edit window on
  these two files; happy to implement it myself once they're free if Lane C would rather hand it back.

## Lane C, Oct 8 2026: shared feature cards (lib/featureCards.js), for Lane A's "What you get."
- Buy's "More than a list of cars." now renders through `featureCardsHtml(items, { headingTag })` +
  `FEATURE_CARDS_CSS` (lib/featureCards.js): white rounded card with a soft shadow, 40px dark-green icon in a
  64px pale-green circle, serif title, sans body one shade darker than --sec; 4 across, 2x2 under 980px,
  one column under 560px. The new Sell landing uses the same module.
- When Lane A was checked (commit 0359ac7) Market Check's `.mc-feats/.mc-feat` were still the flat bordered
  columns, so there was nothing shared to reuse. To give "What you get." the same treatment with no
  duplicated CSS: map `feats` to `[{ icon, title, body }]`, render `featureCardsHtml(items)` in place of
  `<div class="mc-feats">`, and include `FEATURE_CARDS_CSS` once. Spacing uses padding, not heading
  margins, so a page-level h2/h3 reset cannot collapse it. Lane C will not edit lib/live/marketCheckLanding.js.
- 2026-10-08 (Lane C -> Lane B): range-label parity spec (225b466) DONE in aade25d. `coreOf` sets
  `m.refinedNote` ("manual cars", "PDK cars", ...) only when the engine confirms `d.refined`, so it survives
  walkLadder's family-noun strip; listingMarket passes it to the client. Buy's card caption reads "What manual
  cars of this spec have sold for, last 12 months" and the Market Check panel adds "Reflects manual cars only."
  A read that fell back to any_gearbox carries no note (its range is the whole pool). Verified on fresh cores
  through the ladder probe (bf80d40): 2010 997 Carrera S family "997 Carrera S coupes" + note "manual cars".
  Cores cached before aade25d show no caption until they refresh (6h memory, nightly table rebuild).
- 2026-10-08 (Lane C): new Sell landing (02251ba, 0511f16, 7c08ab2) lives in lib/sell/sellLanding.js +
  lib/sell/sellExample.js, served by api/sellNext.js behind SELL_NEXT_ON. lib/heroImage.js NOT touched (the
  default layout fits). The specialist band photo is `img/sell/specialist.jpg`, shown only once that file exists.
- 2026-10-08 (Lane C): RESULT ADDRESSES for Buy and the new Sell.
  - Buy: each search turn pushState's `/buy?q=<the buyer's words>&make=..&model=..&gen=..&trim=..&body=..
    &gearbox=..&colour=..&from=..&to=..&miles=..&budget=..&near=..&within=..&beyond=..&abroad=1&above=1&all=1
    &house=..&sort=..` (only the filters set). Back truncates the conversation to that turn, then the landing.
    Reload / a pasted link reruns the SAME search from the filters (api/buySearch.js action "rerun" ->
    lib/live/samChat.js runFilters -> the search_live tool code, no model call). A words-only `?q=` (Market
    Check's live panel link) still goes through the chat, then the address is completed in place.
  - LOCATION IN A LINK: `near` is the 5-digit ZIP the buyer typed (a ZIP area) or the town the engine
    resolved (meta.place), never a street address or coordinates. Emails are stripped from every address.
  - Sell: `/sell?car=<named car>&state=..&how=..&rush=..` (+ the probe key on a preview). vercel.json routes
    /sell?car= to api/sellNext.js; with SELL_NEXT_ON off and no key it serves the LIVE /sell (noindex header).
    The state is the only place named.
  - Every result address is noindex with the landing as canonical; /buy and /sell themselves are unchanged.
  - LANE A: Sell's history lives in lib/sell/sellMcClient.js, NOT js/onebox.js. If Market Check's address
    work adds pushState/popstate to js/onebox.js, skip it when `window.GAS_SELL` is set (the Sell page runs
    the same file), or the two will push competing entries.
- 2026-10-08 (Lane C -> Lane A): BUY SIGN IN (item E) was already built and pushed (791b6ce) before Sam's
  "Lane A owns the shared top-bar sign in" note, so Lane C stops here; A replaces or reuses it. What exists, all
  in api/buy.js: `<div class="buytop"><div id="signin-area"></div></div>` fixed top right on wide screens
  (js/auth.js authRenderTopbar fills #signin-area: "Sign in", or email + Sign out); on phones a copy slot
  `#signin-area-m` inside the mhead (`.mtop`, after the Sell link) mirrored from #signin-area by a
  MutationObserver in the CLIENT; CSS `.buytop`, `.mtop`, `#signin-area,#signin-area-m` in BUY_CSS. To swap in
  the shared bar: remove the `.buytop` div, the `.mtop` span `#signin-area-m` and the mirror IIFE (search
  "signin-area-m"); keep `.mnew` (Buy's phone New search) in the phone top bar.
- 2026-10-08 (Lane B, standing note, ALL LANES): canonical_sales is NOT a live source. Nothing public
  reads it and it is not rebuilt nightly (scripts/buildCanonical.js only runs via a workflow_dispatch-only
  GitHub Action, last run ~Sep 22-23; every source is uniformly stale, confirmed not a per-source bug).
  Do not wire anything new to it. Live pages read sales_archive and auction_attempts. Decision: no
  schedule added, no rebuild run, no reader changed - reported to Sam with options, his call.
- 2026-10-08 (Lane B, FOR SAM, flip steps): turning SELL_PICK_SHARED on tomorrow.
  FLIP: in Vercel, Project Settings -> Environment Variables -> Production, set `SELL_PICK_SHARED`
  to the string `1` (not `true`, not `yes` - the code checks `=== "1"`). Save, then REDEPLOY - an
  env var change alone does not apply to the already-built serverless functions; use `npm run
  deploy` or redeploy the current commit from the Vercel dashboard. Confirm it took by checking any
  live `/sell` result for the new behaviour (a car's by-venue breakdown counts will differ from the
  capped-fetch numbers you are used to seeing, since the whole analysis now comes from the shared
  archive pool, not fetchRecentRecords - this is the intended change, not a bug).
  WATCH, first hour, in app_usage_events (event_type=eq.seller_decision, created_at after the flip):
    - `status` should stay `decision_ready` on every row. Any other status is a crash the code did
      not expect (buildSharedAnalysis failures are caught and degrade to the honest zero-evidence
      state, which still logs `decision_ready` with `metadata.evidenceBasis = "regional_policy"` -
      that is NOT an error, it means the shared pool genuinely found nothing for that car).
    - `metadata.evidenceBasis` - watch the SHARE of `regional_policy` rows. A few is expected and
      correct (genuinely thin/rare cars - see the three real examples from the audit: 1990
      Lamborghini Countach 25th Anniversary, 1989 Porsche 911 Speedster, 1967 Ferrari 275 GTB/4). A
      sudden majority of rows landing there would mean the shared pool is failing broadly, not that
      cars got rarer.
    - `metadata.pickPlatform` - watch the distribution. A skew toward one platform across many
      different cars (not just Bring a Trailer's usual volume lead) would signal a bug in
      buildSharedAnalysis, not a real market pattern.
    - Vercel's function logs (NOT app_usage_events) for the line "SELL_PICK_SHARED buildSharedAnalysis
      failed" - this is a console.error, not a DB row, so it only shows in the Vercel dashboard's
      Logs tab for api/sellerDecision.js. Any occurrence is non-fatal (the request still returns the
      honest zero-evidence state, never a half-filled page) but should not repeat for the same car.
  ROLLBACK (one line): set `SELL_PICK_SHARED` back to empty (unset) or any value other than `1` in
  Vercel, redeploy. Nothing else to undo - the flag is read fresh on every request, there is no
  cached state, and analyze()/decide() on the capped-fetch path is untouched and byte-identical to
  before this round.
- 2026-10-08 (Lane B, DISCLOSURE for whoever owns it - looks like Lane A): my commit 7ab7e1d ("One
  resolver...") accidentally bundled in 4 files I never touched and did not intend to commit:
  `api/howSamDecides.js` (new), `how-sam-decides.html` (deleted), `lib/appShell.js`, `vercel.json`.
  I ran `git add lib/vehicle.js api/usageDashboard.js` then `git commit` right after - those 4 files
  must have already been staged in the shared index by a concurrent `git add` from another lane at
  that exact moment, and `git commit` with no path args commits the WHOLE index, not just the files
  I'd just added. The content itself checked out fine (node --check on the two JS files, valid JSON
  on vercel.json - looks like a complete how-sam-decides.html -> api/howSamDecides.js migration, not
  a half-written change), so I did not revert or force-push anything - that seemed more likely to
  cause real damage than a bundled-but-complete commit already on origin/main. If this was your WIP:
  it is live on main now under my commit message, not yours - please confirm it landed the way you
  intended. LESSON FOR ALL LANES (adding to the standing push rules): run `git diff --cached --stat`
  right after `git add <your files>` and before `git commit`, every time, to catch exactly this - the
  shared index means another lane's concurrent `git add` can ride along on your commit silently.
- 2026-10-08 (Lane B, FOR SAM, nightly step to paste): the cross-product engine check
  (scripts/crossProductCheck.js, ops task `enginecheck`) is read-only and archive-only (zero OldCarsData
  spend) - safe to run nightly. Per Sam's round ("after the search rules check", continue-on-error true),
  paste this step into .github/workflows/nightly.yml's `ingest` job, directly after the existing
  "Search rules check (public pages)" step (ends at the `continue-on-error: true` line just above "Fail
  the job if the VIN index step failed"). It reuses that job's existing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
  env (already set at the job level, lines 41-42) - no new secret needed. continue-on-error: true, same as
  the search rules check it follows: a cross-product drift is worth seeing every morning, never worth
  reddening the whole nightly job over (that stays a human-assigned fix, not a blocker).

  ```yaml
      - name: Cross-product engine check (Buy/Sell/Market Check/Tasks agree)
        id: crossproductcheck
        continue-on-error: true
        run: node scripts/crossProductCheck.js
  ```

  Exit code: the script exits 1 when any of the 20 built-in specs has a field mismatch (see the
  Oct 2026 report below for the current baseline - 16/20 mismatch, all but one explained and none a
  pool-membership bug). continue-on-error swallows that exit so the job stays green; the step's own
  log (visible in the Actions run) carries the full table either way. No paired "Fail the job if..."
  step was added (same choice as the search rules check it sits after) since this is a nightly trend
  to watch, not a correctness gate yet - add one later if a mismatch pattern is ever promoted to "this
  must never regress."
- 2026-10-08 (Lane C -> Lane A): SHARED TITLE HELPER `lib/carTitle.js` `humanTitle(title)`. Shouting words read
  in proper case ("SPORT" -> "Sport"), badges stay as the maker writes them (xDrive35i, GT3 RS, Z06, SS, GTS,
  M3, AMG, E46, 911S, 4S, 328i), words already in mixed or lower case are left alone. Buy applies it to card
  names (api/buySearch.js nameOf). NOT wired into Market Check or Tasks this round (Sam): import it where those
  render a sale or listing title when convenient, so the three products name a car the same way.
- 2026-10-08 (Lane A -> Lane C): Round D, the shared app shell. Built `lib/appShell.js` - one function,
  `railOpenHtml({active, pageExtra, logoHref})`, that renders the scrim + left rail + mobile header
  (logo, hamburger) for any page, plus `SHELL_CSS` (the rail/main/mobile CSS, one copy) and `SHELL_JS`
  (`gasToggleRail`). Wired it onto Market Check, the new Sell (both via onebox.html, which now carries a
  `<!--SHELL_RAIL-->` placeholder each server splices its own `railOpenHtml()` into - api/marketCheck.js,
  api/sellNext.js, api/publicConfig.js's /o/:id share route), Tasks (api/tasksPage.js, both /tasks and
  /tasks/mine) and the homepage (index.html via api/sellPage.js - see below, lighter touch there).
  SURFACES (Sam's spec): the rail is `--rail-bg:#EDF3EE` (the same pale-sage token Market Check's
  .mk/.widen pills and your `.mcdrawer` already use for "search and context boxes" - var(--tint) there),
  the main area is `--main-bg:#F6F3EC` (the existing cream), defined once in `SHELL_TOKENS_CSS`. PAGE
  LIST: one shared array (`SHELL_PAGES` in lib/appShell.js) - Buy, Sell, Market Check, Tasks, For
  business, current page marked `active`. LOCKDOWN LIFTED (confirmed with Sam this round): the "public
  nav lockdown, Oct 7" commits (45d7548 on api/_chrome.js, the matching one on api/sellPage.js) that
  stripped everything but "Where to sell" for signed-out visitors are SUPERSEDED - every page now shows
  the full list to everyone, signed out included. api/_chrome.js's own `railHtml()`/`isCrewRequest`
  export is UNCHANGED and still used by History/VIN/Spec pages (out of this round's named list) - if you
  want those on the shared shell too, same `railOpenHtml()` call, not a new file.
  BUY: NOT wired by me - your js files, per Sam's "do not edit Buy's js". To adopt: swap api/buy.js's own
  `.rail{background:var(--page)}` + rail markup for `railOpenHtml({active:"buy", pageExtra: <your Your
  searches HTML>})`, add `${SHELL_CSS}` to your `<style>` block and `${SHELL_JS}` as a script tag, and
  close the `<div id="gas-main">` `railOpenHtml()` opens (`SHELL_MAIN_CLOSE`, just `</div>`) after your
  own `</main>`. Your "Your searches" remove/Clear all/Saved searches JS (`.srow`/`.srm`/`.sclear`/
  `.vlist` etc) is untouched by this - pass that markup as `pageExtra` exactly as it renders today and it
  keeps working unchanged; only the outer rail/main wrapper ids change (`#rail`/`.rail` -> `#gas-rail`/
  `#gas-main`). Whenever convenient, not urgent.
  HOMEPAGE (index.html, LIGHTER TOUCH, deliberately not a full rewrite - this page runs the live /sell
  wizard, `toggleRail()`/`setActiveNav()`/`toggleSavedSubmenu()`/the settings gear are all wired to its
  own `#rail`/`.hp-navitem` ids): did NOT replace its DOM with `railOpenHtml()` - too much live wizard
  behaviour hangs off the existing ids to risk it this round. Instead: restyled the EXISTING `#rail`/
  `#main` to the same two shared tokens (styles.css, `var(--rail-bg,#EDF3EE)` / `var(--main-bg,#F6F3EC)`,
  injected via `SHELL_TOKENS_CSS` in api/sellPage.js), and ADDED Market Check / Tasks / For business as
  new `.hp-navitem` links alongside the existing Buy/PowerSellers/How Sam decides (additive, nothing
  removed - flagging PowerSellers stayed rather than being swapped for the exact shared list, in case
  it's still a page you want reachable from here). Also removed `api/sellPage.js`'s `stripPublicNav()` /
  `CREW_ONLY_HREFS` (the Oct 7 lockdown mechanism for this page) per the same "lift the lockdown"
  decision above.
  REMOVED AS DEAD CODE: js/onebox.js's old `obAvatarInit()` (the corner-avatar-initials control) - it
  read `#ob-account`, which no longer exists now that the shared sign-in bar (item 9) is the one account
  control; it was already superseded, this just deletes the now-pointless DOM read.
  NOTE (not touched, not mine): found several of your files uncommitted in the working tree mid-session
  (lib/live/converse.js, lib/live/samChat.js, lib/platformPick.js, lib/live/buyAlerts.js, lib/live/
  narrow.js, api/buySearch.js, plus a vercel.json cron line for buySearch?alerts=run) - left every one of
  them exactly as they were, staged and committed only my own files line by line (vercel.json especially,
  since my one rewrite-rule line and your cron line were sitting in the same unstaged diff). Flagging in
  case that's more in-progress work than you meant to leave sitting uncommitted.
- 2026-10-09 (Lane C): BUY NARROWING, SORT, BEFORE IT ENDS (0a27b0e, 6d3f6b8, 65731b9).
  - The narrowing question: lib/live/narrow.js `askFor` (more than 12 cars; era, body, budget from the live
    bids, gearbox, mileage; counted over the header's own set with the search's own filter tests). ERA
    BUCKETS ARE THE ENGINE'S: `engineGenerations` reads One Box's own generation_choice answer for the bare
    model (lib/onebox.js runOneBox, the same options Market Check offers). No second generation table.
    A year two generations both claim (1989, 2012 for the 911) is "doesn't say"; the era button counts it in
    a "Show them too" line. New search filters (lib/live/samChat.js FILTER_FIELDS, address params): era,
    bid_min/bid_max (current bid), miles_min, has (a whole word in the listing title), soft (cheap, low miles,
    fast, rare, nice, best), sort (ending_soon default, newest, lowest_bid, highest_bid, nearest, lowest_miles).
    Tasks' runSearch gets the same filters (unused by Tasks today); a make-less runSearch with opts.rows now
    searches those rows (it returned nothing before).
  - Before it ends: lib/live/buyAlerts.js + buy_alerts (docs/supabase-buy-alerts.sql, applied by Sam Oct 9).
    Cron /api/buySearch?alerts=run every 15 minutes (vercel.json). Sends through lib/_email.js sendTaskEmail
    with its own signed stop link (confirm page on GET, one-click POST). Never a Task, never the Tasks slot.
  - LANE A: Round D's `.gas-signbar-m{position:fixed}` (lib/authBar.js) covered Buy's "Your searches" on a
    phone. Buy already places that bar inside its own top bar, so BUY_CSS sets `.mhead .gas-signbar-m{position:
    static}` (and hides the account email there, Sign out stays). No change to lib/authBar.js.
    UPDATE Oct 9: Lane A fixed it at the source (fcc17b2), so the position:static override is removed. Kept in
    BUY_CSS: the phone row-fit rules (account email hidden, "Your searches" on one line, .mright may shrink).
    Without them, signed in at 390 the email + Sign out (279px) pushed the page to 500px wide.
  - FOR SAM (sign in): a first-time email sign in gets Supabase's "Confirm your signup" LINK, not a code (the
    sign in card says "Email me a code"; seen Oct 9 with a fresh test inbox). The Supabase "Confirm signup"
    email template likely needs {{ .Token }} like the one returning users get, or new users can't finish
    with a code (clicking the link does still sign them in).
- 2026-10-09 (Lane B, two findings from this round's crossProductCheck run, neither caused by this
  round's lib/onebox.js engine additions - reported, not fixed, since both trace to other files):
  1. CACHE STALENESS (Lane C, lib/live/search.js specOf/spec_market_cache): "2012 BMW M3 Competition
     Coupe" showed Buy/Tasks stuck at count=8/latest=2026-09-11 while Market Check/Sell (both read
     runOneBox live, no cache) showed count=37/latest=2026-10-06 - confirmed STABLE across repeat
     calls (not a flaky bug), consistent with a spec_market_cache row written before this session's
     mid-run ingest and still inside its TTL. Expected caching behavior, not a regression; flagging
     only because it is the kind of thing that can look alarming in a crossProductCheck diff.
  2. GENERATION-BINDING GAP (bare year-less/trim-less, multi-generation nameplate): "1989 Porsche 911
     Speedster" now shows Sell (fetchOnlinePool, since the one-engine-ladder fix) landing on a
     narrow, high-value pool (count=19, $203k-$235k - a specific rare Speedster generation) while
     Buy/Tasks pool EVERY 911 Speedster generation together (count=100, $68k-$101k). Both are real,
     live reads; they differ because Sell passes the SAME `generation` object Market Check resolves
     (year-pinned to one generation) into runOneBox, while Buy/Tasks' own resolveForBuy/
     listingGeneration path does not bind the same way for this bare query and pools broader. This
     is the SAME underlying gap already named in CLAUDE.md's resolver backlog (Market Check's
     generation_choice gate vs Buy/Tasks having none) - not new, but now visible on Sell too since
     Sell reads the real ladder. Not fixed this round (out of scope - resolver/generation-binding
     work, not an engine addition); worth a dedicated round if Sam wants it closed.
- 2026-10-09 (Lane B, Market Check engine additions, lib/onebox.js, commit bd10226 + 5f4b283):
  soldCount/windowLabel, quarterlyBands, yoyDirection, setAsideCount/setAsideReasons/
  didNotSellCount, placingFor (exported), soldBefore per card - all additive fields on runOneBox's
  own return, so Buy's panel, Sell and the landing example inherit them automatically through the
  same call; no frontend wiring done this round (that is presentation work, a separate round).
  PERFORMANCE NOTE for whoever wires these into a page next: didNotSellCount and soldBefore each
  add one extra query, run in parallel (Promise.all), attached once after the result settles - the
  crossProductCheck 20-spec run went from ~90s to ~180-185s (it calls runOneBox 3-4x per spec across
  the four lanes), but a single real page load only pays for ONE runOneBox call, so the per-request
  cost is much smaller; no latency budget was formally re-measured against the One Box latency gate
  (see [[onebox-latency-gate]] memory) - worth a real p50/p95 check before/after if this becomes a
  concern. Known, documented scope limits (not silently claimed complete): "project" in
  setAsideReasons reads zero on most pools (a project/incomplete car is dropped at the fetch's own
  qualifyReason gate before it ever reaches this pool); a true replica caught specifically by
  rule5PoolGuard's own replica bucket (covered models only) is not retrieved either; didNotSellCount
  cannot be trim-scoped (auction_attempts carries no title); soldBefore only attaches to the main
  `cards` array, not the separately-shaped `recent3`.
- 2026-10-09 (Lane B, follow-up round, commits c59e5c4, acc1eef, bafd0e9, 91489a2 + this entry):
  closed both findings from the previous round's disclosure, plus the drawer vs card split Lane C
  found. All four turned out to be TWO root causes, not four:
  1. SPEC_MARKET_CACHE NEVER RE-VISITED (items 1 and 2). scripts/buildSpecMarketCache.js's nightly
     sweep only re-queues a spec_key when a CURRENTLY LIVE listing still resolves to it - once the
     listing that first created a cache row sells or expires, nothing ever looks at that row again,
     so it can go stale indefinitely even while fresh matching sales keep landing in sales_archive.
     Confirmed live on "2012 BMW M3 Competition Coupe": the cached row had widened to "any_body"
     (coupes AND sedans, 8 sales through Sep 11) because the coupe-only pool was too thin when it
     was computed; a fresh read the same day found 37 coupe-only sales through Oct 6, wide enough on
     its own. The 1988 Porsche 911 Carrera Targa drawer-vs-card split Lane C found is the SAME
     mechanism (confirmed via the new drawervscard ops task). FIX: scripts/ingest.js now deletes
     every spec_market_cache row whose own make + (model OR generation code) matches a make/model
     that run's upsert actually touched, right after the upsert completes - the next Buy/Tasks read
     is then a clean cache miss, which the EXISTING specCore/refreshSpec path already recomputes
     live and writes back fresh (that read-time logic is untouched). New lib/_supabase.js
     supabaseDelete() helper (same pattern as supabasePatch). New api/usageDashboard.js
     task=specinvalidate (?make=&model=) for clearing a spec stuck stale right now by hand, used to
     clear the already-stale BMW M3 and Porsche 911 entries live today. This also resolves item 1:
     the drawer (a fresh /api/sellerDecision{oneBox:true} call) and the card (spec_market_cache) both
     already call the SAME engine (runOneBox) through the SAME resolver for a given car - verified
     via the new resolvediff ops task, which found the card/drawer RESOLUTION paths identical for
     every spec checked - so once the cache is kept current they can no longer disagree. No separate
     code change was needed to force them onto "one function" because they already were; the cache
     was the only thing standing between them.
  2. RESOLVEFORBUY VS RESOLVEVEHICLE ON "SPEEDSTER" (item 3). Confirmed via resolvediff:
     resolveVehicle (Market Check/Sell) resolved "1989 Porsche 911 Speedster" to trim="Speedster"
     from curated data; lib/live/search.js resolveForBuy's generic "a body word the resolver filed
     as the trim is a body, not a trim" correction (added to fix a real "Targa Targas" doubling bug)
     then rewrote that to bodyStyle="speedster", trim=null - pooling every 911 (count 100) instead of
     the real Speedster trim. FIX: excluded "speedster" from that correction's word list only; Targa
     and the rest are unchanged (they are pure body descriptors with no price tier of their own;
     Speedster is a genuinely rare, distinct, much pricier factory trim on several classics). No
     public URL changed.
  Item 4: yoyDirection's sentence now names the actual rolling windows ("the past 12 months" / "the
  12 months before that") instead of "this year" / "the year before", which read as calendar years.
  Whole-percent figure, no dashes, no median, no valuation words - unchanged otherwise.
  CHECK TABLE: before this round, scripts/crossProductCheck.js (20 specs) showed 2 mismatches (the
  BMW M3 and Speedster cases above, carried over from the previous round's disclosure). After every
  fix and after invalidating the two already-stale cache entries: 20/20 MATCH, zero mismatches.
  DRAWER VS CARD (11 specs, api/usageDashboard.js task=drawervscard): the Targa, the BMW M3
  Competition Coupe/Competition, the Speedster, and "2008 Porsche 911 Carrera" (caught by the same
  blanket Porsche 911 cache invalidation) all read as a clean cache MISS right after the fix landed
  (the expected, correct state post-invalidation - a brief "pending" that self-heals on the next real
  read, never a wrong value); the other 7 of the 11 (Mustang Fastback, Corvette ZR-1, Camaro Z28,
  GT350, Boxster S, NSX, Ford GT), whose cache happened to already be current, matched the drawer
  exactly even before any fix - direct evidence the two paths were never structurally different, only
  ever as current as their cache.
- 2026-10-09 (Lane A -> Lane C): rail nav-item pill polish (Sam's round). Active rail item is now a
  filled pill (`--rail-active-bg:#D7E6DA`, 10px radius, label in the page's own dark green + 600
  weight) instead of the old thin green left border; inactive text darkened one step
  (`--rail-text:#46524B`); hover/focus-visible get a lighter pill (`--rail-hover-bg:#E3EFE6`). All
  three tokens are in `lib/appShell.js` `SHELL_TOKENS_CSS`, so they're already on every page that
  injects it (Market Check, Sell/homepage, Tasks, How Sam decides). Applied to `.gas-navitem`
  (appShell.js) and, as a companion change, `styles.css` `.hp-navitem` (Sell's own rail system,
  which doesn't consume `.gas-navitem` at all - it was still using the old cream `--paper-shade` for
  its hover/active pill even though its rail background has been sage since the Round D surface pass).
  BUY NOT TOUCHED (not mine - `api/buy.js`'s own `.rail a.n` / `.n.on` CSS, a third, separate rail
  system from both of the above). To match: swap whatever colour `.rail a.n:hover` / `.rail a.n.on`
  currently use for `var(--rail-hover-bg,#E3EFE6)` / `var(--rail-active-bg,#D7E6DA)` respectively,
  set the active label colour to Buy's own dark green token (keep it, don't adopt Market Check's
  `#1E4D38` - same pattern as Sell above, every page keeps its own green), make active/hover weight
  600, and make sure inactive/active share identical padding and min-height (the point of the change
  is nothing shifts when the current page changes - check this specifically, it was the actual bug
  in the old border-left version before this round). `--rail-active-bg`/`--rail-hover-bg` are on
  Buy's page already if it loads `lib/authBar.js`'s CSS (it does, per the mobile sign-in fix) - but
  NOT `SHELL_TOKENS_CSS` unless Buy separately imports it; cheapest path is probably just hardcoding
  the two hex values in Buy's own CSS rather than wiring a new import for two colours.
- 2026-10-09 (Lane C): BUY IS ON THE SHARED SHELL (lib/appShell.js), per Lane A's Round D handoff above.
  api/buy.js renders `railOpenHtml({active:"buy", logoHref:"/buy", pageExtra})`, `SHELL_CSS` before BUY_CSS,
  `SHELL_JS`, and closes `#gas-main` (`SHELL_MAIN_CLOSE`) after its own `</main>`. Buy's own rail, phone
  header and their CSS (`nav.rail`, `.mhead`, `.rdiv`, `.n.how`) are gone; nothing in Buy's client hung off
  them. pageExtra is Buy's "Your searches" block exactly as before (`.rh` + `#searches` + `#newsearch`), so
  the client still fills it unchanged: this visit's searches with remove and Clear all, Saved searches when
  signed in, Before it ends. Search rows use the rail pill tokens (--rail-text/--rail-hover-bg/
  --rail-active-bg, hex fallbacks), same padding active or not. The page paper is the shell's --main-bg
  (Buy's --page now points at it). PHONE HEADER ROW: Buy inserts its "Your searches" pill before the shared
  menu button (server side, falls back to the end of .gas-mhead if the button markup ever changes); the
  shell's gasDockSignin docks the sign in last. Signed in at 390 the account email is hidden in that row
  (Sign out stays) so logo + pill + menu + Sign out fit (16..378px). Lane A's rail nav pill note above is
  covered by this (Buy now uses .gas-navitem). Unchanged: every URL, title, H1, canonical, robots, lead,
  cache headers. NOTE FOR LANE A: if `.gas-mhead` gains another control, Buy's phone row is full at 390.
- 2026-10-09 (Lane A): rebuilt /business (api/business.js) inside the shared shell per Sam's spec -
  "For business" active in the rail, same rail/sign-in/tokens as Market Check/Sell/Buy/Tasks. Replaces
  the old static business.html (own token system, no rail, no sign-in) - deleted, nothing else
  referenced it. URL/title/canonical kept byte-identical. The example panel reuses
  lib/live/marketCheckExample.js UNCHANGED (same spec_key, same cache Market Check's own landing
  reads) - zero new engine calls, so if Market Check's example is warm, this page's is too, and if
  the engine returns nothing for that car the panel is left out entirely (never a shown-but-empty
  state). Hero uses lib/heroImage.js heroHtml(..., {layout:"banner"}), the same call Market Check's
  landing makes. Thanks to Lane C's Buy `.gas-navitem` adoption noted above, Buy already gets this
  page's rail-pill styling too with no extra work.
- 2026-10-09 (Lane B, DISCLOSURE for whoever owns it): my commit 5f75a2d ("Item 4: resolveForBuy
  keeps Targa/Roadster/Spider...") accidentally bundled in 3 files I never touched and did not
  intend to commit: `api/business.js` (new), `business.html` (deleted), `vercel.json`. Same cause as
  the 7ab7e1d incident noted earlier in this file: another lane's concurrent `git add` landed in the
  shared index between my own `git add lib/live/search.js` and `git commit`, and a plain `git commit`
  with no path args commits the WHOLE index. I ran `git diff --cached --stat` right before
  committing and it SHOWED all 4 files - I misread it as "my change plus nothing" instead of
  stopping to ask whose the extra 3 were. node --check on business.js and a JSON parse on
  vercel.json both pass, and it reads as a complete business.html -> api/business.js migration, not
  a half-written change, so I did not revert or force-push - that seemed likelier to cause real
  damage than a bundled-but-complete commit already on origin/main. If this was your WIP: it is live
  on main now under my commit message, not yours - please confirm it landed the way you intended.
  CORRECTION TO MY OWN EARLIER LESSON: "run git diff --cached --stat before committing" is not
  enough by itself - I ran it this time and still missed it. The actual fix is to READ every line of
  that output before typing the commit command, every time, especially when it names a file you do
  not recognize as your own edit.
- 2026-10-09 (Lane A): Market Check landing headline change (Sam's round). H1 "What do cars like
  yours sell for?" / sub "Real sales, matched to your car, with the range most landed in and the
  cars behind it." - replaces "What's your car going for? / Not what it should sell for..." in all
  THREE places it had to change together (they were already out of lockstep before this round, worth
  knowing for next time): api/marketCheck.js's `H1` constant (fed into the sr-only hidden `<h1>` for
  crawlers, which had drifted to "What could mine bring?" - a different string from the visible
  headline even before this change), lib/live/marketCheckLanding.js's `.mc-display`/`.mc-sub` (the
  server-rendered landing), and js/onebox.js's `renderEmpty()` `<h1 class="ob-head">`/`.ob-sub` (the
  client-only empty-state fallback reached via "Change" - same copy, kept in lockstep per its own
  header comment). Search placeholder/button/chips/VIN line untouched, confirmed via live DOM read.
  Page title/canonical/URL untouched (Sam's own instruction - the rules check did not ask for a title
  change). grep confirmed no other "going for" / "should sell for" anywhere in the codebase.
- 2026-10-09 (Lane C): BUY LANDING "PUT SAM ON IT" PANEL, Sam's complete spec (replaces every earlier
  instruction for it). lib/live/buyLanding.js: new eyebrow/headline/two-line sub, step labels "You give Sam
  the task" / "Sam keeps working" / "A match appears" + small "An example"; nothing clickable anywhere in
  the panel (the match card's "See the car" link is gone); the "Before any auction ends..." line is removed
  from the panel (the drawer's before-it-ends switch is untouched). lib/live/buyExample.js TASK_CANDIDATES
  a to d, tried in order through the same runSearch as the chat and Tasks; the first with at least one
  CONFIRMED live car (every filter stated in the listing, not set aside, end_time in the future) is the
  example and that car (the one ending last) is the match card, with its own miles, gearbox and, only when
  the listing carried one, its bid. None: step 1 shows candidate a's sentence and the match card is left
  out. The page also drops the match card at render time once its auction has ended. Built with the rest of
  Buy's example (hourly on page render, cached in spec_market_cache, key bumped to v9); Buy has no separate
  nightly example step (Market Check and Sell do). Probe: POST /api/buySearch {action:"landing",key,fresh}
  returns task.candidate / task.count and every candidate's counts in tried[].
- 2026-10-09 (Lane C): BUY SAVED SEARCHES, checked on the shared rail with a real saved search (BMW M3).
  Found and fixed: the server's cleanState (api/buySearch.js) kept only the old wizard fields and DROPPED
  chatState, which is where Buy's search filters live, so every saved Buy search came back as its title
  and reopened at /buy?q=<title> (Sam re-reading the words) instead of its own address. cleanState now
  keeps chatState.filters through cleanChatFilters (plain short values only: numbers, booleans, strings
  up to 120, arrays of up to 10 short strings, at most 40 keys). Searches saved before the fix still open
  by their words. NOTE FOR SAM: there is no "Save this search" control on Buy (removed on purpose in
  0b5215e), so the rail's Saved searches section only shows searches saved through the API (the old link's
  request, or earlier saves). Whether Buy should have a Save control again is a product call, not changed.
- 2026-10-09 (Lane A): desktop sign-in pill fix (Sam's round, reported by Lane C on Buy). Root cause:
  .gas-signbar's background was rgba(246,243,236,.94) - 94% opaque, so scrolled content showed
  through wherever it passed under the fixed pill, reading as a glitch rather than a deliberate
  floating control. Fixed in lib/authBar.js only (the pill option Sam offered, not the header-strip
  option - a strip needs matching top-padding added to EVERY consuming page's own content container,
  which I cannot do for Buy's, not my file): solid background (var(--main-bg,#F6F3EC)), a real
  box-shadow for separation, z-index raised 30->40 (still under the rail's 50 and its mobile scrim's
  45). No markup change, no page-specific padding needed - every page using AUTH_SIGNBAR_CSS (Market
  Check, Sell, Tasks, How Sam decides, business, and Buy via its own import of the same file) gets it
  from this one change. Verified solid (no more rgba) and shadowed on Market Check/Tasks/business/How
  Sam decides at 1440, signed out and signed in (fake session), scrolled past the hero. Could not
  reproduce Buy's specific "Market Check drawer" element locally (the in-chat drawer did not open via
  a scripted click - it may need a live card's own entry point) - the fix itself is structural
  (opaque + shadow + z-index), not drawer-specific, so it should resolve regardless; please confirm
  on the actual drawer on your end and flag me back if it still collides.
- 2026-10-09 (Lane B, second follow-up round, commits df6a4e7 and earlier in this run, ea6fd80):
  items 1 to 6 from Sam's "drawer vs card, structurally" round.
  1/2 DRAWER VS CARD + TIME FRESHNESS: exported coreOf/persistCore/specKeyFor from
  lib/live/search.js; api/sellerDecision.js's oneBox branch (Market Check and the drawer both call
  it) now writes its live answer back to spec_market_cache under the identical key after every
  clean, unrefined result - ordinary traffic now self-heals a popular spec's card cache, on top of
  the ingest-tied invalidation and an explicit DAY_TTL=24h ceiling (Math.min with the existing 6h
  SPEC_TTL, so today's behavior is unchanged, the 1-day contract is just explicit in code now).
  3 RECOMPUTE AT END OF INGEST: scripts/ingest.js now recomputes every spec it just invalidated
  before the run ends (parses the spec_key back into a vehicle, resolves the generation by code,
  calls runOneBox, writes via the same coreOf/persistCore path) - best-effort, never blocks the run.
  4 TRIM-LIST AUDIT: ran trimresolvediff over all 132 (PORSCHE_911_TRIMS x 3 years) + cross-make
  cases; found the Speedster bug class also hit Targa (911 Targa/Targa 4/Targa 4S/Targa 4 GTS),
  Roadster (Corvette/Cobra/E-Type/300SL/Miata) and Spider/Spyder (Ferrari 308 GTS Spider) - excluded
  all from resolveForBuy's body-word-as-trim correction, same pattern as Speedster. 20 of 21 fixed;
  one flagged not fixed (wrong direction): resolveVehicle itself fails "1970 Datsun 240Z Spyder" (not
  a real trim, likely a non-real test case).
  5 CROSSPRODUCTCHECK GROWN to 42 specs (every car named this round + a mixed common/thin/trim-
  sensitive set); continue-on-error stays on.
  6 SELL STATUS: yes, Sell (lib/platformPick.js fetchOnlinePool, since an earlier round) reads the
  same ladder via lib/onebox.js runOneBox using resolveVehicle - never resolveForBuy, so none of this
  round's Buy-side resolver bugs ever touched it. crossProductCheck's Sell lane matched on 41 of 42
  specs this round (the one miss is new finding 7 below, a Buy/Tasks-only gap). The EXISTING
  SELL_PICK_SHADOW log (?task=shadowreport) is STALE - 21 comparisons from Oct 8, 18 agree/3
  disagree, and 2 of those 3 were the since-fixed Speedster bug. Have not re-run a fresh shadow pass
  post-fixes. RECOMMENDATION before flipping SELL_PICK_SHARED: set SELL_PICK_SHADOW=1 for a day to
  get a current comparison rather than trusting the stale log.
  NEW FINDING 7 (not fixed, flagging for a follow-up round): "1988 Porsche 911 Carrera Targa" is the
  one crossProductCheck mismatch at 42 specs (count 54 Market Check/Sell vs 140 Buy/Tasks). Root
  cause is DIFFERENT from findings 1 to 6: resolveVehicle itself resolves "Carrera Targa" (both words
  present) to trim="Carrera" ONLY, bodyStyle=null - "Targa" is dropped entirely, by BOTH resolvers
  equally (confirmed via resolvediff: marketCheckResolve and buyResolve agree, both wrong). Market
  Check still gets the right, Targa-scoped pool anyway because runOneBox's own buildSpec re-scans
  the FULL raw search text for body words independently of v.bodyStyle. Buy/Tasks do not get this
  safety net: lib/live/search.js familyMarket builds its synthetic row's listing_title from
  STRUCTURED VEHICLE FIELDS only ([year,make,model,trim].join(" ")) - since trim lost "Targa", the
  reconstructed title never had it to begin with, and resolveForBuy (run again on that incomplete
  title) correctly, but wrongly, resolves the whole 3.2 Carrera family. Likely affects any compound
  "{curated trim} {body word}" phrasing, not just Targa. Not fixed this round (new, deeper gap than
  the audit above; found while verifying the grown 42-spec check, after this round's other fixes
  were already pushed).
- 2026-10-09 (Lane A, FOR SAM + Lane C): PUBLIC_LAUNCH switch. Until the env var PUBLIC_LAUNCH=1, a
  visitor without the gas_crew=ok cookie sees a reduced rail/footer everywhere - Where to sell,
  PowerSellers, Your results (when the page passes one), Send feedback, Privacy, About - nothing
  naming or linking to Buy, Market Check, Tasks, For business or How Sam decides. Crew always sees
  the full rail; everyone does once PUBLIC_LAUNCH=1. lib/appShell.js: new `isFullAccess(crew)`
  export (single source of truth), `railOpenHtml()` now takes a `crew` param and branches its nav +
  footer on it. api/sellPage.js (Sell's own rail system, not lib/appShell.js) mirrors the same
  isFullAccess check with its own stripHiddenNav() by href, matching the reduced set exactly - "so
  every page agrees" per Sam's instruction. Every railOpenHtml() CALLER updated to pass crew:
  api/marketCheck.js, api/sellNext.js, api/publicConfig.js (the /o/:id share route, previously had
  no crew check at all), api/howSamDecides.js, api/business.js, api/tasksPage.js (both /tasks and
  /tasks/mine). CACHING FIX (load-bearing, read this before touching any of these files again): any
  page whose rail now depends on the cookie MUST vary its Cache-Control by crew (private, no-store
  for crew; public/cacheable only for non-crew) or a shared edge cache slot leaks the wrong rail to
  the next visitor in either direction - api/marketCheck.js and api/publicConfig.js had NO crew-
  aware caching before this round (their rail was previously identical for everyone) and both are
  fixed now; api/sellNext.js's existing probe-key check is now OR'd with crew for the same reason.
  BUY: api/buy.js already calls lib/appShell.js railOpenHtml() directly (not mine to edit) and
  already computes `const crew = isCrewRequest(req);` at its call site (line ~45) - it is NOT yet
  passing crew into the call (line ~52), so until you add `crew` to that object literal, Buy shows
  the REDUCED rail to everyone, crew included (the safe-by-default failure direction, not a leak -
  but worth the one-line fix). AUDIT (part 2 of Sam's ask): grepped index.html, js/homepage.js, js/
  result-copy.js, js/auth.js, lib/authBar.js, lib/sell/sellLanding.js, lib/_email.js and index.html's
  JSON-LD for any mention of or link to Buy/Market Check/Tasks/For business/Sam Desk outside the rail
  itself - all clean (one code-comment-only hit in each of index.html and sellLanding.js, never user-
  visible copy). "Put Sam on it" is real copy but lives entirely inside Buy's own page (lib/live/
  buyLanding.js) - Buy is itself one of the hidden products, so this is not a separate leak, just
  content on an already-gated page. No llms.txt file exists in the repo. WHAT A STRANGER CAN STILL
  DISCOVER (Sam's rule 3, stated plainly): every hidden page stays live and indexable at its own
  address - /buy, /market-check, /tasks, /business, /how-sam-decides are not blocked, not noindexed,
  not removed from any sitemap, and anyone with the direct link (a search result, a shared URL, a
  guess) reaches the real page in full. This switch hides the DISCOVERY surface (nav, footer) only,
  exactly as instructed - it is not a secrecy or access control measure and was never asked to be one.
- 2026-10-09 (Lane C): NEW SELL RESULTS, four fixes (5ba396d + this commit), all on lib/sell/:
  1. Above the cards: the search bar (One Box's own #ob-input, the car as typed or the address's car), one
     line naming the car ("For the 2001 BMW M3, E46 generation.", carLine from buildResult: humanTitle of
     the resolved label + the engine's generation code when the title does not carry it) and "New search"
     (back to the landing). A new car typed in the bar goes through One Box's own resolution (its questions
     if it needs any), then reruns the result in place with the same state/how/rush and a new address.
     The follow-up box is now its own input (#sell-askq). "Your results" in the rail is Sell's own list
     (localStorage gas_sell_recent, each entry its Sell address), drawn after One Box's rail sync.
  2. The pick card's empty right column was the live /sell card's .pcard-meta rows (car + place, Analysis
     scope, Analysis window) that the new Sell never rendered. Restored from the same placesFor read the
     WHY counts come from (cohort_name, window_months), only alongside a counted WHY; no rows and no tiles
     means no right column at all.
  3. The PowerSeller card: sellFlow kept only name/regions/notes from evaluatePartnerReferral's partner
     record and dropped specialties/serviceClaims. lib/sell/sellPartner.js ports the live card's display
     rules (js/result-v2.js renderPowerSellerCardV2 + psv* helpers) and keep both in step: tiles in its
     priority order under its height budget (premium 2, others 1, 4 in all): Track record premium
     (positive only), auctions represented, Specialises in (wheelhouse match or curated identity, never
     the broad makes), Based in + coverage, Preparation, one trust line when no premium; Known online as;
     the intro by match type (wheelhouse, locality with intro_hook, nationwide). Voice: "Sam would trust
     him" (no first person). No tiles = no card.
  FOR LANE B (engine, not worked around on the page): the pick has no per-venue time spread or per-venue
  price range for the picked venue. placesFor/pickPlatform return the venue's sale COUNT in the window
  (place.sales, pl.total, pl.window_months, pl.cohort_name) and the reserve/day reads over the whole pool,
  but nothing like {venue, months:[{month, n}]} or {venue, low, high, n}. If the panel should carry the
  venue's own spread or range, that field needs to come from the shared engine.
- 2026-10-09 (Lane C): BUY "YOUR SEARCHES" IS ONE LIST, on the account when signed in (Sam). Before: it was
  sessionStorage only (gas_buy_visit: one tab, never the account, no sync), with saved searches as a second
  "Saved searches" section. Now, signed in, every search is recorded on the account (api/buySearch
  action "visit": one buy_conversations row per address, state.url, de-duplicated there), and the rail
  shows ONE list: this tab's searches first, then the account's rows (each address searched plus the
  searches saved before, which are named and opened by their filters), de-duplicated by address and label,
  at most 8. Remove and Clear all HIDE rows (state.hidden; actions "hide"/"hideall"; the old "remove" now
  hides too): no buy_conversations row is ever deleted, and a hidden row's watch (Tasks seeds from
  watch=true rows) is untouched. "list" leaves hidden rows out. Signed out: unchanged. No new table, no SQL.
- 2026-10-09 (Lane A): Market Check hero placeholder shortened to "Your car or its VIN" (was "...,
  for example 2008 Porsche 997 Carrera S") in every place it's set: lib/live/marketCheckLanding.js
  (server landing), js/onebox.js renderEmpty() (client empty state, previously slightly different
  wording - "Your car, for example..." - now matches exactly), and the four result-tier
  inboxHtml(lastQuery) call sites (result/refusal/not-tracked/VIN-anchor) - these pass value=lastQuery
  in practice so the placeholder never actually shows, but now has an explicit, consistent fallback
  instead of defaulting to the unrelated rotating PLACEHOLDER_BEATS examples if value were ever empty.
  Button/chips/VIN line unchanged, confirmed via live DOM read.
- DECISION, Oct 9, 2026, Sam: the Market Check landing headline and sub, the Market Check feature
  tile and the Market Check search page empty state may say "cars like yours" because it speaks to
  the visitor's intent. Do not change them to ownership-neutral wording, and do not flag them in
  future checks. Everywhere else product rule 20 (ownership is never assumed) still applies unless
  Sam says otherwise. Mirrored in CLAUDE.md as an exception appended to rule 20.
- 2026-10-09 (Lane C): PARTNER TRACK RECORD (+N%) AUDIT, report only, the computation untouched. Computed by
  api/usageDashboard.js task=premium (nightly.yml, persist=1) into partners.specialties.premium
  {pct, n, source:"data_verified", computedAt}: each partner's SOLD sales in vehicle_market_records (by
  seller_usernames) vs the median of same-model sales on 8 US platforms within +/-183 days, partners
  excluded, year-scoped (mapped generation, else +/-2 years, 5+ comps or the sale is unmatched); premium =
  median of the per-sale % deltas when 10+ match. No cap, floor or default anywhere. Run read-only on Oct 9:
  Howard 14% (n=184 of 517), Ingo 21% (n=138 of 237), Dan 1% (n=49 of 72), Chris -3% (n=34 of 73), Spencer
  20% (n=23 of 36). The cards showed +15% for BOTH Ingo and Spencer, which is not what the computation gives
  today: the stored rows are stale or were written by something else (no read-only ops task shows the stored
  row; the nightly log's "premium=" line or the row itself will say). The only writer is task=premium
  persist (usageDashboard.js), and the stored 15 passes a stamp check (data_verified, n>=10, computedAt
  within 3 days), so a run of this computation wrote it, yet a rerun today gives 21 and 20. Until the
  stored rows and a rerun agree, the NEW SELL shows NO premium tile for any partner
  (lib/sell/sellPartner.js PREMIUM_TILE_ON=false; the stamp checks stay for when it is turned back on);
  live /sell's js/result-v2.js psvPremium is unchanged.
- 2026-10-09 (Lane C): THIN POOLS in the Sell reason (lib/sell/sellFlow.js pickFacts, the one builder every
  Sell surface uses; the brief named sellFacts.js, but the sentence is built here): under 3 sales it never
  says "most": "The one sale in the last 12 months was on X." / "Both sales in the last 12 months were on X."
  / "One of the two sales in the last 12 months was on X." ("at" for a house). The Reserve tile (8+ each
  side) and the chat's sold range (midHalf, 8+) cannot reach fewer than 3. Sell results drawn in a visit are
  kept by address, so Back after New search redraws at once.
- 2026-10-09 (Lane A): /business reworked again, insurer/lender/finance audience, per Sam's round.
  Replaced "Three ways in" with "The problems it solves" (6 pain-first cards) + a slim "How you use
  it" row (3 items); removed "Agents with one job each" (its idea folded into card c, "A book that
  moves", using Sam's own card text verbatim, nothing added); "Who it is for" renamed to the 4 exact
  items (Insurers / Lenders and finance / Auction platforms and houses / Dealers, advisers and
  funds); "Why it holds up" trimmed to the 4 exact lines; the example panel drops the three car cards
  and now shows only the car name, the range (or the figure, large, when present), the count and
  window, and "Every figure opens to the sales behind it." (no link).
  referenceFigure WIRING: lib/onebox.js already had this field (Lane B, confirmed in this file before
  I started) but lib/live/marketCheckExample.js's reduce() was NOT passing it through to the cached
  example object - added `referenceFigure: d.referenceFigure || null` there (one line, benefits
  Market Check's own landing too if it ever wants the figure, not just /business). Sub line and card
  b's body both branch on `!!(ex && ex.referenceFigure)` - SUB_WITH_FIGURE/SUB_FALLBACK and card b's
  bodyFigure/bodyFallback, exactly Sam's two copy options, computed from the SAME example read the
  panel uses (zero extra engine calls). SWAP MARKER FOR LANE A (next time this page is touched): this
  can be simplified to always use the figure text once confirmed every live spec_market_cache row for
  the example key has been rebuilt since referenceFigure shipped (cold rows from before still read
  null even though the engine itself has supported it for a while - check the actual cached row's
  computed_at / market.referenceFigure via the spec_market_cache table before assuming it's live for
  a given spec).
- 2026-10-09 (Lane B, referenceFigure job, commits db37eca, 61f7f4d, ab73b9b, 112801b, 1325949):
  a single business-use figure, archive-only, computed from the SAME pool and cluster that sets the
  range - never a second query, never shown on any consumer page.
  METHOD (the one sentence an auditor gets): the figure is the middle point of the typical price
  band - the same cluster (p25 to p75 of the pool, the 8+-sale gate that also sets the shown range,
  rule 24) - that sets this result's own range; `amount = round((cluster[0]+cluster[1])/2)`. It moves
  with the pool's mileage mix the same way the range does, since it is built from the identical
  cluster, not a separate computation.
  SHAPE: `{ amount, rangeLow, rangeHigh, salesCount, windowLabel, confidence, basis }` plus a sibling
  `referenceFigureReason` (string) on every tier, populated together, never both null on a real
  answer. GATE (rule 1): only set when `cluster` exists - the same 8-sale floor as the headline range
  (rule 24) - else `referenceFigure: null` with a tier-specific reason string (thin/refusal/class_era/
  not_tracked/body_unavailable all carry their own). CONFIDENCE: reuses two EXISTING engine numbers,
  no new threshold invented - the 16-sale cluster floor and the 40% width-to-amount ratio (r4Driver-
  Search's own "wide band" threshold): high = 16+ sales AND tight; medium = (16+ AND wide) OR (8-15
  AND tight); low = 8-15 AND wide. No valuation words, no "median", no dashes in any string (checked
  by grep before every push).
  WIRING: lib/onebox.js's buildResult sets it on the main "result" tier; the six other early-return
  tiers (refusal x2, thin x2, class_era, not_tracked, body_unavailable) each got their own
  `referenceFigure: null, referenceFigureReason: "<reason>"` added after a live 12-car test caught 3
  of 12 printing `None` instead of a real string (those tiers never reach buildResult at all).
  lib/live/search.js's coreOf passes both fields through unchanged from the engine's own `d` -
  Buy/Tasks' own read of this reduction (via familyMarket/listingMarket) was STILL null after that,
  traced to a second bug: listingMarket() rebuilds its own narrower `m` object field by field and
  never copied referenceFigure/referenceFigureReason over - fixed (1325949). A SPEC_V bump (6->7,
  ab73b9b's follow-up) was tried first and was harmless but NOT the actual fix; left in place since a
  cache-shape version bump is cheap and correct on its own terms, just not what closed this gap.
  crossProductCheck's referenceFigure field comparison only compares lanes with a non-null value
  (compareField filters out null before comparing), so Buy/Tasks serving a stale null never shows as
  a MISMATCH - it just silently drops out of the comparison. Confirmed via a live 42-spec enginecheck
  BEFORE the listingMarket fix: 30 of 42 specs had Market Check/Sell carrying a real figure while
  Buy/Tasks read null - AFTER the fix, re-ran the same 42 specs: zero stale nulls remain.
  LIVE 12-CAR TABLE (task=referencefiguretable, api/usageDashboard.js, read-only): NSX $80,500
  (65,000-96,000, n=29, high); 986 Boxster S $16,000 (13,000-19,000, n=98, high); 997 Carrera
  $45,000 (36,000-54,000, n=66, high); C4 ZR1 $35,250 (26,500-44,000, n=49, medium); S550 GT350
  $56,000 (49,500-62,500, n=44, high); E92 M3 Competition $54,250 (38,000-70,500, n=37, medium); 992
  GT3 $258,000 (244,000-272,000, n=25, high); 991 Turbo S $150,000 (127,000-173,000, n=30, high);
  Ford GT $539,500 (472,000-607,000, n=35, high); Cobra Roadster/901 Carrera RS/300SL Roadster all
  null (thin tier, too few online sales, each with a real reason string).
  NEVER PUBLIC: grepped for the field name outside lib/onebox.js, lib/live/search.js,
  lib/platformPick.js, scripts/crossProductCheck.js, api/usageDashboard.js and lib/live/
  marketCheckExample.js (/business, Lane A's own wiring, same gate pattern, see the entry above this
  one) - no consumer-facing render path (js/onebox.js, js/result*.js, lib/sell/*) reads it.
- 2026-10-09 (Lane B, "one parser only" follow-up round, commits d36d03b, 5bc8ca9, 83c3a02): fixed
  NEW FINDING 7 from the entry above (the Carrera+Targa resolver drop) at the source, per Sam's ask.
  ITEM 1 ROOT FIX: refine911 (lib/vehicle.js) scanned PORSCHE_911_TRIMS for the FIRST match and
  stopped, so "Carrera Targa" resolved trim Carrera only and silently dropped Targa. Split the
  grammar into drivetrain entries and body-hint entries (Targa/Targa 4/Targa 4S/Targa 4 GTS,
  Speedster - the two words that double as both a genuine trim AND a body) and match each
  independently: a body hint found ALONGSIDE a drivetrain trim sets bodyStyle, never a second trim
  word; a body hint found ALONE still resolves as the trim itself, unchanged from today ("1973 911
  Targa" still trim "Targa"). Strips the body hint's own matched text before the drivetrain scan, so
  a compound entry whose tail word doubles as a generic catch-all ("Targa 4 GTS" ends in the bare
  "GTS" entry) is never mistaken for an independently-named trim next to it - caught by a 244-case
  local sweep (every PORSCHE_911_TRIMS entry x Targa/Cabriolet/Coupe/Speedster/Roadster/Spyder)
  before it shipped; without the strip, 6 of the 70 genuinely-changed cases regressed (lost the "4").
  Zero regressions in the final 244-case sweep (70 changed, all additive - gained a bodyStyle, never
  lost a trim word); the 6 named cross-make cases (Corvette Z06 Convertible, BMW M3 Convertible,
  Mustang GT Fastback, Mercedes SL Roadster x2, Ferrari 308 GTS Spider) are untouched, as expected -
  refine911 is Porsche-911-only. Added api/usageDashboard.js task=bodytrimsweep to re-run this sweep
  live.
  ONE PARSER: buildSpec (lib/onebox.js) no longer independently rescans the raw search text via
  detectBodyStyle(searchText) - that rescan is EXACTLY how Market Check "survived" the Carrera+Targa
  bug while Buy/Sell/Tasks did not (it found Targa in the raw text even after the shared resolver had
  already lost it). spec.bodyStyle now reads vehicle.bodyStyle directly, no re-filtering through
  detectBodyStyle's narrower vocabulary either (which was ALSO silently dropping resolver-only values
  like hardtop/sportbrake that detectBodyStyle's own list never carried - a second, smaller bug this
  same line fixed as a side effect). Verified end to end locally: resolveVehicle("1988 Porsche 911
  Carrera Targa") -> trim "Carrera", bodyStyle "targa" -> buildSpec carries both into genCode "3.2
  Carrera" + subject "911 Carrera Targa". Verified LIVE via drawervscard: card and drawer both read
  low=63500 high=81500 count=54, MATCH.
  ITEM 2 CACHE WRITE SAFETY: already safe by construction, not key-based - api/sellerDecision.js's
  opportunistic write-back only runs `if (oneBox.tier === "result" && !obRefine && ...)`. ANY refine
  object at all (mileage, gearbox, the trim-chip slug, body, variant, driver/observe) skips the write
  entirely, so a filtered read is never even a candidate to overwrite the plain spec's row - there is
  no key-matching subtlety to get wrong. Added api/usageDashboard.js task=cachewritesafety to prove it
  live (mirrors the real gate, does not reimplement it): seeds the plain row, runs a trim-filtered
  ("?trim=turbo" shape) and a mileage-filtered read of the SAME spec, re-reads the plain row.
  Confirmed live on "2008 Porsche 911 Carrera": computed_at identical bit-for-bit before and after
  both filtered reads (`unchanged: true`).
  ITEM 3: grew crossProductCheck's DEFAULT_SPECS by 11 more compound trim+body phrases (53 total),
  continue-on-error unchanged. Swapped out two I'd picked badly before pushing ("Carrera T Coupe" at
  a year before Carrera T existed, "Carrera T Cabriolet" when Carrera T has never been sold as a
  Cabriolet) for two real combinations once the live run flagged them as a car that never existed,
  not a resolver bug.
  NEW FINDING 8 (not fixed, flagging for a follow-up round): once resolveVehicle correctly carries a
  body style for a Targa compound, two of the new specs ("1989 Porsche 911 Turbo Targa", "1991
  Porsche 911 Carrera 4 Targa") exposed a genuine, separate Buy/Tasks-vs-Market-Check/Sell divergence
  that the OLD bug had been hiding (bodyStyle was always null everywhere, so this path never ran):
  lib/live/search.js's walkLadder has a documented "any_body" widening step that DROPS the body
  filter when the body-scoped cohort is too thin for a range, landing on the whole model/trim pool
  instead (930 Turbo Targa: Market Check/Sell correctly stay thin at 6 Targa-only sales; Buy/Tasks
  widen to 41, the whole 930 Turbo family). Market Check/Sell's own evidence ladder (lib/onebox.js)
  does not widen past body style the same way. This is a pre-existing, INTENTIONAL design difference
  in Buy/Tasks' ladder (not something this round introduced), only now exercised for these cases for
  the first time because bodyStyle used to always be null going in. Left both specs in
  crossProductCheck (continue-on-error) as live signal rather than removing them.
  SELL POOL STATUS (unchanged from the prior round's answer, re-confirmed): Sell reads the same
  ladder via runOneBox/resolveVehicle, never resolveForBuy, so finding 8 above does not touch Sell -
  only Buy/Tasks' separate walkLadder has the any_body widening step.
- 2026-10-09 (Lane C): ROUND (Sam): track record off on live /sell, watches, one task at a time, morning list.
  1. LIVE /SELL: js/result-v2.js psvPremium behind PSV_PREMIUM_TILE_ON=false (same logic as the new Sell; when
     turned on, only a figure stamped data_verified, n>=10, computedAt within 3 days). Script version
     js.20261009e (index.html + vercel.json rewrite). Stored rows seen through /api/sellerDecision: Ingo
     {pct 15, n 151, computedAt 2026-10-08T14:56:57Z}, Spencer {pct 15, n 24, same run}; a read-only rerun on
     Oct 9 gives Ingo 21% (n 138), Spencer 20% (n 23). FOR LANE B.
  2. WATCHES (new): lib/live/watches.js + api/watch.js + docs/supabase-watches.sql (RUN ONCE: tables watches
     and watch_sends, RLS on, anon/authenticated revoked). Until run, /api/watch "ready" is false and Buy shows
     no watch control. Spec watch = the same spec key and engine answer as Buy's cards (search.js engineAnswer,
     now exported): qualifying sales dated after the baseline (the newest sale the engine held when armed).
     VIN watch = vinAppearances after the watch began, plus live_listings first seen after it began
     (vin_norm indexed). watch_sends (unique watch_id, event_key) = the sent log; within 7 days of a message new
     events wait and go as one digest. Delivery = buyAlerts' stop link (stopAll now also stops watches),
     List-Unsubscribe one-click, junk line on the account's first watch message. Cron /api/watch?run=1 every
     4 hours at :50. Buy: drawer controls (next sale of the card's family; this exact car when it has a VIN),
     rail "Watching" with each watch's last event and a stop control, "Free. No card, no plan." after the
     first watch. The old watch_requests rows are untouched (never sent; no sender reads them).
     FOR LANE A: Market Check can arm a spec watch through the same /api/watch once it has a live listing id,
     or ask Lane C for an arm-by-spec action.
  3. TASKS ONE AT A TIME: the slot is now running/needs_you only (matches the DB unique index); a paused task
     waits without it. A second task (a seeded arrival, Start on a draft, Resume of a paused task while
     another works) shows Sam's exact choice with "Swap it for this one" / "Keep the current one"; every
     showing and press is logged as app_usage_events task_limit_hit (status seen|swap|keep; metadata user_id,
     running_task_id, running_task, attempted_job, mode, button). Probe reader: /api/tasks test_limit_events.
  4. Tasks cards use lib/carTitle.js humanTitle; the Buy landing example reads "within 300 miles of New York"
     (the search still uses ZIP 10282; cache key v10).
- 2026-10-09 (Lane A): Market Check results page additions, Lane B's engine fields rendered client-side, plus
  the one-line api/buy.js crew fix. Commits bd10226.. engine side (Lane B, already shipped); frontend/API this
  round landed as 4205019 (Fix sellshadow venue comparison... - a commit race bundled this round's
  api/buySearch.js + js/onebox.js + onebox.html + vercel.json changes under Lane C's unrelated sellshadow
  commit message; content verified correct via diff, not re-done), then 7934e5a and 15a44d5 (two small
  follow-up fixes, clean commits). Script version js.20261014l (onebox.html + vercel.json rewrite).
  1. api/buy.js: `crew` now passed into railOpenHtml() (was missing). Verified live both cookie states.
  2a. Eyebrow: "{N} sold in {window}" using soldCount (already word-under-ten) + windowLabel. No "based on".
  2b. Four quarters: rendered as plain lines (period, band, count), newest first, ONLY when 2+ quarters have
      a real band (quarterlyBandsHtml, js/onebox.js). FLAGGING A SPEC CONTRADICTION: the brief asked each line
      to "open that quarter's sales" via quarterlyBands[i].sales, but the engine (quarterlyBandsFor,
      lib/onebox.js) only populates .sales for a quarter WITHOUT a band - the thin ones this view does not
      show. There is nothing honest to open for the quarters that actually render here, so NOT wired as a
      click target. If an open-on-click interaction is wanted, the engine needs to also carry .sales (or a
      per-quarter card list) for BANDED quarters, which it deliberately does not today (keeping banded-quarter
      payload small). Verified live (M3, 997, Targa: 3 banded lines each; Countach: 0, correctly nothing).
  2c. Direction: yoyDirection.sentence rendered verbatim plus two small lines for recentBand/priorBand. Null
      -> nothing. Verified live on all 4 non-VIN cars and the VIN case.
  2d. "N set aside" / "N didn't sell" quiet lines, collapsed by default, each expanding its own list
      (setAsideLineHtml/didNotSellLineHtml). Set aside buckets by reason (modified/project/replica/odd sale)
      from setAsideReasons, rows from setAsideRows (poolCardHtml, so soldBefore still shows if present).
      Didn't sell lists date/high bid/platform/link from didNotSellRows. NOTE FOR SAM: d.asideCards (the
      existing "Shown separately" section) and d.setAsideRows are THE SAME underlying array (both
      shapeCards(aside) in lib/onebox.js buildResult) - on a result with any aside rows, a reader now sees
      the same cars twice: once in the open "Shown separately" grid (with Above/Below range tags) and again
      collapsed under the new "N set aside" line (with reason tags). Built exactly as specified rather than
      unilaterally removing/merging the older section; flagging in case you want "Shown separately" retired
      once this ships. Caught and fixed live: setAsideCount word-ifies under ten (countWord), so the singular
      check needed n === "one" alongside n === 1 ("one sale set aside", not "one sales" - fixed in 15a44d5).
  2e. Placing: wherever a live bid is shown (the "N like this are live right now" panel), the word now appends
      ("Current bid $59,000 · above the range"). Required a small server change: js/onebox.js's loadLivePanel
      now passes the headline's own cluster band as lo/hi on the ?panel=1 call; api/buySearch.js's panel
      handler imports placingFor from lib/onebox.js and computes it per row against that band (never a second
      band, never guessed - null when there is no cluster or no usable dollar figure). Verified live: M3 shows
      "above the range", 997 shows "below the range".
  2f. Sold before: poolCardHtml now appends a "Sold before on {date} for {price}" line (linked when the
      engine gives a link) when cards[i].soldBefore is set. Scoped to d.cards-shaped cards only (attachSoldBefore
      mutates result.cards, never result.representative.closest/high/low, so the hero/side cards never carry
      it - this matches where the engine itself writes the field). Verified live: 9-10 lines on the three
      Porsche/BMW cars, 2 on the VIN match's comparable pool, 0 on the thin Countach case (no history there).
  2g. Removable current-answer chips: currentAnswersChipsHtml() reads obLastRefine (miles/body/tx/trim/
      variant/driver/observe, whichever are answered) at the top of the result. Removing one calls
      refineWithout(dim) (clears just that dimension's keys, null if nothing else is answered) and reruns via
      the existing runPool, which already updates the address (mcPushUrl). Verified locally end to end
      (fixture test): answering a mileage chip shows "under 60k ×", clicking it clears back to no chips.
  2h. Copy link: untouched, confirmed still present (data-share button, mcUrlActive-gated).
  2i. "Put Sam on it" band: built (samOnItHtml) with the two exact lines Sam gave (spec vs VIN). NOT wired to
      a watch creation call. First pass reused the OLD api/buySearch action:"watch" -> watch_requests (the
      only call visible before Lane C's note above landed) - caught and removed before anything shipped once
      Lane C's same-day note said those rows are "never sent, no sender reads them." Lane C's REAL call
      (api/watch action:"arm", see their note above) is gated on a live_listings listing_id: arm() looks up
      the live row and reads the spec/VIN off IT (lib/live/watches.js line ~148-166), never off a typed spec.
      Market Check has no listing_id on either path (a plain spec search has none at all; a VIN match is an
      archive row, not necessarily a live one), so there is no honest call today on EITHER the spec or the VIN
      branch. Current behavior: signed-out click opens the shared sign-in card (openSignInCard, confirmed
      working - js/auth.js loads deferred but the button only calls it at click time); signed-in click does
      nothing further (no network call, no confirmation message) rather than claim something that doesn't
      happen. FOR LANE C: an arm-by-spec/arm-by-vin path that accepts a resolved vehicle (make/model/trim/
      body/year) or a bare VIN directly, with no listing_id requirement, is what would let this reconnect -
      the baseline-date logic in arm()'s spec branch (cohortAnswer against the newest sale already in the
      pool) looks directly reusable once there's an entry point that doesn't require a live row first.
  2j. Copy audit: grepped the new functions for worth/valuation/estimate/appraisal/undervalued/overvalued/
      median/scatter/dashes/first-person - none found.
  3. Tested live (real deploy, not local): 2001 BMW M3 Coupe, 2009 Porsche 911 Carrera S Coupe, 1988 Porsche
     911 Carrera Targa (all dense results, all additions shown except placing - no live listing happened to be
     up for the Targa at test time, so nothing rendered there, correctly), 1990 Lamborghini Countach (thin:
     quarters/direction absent - correctly, pool never clears the 2-quarter-banded or 8-sale useRecent floor;
     set-aside+didn't-sell quiet lines present), and a VIN (WBS4Y9C55KAG67564, an exact match): direction
     present, quarters absent (13 sold, under the floor), soldBefore on 2 comparable cards, samonit using the
     VIN-specific line. Screenshots at 1440 saved this session (not committed, local only).
  LOCAL TESTING NOTE for future Lane A rounds: a browser page served off localhost cannot reach
  https://goasksam.com/api/* directly (credentials:"include" + the API's wildcard CORS reject a non-wildcard-
  origin preflight; a raw curl/node fetch to the live API also gets Vercel's Attack Challenge Mode 429, not a
  real failure - see [[smoke-429-attack-challenge]]). Worked around this round by building a fixture JSON
  matching the engine's documented return shape and intercepting the page's fetch via Puppeteer
  setRequestInterception, which is honest for testing RENDER logic (the engine's own correctness is Lane B's
  shipped responsibility) but cannot stand in for testing against real data - final verification was a second
  pass against the live deployed page with a real headless Chrome (which the Attack Challenge does let
  through, confirmed again this round).
  Search check: rule 1 (soldCount/quarters/direction are dated-window market facts, re-derived every render,
  never cached stale), rule 3 (no change to title/H1/canonical/lead), rule 7 (no new indexable surface - these
  additions are on the existing /market-check results view only).
- 2026-10-09 (Lane A): Market Check search bar width fix + connected Put Sam on it to Lane C's watch API.
  Commits 465c860, cef1701.
  WIDTH FIX: the hero bar (lib/live/marketCheckLanding.js) and the empty-state/results bar (js/onebox.js
  inboxHtml) both ran too wide past 640px, overlapping the hero car photo on the landing. Capped at 600px via
  a new .mc-bar class, scoped so New Sell (the SAME shared .inbox markup, window.GAS_SELL truthy there) is
  never touched - inboxHtml() only adds mc-bar when !SELL. Chips row and the VIN line on the landing match the
  bar's width. Verified live at 1440/1024/768/390: desktop ends well before the car, the 640px mobile banner
  layout (car above text) is unaffected, no wrap/overlap at 768 or 1024. Could not verify New Sell's OWN bar
  live (today /sell?car=... still serves the OLD /sell page, not sellNext - unrelated to this change, the
  .inbox class isn't reached there either way) - zero risk either way since the scoping is via the existing
  SELL flag this file already uses for the same purpose elsewhere.
  WATCH CONNECTION: item 2i ("Put Sam on it") now arms a real watch through Lane C's documented contract
  (their 2026-10-09 lane-notes entry below) - POST /api/watch {action:"arm", kind:"spec", car:{year, make,
  model, trim, body}} for a plain search, or {action:"arm", kind:"vin", vin} for a VIN/chassis match, same
  endpoint and wording Buy's own control uses (never a second one). Gated on {action:"ready"} (checked once at
  boot into OB_WATCH_READY) - no control renders while the tables aren't set up. Signed-out click opens the
  shared sign-in card only (mirrors Buy's armWatch(): no post-signin auto-resume there either, so none was
  added here - sign in, click again, same two-step on both pages). Signed-in click arms and swaps the band to
  "Watching for the next sale of {label}." / "Watching for this exact car to come up again.", plus "Free. No
  card, no plan." on this account's first ever watch (j.first). State (obWatchArmed/obWatchFirst) resets on a
  new search (run()/mcApplyFromUrl()), not on a refine - the identity being watched doesn't change when
  miles/gearbox narrow the same pool.
  SHARED WATCHING RAIL: added to lib/appShell.js rather than Market Check's own page, so Tasks and /business
  get it from the same place with zero duplication, per the instruction. railOpenHtml() now always renders an
  empty `<div id="gas-watching-rail" hidden>` container (data-active/data-full attributes on #gas-rail tell
  the script whether to run) and SHELL_JS gained gasWatchRail(): fetches POST /api/watch {action:"list"} when
  signed in and the rail is "full" (not the reduced pre-launch set), renders a "Watching" section with each
  watch's label/last_event and a stop (x) control wired to {action:"stop", id}. SKIPS when data-active="buy" -
  Buy already renders its own Watching section (its own page-specific script, predates this shared one) and
  showing both would duplicate the list; this is the one deliberate exception to "every page shows it" and is
  explained in a comment at both ends (railOpenHtml's note, gasWatchRail's note). Verified via local fixture
  (fake session + mocked /api/watch list/stop): the shared container renders correctly on Market Check
  (data-active="market-check", market-check/tasks/business all confirmed server-rendering the container via a
  local smoke render of each handler), stop removes the row and re-hides the box when empty, and the gate
  correctly no-ops on the reduced (pre-launch) rail and on Buy's own page in both the local test and a live
  check of Buy's current (pre-this-change) markup.
  NOT independently live-tested end to end (no real test account in this session, unlike Lane C's own "test
  account, disposable inbox" pass noted below): the actual arm-and-confirm round trip and the rail populating
  from a REAL signed-in session. What IS verified live: /api/watch {action:"ready"} returns true in production
  (the band renders at all), the sign-in card opens with the exact copy ("Sign in to keep a watch. Free. No
  card, no plan."), and the arm payload shape/Authorization header/response handling were checked against a
  mocked server matching Lane C's documented contract exactly (confirmed via a captured request body:
  {"action":"arm","kind":"spec","car":{"year":2001,"make":"BMW","model":"M3","trim":null,"body":"coupe"}}).
  A real-account click-through would be good belt-and-suspenders if anyone wants it before calling this done.
  TRANSIENT 500 OBSERVED AND SELF-RESOLVED: right after this round's push, all five pages (/sell /buy /tasks
  /market-check /business) returned a genuine Vercel 500 (not the Attack Challenge page - confirmed via a real
  Puppeteer browser hitting the actual error body) for a brief window on the deployment carrying commit
  d037166 (a concurrent Lane C push that landed between my two commits). A follow-up deployment (triggered by
  an unrelated "Update nightly.yml" push, 6026317) with no app-code difference served 200 again, and every page
  plus a full Market Check search has been clean since. Could not pull a stack trace (vercel logs had already
  rolled past the bad window by the time I checked). Flagging the timestamp in case Sam wants to check Vercel's
  own deployment history for that commit; nothing currently reproduces.
  Baseline (post-fix): /sell /buy /tasks /market-check /business all 200 signed out, titles/H1s intact.
  Search check: no title/H1/canonical/address change on any page this round.
- 2026-10-09 (Lane C -> Lane A): WATCH API for Market Check (and any page). ONE endpoint, api/watch.js; do not
  add a second. All POST, JSON. arm/list/stop need the signed-in token: `Authorization: Bearer <access_token>`
  (the same gas_auth_session token Buy and Tasks send). Missing/expired token -> 401 {ok:false, needSignIn:true}.
  Tables not set up -> 200 {ok:false, setup:true}. A watch object everywhere is
  `{ id, kind:"spec"|"vin", label, key (the VIN for kind "vin", else null), last_event (plain line or null),
  last_event_at, created_at }`.
  * READY (no token): {action:"ready"} -> {ready:true|false}. Show no watch control while false.
  * ARM BY SPEC (Market Check: no listing needed): {action:"arm", kind:"spec", car:{year, make, model, trim,
    body, gearbox}} (trim/body/gearbox optional; gearbox "manual"|"automatic") -> {watch, first} or
    {error:"not found"|"no spec"}. The car is read through the same specOf as a Buy card, so it lands on the
    same spec key a card for that car has (one watch per spec per account; arming again returns the same
    watch and restarts it if it was stopped). label is the engine's group name ("3.2 Carrera Targas").
  * ARM BY SPEC FROM A LISTING (Buy): {action:"arm", kind:"spec", listing_id:<live_listings.id>} -> same reply.
  * ARM BY VIN: {action:"arm", kind:"vin", vin:"<17 chars>"} or {action:"arm", kind:"vin",
    listing_id} -> {watch, first} or {error:"no vin"|"unknown vin"} (unknown = no record and no live listing).
  * first:true on the account's first watch: show "Free. No card, no plan." under the control.
  * LIST: {action:"list"} -> {watches:[watch...]} (active only, newest first). Rail: "Watching", each
    `label` with `last_event || "Nothing yet"` and a stop control.
  * STOP: {action:"stop", id} -> {ok:true}. The message's own stop link stops every notice on the account.
  Buy's wording to reuse: "Watch for the next sale of {label}" / "Watching for the next sale of {label}." and
  "Watch for this exact car to come up again" / "Watching for this exact car to come up again."
- 2026-10-09 (Lane C): watch and before-it-ends messages (and Tasks emails) now end with the stop link and
  the single word "GoAskSam"; nothing is signed "Sam". NOTE: the sender display name is still
  "Sam <sam@mail.goasksam.com>" (lib/_email.js TASK_FROM), left for Sam to decide.
- 2026-10-09 (Lane C): WATCHES LIVE TEST after the SQL ran (test account, disposable inbox). Armed by spec from
  a car ({kind:"spec", car:{1987 Porsche 911 Carrera Targa}} -> label "3.2 Carrera Targas", the card's own group
  name) and by VIN (1998 SL500). One real run (/api/watch?run=1, probe held to the account) sent 2 messages
  (a 2-sale digest; a back-at-auction with its earlier sale) and wrote 4 watch_sends rows; a second run sent
  nothing ("quiet": the sent log, not the digest hold). Drawer arming on Buy and the Watching rail checked at
  1440 and 390; the message's stop link (confirm page, then POST) stopped every watch and the rail section went.
  The stop pages now say they stop before-it-ends notices and watches, in GoAskSam's name.
- 2026-10-09 (Lane C): WATCH FOLLOW-UP. (1) Sender display name is "GoAskSam" on every message sent through
  lib/_email.js sendTaskEmail (watches, before it ends, Tasks); the address stays sam@mail.goasksam.com
  (verified domain, DKIM/SPF untouched; a TASK_EMAIL_FROM override keeps its address, shown as GoAskSam). Sign-in
  emails are Supabase Auth's own: their sender name is set in the Supabase dashboard (Auth > SMTP), not in code.
  Partner lead emails were already "GoAskSam Leads". (2) STOP GRANULARITY: a message's stop link now also names
  its one item, signed: `&i=w:<watch id>.<sig>` (a watch) or `&i=a:<buy_alerts id>.<sig>` (a before-it-ends
  notice) (lib/live/buyAlerts.js stopLink(userId, item) / verifyItem). The confirm page names it ("Stop the
  watch on 3.2 Carrera Targas") with "Stop this one" (POST &scope=one) and "Stop everything" (POST
  &scope=all). The List-Unsubscribe header keeps the account-wide link (no item), so a mail client's one-click
  POST stops everything. (3) "Free. No card, no plan." shows in the drawer of the account's first watch only,
  and goes once a later watch is armed. API FOR LANE A: no reply shape changed (arm/list/stop as above).
- 2026-10-09 (Lane A): Market Check landing hierarchy. Commit 545f644 (lib/live/marketCheckLanding.js only -
  no H1/title/canonical/address/search-bar/chips/VIN-line change).
  1. Removed the three-icon trust strip (.mc-proof) entirely.
  2. One quiet centred line in its place: "Real sales · Matched like with like · Receipts behind every
     number" (.mc-quiet, 14px Instrument Sans, no icons).
  3. The example (exampleBandHtml) moved to render directly after that line - now the first major section,
     before "How Sam gets there." Unchanged itself (same car, same engine call, "An example" label and Sam's
     take all intact).
  4. "What you get." (.mc-gets, 4 icon cards) replaced with "How Sam gets there." (.mc-how): one row of three
     quiet text items (bold short lead-in + one line), no icons at all (read "no icons larger than the text"
     as no icons, matching "quieter section"), stacking at 640px and under. Exact copy as given.
  5. GAP, FLAGGED RATHER THAN GUESSED: the instruction says to keep a "Put Sam on it" band and a closing call
     to action on the landing, in order after How Sam gets there. Neither exists on the landing today - Put
     Sam on it is a RESULTS-page-only feature (added last round, js/onebox.js samOnItHtml, only renders once
     a search has returned a resolved car/VIN match; the landing has no resolved car yet) - and there has never
     been a separate "call to action" card here, just the existing one-line .mc-foot ("Real sales only.
     Nothing estimated."), which I left in place at the end. Did not invent a landing-specific Put Sam on it
     band or a new CTA card since no copy was given for either and the landing has no car to watch yet - say
     the word and I'll build whichever one you want (e.g. a generic "Any car that sells, Sam can tell you"
     band wired through the same /api/watch arm-by-spec call once a car is searched, or a plain /sell-style
     CTA card) once you confirm the copy and behavior.
  Verified live at 1440 and 390 (screenshots this session, not committed): order confirmed via DOM children of
  #mc-landing (gas-hero, mc-quiet, mc-ex, mc-how, mc-foot) on the real deployed page with the real cached
  example rendering (locally the example is null - Supabase isn't reachable from a bare script run, a known
  limitation noted elsewhere in this file - so the reordering itself was proven structurally locally and the
  example's actual position was confirmed live).
  Baseline: /sell /buy /tasks /market-check /business all 200 signed out.
  Search check: no title/H1/canonical/address change; rule 3's dated lead sentence (mc-upd, "Market Check.
  Updated Oct 9, 2026.") is untouched and still renders before any client JS runs.
- 2026-10-09 (Lane B -> Lane A): quarterlyBandsFor (lib/onebox.js) had sales/band INVERTED - a
  quarter that cleared RANGE_THRESHOLD got `band: <real cluster>, sales: null`; a thin quarter got
  `band: null, sales: <its cards>`. Fixed: a banded quarter now carries `sales` (the cards that set
  that band), a thin quarter carries nothing but `count`. Verified live (task=obcheck):
  "2001 BMW M3 Coupe" - 3 of 4 quarters banded (Jul-Sep $23,000-$35,500/21 cards, Apr-Jun $22,500-
  $43,500/23 cards, Jan-Mar $29,000-$41,000/15 cards), each `sales.length` matching its own count;
  the one thin quarter (Oct-Dec, "three") carries band:null, sales:null. "1969 Chevrolet Camaro Z28"
  - all 4 quarters thin (1/2/6/3, each under the 8-sale floor) - band:null, sales:null on every one,
  as expected. crossProductCheck.js never references quarterlyBands (confirmed by grep), so this
  fix cannot change anything that script compares - no rerun needed to confirm "unchanged".
  TRANSIENT 500 (Sam's follow-up ask): tried to pull Vercel's own logs for the commit d037166-era
  deployment (`vercel inspect <url> --logs`, `vercel ls --meta gitCommitSha=...`) - could not isolate
  that specific deployment or retrieve runtime logs from several hours back; the CLI's deployment
  list doesn't expose git SHA directly and runtime log retention had already rolled past, same
  conclusion Lane A already reached. Nothing new to add - Lane A's self-resolved finding stands.
- 2026-10-09 (Lane C): OUTAGE NOTE. cef1701 (Lane A) committed lib/appShell.js importing lib/analytics.js while
  that file was still untracked, so every page importing the shell (/sell, /buy, /tasks, /market-check,
  /business, /how-sam-decides, /api/publicConfig) returned 500 until 4446fae added the file. ALL LANES: before
  pushing, `git status` for untracked files your commit imports (`git show --stat HEAD` + a node import of
  the changed entry points from a clean worktree of origin/main catches it).
- 2026-10-09 (Lane C): exact-car watches count a live listing only while its end_time is in the future (the
  pull can lag the end by up to four hours).
- 2026-10-09 (Lane C -> Lane A): MARKET CHECK "PUT SAM ON IT" CHECKED LIVE (signed out, 1440 and 390, the
  disposable inbox accounts). Works: the shared sign-in card opens ("Sign in to keep a watch. Free. No card,
  no plan."), the code signs in and the visitor stays on the result; the next click arms through /api/watch
  (spec: "Watching for the next sale of 997 Carrera S cars."; VIN: "Watching for this exact car to come up
  again."); both watches show in Buy's Watching rail. PAGE SIDE, for Lane A:
  1. The Watching section never shows in Market Check's rail for the public: SHELL_JS gasWatchRail() returns
     early unless #gas-rail has data-full="1", and the pre-launch reduced rail (PUBLIC_LAUNCH off) is
     data-full="0". Signed-in visitors therefore see their watches only on Buy. If Watching should show on the
     reduced rail too, drop that check for the Watching box (it already skips signed-out visitors).
  2. After signing in from "Put Sam on it", nothing resumes the click: the visitor must press it again (Buy is
     the same today). If wanted: remember the pending arm in sessionStorage before openSignInCard and replay it
     when authIsSignedIn() turns true (Buy's before-it-ends switch does this: askSignIn/resumeArm).
  3. The rail does not redraw after arming on the page; call gasWatchRail() after a successful arm.
  API side: nothing to change; the "first" flag is correct (proven on Buy with two new accounts). The Market
  Check first-watch screenshot waits on Supabase's per-connection sign-up limit (new accounts refused for now).

- 2026-10-09 (Lane B, Step 1 FACTS REPORT, open-search policy, Sam's directive): tracking/rate-limit state,
  read-only, nothing changed. For Lane C's Buy/Sell report and Lane A's Market Check report.

  **Rate limits / quota today, by product:**
  - Sell (api/sellerDecision.js `computeSearchGate`, the ONLY caller - line 3763, reached only on the
    non-oneBox branch): this is where "60 per hour per address" actually lives, but it is bundled with
    FOUR separate things in one function, two of which Sam wants removed and two of which must survive:
    (1) `ip_cap_all_hour` (app_config, default 60/hr per IP, `clientIp(req)`) - general abuse cap, every
    non-crew search. KEEP (item 5's "invisible per-address/device limit").
    (2) `ip_cap_anon_day` (app_config, default 20/day per IP, anon searches only) - KEEP, same reason.
    (3) THE ACCOUNT WALL Sam wants gone: `gas_free_used` cookie -> one anonymous search ever, then
    `account_required`; signed-in `reserve_search` RPC -> monthly/daily tiers (free=1/day, tdv=3/day via
    Beehiiv subscription check); `guest30` tier (30 lifetime via a `?guest=CODE` link, separate code path,
    see [[guest30-tier]]); `gas_tester`/`gas_once` cohorts (pre-launch invite tiers, lib/_tester.js +
    api/crew.js, 10/day and 3-total respectively) - these three sit OUTSIDE the free/account wall entirely
    (own counters) and are pre-launch-specific; worth a product call on whether they still make sense once
    search is unconditionally open, but they are not part of "the first one's on me" copy.
    EXACT COPY LOCATIONS for "Your first one's on me...": `js/auth.js` lines 482, 505, 514, 525
    (`gateWalledReack`/`gateAppendFirstFreeLine`/`gateRenderStatus`), plus the TDV-tier variants at 480/523/
    627/629/633 and the guest-wall copy at 499. `js/result.js` lines 172-177 read `decisionData.daily` /
    `decisionData.firstFree` / `decisionData.resultId` off the SAME response `computeSearchGate` + the
    handler produce (api/sellerDecision.js ~4316-4424, `responsePayload.resultId`/`firstFree`).
    (4) THE SPEND FLOOR THAT MUST SURVIVE, already built, item 6's exact ask ("a cache-first rule plus a
    lower live ceiling"): lines 2961-2972, UNCONDITIONAL on tier/account - before ANY anonymous search
    proceeds, it checks `readMarketFetchCache` first (zero-cost path); only on a cache MISS does it check
    whether today's OCD spend is already within `ocd_auth_reserved_requests` (default 8) of
    `OCD_DAILY_REQUEST_BUDGET`, and if so returns `{status:"capacity"}` rather than let an anonymous
    request burn the budget signed-in users need. **This is a different mechanism from the account wall
    and lives in the same function - removing "the free-first/daily-quota wall" must NOT touch this block.**
    Signed-in requests go through `reserve_search` instead (ties to the account, not this floor).
  - Buy (api/buySearch.js, lib/live/search.js): **no rate limit of any kind today.** Confirmed by grep -
    `computeSearchGate`/`ipHitsSince`/`clientIp` are never imported or called from buySearch.js or buy.js.
    Sam's belief ("I believe 60 per hour per address") is actually Sell's `ip_cap_all_hour` - Buy has
    nothing today, not even that. Hero copy: `lib/live/buyLanding.js:112`, exact string `"Free · No account
    needed"` (+ ` · Updated {date}` when present) - accurate today (zero gates of any kind), but would need
    a real per-address/device cap added before Lane C can honestly call it "protected" per item 5's spirit
    if volume ever becomes a concern. Not urgent today (Buy's search path is 100% archive-only, see below).
  - Market Check (api/sellerDecision.js, `req.body.oneBox` branch, returns BEFORE reaching
    `computeSearchGate` at line 3763 - confirmed by tracing every early-return in the oneBox block,
    lines 3372-3604): **shares NO quota or counter with Sell.** Has its OWN lightweight invisible cap
    already, which already matches item 5's spec almost exactly: `onebox_daily_cap` (app_config, default
    40/day) counted server-side from `funnel_events` where `event=onebox_search`, keyed by the CLIENT-sent
    `anonId`/`obAnonId()` (localStorage `gas_ob_anon`, see below - NOT a cookie, not IP-based). On the cap:
    a plain, calm line, no sign-in demand (`"That's a lot of lookups for one day. Come back tomorrow..."`,
    line 3523) - exactly item 5's requirement, already shipped. A refine tap (mileage/gearbox/etc.) is
    exempt from the count (continuation of the same lookup, not a new one). Lane A: this already satisfies
    most of item 5 for Market Check; the only gap is it's per-localStorage-id not per-IP/device, so a
    cleared localStorage resets it (low-stakes since Market Check is archive-only - see cost section).
  - Tasks: not yet traced this round (ran out of scope) - Lane A/C, flag if Tasks has its own gate; I did
    not find one in this pass.

  **Tracking/analytics infrastructure that exists today (fragmented, no shared visitor id):**
  THREE separate, non-communicating anonymous-id schemes, none of them cookies (all `localStorage`, so
  none are readable server-side before JS runs, none survive a cleared browser, none work across
  subdomains/devices), and NONE stitched to the account on sign-in anywhere in the codebase (grepped
  "stitch"/account-linking patterns around watch_requests/saved_results/journeys - found none):
    1. `gas_anon` (js/auth.js:324-326, `gasAnonId()`) - Sell's id, sent as `anonSessionId` to
       `computeSearchGate`'s funnel logs and the decision save.
    2. `gas_ob_anon` (js/onebox.js:1680-1683, `obAnonId()`) - Market Check's id. Confirmed Buy's own
       inline client script (api/buy.js CLIENT string) reuses this SAME key name/generator by coincidence
       (copy-pasted, not shared code) - so Buy and Market Check happen to already collide into the same
       localStorage slot when both are visited in one browser, but this is accidental, not designed.
    3. `gas_jid:<make|model|year>` (js/auth.js `gasJourneyId`) - a DIFFERENT id per vehicle the visitor is
       trying to sell (Sell's own "business journey" concept, `lib/_journey.js`/`journeys` table,
       docs/supabase-journeys-schema.sql), deliberately NOT a single visitor id - this is "one id per car
       someone's selling," which should stay separate from the new cross-product visitor id (different
       purpose: tracking a sale attempt, not a person).
  Three storage tables, also non-unified:
    - `funnel_events` (docs/supabase-phase3-2c.sql:46-61): `event, anon_session_id, user_id, dedup_key,
      created_at` - closest thing to a canonical event log today, but only 8 event names are ever logged
      to it (`tester_daily_limit_hit, once_limit_hit, guest_limit_hit, daily_limit_hit, limit_hit,
      second_search_attempt, onebox_search, rec_shown`, all from sellerDecision.js) plus whatever
      api/funnel.js's `ALLOWED` set adds client-side (`homepage_view, wizard_start, wizard_complete,
      signup_shown, non_us_attempt, out_of_scope`, the `onebox_*` interaction events). No `props`/metadata
      JSON column - can't carry a UTM, a tool name, or anything beyond the fixed row shape.
    - `app_usage_events` (CLAUDE.md: cost/usage logging) - has a `metadata` JSON column and is used for
      cost accounting (OCD/Anthropic metering) plus one ad-hoc `entry_diag` client-error path
      (api/funnel.js) - not a product-analytics table by design, has no visitor id column.
    - `journeys`/`journey_events` (docs/supabase-journeys-schema.sql) - Sell-only, per-vehicle, no UTM/
      referrer column on the schema itself.
  First-touch/last-touch attribution DOES already exist, but narrowly: `js/auth.js` `gasCaptureTouch()`/
  `gasClassifySource()` (lines 352-384) read `utm_source/medium/campaign` + `document.referrer` on every
  page load into `localStorage.gas_first_touch`/`gas_last_touch`, classified into Direct/Organic/Social/
  Referral/named-source/"The Daily Vroom". It is loaded via js/auth.js, which per Lane A's authBar work
  now runs on Market Check/Sell-landing/Tasks/homepage too - so the CAPTURE already fires broadly - but
  it is only ever READ/ATTACHED by `gasJourneyEvent` (Sell's journey beacon), so Market Check/Buy/Tasks
  visits capture it into localStorage and then do nothing with it. This is directly reusable for the new
  visitor id's first-touch requirement (same classification logic, same localStorage keys already warm on
  most pages) rather than building a second one.
  GA4 (lib/analytics.js/api/gaConsent.js, this session's earlier round): EEA/UK/CH country-gated consent
  check already exists (`GA_BLOCKED_COUNTRIES`) - directly reusable as the geography test for whether the
  new first-party visitor id needs a consent banner (see flag below), though GA's gate is about a
  THIRD-PARTY id (Google's), a stricter case than a first-party pseudonymous id with no ad use - still the
  right starting precedent to apply the same jurisdictions to.
  Admin Stage 1 (lib/events.js, docs/admin-analytics.md, admin_users/admin_daily/admin_audit tables):
  confirmed via grep - **none of this exists yet.** It is still only a plan (CLAUDE.md "Later (parked)" /
  this file's own prior round notes referencing it) - this round is the first real step toward it.

  **Cost/spend facts (item 6), traced end to end per product:**
  - Buy search (lib/live/search.js via api/buySearch.js): **100% archive-only (sales_archive via
    runOneBox/archiveResolveToken), zero OldCarsData spend**, confirmed by import graph (search.js never
    imports lib/_ocd.js). The ONE place Buy calls OCD at all: `freshBid()` (api/buySearch.js ~456-470),
    a single on-demand current-bid refresh when a listing detail view opens - gated behind `LIVE_FRESHNESS`
    env flag (off unless set), 5-minute cache per listing, and an `underReserve(env)` check that refuses
    to spend once the monthly OCD reserve is tight. This is already exactly the shape item 6 asks for
    (bounded, cached, reserve-aware) and is NOT tied to search volume at all (one listing view = at most
    one call, ever 5 min) - no change needed here.
  - Market Check (lib/onebox.js `runOneBox`): **100% archive-only, zero OldCarsData spend**, per the
    code's own comment at api/sellerDecision.js:3503 ("One Box is ARCHIVE-ONLY... must NOT consume the
    seller's /sell daily reserve"). No metered call exists anywhere on this path. Opening Market Check to
    unlimited signed-out search costs nothing beyond Supabase read load (already handled by the existing
    `onebox_daily_cap` soft ceiling above).
  - Sell (api/sellerDecision.js, non-oneBox branch): **the one real spend path.** `readMarketFetchCache`
    checked first (zero cost on a hit); on a MISS, `fetchRecentRecords` runs the live multi-pass OldCarsData
    fetch (metered - confirmed this session at 2-9 requests per uncached car during the ONE RANGE
    verification run). This is exactly why the lines-2961-2972 floor above exists and must be preserved
    when the account-wall copy is removed. PROPOSAL (item 6): keep that floor exactly as-is, AND fold the
    two general IP caps (`ip_cap_all_hour`/`ip_cap_anon_day`) forward unchanged - removing the "one free
    search" wall does not require touching either protection; they are orthogonal to the account tier and
    already enforce calmly (no sign-in demand, just the capacity-floor path's existing degrade). No new
    limit is needed beyond what's already there; the risk is Lane C deleting the WRONG lines while removing
    the right ones, since all four mechanisms share one function (`computeSearchGate`) - flagging precisely
    which lines are which above so that doesn't happen.

  Lane B is not touching api/sellerDecision.js, api/buySearch.js, or js/auth.js's quota code this round
  (Lane C/A's files) - proceeding to Lane B's own Step 2 (visitor id, lib/events.js, admin views).
- 2026-10-09 (Lane B): ONE RANGE decision (decision.priceBand), commit dfb1c24, done per Sam's 5-item spec.
  1. `api/sellerDecision.js`: `decision.priceBand` is now set by a fresh `runOneBox(vehicle, generation,
     searchText, {supabaseUrl, supabaseKey, asked:2}, null)` call right after `decide()` returns, reading
     `.cluster`/`.poolN` - the SAME call shape Market Check makes for the same car (same resolver output,
     fences, gates, evidence-ladder window). No cluster -> `decision.priceBand` is simply never set (was
     previously always set via the separate `priceBandForVehicle`).
  2. `js/result-v2.js`'s `v2AskingLine()` already returns `""` before building any HTML when `dec.priceBand`
     is missing/zero, and its result string-concatenates straight into the page with no wrapper div - traced
     the exact call site, confirmed no code change needed, no empty frame, no "$0 to $0" possible.
  3. Searched every real caller of `priceBandForVehicle` (lib/onebox.js) before touching anything: exactly
     two, both in api/sellerDecision.js. (a) The item-1 assignment above - now points at runOneBox's cluster
     instead. (b) The `priceProbe` branch (`req.body?.priceProbe`, ~line 3612) - product rule 23's deferred-
     ask feature ("you tell me" asking price) - KEPT UNCHANGED, deliberately not moved: rule 23 requires that
     band to NEVER widen past the seller's own trim to manufacture a spread, which is exactly what runOneBox's
     evidence ladder does at wider rungs - moving this caller would violate a separate locked rule, not fix
     one. `priceBandForVehicle` itself is therefore NOT removed (it still has this one real, intentional
     caller) - flagging this as a deliberate deviation from "move every caller," not an oversight. No chat/
     Desk/exports/script caller found anywhere else (grepped repo-wide).
  4. `scripts/crossProductCheck.js`: `sellLane()` now makes its own independent fresh `runOneBox` call for
     `askingLineLow`/`askingLineHigh`; `checkOneSpec()` adds a dedicated `row.askingLineCompare` field
     (MATCH/MISMATCH/N/A) comparing it against `marketCheck.low/high` - a reintroduced second implementation
     of this band would be caught here even if it never touches the venue-pick cluster this script already
     checks.
  5. Verified live via the corrected `?task=sellreal` harness (two INDEPENDENT runOneBox calls, not one
     value read twice) for all five named cars:
     - 1969 Camaro Z28: before $60,000-$155,000/83 sales -> after $68,000-$84,500/15 sales, exact match to
       Market Check's own cluster ($68,000-$84,500/15, "last twelve months"). sameAsMarketCheck:true.
     - 1988 BMW M3: after $61,000-$86,500/30 sales, exact match to Market Check. sameAsMarketCheck:true.
     - 1985 Toyota Land Cruiser: after $21,500-$35,500/54 sales, exact match to Market Check.
       sameAsMarketCheck:true.
     - 1964 Shelby Cobra: before $72,500-$84,500 (priceBandForVehicle's own fabricated spread) -> after NO
       range at all (liveSellAskingLineBand:null), matching Market Check's own "thin" tier (cluster:null).
     - 1961 Jaguar E-Type Roadster: before $30,000-$118,500 -> after NO range at all, matching Market
       Check's "thin" tier.
  Pushed, pulled/rebased clean before push, searchCheck.js shows the same known Attack-Challenge-Mode 429
  pattern on /buy /tasks /market-check /business (curl-only false positive, browsers get 200 - see
  [[smoke-429-attack-challenge]]), /sell confirmed 200 three times post-push.
  Search check: no public page title/H1/canonical/address touched; this changes a number inside an existing
  /sell result sentence only.
- 2026-10-09 (Lane A): Market read card (commit e837961, js/onebox.js + onebox.html).
  Built the card exactly as specified: paper surface/radius/padding matching the range card above it,
  yoyDirection.sentence as the lead (no repeated band lines - those were on the old standalone block,
  removed), four quarter rows with bars on the SAME price scale as the range card's rangebar (d.span lo/hi),
  sage (--chip) bars with the newest quarter in dark green (--green) when it has one, a thin quarter reads
  "Not enough sales" in grey with no bar and is not a button. Verified live on all three named cars
  (screenshots this session, not committed) at 1440 and 390 with a quarter row opened.
  CLICK TO OPEN NOW WORKS: Lane B's fix (ab02006, "sales belong to the quarter WITH a band") landed and is
  confirmed live - every banded quarter on all three cars carries its own sales (M3: 21/23/15 cards on its
  three banded quarters; 911: 16/20/11; Camaro has zero banded quarters so nothing to open there). Wired per
  Sam's direction 3.
  SET ASIDE PILL (Sam's direction 2): no longer a second list - scrolls to the existing "Shown separately"
  section (now carries id="shown-separately") and its digit count is that section's own filtered list length
  (asideCards minus the exact-car's own url, the same filter shownSeparatelyHtml already applies), so the
  pill and the section can never disagree. "Digits not words": setAsideCount/didNotSellCount word-ify counts
  under ten for prose (countWord, lib/onebox.js); the pill reverses that (digitOf()) since this UI explicitly
  wants "4" not "four" - same fact, no recompute, just a different print.
  DIDN'T SELL PILL - HELD BACK, QUESTION FOR LANE B: the response carries no window for didNotSellCount at
  all (no sinceForExtras or equivalent field is returned), so per Sam's fallback rule ("hide it if the window
  cannot be determined") it does not render. Raw numbers for the three test cars, soldCount (the engine's
  stated "last twelve months" window) vs didNotSellCount and the OBSERVED date range of didNotSellRows itself
  (computed client-side from the rows returned, NOT an engine-stated window - included only as supporting
  evidence, not trusted as the true scope):
    Camaro: soldCount 15 (last twelve months) vs didNotSellCount 111, rows span 2025-11-05 to 2026-09-25
    M3:     soldCount 89 (last twelve months) vs didNotSellCount 53,  rows span 2025-10-13 to 2026-09-27
    911:    soldCount 72 (last twelve months) vs didNotSellCount 135, rows span 2025-10-12 to 2026-09-28
  All three row-date-ranges land close to ~11-12 months, i.e. roughly comparable in LENGTH to soldCount's own
  window - so this may not be a wider-window bug at all. The Camaro's 111-vs-15 ratio (88% of attempts never
  sold) and the 911's 135-vs-72 (65%) still read as surprisingly high reserve-not-met rates for these models;
  worth Lane B confirming whether didNotSellForSpec's spec/fence scoping genuinely matches soldCount's (same
  trim/body/generation filters) or is coarser (e.g. make+model only, pulling in a wider trim set of
  attempts than the sold side's trim-scoped pool). FOR LANE B: if didNotSellCount's window matches soldCount
  exactly, the cleanest fix is returning that window's actual start date (or just windowLabel) on the
  didNotSellCount field's sibling so this pill can show "N didn't sell" plainly instead of staying hidden.
  TRANSIENT 500 - EXACT TIMESTAMP (Sam's follow-up ask, precise version): the broken deployment built from
  commit d0371668b374ab9ea128fa00fc774a2e30bc42e1 ("Messages from GoAskSam..."), pushed 2026-10-09 10:11:33
  -0700 (17:11:33 UTC). My own concurrent push, cef1701da083c6c1502033d614be750776de8ba8, landed 4 seconds
  earlier (10:11:29 -0700 / 17:11:29 UTC) - both are in that deployment per `vercel inspect <url> --logs`
  ("Commit: d037166"). All five pages (/sell /buy /tasks /market-check /business) returned a genuine Vercel
  500 (confirmed via the actual error page body in a real Puppeteer browser, not the Attack Challenge) for
  roughly one to two minutes starting shortly after that deploy finished (~17:12:00-17:12:30 UTC, based on
  the build log's ~15-20s deploy duration). The next deployment, built from commit
  602631716c3e2b1e838b98d0df44e46f600874b9 ("Update nightly.yml", pushed 10:13:08 -0700 / 17:13:08 UTC - a
  workflow-file-only change with zero app-code diff from d037166), served 200 again by the time I re-checked
  (~17:13:30-17:14:00 UTC) and every page has been clean since. Lane B already tried to pull Vercel's own
  runtime logs for this window and could not retrieve them (retention had rolled past) - noted here in case
  the more precise window above helps a second look, but nothing currently reproduces.
  Baseline: /sell /buy /tasks /market-check /business all 200 signed out.
  Search check: no title/H1/canonical/address change; card is inside the existing results view only.
- 2026-10-09 (Lane C): BUY HERO PLACEHOLDER (bf53c04). lib/live/buyLanding.js PLACEHOLDERS, Sam's eight lines in his
  order; the box opens on the first and rotates every 3.2s until focused (never under reduced motion). Each run
  through the live search before shipping (live count Oct 9): Porsche 911 under $100,000: 55; manual Ferrari
  575M: 1; black BMW M3 under 50,000 miles: 1; cars under $40,000 near Chicago: 213 (asks "What sort of car?");
  1967 Ford Mustang Fastback: 1; Corvette Z06 2015 to 2019 ending this week: 3; air-cooled Porsche 911 targa: 4;
  cheap Mazda Miata: 7. FIXED to get there (lib/live/search.js, lib/live/samChat.js, Buy client): a tool range
  with one bound stays open ("up to 1998" was read as 1998 only); a hyphenated model matches its squashed title
  ("MX-5": every live Miata was being dropped as "model word not in title"); "Fastback" is read as the title
  word (trim) so it is never a notchback coupe; "ending this week/today/in N days" is a filter (ends_within_days,
  address key ends). FOR LANE B: lib/vehicle.js (and onebox.js body families) file "fastback" under coupe; for a
  1965 to 1968 Mustang that pools fastbacks with hardtop coupes. Buy reads the word as a title word instead; the
  engine's own body family is unchanged.
- 2026-10-09 (Lane C): POLICY "SEARCH IS OPEN, PERSONALISATION IS SIGNED IN", STEP 1 FACTS (Buy and Sell; Lane A
  reports Market Check, Lane B tracking). Nothing changed. STOPPED AFTER STEP 1: point 6 found spend risks.
  1. BUY: no rate limit or quota on Buy search today (api/buySearch.js plain search, rerun, parse: no IP ledger,
     no 429; the 60/hour per address is OLD /sell's, not Buy's). Only limit: chat TURN_CAP 30 (lib/live/chatHttp.js),
     counted from the client's own `turns`, so not a real per-visitor limit. No limit message exists on Buy.
     "Free · No account needed" (lib/live/buyLanding.js) is accurate: no Buy result needs an account. Sign-in is
     asked only for: Before it ends ("Sign in and Sam will tell you before this auction ends."), watches ("Sign in
     to keep a watch. Free. No card, no plan."), saved searches ("Sign in to save your searches.").
  3. SELL (live /sell = index.html + api/sellerDecision.js computeSearchGate): crew bypass; 60 per address per
     hour for everyone (ip_cap_all_hour); tester 10/day; once-pass 3; signed in: reserve_search RPC with
     rate_limits.daily_searches free 1, tdv 3 (Daily Vroom tier from Beehiiv, api/account.js + lib/_beehiiv.js,
     rechecked every 7 days); guest30 30 lifetime; signed out: 20 per address per UTC day, the first search free
     then cookie gas_free_used -> "account_required" wall. Copy: js/auth.js:505 "Your first one's on me. Create a
     free account for a search every day. Daily Vroom readers get three, so if you want more, subscribe free with
     the same email." and :514 "That first search was on me. Create a free account for a search every day. Daily
     Vroom readers get three...", plus walls :480 :482 :487 :544 :548 and the upfront gate gateCheckUpfront.
     Model calls: api/chat.js (old /sell narration and free text), api/vehicleIdentity.js llmExtractVehicle (only
     when the resolver fails; cached), new Sell follow-up (sellChat step ask, action chat). Engine-only:
     sellerDecision decision, new Sell result (buildResult, archive/store only). The new Sell (api/sellNext.js,
     sellChat) has no gate at all and is switched off for the public (SELL_NEXT_ON).
  4. SIGN IN BEFORE A RESULT: only old /sell (the second signed-out search: account_required wall, or upfront).
     Not Buy, not Tasks results, not Market Check (its oneBox branch returns before the gate).
  5. SHARED ADDRESSES: per address only (first x-forwarded-for entry), table ip_rate_hits, fail-open. 20 signed-out
     searches per address per UTC day and 60 per hour for everyone are SHARED by an office NAT or a mobile carrier
     (CGNAT): normal people will hit them. Market Check's 40/day is per client-sent anonId (resettable).
  6. COST, every public path: Buy search/rerun/parse/enrich: archive and live_listings only, zero metered calls.
     Buy chat: a model call every turn, no server limit. Buy detail freshBid: can meter one upstream call, OFF
     unless LIVE_FRESHNESS=1. Market Check / Buy drawer (oneBox): archive only. New Sell result: archive/store only.
     OLD /sell sellerDecision: CAN METER the paid source on a cache miss (cache first; guards: daily 33, monthly
     1000, sell reserve 450, ocd header floor, blind-meter fail-closed, signed-out capacity floor). SPEND RISKS:
     (a) unauthenticated request flags in sellerDecision skip the gate and can meter: bypassCache (also skips the
     per-search cap), warm, rerun, poolDiag, backfillCount; only lib/_ocd.js's 2500/day and monthly reserve stop
     them. (b) api/chat.js is an open model endpoint: no limit, any client-sent system prompt. (c) Buy chat: model
     per turn, client-held turn cap only. (d) Opening old /sell to unlimited signed-out searches multiplies its
     cache misses. PROPOSAL (for Sam, nothing done): lock bypassCache/warm/rerun/poolDiag/backfillCount behind the
     probe key or cron secret (Lane B, sellerDecision); public Sell answers cache/store first with NO metered fetch
     for signed-out visitors (the new Sell result path is already archive only), metered fetch only signed in and
     under a lower live ceiling (e.g. a global daily signed-out live cap of 0, signed-in cap within the existing 33);
     api/chat.js: server-held prompts only plus an invisible per address and per device limit; Buy chat: a server
     side per address and per device turn ceiling with the calm message; replace per-address-only limits with
     address plus device (first-party id) ceilings sized for shared addresses.
- 2026-10-09 (Lane A): POLICY "SEARCH IS OPEN, PERSONALISATION IS SIGNED IN", STEP 1 FACTS, Market Check.
  2. MARKET CHECK: a separate, lightweight cap exists - never shares Sell's limiter. api/sellerDecision.js's
     oneBox branch (req.body?.oneBox, line ~3485) counts funnel_events rows (event=onebox_search) by a
     CLIENT-SUPPLIED anonId/anonSessionId (js/onebox.js persists one in localStorage, key gas_ob_anon - not a
     server-issued or signed token), against app_config key onebox_daily_cap (default 40/day, read via
     appConfigInt). If anonId is omitted, or the Supabase count read errors, the check is skipped entirely
     (fail-open, "never block a real lookup on a count error") and the search runs uncapped; sending a fresh
     string (or clearing localStorage) resets it trivially - this is not a real per-visitor limit, same
     character as Buy's chat turn cap Lane C flagged. Separate from /sell's limiter in every respect: different
     table (funnel_events vs ip_rate_hits/reserve_search/gas_free_used), different config, computeSearchGate
     (sell's gate function) is never reached on a oneBox request (the branch returns before it).
     COST: the oneBox branch makes ZERO OldCarsData calls on any path, cached or not - it is archive-only
     (Supabase sales_archive/auction_attempts only; confirmed no import of lib/_ocd.js's callOldCarsData
     anywhere in lib/onebox.js). The one upstream fallback in the chain - lib/vehicle.js resolveVehicle's
     taxonomy loader, used to parse the typed car name before oneBox runs - CAN call OldCarsData's /makes and
     /models endpoints when Supabase's taxonomy tables come back empty, but those two endpoints are explicitly
     UNMETERED (lib/_ocd.js: "const metered = path.startsWith('/auctions')... /makes, /models are free and
     uncapped") and are 10-minute in-process cached regardless. VIN decode (api/vehicleIdentity.js) uses only
     vPIC (free, government) and the Supabase archive match - no OldCarsData reference anywhere in that file
     or in lib/_flags.js's findVinArchiveMatch. POINT 6 CONCLUSION FOR MARKET CHECK: no spend risk on any
     Market Check path, cached or uncached - safe to proceed straight to Step 2 for this lane without waiting,
     per the "unless point 6 found a spend risk" clause. (Lane C found real spend risk in /sell and stopped
     there - that finding does not implicate Market Check, a structurally separate, archive-only path.)
  4. SIGN IN BEFORE A RESULT: none on Market Check. No auth check anywhere in api/marketCheck.js (the page
     shell), the oneBox branch of api/sellerDecision.js, or api/buySearch.js's ?panel=1 live-listing handler
     (the only auth check in that file gates "Your searches"/watch actions, not result display). The only
     sign-in prompt anywhere in js/onebox.js is the watch control ("Sign in to keep a watch. Free. No card, no
     plan.", js/onebox.js:2032) - a feature gate, not a result gate.
  6 (copy audit): no proactive limit/quota/sign-in/counter copy exists on the Market Check landing
    (lib/live/marketCheckLanding.js - zero matches for limit/quota/free search/sign in/counter) or in
    js/onebox.js outside the rate_limited error line itself (shown only AFTER the cap is hit, reactive, never
    proactive): "That's a lot of lookups for one day. Come back tomorrow and I'll keep pulling real sales for
    you." (api/sellerDecision.js:3523, with a client-side fallback copy of the same line in js/onebox.js).
  STEP 2 (this round, commit pending): nothing to REMOVE on Market Check (no sign-in/quota language exists to
  strip - confirmed above); the watch control's sign-in line already explains its reason correctly and needed
  no change. Added: open-to-use/sign-in-to-keep framing is now explicit on the Market Check landing (see
  below). FOR LANE C: Sam's instruction places "make the Buy and Sell front doors say the same thing in the
  same style" under Lane A's heading, but Buy's and Sell's front-door templates are Lane C's files
  (lib/live/buyLanding.js, index.html/api/sellPage.js) - rather than edit them directly, the exact line added
  to Market Check's own hero (below) is handed off here for Lane C to match verbatim or adapt to each page's
  existing voice, your call on exact placement.

- 2026-10-09 (Lane B -> Lane A): ANSWER to the didNotSellForSpec question above. Confirmed the cause:
  `didNotSellForSpec` (lib/onebox.js:3569) filters `auction_attempts` on make (ilike), model (ilike,
  OR'd with genCode when present) and year range ONLY - no trim, no body style, no specials/project/
  race-car fence. The sold side (`spec`/`isQualifying`/`qualifyReason`, used to build the pool
  `soldCount` describes) applies all of those. So for a spec with a named trim (the Camaro Z28 case),
  didNotSellCount is counting EVERY Camaro attempt in the year window, not just Z28 attempts - not
  apples-to-apples with soldCount, exactly as suspected. The 88%/65% ratios are real but mean "how many
  Camaros/911s of any trim didn't sell vs. how many Z28s/this-spec sold," not a same-car reserve-not-met
  rate. Holding the pill back was the right call; showing it next to soldCount as-is would be a real
  rule-25-style mismatched-pool problem even with a window label added. PROPOSED FIX (not implemented
  this round - flagging direction, not claiming done): add the same trim/body/fence filters `spec`
  already carries to `didNotSellForSpec`'s query (title ilike on spec.trim when present, the same
  specials/race fence lib/_classify.js already centralizes, a body filter when spec.bodyStyle is set) so
  both sides are scoped identically, THEN surface the window (sinceForExtras, already computed at
  line 4142, just not returned - add it to the response alongside didNotSellCount) so the pill can render
  safely. Picking this up after the current open-search-policy round; shout if you'd rather take it since
  it's entirely inside lib/onebox.js which Lane B already owns edits to this session.

- 2026-10-09 (Lane B): STEP 2 done (commit 6607571) - pseudonymous visitor id + canonical events. Full
  writeup is in `docs/admin-analytics.md` (vocabulary table, SQL for every Stage-1 metric Sam named,
  consent-banner flag, draft Privacy paragraph) - summary here:
  - `lib/_visitor.js` `ensureVisitorId`/`readVisitorId`: random `gas_vid` cookie, ~2yr, excluded for
    crew AND for EEA/UK/Switzerland (reuses `lib/analytics.js` `GA_BLOCKED_COUNTRIES` + the same free
    `x-vercel-ip-country` header the existing GA consent check already reads - same jurisdictions, same
    mechanism, no new geo lookup). This is a technical default (no banner needed because no cookie is set
    there), not a policy decision - flagged for Sam in admin-analytics.md if he wants those visitors
    counted too (would need a banner first).
  - `lib/events.js`: `EVENTS` vocabulary + `logEvent()`/`stitchVisitorToAccount()`, writing to
    `funnel_events` (extended additively - `visitor_id`/`tool`/`props` columns, plus a new `visitor_links`
    table for the many-visitor-ids-to-one-account stitch - `docs/supabase-visitor-tracking.sql`, PENDING,
    Sam runs it once, standing rule). Every PRE-EXISTING funnel_events caller (sellerDecision.js
    `logFunnel`, account.js's old `funnel()`, the old `/api/funnel` insert) is untouched and keeps working
    - they just don't set the new columns, which default to null.
  - Wired: `api/funnel.js` (mints/stamps the visitor id on every client beacon, widened `ALLOWED` with
    the client-emittable canonical events), `api/account.js` (stitches on every ensure; logs
    `sign_in_completed` ONLY when the client sends `freshSignIn:true`), `js/auth.js` (`sign_in_started`
    beacons on both doors; `freshSignIn:true` threaded through the three real fresh-sign-in call sites -
    email-code verify, both OAuth "returned" boot paths - but NOT `gateRefreshTier`'s mid-wall tier
    refresh, which is not a sign-in).
  - NOT wired (proposed to Lane A/C in admin-analytics.md with the exact import/call pattern, their
    files): the `search` event itself and `rate_limit_hit` (api/sellerDecision.js, api/buySearch.js),
    `market_check_open`/`receipt_click`/`auction_clickout` (wherever those render/link today),
    `task_created`/`watch_created` (Tasks, /api/watch). Every SQL view in admin-analytics.md honestly
    returns 0/empty against `search` rows until one of these lands - not wrong numbers, just not real
    traffic yet.
  - Admin dashboard PAGES (Supabase-auth + admin_users allowlist, dark-rail shell, Overview/Journeys/
    Settings UI) are NOT built this round - scoped this round to the data layer (visitor id + events +
    the SQL that answers every metric) so each piece could be verified before building UI on top of it.
    Flagging this as a deliberate scope cut, not an oversight - say the word if the UI should be next.
  VERIFIED LIVE (real Chrome via puppeteer-core, not curl - curl hits the same documented Attack
  Challenge Mode 429 on these paths, confirmed again this round): `/market-check` `/buy` `/sell` all 200,
  zero console errors from the js/auth.js edit. A client `POST /api/funnel` with a canonical event
  (`cross_product_move`) returned 204 and minted `gas_vid` correctly in the response cookie. NOT verified
  end-to-end: the sign-in stitch and `sign_in_completed` logging (no disposable test account available
  this session) - same honesty standard as other unverified-live items this session, not claiming more
  than was actually checked. Both are also no-ops until Sam runs `docs/supabase-visitor-tracking.sql`
  (every new-column write is wrapped in try/catch, so this degrades to silent no-op, never an error, same
  standing pattern as every other pending-DDL feature in this codebase).
  Pulled/rebased clean before push (no collisions this round - `git status --short` showed exactly my 7
  intended files both before staging and after commit). `searchCheck.js` shows the same known 7/9
  Attack-Challenge 429 pattern (not a regression - confirmed via the real-Chrome check above instead).
  `crossProductCheck.js` could not run locally (Supabase secrets don't pull locally, standing limitation)
  - no engine/pool/resolver code touched this round, so no reason to expect any change in its mismatches
  either way; next nightly run will show it either way.
  Search check: no public page title/H1/canonical/lead/address touched - this round is cookie + event-
  logging plumbing only, zero visible copy change anywhere.
- 2026-10-09 (Lane B, REPORT ONLY, for Sam/Claude to check against the plan - read-only, nothing changed,
  everything below re-verified against the actual code and one live engine call just now, not from memory).

  1. VISITOR ID. `lib/_visitor.js` `ensureVisitorId(req, res)` mints it; `readVisitorId(req)` reads it without
     minting. Stored as a first-party cookie, name `gas_vid`, `Max-Age` ~730 days (2 years), `Path=/;
     SameSite=Lax; Secure`, not HttpOnly (matches every other `gas_*` cookie in this codebase). Value is
     `crypto.randomUUID()` (fallback: timestamp + `Math.random()` string if `randomUUID` is unavailable) -
     opaque, no email, no typed text, no personal data of any kind. Confirmed skipped for crew: line 41,
     `if (cookies.gas_crew === "ok") return null` - a crew cookie means no `gas_vid` is ever minted or read.
     Also skipped for the EEA/UK/Switzerland (same list `lib/analytics.js GA_BLOCKED_COUNTRIES` already
     uses for the GA tag, read via the free `x-vercel-ip-country` header) - no cookie, no cost, same honest
     non-coverage as the GA numbers already have for that traffic.
     ONE THING TO FLAG, verified just now rather than assumed: `ensureVisitorId` (the only function that can
     actually MINT the cookie) is called from exactly one place, `api/funnel.js` line 85, inside its
     client-event beacon handler. `api/account.js` only ever calls `readVisitorId` (read-only, never mints).
     The only automatic page-load beacon, `gasFunnelOnce("homepage_view")`, fires inside `authBoot()`
     (`js/auth.js` line 324) - the FULL wizard boot, used only by the old `/sell` page. Market Check, Buy,
     Tasks and the Sell landing all boot through `authBootTopbarOnly()` (added by Lane A's shared top-bar
     work) which explicitly skips that beacon (comment at line ~675: "no homepage_view funnel event, which
     would otherwise mislabel every page's first load"). So on those four pages, `gas_vid` is NOT minted on
     page load - only once some other beacon fires. In practice the first beacon that fires on nearly every
     page is `gasFunnel("signup_shown")` inside `openSignInCard()` (`js/auth.js` line 244, the shared
     sign-in card, used everywhere), so a visitor who never opens the sign-in card and never does anything
     else that beacons today (Market Check's own `js/onebox.js` never calls `gasFunnel` at all - confirmed
     by grep, zero matches) gets no visitor id at all yet. Not a bug in what I built; a direct consequence
     of `market_check_open`/`search` not being wired into any page yet (see point 3).

  2. STITCHING. `api/account.js` line 191-194: on every `/api/account` ensure (not just a fresh sign-in),
     `readVisitorId(req)` reads the cookie and `stitchVisitorToAccount(env, visitorId, auth.userId)`
     (`lib/events.js`) upserts it into a NEW table, `visitor_links` (`visitor_id` primary key, `user_id`,
     `first_seen_at`, `linked_at`; `docs/supabase-visitor-tracking.sql`, Sam runs this once, standing rule -
     not yet applied, so every write degrades to a silent no-op until then). RLS: `alter table
     visitor_links enable row level security; revoke all on visitor_links from anon, authenticated;` - locked
     down from creation per the standing DB security rule, confirmed in the SQL file itself. The upsert is
     `on_conflict=visitor_id` with `resolution=merge-duplicates` - last-write-wins if the same cookie later
     links to a different account (a shared device), which also means admin reads (a join against this
     table's CURRENT state) attribute all of that visitor_id's history to whichever account it points to
     NOW, not at query time historically - flagged as a Stage-1 simplification in the file's own comment,
     not a bug.
     Does earlier anonymous history stay attached? Mechanically yes - any `funnel_events` row carrying that
     same `visitor_id` is picked up by every admin query that joins on it (point 5's SQL), regardless of
     when it was written relative to `linked_at`. HONEST CAVEAT: today almost nothing populates `visitor_id`
     except the handful of events already wired (point 3), so there is very little real "anonymous history"
     to actually demonstrate yet - the plumbing is correct and would carry forward any future event the
     moment it starts carrying a visitor_id, but it is not yet proven end to end with a real account (no
     disposable test account was available this session, noted honestly in the prior round's report too).

  3. EVENTS. Full list in `lib/events.js` `EVENTS`: `search`, `cross_product_move`, `market_check_open`,
     `receipt_click`, `auction_clickout`, `task_created`, `watch_created`, `sell_followup_gated`,
     `sign_in_started`, `sign_in_completed`, `rate_limit_hit` - all 11 of the ones Sam named exist by name.
     Which actually fire today, checked by grep for real call sites (not just being in the client-allowed
     list):
       - `sign_in_started`: WIRED, `js/auth.js` (`authSignInGoogle`, `authSignInEmail`), fires on both doors.
       - `sign_in_completed`: WIRED, `api/account.js`, only when the client sends `freshSignIn:true` (set by
         `js/auth.js` on the three real fresh-sign-in call sites, never on a routine tier-refresh boot).
       - `search`: NOT WIRED anywhere (zero call sites in api/buySearch.js, api/sellerDecision.js, or
         anywhere else) - every search-volume view in point 5 that depends on it reads zero today, honestly.
       - `market_check_open`, `cross_product_move`, `receipt_click`, `auction_clickout`, `task_created`,
         `watch_created`: NOT WIRED - these are in `api/funnel.js`'s client-ALLOWED set (so a page COULD
         send them) but no page actually calls `gasFunnel` with any of these names yet (confirmed by grep
         across js/). Proposed call patterns and owning lane are in `docs/admin-analytics.md`.
       - `sell_followup_gated`: NOT wired as of my last commit, but IS being wired right now in Lane C's
         in-progress, UNCOMMITTED work I can see sitting in the shared working tree as of this report
         (`api/chat.js` line 92, `lib/_ceilings.js` new file) - correctly importing `logEvent`/`EVENTS` from
         my file. Flagging as "in progress elsewhere, uncommitted" rather than claiming it as shipped; I did
         not touch or read further into those files, since they are not mine and still mid-edit.
       - `rate_limit_hit`: same situation - `lib/_ceilings.js` (uncommitted, Lane C's file) already imports
         `logEvent`/`EVENTS.RATE_LIMIT_HIT` from `lib/events.js` with `props:{kind, scope}`. Not committed
         as of this report, so not counted as wired in the summary above.
     Nothing is missing by NAME; the gap is entirely in which lanes have wired their own fire points, which
     was always proposed-to-the-owning-lane, not mine to do (api/buySearch.js, api/sellerDecision.js,
     js/onebox.js, api/tasksPage.js, api/watch.js are not my files).

  4. FIRST TOUCH. `js/auth.js` `gasCaptureTouch()`/`gasClassifySource()` (lines 364-389) read `utm_source`/
     `utm_medium`/`utm_campaign` + `document.referrer` and write `localStorage.gas_first_touch` /
     `gas_last_touch`, classified (Direct/Organic/Social/Referral/named-source/"The Daily Vroom"). This runs
     UNCONDITIONALLY at script parse time (line 400, top-level, not inside either boot function) - so it
     fires on every page that loads `js/auth.js`, topbar-only pages included. Confirmed this is REAL, broad
     capture, not just a doc claim.
     HONEST GAP: `gasAttribution()` (the function that reads those two localStorage keys back out) is only
     ever called from ONE place in the whole codebase - `gasJourneyEvent` (line 411), Sell's own per-vehicle
     "business journey" beacon (a different payload shape, `kind:"journey"`, writing to the separate
     `journeys` table, not `funnel_events`). First touch is captured broadly but attached to NOTHING in the
     canonical pipeline today - not to `visitor_id`, not to `visitor_links`, not to any `logEvent` call, not
     to the account. It is real and reusable (the data is sitting in localStorage on most pages right now),
     but "attached to the visitor and later the account" is a proposal in `docs/admin-analytics.md`, not a
     shipped fact - correcting my own earlier phrasing if it read as more finished than it is.

  5. VIEWS. All the SQL lives in `docs/admin-analytics.md`, reading `funnel_events` (+ `visitor_links` for
     the anon->account join) - none of it is wired into an actual admin PAGE yet (that UI is explicitly the
     next step, not built this round). What each would return RIGHT NOW if run, checked against point 3's
     wiring, not assumed:
       - Unique/returning visitors: SOME real rows (any event with a non-null `visitor_id` counts, and
         `sign_in_started`/`sign_in_completed` do carry one) - a real but heavily undercounted number, since
         most visits never trigger any wired event yet.
       - Searches per visitor, searches by tool, cross-product usage, "3+ searches before signing in": all
         filter on `event='search'` - zero rows, honestly, until that event is wired.
       - 7-day/30-day repeat rate: partially real (uses `first_seen`/any later event on the same visitor_id,
         not search-specific) but same undercounting as unique visitors.
       - Market Check opens, receipt clicks, auction clickouts, tasks created: zero - none of those events
         fire yet.
       - Anonymous -> registered conversion: CAN be real today - it only needs a `visitor_links` row plus
         any earlier `funnel_events` row on that visitor_id (e.g. `signup_shown`/`sign_in_started` logged
         before the account existed), both of which already happen on a real sign-in.
       - Best acquisition sources: the query is written but reads `props->>'source'` off `sign_in_completed`
         - and `api/account.js`'s actual `logEvent` call for `sign_in_completed` does NOT pass `props` at
         all today (checked the call site directly: `{event: EVENTS.SIGN_IN_COMPLETED, userId, visitorId}`,
         no `props`). This view returns zero/null-grouped rows until that gap is closed - flagging
         precisely rather than leaving it to be discovered later. Small fix (pass `props:{source:
         gasAttribution().first?.source}` at that call site) but not made this round - report only.
     In short: the SCHEMA and SQL are ready for all eleven; the DATA exists today only for sign-in-adjacent
     activity and the anon->account bridge, because `search` (the one event nearly every other view depends
     on) is still unwired, by design - it was proposed to Lane A/C, not built here.

  6. CONSENT. The in-house visitor id sits in the same EU ePrivacy/UK PECR gray area as any persistent
     first-party identifier used for analytics - some readings treat a strictly-necessary/security use as
     exempt, others treat any non-essential persistent id as needing consent regardless of whether the data
     itself is personal. GoAskSam's GA4 tag resolves the equivalent question today by simply never loading
     for the EEA, UK or Switzerland: `api/gaConsent.js` returns `{load:false}` for crew and for those
     countries (checked via the free `x-vercel-ip-country` header), and `lib/analytics.js` `gaBootstrapHtml()`
     never even creates the `<script src=".../gtag/js">` tag unless that check says `load:true` - there is
     no consent-mode fallback, no reduced tag, nothing loads at all for that traffic today. The new visitor
     id applies the exact same default (`ensureVisitorId` returns `null`, mints no cookie, for the same
     country list) - a technical default matching the existing GA behavior, not a policy decision Sam has
     made. Needs a real decision before EEA/UK/CH traffic is ever counted: either a consent banner, or a
     legitimate-interest/strictly-necessary case Sam is comfortable standing behind. Not shipped either way.

     Draft Privacy page paragraph (for approval, not on any live page, no dashes, no other tool named):

     > How we measure usage. GoAskSam sets a random, anonymous identifier in your browser, not tied to your
     > name or email, so we can tell how many people use the site and which features are useful, and to
     > keep search fair for everyone. It never leaves our systems, is never sold or shared, and never
     > follows you to other websites. If you create an account, this identifier is linked to it so your
     > search history carries over between devices. You can ask us to delete it at any time. We do not set
     > this identifier for visitors in the EU, UK or Switzerland at this time.

  7. THE FASTBACK MISMATCH. Tested live just now rather than relying on the comment in `samChat.js`, because
     static reading of `lib/vehicle.js` did not match what the engine actually does - worth stating plainly
     since it corrects the premise in how this was described to me.
     VERIFIED (via the read-only `?task=obdiag` probe against the live engine): for "1967 Ford Mustang
     Fastback", `resolveVehicle` (`lib/vehicle.js`) does NOT set `bodyStyle` to "coupe". It sets neither a
     body style nor a trim - the word "fastback" is in `BODY_STYLE_ENUM_WORDS` (line 58), which is consulted
     only to EXCLUDE "fastback" from being captured as a generic leftover trim token (lines 489, 2190); it
     is NOT in `BODY_STYLE_WORDS` (line 113), the shorter list `extractBodyStyle` actually uses to set
     `bodyStyle`. So resolveVehicle hands back `{bodyStyle: null, trim: null}` for this query, confirmed by
     the probe's own output. The literal "fastback" -> "coupe" mapping that DOES exist in `lib/vehicle.js`
     (line 686, inside `bodyStyleFromVpic`) only fires when decoding a VIN's vPIC BodyClass string - a
     completely different code path from a typed query, never reached here.
     What actually happens in each product, confirmed live:
       - MARKET CHECK (`lib/onebox.js` `runOneBox`): does its own INDEPENDENT rescan of the raw search text
         (separate from resolveVehicle's output - the same mechanism already noted in the file at line 1041
         for "Targa"), and sets its internal `poolTrim` to "Fastback" directly. Live result: 41 matching
         sales, generation-bound 1965-1971, cluster $41,000-$66,500, every sampled title containing the
         literal word "Fastback" - correctly fastback-only, no hardtops mixed in.
       - BUY (`lib/live/samChat.js` line 248): intercepts the word "fastback" in the chat text BEFORE the
         search runs, explicitly sets `filters.trim = "Fastback"` and drops any `body` filter the upstream
         parser had set - reaching the same semantic scope as Market Check by its own, separate, hand-written
         regex rather than by calling into the same mechanism Market Check uses.
       - SELL, the part that actually drives the live page's venue pick and evidence-count tile (`analyze()`/
         `decide()` in `api/sellerDecision.js`, NOT `runOneBox` - this round's ONE RANGE fix only moved the
         asking-line SENTENCE to `runOneBox`, not the venue pick): tested live via `?task=sellreal` for the
         same exact query. It lands on `ladderLanded: "exact_year_trim"` with only 3 total evidence sales
         (priced sample of 2, band $47,000-$76,067) - a radically thinner, differently-priced pool than
         Market Check's 41. This is the real disagreement: not a body-style miscategorization, but Sell's
         legacy venue-pick ladder reading a far smaller pool for the identical car than the shared engine
         does, because it has no equivalent of either Market Check's rescan or Buy's regex carve-out of its
         own - its own classifier (`lib/_classify.js`) is matching "Fastback" some narrower way that neither
         of the other two paths uses. (This number itself has moved before: an earlier `sellerDecision.js`
         comment, line 613, records a prior state of this same car at 25+3=28 total sales under a different
         venue-pick audit - the legacy ladder's count for this car has not been stable across rounds, which
         is itself evidence it is not reading the same thing runOneBox reads.)
     PROPOSED FIX (not implemented, per the instruction) - and adjusted from how the question named it,
     since resolveVehicle is not actually where the three disagree: the one change that would make all three
     agree, placed in `resolveVehicle` as asked, is to stop EXCLUDING "fastback" from the trim-token
     extractor and instead let it become `vehicle.trim = "Fastback"` directly in the shared resolver (a
     small, explicit exception alongside the existing `isBodyStyleWord` exclusion, scoped to this one word
     per the ask - not a general reopening of body-style-as-trim). That would give every downstream
     consumer - Market Check's `runOneBox`, Buy's `samChat.js` (whose own regex carve-out could then be
     deleted as redundant), and Sell's `analyze()`/`decide()` ladder (which has no carve-out of its own
     today and is the one actually disagreeing) - the SAME resolved `vehicle.trim` to match against, instead
     of three independent, differently-scoped guesses at the same word. Not implemented this round.
- 2026-10-09 (Lane C): OPEN-SEARCH POLICY, PART 1 (SPEND PROTECTION).
  * lib/_credential.js hasServerCredential(req): the ONE "this is us" check. x-probe-key / x-ops-key header
    (PROBE_KEY, OPS_KEY) or Authorization: Bearer CRON_SECRET. Never the address or the body. Keys from env only.
  * api/sellerDecision.js: SERVER_ONLY_FLAGS (warm, bypassCache, rerun, poolDiag, backfillCount, archiveQuery,
    oneBoxProof, titleSearch, cacheStats, reserveSim, debug) are deleted from the body at the top of the handler
    unless credentialed; a public request then runs as an ordinary search. Public on purpose (each only reduces
    spend): archiveOnly, ladderPreview, priceProbe, oneBox. CALLERS: scripts/warm.js (nightly warm; WARM_OCD is
    off) and scripts/smokeProd.js and scripts/engineCheck.js now send x-probe-key from PROBE_KEY. The dev probe
    scripts using archiveQuery (probeBatQuarters, probePoolDiag, probeDeskPool, probeR, probeYearCounts,
    probeChecks, probeCountRetry, probeOnline, probeSample, hvt100) need the header too when next run.
    crossProductCheck and the ops tasks import the engine directly (unaffected).
  * SIGNED OUT NEVER METERS: meterAllowed = credential or crew or a verified signed-in session; anyone else is
    answered by the existing archiveOnly path (fetchRecordsFromStore, cacheStatus "public_store"), transmission
    refinements included. The daily circuit breaker (OCD_DAILY_REQUEST_BUDGET, monthly, OCD header, sell
    reserve) now applies to every metered fetch except a credentialed measurement (refinements were exempt);
    trips log ocd_budget_guard and show in /api/usageDashboard?view=ops&task=ocdmeter "breaker". Buy's one
    metered call (detail freshBid) is credential only.
  * api/chat.js: prompts held server side (read from js/chat-core.js SYS and js/wizard.js SELL_SYS, vercel.json
    includeFiles); the page sends mode "assist" (open) or "followup" (gated). A made-up prompt is refused; our own
    jobs may send one with the credential (smoke). Caps: 12 turns, 2,000 characters a message, 12,000 in all,
    20,000 of result facts, 700 tokens out. lib/_ceilings.js followupGuard is the ONE gate for live /sell's
    follow-up AND the new Sell's ask/chat (api/sellChat.js): verified session, ceiling, daily allowance per
    account (free 40, Daily Vroom 80), logs sell_followup_gated.
  * lib/_ceilings.js checkCeiling: the ONE invisible ceiling for Buy (search, chat, rerun, converse) and both Sells
    (sellerDecision's gate replaces the old 60 per address per hour; api/sellChat result). Device aware: Lane B's
    gas_vid, else a cookieless address+browser stand-in; a far higher address backstop. Numbers from the last 30
    days: busiest real Buy browser 12 searches a day (p99 10); busiest non-crew Sell address about 30 a day;
    typical chatting address 7 a day. Ceilings (device hour/day, address hour/day): buy_search 150/600,
    900/4000; buy_chat 60/200, 400/1500; sell_search 60/300, 400/2000; sell_chat 40/150, 300/1200; sell_assist
    20/60, 200/800. Hits log rate_limit_hit and show a calm line, never a sign in demand. Test with a credentialed
    request plus x-ceiling-test: n (and x-allowance-test: n) only; production numbers are untouched.
  * CACHE QUESTION (for Sam): last 7 days of /sell searches: 88 cache hits, 30 misses, 12 served from the store
    after a rate limit; organic miss rate 23%; the misses spent 125 metered calls (74 of them for signed-out
    visitors). A miss for a car never searched before has little or nothing in the store, so a signed-in visitor
    can still get a fresher read than a signed-out one on that 23%. PROPOSAL (waiting for Sam): one cache-first
    rule for everyone (signed in or not) with a single global daily metered budget, so the answer never depends
    on sign in.
  * FOR SAM, two workflow edits (docs/nightly-workflow.yml already matches): (1) .github/workflows/nightly.yml,
    warm job env: add `PROBE_KEY: ${{ secrets.PROBE_KEY }}`; (2) the premium step: replace
    `--data-urlencode "key=${PROBE_KEY}"` with `-H "x-ops-key: ${PROBE_KEY}"`. And .github/workflows/smoke-prod.yml:
    add `PROBE_KEY: ${{ secrets.PROBE_KEY }}` to the env of both smoke steps (the chat checks need the header).
- 2026-10-09 (Lane C): OPEN-SEARCH POLICY, PART 2 (THE ACCOUNT WALL IS GONE).
  * api/sellerDecision.js computeSearchGate is now: crew skip, then lib/_ceilings.js checkCeiling (the one guard,
    shared with Buy and the new Sell), then attribution only (a verified session's account, or the tester label).
    Removed: the one free search and the gas_free_used cookie, the 20 per address per day signed-out cap, the
    reserve_search daily quota (and its release/refund), guest30 (30 lifetime), the gas_once pass, the capacity
    block, the tester 10 a day counter (it sat below the open public path; tester stays as a tier label) and a
    stale session's auth_required wall (a session that does not verify just searches as signed out).
    Dead helpers removed after a caller search: ipHitsSince, recordIpHit, kindHitsSince,
    countAllTimeSearchEvents, coarseMonthKey, clientIp, lib/_onepass.js.
  * api/account.js reports no daily allowance (dailyQuota returns nulls) and no longer makes guest30 accounts; an
    old guest30 account becomes free on its next tier check. api/crew.js: old ?guest= and ?once= links just land
    on the page and set nothing. js/auth.js: gateCheckUpfront never walls (and clears gas_free_used); every
    "first one's on me" / "a search every day" / "three a day" / "30 searches" line is gone; gateRenderStatus
    keeps only the tester line, the calm ceiling line and the lost-session line.
  * Free and Daily Vroom kept as the follow-up allowance (40 and 80 a day, lib/_ceilings.js FOLLOWUP_PER_DAY).
  * The follow-up gate is decided server side from what the request carries: a Sell chat whose context holds the
    result's facts (api/chat.js RESULT_FACTS) needs a session; a question asked mid-wizard, before a result, stays
    open (product rule 12). After sign in the question is sent again on the same car (js/entry.js
    resumePendingFollowup from gateAfterSignup).
  * Front doors: Buy keeps "Free · No account needed" and adds "Open to use. Sign in only to save a search or
    watch a car."; Sell adds "Open to use. Sign in only to ask follow-up questions about a car." (index.html,
    under "Built for enthusiast..."). Scripts bumped to js.20261009g.
