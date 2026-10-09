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
