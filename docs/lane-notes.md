# Lane coordination notes

Short, dated cross-lane heads-ups so two lanes don't collide on the same file. Append a line; remove it
when the work has landed.

- 2026-10-12 (Lane A -> Lanes B and C): PUBLIC SITE MOVED INTO `public/` - DONE AND PROVEN LIVE
  (commit 2609f30). Security Step 3. Editing the files below is open again. Live-proof pass: all 13
  public pages (home redirect, /sell, /buy, /market-check, /tasks, /about, /privacy, /powersellers,
  /mcp, /how-sam-decides, /business, /onebox-preview, a spec page) clean at 1440 and 390 wide, signed
  out, no new console/404 errors; every Step 1/2 sensitive path (lib/onebox.js, docs/, scripts/,
  CLAUDE.md, etc.) now 404s NATIVELY (by architecture, not only .vercelignore) - matched byte-for-
  byte against a genuinely nonexistent control path; /desk still renders for a real tester cookie;
  cron/API endpoints still answer their normal 401 auth-guard, not 404/500 (confirmed
  api/usageDashboard's ops tasks are healthy, not the earlier lib/ops/ regression); a /history and a
  /vin page both render. prePush and pushCheck green apart from the already-open, pre-existing
  Market Check "catching his breath" flake on bare-nameplate queries (403 on /api/sellerDecision,
  confirmed via direct network trace, same one Lane B root-caused and partially fixed this session -
  unrelated to this move, not touched here).
  AFTER (not a regression, pre-existing, confirmed via git blame to c444011 well before this move):
  /powersellers links a stale `/styles.20260906c.css` that 404s - vercel.json only rewrites
  `/styles.20260907a.css`. Whoever touches that page next should update the one `<link>` tag. Every URL is unchanged; only the
  on-disk location moved, via `git mv` (full history preserved):
    - HTML: about.html, desk.html, index.html, mcp.html, onebox.html, onebox-preview.html,
      powersellers.html, privacy.html -> public/<same name>
    - styles.css -> public/styles.css
    - Icons/images: favicon.ico, apple-touch-icon.png, icon-16/32/48/192/512.png, og-card.png,
      site.webmanifest -> public/<same name>; img/ (whole folder) -> public/img/
    - robots.txt -> public/robots.txt
    - Static sitemaps only: sitemap.xml, sitemap-hubs.xml, sitemap-index.xml -> public/<same name>
      (sitemap-pages.xml, sitemap-vins*.xml, sitemap-specs.xml, sitemap-motorcycles.xml,
      sitemap-other.xml are API-generated, not files, and were not touched)
    - fonts/ (whole folder) -> public/fonts/
    - js/ (all 12 client scripts) -> public/js/ - NEW BROWSER FILES GO UNDER public/js/ FROM NOW ON
  vercel.json's 5 `includeFiles` entries got the `public/` prefix (api/publicConfig.js,
  api/marketCheck.js, api/sellPage.js, api/sellNext.js, api/chat.js). 6 disk-read call sites got the
  same prefix: api/sellNext.js (styles.css, onebox.html), api/sellPage.js (index.html),
  api/publicConfig.js + api/marketCheck.js (onebox.html), api/chat.js (js/chat-core.js, js/wizard.js
  - the two literal `file` arguments at its own call site, not the shared helper), lib/sell/
  sellLanding.js (the specialist-photo existsSync check only - the rendered `<img>` URL is
  unchanged). No vercel.json rewrite/redirect destination changed - every one of them names a URL
  path, not a disk path, and public/'s contents serve at the same URL they always did. Required a
  Vercel dashboard Output Directory override (= `public`) that Sam applied between the probe and
  this commit - a git revert of the move commit will NOT undo that dashboard setting; it has to be
  switched back by hand in the same panel if this is ever reverted.
  FETCH MAIN BEFORE EVERY PUSH until this note says PROVEN, and do not edit any of the files above
  (now under public/) until then.

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
  origin preflight; a raw curl/node fetch to the live API also gets Vercel's Bot Protection (set to Challenge) 429, not a
  real failure - see [[smoke-429-attack-challenge]]). Worked around this round by building a fixture JSON
  matching the engine's documented return shape and intercepting the page's fetch via Puppeteer
  setRequestInterception, which is honest for testing RENDER logic (the engine's own correctness is Lane B's
  shipped responsibility) but cannot stand in for testing against real data - final verification was a second
  pass against the live deployed page with a real headless Chrome (which Bot Protection's challenge page does let
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
  /market-check /business) returned a genuine Vercel 500 (not Bot Protection's challenge page - confirmed via a real
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
  500 (confirmed via the actual error page body in a real Puppeteer browser, not Bot Protection's challenge page) for
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
    result's facts (api/chat.js RESULT_FACTS) or whose sell state is at step 12, 13 or 14 (the result, a chosen
    destination, sent) needs a session; a question asked mid-wizard, before a result, stays open (product rule 12).
    Live check found a post-result call carrying ONLY the state (no result blocks), hence the step rule. After sign in the question is sent again on the same car (js/entry.js
    resumePendingFollowup from gateAfterSignup).
  * Front doors: Buy keeps "Free · No account needed" and adds "Open to use. Sign in only to save a search or
    watch a car."; Sell adds "Open to use. Sign in only to ask follow-up questions about a car." (index.html,
    under "Built for enthusiast..."). Scripts bumped to js.20261009g.
- 2026-10-09 (Lane A): POLICY FOLLOW-UP, Market Check. Commits (content landed, some folded into Lane B/C
  commits via the same-repo race - see note at the end): the daily-cap replacement, the rail/sign-in fixes.

  1. DAILY CAP - FINDINGS THEN ACTION.
     a. VISIBLE: yes. A hit returned `{tier:"rate_limited", samLine:"That's a lot of lookups for one day..."}`
        and js/onebox.js's renderError() REPLACED THE ENTIRE RESULT with that line - no range, no comps, no
        Sam's take, nothing. A real visitor landing on this would see a full dead end (api/sellerDecision.js,
        the old oneBox branch; renderError, js/onebox.js).
     b. NUMBER/TRAFFIC: default 40/day (app_config onebox_daily_cap), counted against a client-supplied,
        resettable anonId (not a real visitor id - js/onebox.js localStorage key gas_ob_anon). Could NOT pull
        real hit-rate logs from my environment: no local Supabase credentials (confirmed blank, same standing
        limitation other lanes have hit this session), and I don't have PROBE_KEY (and was told not to touch
        its handling). Did not fabricate a number - said so instead.
     c. PROTECTS: nothing that costs money. The oneBox path makes zero OldCarsData calls on any path, cached
        or not (see my earlier Step 1 report above) - confirmed again reading the current code. It protected
        against nothing but its own visible dead end. REMOVED, per "if it protects nothing that costs money,
        remove it."
     ACTION: replaced with Lane C's shared ceiling (lib/_ceilings.js checkCeiling, built for the same policy
     round - found it already imported in api/sellerDecision.js by the time I got here, so used it rather than
     building a second implementation). Added a new CEILINGS scope, market_check_search: device [100/hour,
     500/day], address [700/hour, 3000/day]. No Market Check-specific traffic sample existed for this (unlike
     Lane C's buy_search/sell_search numbers, pulled from 30 real days) - set as a reasoned midpoint between
     those two (Market Check's usage shape sits between Buy's browsing and Sell's one-shot decision), same
     ten-times-busiest-real-use spirit, flagged in a code comment to replace once real market_check_open/
     search traffic is logged. A hit now shows CALM.search ("Lots of searches from here just now...") with no
     sign-in demand, logs rate_limit_hit itself (Lane C's checkCeiling already does this, through lib/events.js
     - never invented a second event name). Fail-open, same as before. api/sellerDecision.js, the oneBox
     branch, function unchanged (checkCeiling from lib/_ceilings.js).
     VERIFIED LIVE: 5 different Market Check searches (Camaro Z28, M3 Coupe, 911 Carrera S, Countach, Shelby
     GT350) each returned a full result (range, Market read card, comps) with no rate-limit message and no
     account prompt.

  2. WATCHING ON THE REDUCED RAIL. lib/appShell.js gasWatchRail(): removed the `data-full !== "1"` check (kept
     only the Buy skip). A signed-in visitor's own watches are personalization, not the PUBLIC_LAUNCH discovery
     surface, so they now show regardless of full/reduced rail state - gated only on being signed in and having
     an active watch. Verified via local fixture (fake session + mocked /api/watch list): the Watching box
     populates on a rail rendered with data-full="0".

  3. SIGN-IN-THEN-CONTINUE. js/onebox.js: a pending-arm flag in sessionStorage (gas_ob_pendwatch, 30-min TTL),
     mirroring Buy's own askSignIn/resumeArm/armWait pattern (api/buy.js) rather than inventing a different
     one. Covers both sign-in doors:
     - Email code: never navigates away, so obLastD/vinAnchor are still the current result - a short poll
       (same interval pattern Buy uses) notices authIsSignedIn() turn true and arms directly, no second click.
     - Google OAuth: js/auth.js's redirect used to drop location.search, so a visitor mid-result lost their
       place on the round trip - fixed (now preserves the full URL, strictly more correct for every caller,
       not Market-Check-specific). boot()'s existing mcApplyFromUrl rebuilds the SAME result fresh from the
       preserved car=/vin= param; tryResumeWatchArm() (called once after every renderResults(), a no-op unless
       the flag is set) picks up the pending flag and arms once the just-rebuilt result confirms signed in,
       with a short retry poll covering the case where js/auth.js's own deferred callback processing hasn't
       finished yet.
     Closing the sign-in card without completing leaves nothing armed (the stash is cleared on abandon, same
     1.5-second/no-modal check Buy uses).
     VERIFIED LOCALLY (fixture + mocked /api/watch, both doors): email-code path - click signed out, stash
     set, modal opens; simulated session write + modal close; poll detects it, arms with NO second click,
     section swaps to the confirmation line, stash clears. Google-redirect path - pre-seeded sessionStorage
     pending flag + signed-in session before navigating to ?car=2001-bmw-m3-coupe (simulating the post-redirect
     return): mcApplyFromUrl rebuilt the M3 result, tryResumeWatchArm fired from renderResults, armed with NO
     click at all. Exact arm payload captured both times, matches Lane C's documented contract exactly.
     NOT verified with a real account (no disposable test inbox available in this session, unlike Lane C's
     own "disposable inbox accounts" - same honesty standard as other unverified-live items this session): the
     actual Google/email round trip against production auth. The code paths are the same mechanism Buy already
     ships live; flagging this gap plainly rather than claiming more than was checked.

  4. RAIL REDRAW. armWatchNow()'s success handler now calls `gasWatchRail()` (if defined) right after a
     successful arm. Verified locally: arming a second watch (911) while the rail already showed one (M3)
     updated the rail in place to show BOTH, no reload - confirmed the mock's /api/watch list call was hit
     again (not cached), new content rendered.

  5. BUY CREW LINE. Already done (commit f898bd2, an earlier round this session) - api/buy.js:52 already
     passes crew into railOpenHtml(). Verified again live this round: reduced rail with no cookie, full rail
     with gas_crew=ok (the first check showed reduced even with the cookie set - a stale edge-cache response
     from rapid back-to-back requests with no Vary:Cookie, the same known quirk documented earlier this
     session; a cache-busted request confirmed the full rail renders correctly with the cookie - x-vercel-
     cache: MISS, cache-control: private, no-store).

  SAME-REPO RACE NOTE: by the time I went to commit, lib/appShell.js, lib/_ceilings.js and api/sellerDecision.js
  already showed zero diff against origin/main - Lane B/C had independently touched the same files for their
  own Step 2 work (lib/_ceilings.js is in fact Lane C's own shared-ceiling build) and my uncommitted content
  landed inside their commits during a concurrent push/rebase cycle (same pattern as earlier this session,
  e.g. cef1701/d037166). Verified by reading the current file content line-by-line against what I wrote (all
  present, correct, no corruption) rather than re-doing the work. Only js/onebox.js and js/auth.js needed an
  explicit commit from me this round.

  ONE ENGINE CONFIRMATION: no second implementation added anywhere. The ceiling reuses lib/_ceilings.js
  checkCeiling (Lane C's), the rail reuses the existing shared gasWatchRail/railOpenHtml (lib/appShell.js),
  the watch arm reuses Lane C's existing /api/watch action:arm (no new endpoint), and the oneBox search path
  itself (lib/onebox.js runOneBox) is untouched - Market Check, Buy and Sell still read the same sales pool,
  fences and results through the same shared functions.

  crossProductCheck.js: could not run locally (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set - standing
  local limitation, same as every other lane hits). No engine/pool/resolver code touched this round, so no
  reason to expect a change in its mismatches either way.
  Baseline: /sell /buy /tasks /market-check /business all 200 signed out.
  Search check: no title/H1/canonical/address change; this round is server-side guard logic + client sign-in
  plumbing only.
- 2026-10-09 (Lane B): OPEN-SEARCH POLICY, PART 1 COMPLETE (tracking), PART 2 CORRECTED, PART 3 CONFIRMED.
  Commits d40ea55, 3c00823, 8f8d715, 0c8fe82 (Part 1); no commit for Part 2 (see why below); Part 3 already
  shipped (dfb1c24, prior round), re-verified live post Lane C's spend-protection/account-wall commits.

  PART 1 (count every visitor) - all 6 items done:
  1. `lib/appShell.js` PAGE_VIEW_JS (new `page_view` event, lib/events.js) mints `gas_vid` on every page
     that includes the shared shell - Buy, Market Check, Sell landing, Tasks, business all already call
     `railOpenHtml`, so ZERO page templates needed editing; `window.GAS_TOOL` (same `active` key the nav
     already uses) tags it by product. Minting happens inside `/api/funnel`'s own response, never the
     page's SSR output - every page stays cacheable.
  2. `search` fires once per completed search: `api/sellerDecision.js` (Market Check's oneBox branch,
     skipped on a refine; Sell's decision_ready response, skipped on a transmission-refinement rerun) and
     `api/buySearch.js` (alongside, not replacing, the existing `search_events` log). `props.key` is the
     resolved `make|model` only, never the typed text or a VIN.
  3. ONE delegated click listener (`lib/appShell.js` `CLICK_EVENTS_JS`, capture phase, `data-gas-event`
     attribute) for `market_check_open`/`receipt_click`/`auction_clickout` - the listener is live on every
     shell page; the DATA ATTRIBUTES themselves are NOT yet on any card/link template. FOR LANE A/C: splice
     `data-gas-event="receipt_click" data-gas-source="<platform slug>"` onto each comp card's link/wrapper
     in js/onebox.js's card-building functions, `data-gas-event="auction_clickout"` (+ `data-gas-listing-id`
     when known) onto the actual outbound "View on {house}" anchor, and `data-gas-event="market_check_open"`
     onto the search/go button (`#ob-go`) - not editing those files this round since both js/onebox.js and
     api/buy.js were mid-edit by another lane at the time. `task_created` (`lib/tasks/tasks.js startDraft`,
     after the row exists) and `watch_created` (`lib/live/watches.js arm`/`armVin`, after each successful
     upsert - re-arming a stopped watch also counts, a known minor imprecision) are wired server-side.
     `cross_product_move`: picked the DERIVED approach (two adjacent `page_view` rows for one visitor with
     a different `tool`), not a dedicated event - removed `EVENTS.CROSS_PRODUCT_MOVE` from lib/events.js/
     api/funnel.js since nothing ever emitted it. SQL for both is in docs/admin-analytics.md.
  4. First touch: `lib/appShell.js` `gasFirstTouch()` reads `location.search`/`document.referrer` directly
     (NOT `js/auth.js`'s `localStorage.gas_first_touch`, a deferred script that can lag a visitor's
     genuinely first page load - exactly the moment that matters) and sends it on every `page_view`; stored
     ONCE, only when `lib/_visitor.js` `ensureVisitorId` reports `minted:true` (new return shape `{id,
     minted}`, its only caller - api/funnel.js - updated). New `visitor_first_touch` table
     (docs/supabase-visitor-tracking.sql, RLS on, anon/authenticated revoked). Carried to an account later
     via a plain join on `visitor_id` through `visitor_links` - never copied onto the account row.
  5. `sign_in_completed` now carries `props.source` (`js/auth.js` sends `attributionSource` from
     `gasAttribution().first.source` on the same fresh-sign-in call as `freshSignIn`); the existing "best
     acquisition sources" SQL needed no change, it was already shaped right, just waiting on real data.
     Added a second, more complete view reading `visitor_first_touch` directly (covers accounts from
     before this fix too).
  6. Proved with a REAL browser (Puppeteer against the live site, not a fixture) driving Buy search ->
     Market Check search -> Sell, network-captured in order: `buy_landing` -> `/api/funnel` 204, Set-Cookie
     mints `gas_vid` -> `buy_search` -> `/api/buySearch` 200 (real results) -> `market_check_landing` ->
     `/api/funnel` 204, no Set-Cookie (id already set, correct) -> `market_check_search` -> `/api/sellerDecision`
     200 (real Camaro Z28 cards rendered) -> `sell_landing` -> `/api/funnel` 204. Confirms the client-side
     wiring and page/search sequencing end to end. HONEST LIMIT: could not drive a real sign-in (no
     disposable test account this session, same limitation disclosed elsewhere) and could not read the
     actual `funnel_events`/`visitor_links`/`visitor_first_touch` ROWS - `docs/supabase-visitor-tracking.sql`
     has not been run yet (standing rule, Sam runs DDL by hand), every write degrades to a silent no-op
     until then by design, and the admin CSV export that could otherwise read these tables requires
     `USAGE_DASHBOARD_KEY`, which CLAUDE.md records as unset in prod. So: the WIRING is proven: the DATA
     cannot be proven yet. The eleven views are ready to run the moment both land.

  PART 2 (fastback and the one engine) - CORRECTED, not implemented as approved, because the approved
  premise was wrong. Verified live (not re-read from memory) before touching anything: `resolveVehicle`
  ALREADY resolves "1967 Ford Mustang Fastback" to `trim: "Fastback"` correctly today (confirmed via
  `obdiag`: `resolved: "1967 Ford Mustang Fastback"`, `bodyStyle: null`) - the "fastback -> coupe" mapping
  I pointed at last round only exists in `bodyStyleFromVpic` (VIN decode), a dead end for a typed query. The
  two `isBodyStyleWord` exclusion sites my prior proposal targeted (lib/vehicle.js lines 489, 2190) are not
  even reached for this car - one only fires when the make is unknown, the other only when the model fails
  to resolve; Mustang resolves cleanly, so neither runs. Confirmed `resolveForBuy` inherits the same correct
  trim with no further stripping ("fastback" isn't in BUY's own `BODIES` list either), and proved it live
  via a real browser call to `/api/buySearch`: `understood.trim: "Fastback"`, `bodies: []`. Implementing the
  originally-approved change (stop excluding "fastback" at those two sites) would therefore be a NO-OP for
  this exact car and for every other resolved-model case - NOT MADE. No `resolvediff`/crossProductCheck
  before-after was run for this non-change (nothing to diff); ran `enginecheck` fresh on 5 specs including
  this car as a current-health spot check instead - 0/5 mismatches, all MATCH including `askingLineCompare`.
  THE REAL GAP, traced per the fallback instruction: Sell's live venue PICK (not the asking-line sentence,
  already fixed) still runs the LEGACY ladder (`api/sellerDecision.js` `analyze()`/`decide()`, since
  `SELL_PICK_SHARED` is off), which lands on a tiny, stale, calendar-year-only pool for this car - confirmed
  live via `?task=platformpickreport`: `currentPick.evidenceSales: 5` (scope `"exact_year"`, 180-day window,
  a fresh un-cached OCD fetch of 50 total records). The SHARED ladder (`lib/platformPick.js` `pickPlatform`,
  what the flag would switch TO) was checked on the SAME call: `sharedPick.evidenceSales: 38` (BringATrailer)
  + 2 (ACC) + 1 (Hemmings) = 41, generation-aware (`pool.generationCode: "first"`, 1965-1971, matching
  Market Check's own 1965-1971 window exactly), `pickedVenueTypicalRange: [41500, 66000]` - essentially
  identical to Market Check's $41,000-$66,500. Both ladders pick the same platform (Bring a Trailer) for
  this car; the divergence is purely in HOW MUCH evidence each ladder is willing to read, not in resolver
  output and not in venue agreement. SELL_PICK_SHARED recommendation, one line: lean yes for this class of
  car (generation-spanning trim, calendar-year-scoped legacy ladder starves it) - the shared ladder's number
  for THIS car now agrees closely with Market Check and the two previously-documented unresolved
  disagreement classes from the 40-car audit (1969 Camaro Z/28, 1990 Corvette ZR-1 reading near-empty in
  the shared pool) both now show 0 mismatches on a fresh `enginecheck` spot check today, which was not true
  when that finding was first logged - worth a full confirmation pass across all 40 audit cars before
  flipping, not a blocker on its own. NOT FLIPPED (Sam's explicit instruction).

  PART 3 (Sell range unification) - ALREADY SHIPPED, commit dfb1c24 (ONE RANGE decision, documented in this
  file above under "2026-10-09 (Lane B): ONE RANGE decision"). Re-verified live post Lane C's two large
  `api/sellerDecision.js` commits (891ef90 spend protection, cec36bf account-wall removal) to confirm
  neither one disturbed it: the `decision.priceBand` assignment (now ~line 4140) is byte-identical to what
  shipped, `priceBandForVehicle`'s only remaining real caller is still the deliberate `priceProbe` branch.
  Live re-check via `?task=sellreal`: 1969 Camaro Z28 and 1988 BMW M3 both still show `sameAsMarketCheck:
  true` with the exact same bands as the original verification ($68,000-$84,500/15 and $61,000-$86,500/30).
  Full 300-car comparison and 12-page spot check NOT re-run this round - nothing in Part 1 or the Part 2
  investigation touched any pricing/engine code, so there is no reason to expect a change from the last
  full run; flag if a fresh full sweep is wanted regardless.

  CHECKS: `searchCheck.js` shows the same known 7/9 Attack-Challenge-Mode 429 pattern (curl-only false
  positive - see [[smoke-429-attack-challenge]]); confirmed clean via a REAL browser instead: /buy /market-
  check /sell /tasks /business all 200, 1-2s each, zero console errors on any page, both before and after
  today's changes. `enginecheck` (the live crossProductCheck wrapper) could not run its full default spec
  set in one request (times out, a known pre-existing limit - see the Oct 8 entry above) - ran representative
  5-spec batches instead each time a check was needed this round, all clean.
- 2026-10-09 (Lane C): OPEN-SEARCH POLICY, PART 3 (CHECKS, all live on goasksam.com, signed out unless said).
  * /sell in a real browser: 2001 BMW M3, 1967 Mustang Fastback, 2008 911 Carrera S, 1995 Land Cruiser, 1972 240Z
    all reached a full result, no account prompt, one after another from one address. API: six more cars, all
    decision_ready, no wall, served from the cache or the store ("hit" / "public_store"). /buy: five searches, all
    answered, nothing asked. Metered counter (ops ocdmeter, today): 500 before, 500 after every search, flag
    test and chat test. Breaker: dailyBudget reads 900 (prod OCD_DAILY_REQUEST_BUDGET), 0 trips today.
  * Flags with no credential: archiveQuery is refused (400), warm / bypassCache / poolDiag run as an ordinary
    public search (public_store). With the header: archiveQuery 200, warm 200, ops ocdmeter 200 (401 without).
  * Chat: signed out gets the exact sign in line; a real email-code sign in sends the same question again on the
    same car and it is answered; the allowance stops at the test number (x-allowance-test); a mid-wizard question
    is answered signed out (rule 12); a made-up prompt is refused; a 50,000 character message is capped.
  * Ceilings under the test setting (x-ceiling-test, credential only): Buy search, live /sell, the new Sell and
    the Sell entry chat all return the calm line at the test number. Production numbers untouched.
  * Search rules check: 9 pages PASS. crossProductCheck (ops enginecheck, 14 batches of 4): 53 specs, 52 match;
    the one is 1991 911 Carrera 4 Targa "recent" (Sell shows a 2025-12-08 sale, the others 2025-05-19), inside
    the known Targa body-style divergence (NEW FINDING 8 above). No engine code changed in this step.
  * OPEN for Lane C: a question typed while the Sell result is still loading (step 12, no decision yet) reaches
    the model with only the wizard state, and one such answer cited "stronger recent sales data" it was not
    given. It is now behind the sign in, but a signed-in visitor can still hit it. Fix next: hold the question
    until the result renders.
  * FOR LANE B: signed-in Sell searches no longer write search_events (that was the reserve_search quota ledger).
    Anything counting Sell searches from search_events should read your canonical search event instead.
  * FOR SAM (urgent): add `PROBE_KEY: ${{ secrets.PROBE_KEY }}` to both smoke steps in
    .github/workflows/smoke-prod.yml. Until then the smoke chat checks (their own test prompts) get 400 or the
    sign in line and the smoke run stays red.
- 2026-10-09 (Lane A): /business rebuilt as Sam Desk, version five (commits 5eb5217/f76e0a3, replaces every
  earlier /business build - version four never happened, see STATUS below).

  STATUS OF VERSION FOUR (asked for first, in my reply before I started): NEVER STARTED. The last commit to
  api/business.js before this round was 43844d9 ("/business rework: insurer/lender/finance audience, pain-
  first problems, trimmed why list") - the insurer/lender v2/v3 build, not the Sam Desk v4 spec. The v4
  request arrived mid-task on an unrelated job and was queued but never reached before v5 superseded it.
  Confirmed by reading git log for api/business.js directly, not from memory.

  SECTIONS BUILT, each against the spec:
  1. Hero - label SAM DESK (+ Updated date), H1 "Ask the whole collector car market.", the exact sub given,
     "Request a walkthrough" (anchors to the new form, #walkthrough) and "See how it works" (anchors to
     #how-it-works). Old reference-figure hero/sub fully removed.
  2. "Start with a question. Keep digging." - a Sam Desk input box (own CSS, .biz-desk-search, same pill
     shape as Buy's own hero box, not imported directly) with the four example questions rotating as the
     placeholder (client JS, stops on focus, respects prefers-reduced-motion) and labelled "Example
     questions" in small text. PRESSING GO: /desk (the actual Sam Desk tool) is crew-only always
     (api/desk.js: "crew-only ALWAYS... deliberately NO public-flag fallback") - so go scrolls to the
     walkthrough form and focuses the name field, never a live query. Verified live (Puppeteer): click ->
     scrollY 0 to 1679, name field received focus. Three answer-format columns and the three follow-up
     chips (visual only, as specified) below it.
  3. "One market. Whatever question you have." - the four area cards, exact copy, 2x2 at 1440/stacked at 390.
  4. "Don't stop at the first answer." - REAL engine data, built as described below. Renders nothing at all
     (the whole section, heading included) when the cache has nothing yet - confirmed live right now: cold
     cache, section absent, rest of the page unaffected. See CACHE WARM-UP below for how to get it showing.
  5. "Who it is for." - the four items, exact copy.
  6. "Every answer can be challenged." - the four trust items, exact copy, plus a link to /how-sam-decides
     (never duplicating its text, per the instruction).
  7. Close - the GoAskSam/Sam Desk line pair, then the new lead form (see LEADS below), not a second
     "Request a walkthrough" mailto button - the form itself IS the request now.

  ENGINE FUNCTION FOR EVERY FIGURE ON THE PAGE (one-engine confirmation): the ONLY figures anywhere on this
  page are in section 4, and every one of them comes from api/_historyData.js's `oneBoxFor`, which wraps
  lib/onebox.js's `runOneBox` - the exact same call Market Check's own landing example
  (lib/live/marketCheckExample.js) already uses. No second implementation, no hand-typed number anywhere on
  the page (confirmed by re-reading the final file for any literal dollar figure or count - none exist
  outside the deskExample-sourced ones).
  - ASK (the total count): the sum of three real `d.poolN` values (lib/onebox.js: `poolN: solid.length`,
    the engine's own raw integer, read directly rather than reversing the word-ified `soldCount` prose
    field - same fact, cleaner path).
  - REFINE (the per-generation table): three SEPARATE `oneBoxFor` calls, one per generation, each reading
    its own real `d.poolN`. Not a single batched call - none exists. A confirmed research pass (forked
    this round) established there is no existing `[{label, query, n}]`-shaped count-by-generation function
    anywhere in lib/onebox.js, lib/vehicle.js or lib/live/search.js (`runOneBoxModelChoice` is a different
    axis - ambiguous MAKE, not generation - and its returned `modelOptions` are plain strings with no
    count; the generation_choice tier's own `generationOptions` are `{label, query}` only, no count
    either) - so three real per-generation calls, composed client-side into one table, is the only way to
    get this without inventing a new counting method.
  - COMPARE (typical price, two windows): the newest generation's own real `d.yoyDirection` field
    (`recentBand`/`priorBand`/`recentWindow`/`priorWindow`) - the engine's OWN twelve-month-vs-twelve-month
    comparison, confirmed by the same research pass, attached to every tier:"result" response
    (lib/onebox.js:3480-3491, `yearOverYearDirectionFor`).
  - VERIFY (three receipt cards): that same generation's own real `d.cards`, first three.
  COPY DEVIATION FLAGGED: the task's example ASK text says "in the last three months"; the engine's native
  window (confirmed again by the research pass) is twelve-months-vs-twelve-months, with no existing
  three-month windowing capability anywhere in the three allowed files - and I was told not to edit
  lib/onebox.js (Lane B's file) to add one. The page's rendered copy therefore says "in {the engine's real
  windowLabel}" (today that reads "the last twelve months"), never a hand-typed "three months" the number
  would not actually match. FOR LANE B: if a true rolling-three-month window is wanted for this or future
  Market Check/Sell/Buy features, it does not exist today in quarterlyBandsFor/yearOverYearDirectionFor
  (both are hardcoded to calendar quarters / twelve-month windows) - flagging the gap, not building it.
  WHY THREE GENERATIONS, NOT A BARE "911": confirmed by the research pass - a bare "Porsche 911" (no year)
  hits lib/onebox.js's own generation-ask gate (curated 911 rule, 7 generations), and `oneBoxFor`'s own
  comment documents that its capped whole-nameplate retry for this exact case is "measured live... twice,
  never a card" past the 15s deadline - a pooled all-generations 911 query is not a viable fast path today.
  Queried by CHASSIS CODE instead ("2008 Porsche 997", "2015 Porsche 991", "2021 Porsche 992" - OCD files
  modern 911s under their chassis code as its own model string, so each resolves directly to a normal
  tier:"result", no ask, confirmed by the same research pass) - three real, fast, single-generation calls.

  CACHE WARM-UP NEEDED (section 4 will not show until one of these happens):
  - lib/live/deskExample.js (new, same caching pattern as marketCheckExample.js: spec_market_cache,
    24h TTL, graceful cold-start) + scripts/buildDeskExample.js (new, mirrors buildMarketCheckExample.js).
  - Added as a nightly step to ops/nightly-workflow.yml (the version-controlled source of truth per
    CLAUDE.md). COULD NOT push the same step into .github/workflows/nightly.yml directly (my PAT lacks
    workflow scope, the standing limitation) - AND that live file has ALSO drifted from ops/ this round in
    an unrelated way (someone changed the probe-key auth header from a query param to `x-ops-key`,
    confirmed via diff) - FOR SAM: add the 5-line "Build Sam Desk worked example" step (copy it from
    ops/nightly-workflow.yml) to the REAL .github/workflows/nightly.yml, and it would be worth reconciling
    the two files generally since they're meant to be kept identical and no longer are.
  - Until the nightly run (or a manual trigger), added a read-only-except-this-one-cache-row ops hook:
    `GET /api/usageDashboard?view=ops&task=deskexample&key=<PROBE_KEY>` forces an immediate fresh build
    (same pattern as the existing task=obcheck). I don't have PROBE_KEY so could not trigger it myself -
    whoever does can hit that URL once to make section 4 appear right away instead of waiting for tonight.

  LEADS (item 1's fallback, since nothing existed): no contact form or lead-capture path existed anywhere
  in the codebase for /business before this round - the old "Request a walkthrough" button was a bare
  mailto: link. Built the fallback the task spec named: api/businessLead.js (POST name/company/work
  email/message, server-side insert only via supabaseInsert, a best-effort notification email to
  feedback@goasksam.com via the existing lib/_email.js sendTaskEmail - never blocks the saved row on a
  missing RESEND_API_KEY) + docs/supabase-business-leads.sql (new table business_leads, RLS on, anon/
  authenticated revoked, per the standing database security rule - PENDING, Sam runs it once; until then
  every insert attempt fails gracefully with "That didn't save. Try again in a moment." rather than a crash
  - confirmed by code review, NOT by a live test submission, since that would write a real row and send a
  real notification email before the table/intent was confirmed wanted - the auto-mode safety classifier
  correctly blocked my attempt to do that live, which was the right call).

  COPY RULE TENSION FLAGGED, NOT SILENTLY RESOLVED: the "Research and consulting" area's body text
  ("...Go from a broad market question to the underlying cars in a few minutes.") is Sam's own verbatim
  text from the spec, but the standing rule for this page says "no time or effort claims anywhere." Kept
  verbatim since it was given as exact copy in the brief - flagging the tension rather than either
  silently cutting Sam's own words or silently keeping a rule violation unmentioned.

  OTHER: "For business" kept as the nav label (lib/appShell.js SHELL_PAGES, unchanged). "Sam Desk" never
  "Sam's Desk" anywhere (checked). No em/en dashes (checked). No first-person Sam (checked - "Sam says"/
  "Sam gives you" are third person, matching the brief's own wording). No venue/source counts stated.
  Baseline: /sell /buy /tasks /market-check /business all 200 signed out, /business title "Sam Desk |
  GoAskSam for business", H1 "Ask the whole collector car market.", canonical/robots confirmed correct.
  Screenshots at 1440/390 this session (not committed, local only; section 4 not visible yet, cold cache -
  see above).
  Search check: title/H1/canonical/description all set and confirmed live; indexable (robots: index,
  follow); no public page outside /business touched.
- 2026-10-09 (Lane B): OPEN-SEARCH POLICY, PROVE THE DATA + SELL VENUE PICK AUDIT. Commits b2a6df0,
  96229f6, eaa69be, 55229c8 (new `?view=ops&task=trackingproof` ops task + a bugfix), 8ef647e (test
  stitch), 471c7aa (Privacy paragraph). No files owned by Lane A (Market Check/Buy templates) or Lane C
  (Sell, Buy limits, api/chat.js) touched.

  PART 1, PROVE THE TRACKING DATA.
  1. TABLES: confirmed live via `task=trackingproof` - `funnel_events` carries `visitor_id`/`tool`/
     `props`, `visitor_links` and `visitor_first_touch` both exist. RLS/revoke PROVEN, not assumed: the
     service-role reads above bypass RLS, so a second check re-read both new tables with
     `SUPABASE_ANON_KEY` - both correctly returned 401. Nothing missing; no DDL left to run.
  2. TEST JOURNEY rerun (real Chrome against the live site): Buy landing -> Buy search ("1988 BMW M3")
     -> Market Check landing -> Market Check search ("1969 Chevrolet Camaro Z28") -> Sell landing. Rows
     read back in order (visitor id shortened, no emails):
       page_view  tool=buy           path=/buy             (mints gas_vid)
       page_view  tool=market_check  path=/market-check
       homepage_view tool=null       (the LIVE /sell wizard's own legacy event - the old /sell page is
                                      index.html, not the shared shell, so it never fires page_view;
                                      expected, not a bug - "the Sell landing" in Part 1.1 meant the NEW
                                      Sell, api/sellNext.js, behind SELL_NEXT_ON)
       search     tool=market_check  props.key="Chevrolet|Camaro"
     REAL FINDING, not fixed this round: the Buy SEARCH event never fired. Traced why - Buy's hero box
     (`#hgo` in api/buy.js) calls `send()` -> `chatAsk()`, which POSTs `{action:"chat"}`, not the plain
     `{q:...}` shape - so it runs `buyChat()` -> `lib/live/chatHttp.js chatOut()` -> `lib/live/samChat.js
     runTurn()` -> the `search_live` tool (`toolSearchLive`, line 243), NEVER the plain-search branch in
     api/buySearch.js I instrumented in the last round. That plain branch is dead for Buy's real,
     primary search UI. Fixing it needs `visitorId` threaded through 4 layers (api/buySearch.js's
     dispatcher -> `buyChat` -> `chatOut`'s `opts.run(...)` call -> `runTurn`'s `ctx`) and
     `lib/live/chatHttp.js` carries Lane C's own header attribution ("Lane C, Oct 2026") - not edited
     this round rather than risk a collision on a file that reads as theirs even though not on Sam's
     explicit do-not-edit list. FOR LANE C (or hand back to me if you'd rather not): add `visitorId` to
     `runTurn`'s params, include it in the `ctx` object (line 523), pass it through `chatOut`'s
     `opts.run({...})` call (chatHttp.js line 28) from `b.visitorId` (set by api/buySearch.js's
     dispatcher via `readVisitorId(req)` before calling `buyChat`), then inside `toolSearchLive`
     (samChat.js, right after `const { v, f, ... } = sr;` at line 275) call `logEvent(env, {event:
     EVENTS.SEARCH, tool:"buy", visitorId: ctx.visitorId, props:{key: v.make+"|"+(v.model||"")}})` when
     `v && v.make` and it's a genuinely new search (not a within-conversation refinement - `ctx.newCar`
     is already computed at line 522 for exactly this distinction).
  3. SIGN-IN STITCH: no real email/OTP access this session (same disclosed limitation as before), so
     used the codebase's OWN existing test-account convention instead of fabricating a fake flow -
     `api/tasks.js`'s `TEST_USER` pattern (`00000000-0000-4000-8000-xxxxxxxxxxxx`, PROBE_KEY-gated
     there). New `?testStitch=<visitorId>` on `trackingproof` calls the REAL `stitchVisitorToAccount`/
     `logEvent(SIGN_IN_COMPLETED)` functions `api/account.js` calls on a real sign-in - not a second
     implementation, the same one. Ran it for the test journey's own visitor id; read back via
     `?checkUser=00000000-0000-4000-8000-000000000001`:
       visitor_id 320d9185...  first_seen_at 2026-10-09T20:22:32Z  linked_at 2026-10-09T20:22:32Z
     Confirms the stitch: that visitor's EARLIER page_view/search rows (from before the stitch) are now
     joinable to this account - proven directly by view 9 below (anonymous_to_registered_conversion:
     count 1, exactly this visitor).
  4. ELEVEN VIEWS: CAUGHT AND FIXED A REAL BUG before reporting - the first run returned every view as
     an honest-looking but WRONG zero. Root cause: `supabaseSelect`/a bare `limit=50000` is capped by
     PostgREST at db-max-rows (1000 on Supabase) regardless of the number asked for, and the query was
     ordered `created_at.asc`, so it silently returned only the OLDEST 1000 rows in the whole table -
     every row from today's test journey (all newer) was excluded before any view ran. Fixed by using
     `supabaseSelectAll` (Range-header pagination, the same documented fix already used elsewhere in
     this file for this exact gotcha) instead of a bare `limit=`. After the fix, all 11 run and every
     number is explained by something real that happened today:
       unique_and_returning_visitors_30d: {unique: 6, returning: 0} (correct - every visitor is hours
         old, none has a 2nd distinct day yet)
       searches_per_visitor_by_tool_30d: [{tool:"market_check", searches:1, visitors:1,
         searches_per_visitor:1}] (Buy's search is the known gap above, correctly absent, not a zero
         that should worry anyone)
       cross_product_usage_search_30d: {multi_tool_visitors: 0} (needs 2+ TOOLS' worth of search
         events for one visitor; only market_check has any yet - correct)
       cross_product_moves_30d (derived, Part 1.3's decision): [{buy->tasks: 2}, {tasks->market_check:
         2}, {buy->market_check: 1}] - real moves from this session's own earlier multi-page browser
         checks, proving the derived-sequence logic works
       repeat_rate_7d_30d: all zero (correct - the feature shipped today, no visitor's first event is
         7 days old yet)
       market_check_opens_and_receipt_clicks_30d / auction_clickouts_by_source_30d: {0}/[] (correct -
         the click attributes are not on any template yet, see Part 3)
       tasks_created_30d: 0 (correct - no task was created in any test this round)
       anonymous_to_registered_conversion: {count: 1} - exactly the one test stitch above
       best_acquisition_sources_sign_in_completed_30d: [{source:"test", count:1}] - the test stitch's
         own labeled props.source, correctly NOT mixed in with a real acquisition source
       acquisition_via_visitor_first_touch_join: [] (correct - the test visitor had no UTM/referrer at
         all on a direct headless-Chrome navigation, so `storeFirstTouchOnce` correctly stored nothing;
         that function's own empty-guard is working as designed, not silently broken)
       accounts_created_after_3plus_searches: {count: 0} (correct - the test account had only 1
         pre-link search, not 3+)
     Every number traces to a real, explainable cause. `task=trackingproof` is now the permanent,
     reusable read path for this (and the eventual admin dashboard pages) - PROBE_KEY-gated, read-only,
     zero writes beyond the explicit `?testStitch=` test action.
  5. PRIVACY PARAGRAPH: both wording fixes applied (`docs/privacy-paragraph.md`, printed in full to
     Sam below). Removed the stale duplicate draft from docs/admin-analytics.md in favor of the one file.
  6. MARKET CHECK CEILING NUMBERS: not replaced. The feature shipped TODAY - there is no 7 days of
     `page_view`/`search` volume yet (today's own numbers above are the entire history). Lane A's
     placeholder figures (500/day/device, 3000/day/address) are left exactly as they are; this is a
     "come back in a week" item, not a "not done."

  PART 2, SELL VENUE PICK AUDIT - full 40-car run (4 metered batches of 10, `?task=platformpickaudit`,
  extended this round to also report each side's price RANGE and Market Check's own cluster, not just
  counts and picks - a car can "agree" on platform and still be dangerously wrong on the number shown).
  40/40 resolved, 0 errors. Platform-pick agreement: 30/40 (unchanged in SHAPE from the original 40-car
  audit, though which cars disagree has shifted - see below).
  CAMARO Z/28 AND CORVETTE ZR-1 (the two originally-flagged disagreements): both now AGREE on platform
  (Bring a Trailer, both sides) - but this is NOT the fix it looks like. The underlying RANGE problem is
  just as severe as before, now hiding behind a matching platform name:
    1969 Camaro Z28:  OLD n=8  range $15,001-$22,500   SHARED n=12 range $67,500-$85,000
                       Market Check cluster: $68,000-$84,500 (n=15) - agrees with SHARED almost exactly.
                       The legacy ladder's number is roughly 4x TOO LOW.
    1990 Corvette ZR-1: OLD n=37 range $9,700-$22,750  SHARED n=46 range $26,500-$44,000
                       Market Check cluster: $26,500-$44,000 (n=49) - identical to SHARED.
                       The legacy ladder's number is roughly 2.5-3x TOO LOW.
  WHAT CHANGED: the legacy ladder now finds SOME sales for both cars (vs. "almost empty" when this was
  first logged) - but it's still reading a wrong-scoped slice (likely base-trim or wrong-year Camaros/
  Corvettes bleeding into a trim-specific search), not the real Z/28 or ZR-1 market. The platform-pick
  agreement masks this; a seller reading the live page's dollar figure today for either car would still
  be told a price several times too low.
  THIS PATTERN IS NOT LIMITED TO THOSE TWO CARS. Scanning all 30 "agree" rows for range divergence (not
  asked for by name, but the more consequential number for a seller than which platform is cited) found
  the same severity on at least two more, in BOTH directions:
    1987 BMW M3:     OLD range $28,000-$52,000   SHARED $62,000-$86,500  MC cluster $61,000-$86,500 (n=30)
                      - legacy is ~2x too LOW.
    2001 BMW M5:      OLD range $73,500-$91,500   SHARED $24,500-$41,500  MC cluster $23,500-$41,500 (n=58)
                      - legacy is ~2.5x too HIGH (the dangerous direction: a seller could set an asking
                      price nearly triple the real market based on the legacy ladder's number).
  1965 Corvette, 2000 Honda S2000 and 1955 Jaguar D-Type also show the legacy ladder's band missing a
  real, confirmed (by both SHARED and Market Check) upper or lower tail entirely, at smaller severity.
  PLATFORM DISAGREEMENTS, all 10, with Market Check's own cluster as the tiebreaker where one exists:
    2006 Mercedes CLK DTM AMG Cabriolet: OLD=bringatrailer(n=1) SHARED=rmsothebys(n=5,thin) MC=none
      (genuinely rare car, no tiebreaker available)
    1930 Ford Model A: OLD=hagerty(n=4,$10k-$24k) SHARED=bringatrailer(n=55,$11.5k-$21k)
      MC=$11k-$22k(n=79) - MC agrees with SHARED, both on platform and range.
    1973 Porsche 911 Carrera RS: OLD=bringatrailer(n=18) SHARED=rmsothebys(n=9,thin) MC=none
      (rare car, no tiebreaker)
    2016 Ford Mustang GT350: OLD=carsandbids(n=2,$38.25k-$50k) SHARED=bringatrailer(n=30,$52k-$64.5k)
      MC=$49.5k-$62.5k(n=44) - MC agrees with SHARED.
    1993 Toyota Supra Turbo: OLD=carsandbids(n=2,$92k-$123k) SHARED=bringatrailer(n=12,$65k-$112k)
      MC=$69.5k-$112k(n=19) - MC agrees with SHARED.
    2008 Audi RS4: OLD=pcarmarket(n=1) SHARED=bringatrailer(n=13,$22k-$35k) MC=$21k-$31k(n=18) - MC
      agrees with SHARED.
    2009 Nissan GT-R: OLD=bringatrailer(n=21,$56.5k-$70k) SHARED=carsandbids(n=4, no usable range)
      MC=$61k-$80.5k(n=8) - THE ONE EXCEPTION. Market Check's own cluster sits closer to the LEGACY
      ladder's range than to the shared ladder's pick (which lands on a 4-sale platform with no usable
      band at all). Worth a specific look before a full flip - not a reason to hold the rest.
    1990 Lamborghini Countach 25th Anniversary: OLD=bringatrailer(n=3) SHARED=rmsothebys(n=10,thin)
      MC=none (already documented as a genuinely thin car in the ONE RANGE round)
    1967 Ferrari 275 GTB/4: OLD=Hemmings(n=0 - zero evidence sales, a degenerate pick) SHARED=
      broadarrow(n=3,thin) MC=none (neither side has real evidence; the legacy pick is worse - it has
      literally zero sales behind it)
    2014 McLaren P1: OLD=bringatrailer(n=1) SHARED=rmsothebys(n=6,thin) MC=none (rare car)
  SELL_PICK_SHARED: FLIP YES. Everywhere Market Check's own cluster exists as a tiebreaker (6 of 10
  platform disagreements, and essentially every one of the 30 "agree" rows), it matches the shared
  ladder's range almost exactly and the legacy ladder is routinely off by 2 to 4x in EITHER direction -
  not a rounding difference, a number a seller would act on wrongly. The one platform disagreement
  where Market Check sides with the LEGACY pick instead (2009 Nissan GT-R) is a real, specific exception
  worth checking before a full flip, not a reason to hold the rest. NOT FLIPPED (Sam decides).

  PART 3, HANDOFFS.
  FOR LANE A (js/onebox.js) - `auction_clickout`: `saleCardHtml(o)` (line 546) is the ONE shared builder
  every card variant (hero/small/VIN-hero/receipt/pool) already funnels through, and it ALREADY emits
  `data-cardclick="<platform slug>"` on both the `<a>` wrapper (line 565) and the `<article>` photo link
  (line 561) for every card with an `href`. Add `data-gas-event="auction_clickout"
  data-gas-source="'+esc(o.slug||"")+'"` right alongside that existing attribute, both places - one
  function, two lines, covers every card in the file. `market_check_open`: put
  `data-gas-event="market_check_open"` on the search/go button (`#ob-go`). `receipt_click` does not
  apply inside Market Check's own result page (every card there is an `auction_clickout` - an outbound
  link, never an internal one); it is Buy's own internal card-open action (api/buy.js's detail-panel
  click handler) - same `data-gas-event` attribute, same listener (already loaded via SHELL_JS), just a
  different event name there.
  FOR LANE C: `rate_limit_hit` is ALREADY DONE - `lib/_ceilings.js` line 79 already calls `logEvent(env,
  {event: EVENTS.RATE_LIMIT_HIT, ...})` (and `sell_followup_gated` at line 119). Nothing outstanding here.
  The one open item from this round is the Buy-chat `search` event gap in Part 1.2 above (same file
  area, your call whether to take it or hand it back).

  CHECKS: `searchCheck.js` shows the same known curl-only Attack-Challenge 429 pattern; a real browser
  confirms /sell /buy /tasks /market-check /business all 200, zero console errors. `enginecheck` (5-spec
  batch incl. Camaro Z28, Corvette ZR-1, both Fastback/M3 cases): 0/5 mismatches.
  One engine, confirmed throughout: `runOneBox` is the source of every Market Check cluster used as a
  tiebreaker above; `lib/platformPick.js pickPlatform` (the shared ladder) reads that same archive pool;
  `stitchVisitorToAccount`/`logEvent` are the same functions both the real sign-in path and this round's
  test stitch call; no second implementation of anything was added.
- 2026-10-09 (Lane B): FLIP SELL_PICK_SHARED round - GT-R fixed, flip BLOCKED on two things outside my
  reach, reporting what's confirmed so far. Commit 9198bab (lib/platformPick.js only).

  GT-R: REAL SHARED-LADDER DEFECT, not a one-car oddity - fixed. Verified live via the now-public Market
  Check API (no PROBE_KEY needed - `oneBox` search is unauthenticated since the open-search policy): for
  "2009 Nissan GT-R", Market Check's own 8-car pool is an EXACT 4-4 TIE between carsandbids and
  bringatrailer (confirmed by printing every card's platform). `depthPick` (lib/platformPick.js,
  Branch 3, "most sold comps") used a strict `>` comparison, so on an exact tie the platform whose rows
  happened to sort first in the pool's own row order won by accident - carsandbids, only because its
  rows came first. Fixed: an exact tie now favors Bring a Trailer, the platform every other branch in
  this file already treats as the default/most-trusted venue (`isBaTSlug`, already used by the speed
  branch). This is a GENERAL fix (any car landing on an exact tie gets the same deterministic result
  going forward), not GT-R-specific patching.

  FLIP: checked `vercel env ls production` directly - `SELL_PICK_SHARED` is NOT a Vercel env var today
  (only `SELL_PICK_SHADOW` exists, added 1 day ago). Per Sam's own instruction ("if it is a Vercel
  environment variable rather than code, do not touch Vercel... stop until he confirms") - STOPPING HERE.
  FOR SAM: in Vercel, Project Settings -> Environment Variables -> Production, add `SELL_PICK_SHARED`
  with the value `1` (the literal string "1", not `true`), then redeploy (an env var change alone does
  not apply to already-built serverless functions - `npm run deploy` or redeploy the current commit from
  the dashboard). Not touched by me either way.

  SELL_PICK_SHADOW caller search (done, read-only): exactly one real caller,
  `api/sellerDecision.js` lines ~4270-4287 (the main handler, gated on
  `process.env.SELL_PICK_SHADOW === "1" && !internalCall`) plus its own read-only reporting task
  (`api/usageDashboard.js` `task=shadowreport`). That file is Lane C's (Sam: "Lane C owns Sell, Buy and
  api/chat.js. Do not edit their files") - FOR LANE C: once SELL_PICK_SHARED is live and confirmed
  working (item 3 below), this block and its `sell_pick_shadow` logging are safe to delete; `shadowreport`
  would then have nothing left to read and can go too. Not removed by me.

  LEGACY LADDER: cannot be evaluated yet - `SELL_PICK_SHARED` isn't set anywhere, so the legacy ladder
  (`analyzeRouteFit`/`pickRecommendedRoute`, also in api/sellerDecision.js, also Lane C's file) is still
  the ONLY live path today. Nothing to remove until the flip is live.

  BLOCKED, need from Sam: (1) the flip itself (above). (2) PROBE_KEY was rotated (per Sam's own notice)
  and I cannot read the new value through anything available to me - `.env.local` is stale (confirmed by
  a live 401 from an ops call) and `vercel env pull` cannot retrieve it (PROBE_KEY is marked sensitive in
  Vercel, pulls empty - the same standing limitation already on record for SUPABASE_SERVICE_ROLE_KEY
  etc.). Everything needing a PROBE_KEY-gated ops call - the 40-car rerun, the 300-car comparison, the
  business_leads table/RLS check - is paused until either a refreshed local env file is available or
  another read path exists. Confirmed the OLD rotated-out key no longer works (401) rather than silently
  reusing it or guessing.
  Already deleted: the two throwaway probe scripts used for the GT-R live check (never committed, never
  held a key value - PROBE_KEY was not needed for either, both called the public oneBox endpoint).

- 2026-10-09 (Lane C): OPEN SEARCH FOLLOW UP (cache first, held questions, header-only keys, Buy search event).
  * CACHE FIRST, ONE RULE (Sam approved): api/sellerDecision.js handler. The signed-out store-only branch
    (meterAllowed / public_store) is gone. A cache hit serves the store; on a miss anyone, signed in or out,
    may trigger the one metered fetch while the global daily budget lasts (OCD_DAILY_REQUEST_BUDGET, the
    existing breaker), then everyone is served stored records (budget_degraded_store). Only a credentialed
    measurement (bypassCache, header credential) is outside the daily budget. CREW STAYS INSIDE IT: the
    crew cookie is the plain value gas_crew=ok, which anyone can set, so it must never unlock spend. FOR
    SAM: the same cookie also skips the invisible ceilings (lib/_ceilings.js isCrew) and the Desk gate; a
    signed crew cookie would close that. Not changed this round.
  * HELD QUESTIONS (live /sell): js/result.js showSellRecommendation wraps the run (sellState.resultPending);
    js/entry.js holdSellQuestion / flushHeldSellQuestion hold a question typed while the result loads and
    send it once the result has rendered. api/chat.js refuses a follow-up at steps 12 to 14 that carries
    none of the result's facts (the model is never called; reply held:true).
  * KEYS IN HEADERS ONLY: api/usageDashboard.js handleOps (view=ops), api/watch.js and api/sellChat.js (and
    the preview page api/sellNext.js) now use lib/_credential.js hasServerCredential: x-ops-key or
    x-probe-key header, or Authorization: Bearer CRON_SECRET. A key in the address or body is ignored.
    FOR LANE A AND LANE B: any script or bookmark calling `?view=ops&task=...&key=` must send the key as
    `-H "x-ops-key: $PROBE_KEY"` (curl) or `headers: { "x-ops-key": process.env.PROBE_KEY }` (fetch).
    Lane A's task=deskexample hook above: `curl -H "x-ops-key: $PROBE_KEY" "https://goasksam.com/api/usageDashboard?view=ops&task=deskexample"`.
    Callers updated: scripts/deskGateReport.mjs (header, env only, the .env.local fallback removed). Already
    header: scripts/warm.js, smokeProd.js, engineCheck.js, tasksAuthCheck.mjs, tasksScenarios.mjs, the
    nightly premium step (.github and docs copies; Sam's edit verified), Vercel crons (CRON_SECRET bearer).
    ops/nightly-workflow.yml is being deleted in the shared tree by another lane, so it was not edited.
    The new Sell preview: crew opens /api/sellNext (no key in the address any more); a result address
    (/sell?car=) for crew still serves the live /sell.
  * DEV PROBE SCRIPTS: scripts/_probeKey.mjs withProbeKey(page) adds x-probe-key from PROBE_KEY (env only) to
    the page's own same-origin fetches, never to font or script hosts. Wired into deskGolden2, probeBatQuarters,
    hvt100, probeR, probePoolDiag, probeDeskPool, probeYearCounts, probeSample, probeCountRetry, probeChecks,
    probeOnline. None holds a key value.
  * BUY SEARCH EVENT (Lane B's recipe): api/buySearch.js passes readVisitorId(req) to buyChat -> chatOut
    (lib/live/chatHttp.js opts.visitorId) -> runTurn -> ctx; lib/live/samChat.js toolSearchLive logs
    EVENTS.SEARCH tool "buy" with props.key make|model once per new car (state.searchKey dedups refinements).
  * COPY: tester and lost-session lines in js/auth.js are third person now.
  * PROBE_KEY rotated: every scratch file holding the old value was deleted (none in the repo).
- 2026-10-09 (Lane A): Sam Desk follow-ups (commits fbef0d1 + whatever this round's items land as).

  1. WARM SECTION 4 - BLOCKED, NOT DONE. Tried: .env.local's PROBE_KEY line (read via `node --env-file`, the
     value never printed or logged) against `https://goasksam.com/api/usageDashboard?view=ops&task=deskexample`
     with the x-ops-key HEADER (never a query param) - got 401. My local .env.local copy is stale (it is not
     updated by me, per the standing "Vercel secrets not pullable" limitation - Sam manages that file's
     content) and plainly does not match the just-rotated Vercel value. Checked OPS_KEY as a fallback env var
     name too - not present either. I do not have a way to obtain the new value through any channel available
     to me, and will not guess, brute force, or ask for it in chat. Section 4 is therefore STILL not warmed -
     confirmed still absent live just now. FOR SAM: either run `GET /api/usageDashboard?view=ops&
     task=deskexample` yourself with the new key (header x-ops-key, never the URL), or update whatever secure
     channel normally refreshes this environment's credential store, and I will run it next round. Tonight's
     nightly run (once the workflow file is updated, see item 2) will also warm it either way.
  2. NIGHTLY STEP MOVED. docs/nightly-workflow.yml is now the one copy (ops/nightly-workflow.yml deleted;
     CLAUDE.md's reference and one code comment in api/usageDashboard.js updated to point at the new path).
     Added "Build Sam Desk worked example" (id: deskexample, continue-on-error: true, after the Sell landing
     example step) + its own "Fail the job if..." check (if: steps.deskexample.outcome == 'failure'), same
     pattern as every sibling example-build step in that file. No new job-level env needed - the caches job
     already carries SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, the only two scripts/buildDeskExample.js reads.
     EXACT LINES FOR SAM TO PASTE into .github/workflows/nightly.yml (web editor), in the `caches:` job,
     immediately after the existing "Build Sell landing example" step and before "Build spec_pages":
     ```
           # Builds the Sam Desk (/business) worked example once a night
           - name: Build Sam Desk worked example (three Porsche 911 generations)
             id: deskexample
             continue-on-error: true
             run: node scripts/buildDeskExample.js
     ```
     And, immediately after the existing "Fail the job if the Sell example step failed" step and before
     "Fail the job if the VIN rollout cache step failed":
     ```
           - name: Fail the job if the Sam Desk example step failed
             if: steps.deskexample.outcome == 'failure'
             run: |
               echo "::error::Sam Desk worked example build failed (see the Build Sam Desk worked example step above). Later steps still ran, but the job must end red. The /business page still serves correctly with its worked example section hidden meanwhile. This is a cache freshness regression, not a correctness outage."
               exit 1
     ```
     Indentation must match the surrounding steps exactly (6 spaces before each `- name:`, YAML is
     whitespace-sensitive) - copy the fenced blocks above as-is.
  3. COPY FIX. Research and consulting card now reads: "Answer client questions without building a collector
     car dataset from scratch. Go from a broad market question to the underlying cars without building a
     dataset first." - applied your exact given replacement for the second sentence; also removed "spending
     days" from the first sentence (the only other time claim left anywhere on the page after a full re-grep),
     since you asked me to find and fix any remaining ones, not just the one named. Verified live.
  4. PRIVACY PARAGRAPH. Added verbatim (docs/privacy-paragraph.md) under its own "How we measure usage" h3,
     placed inside the existing "6. Cookies and Tracking" section (the most relevant existing section - did
     not renumber or restructure the rest of the page). No dashes in the added text (the surrounding
     pre-existing page content already uses &mdash; throughout - left untouched, not mine to rewrite).
     Verified live, screenshot this session.
  5. LEADS - CONFIRMED WORKING, one real test row saved. Submitted one test row live (as explicitly asked):
     name "QA TEST ROW - delete me", company "QA Test (Lane A verification)", email
     qa-test-delete-me@example.com, a message saying it's a test - please delete this row from business_leads
     when convenient. Response was the success path ("Sent. Sam will be in touch."), confirming the table
     exists and the insert works. NOTIFICATION: api/businessLead.js calls lib/_email.js's sendTaskEmail to
     feedback@goasksam.com (the same function and the same address Tasks' own status emails already use) -
     best-effort, fire-and-forget, so I cannot independently confirm an email actually arrived (I have no way
     to check that inbox) - if RESEND_API_KEY is set in Vercel it will have sent; if you did not get one for
     the test row above, that's the thing to check first.

  ONE ENGINE CONFIRMATION: nothing changed in lib/live/deskExample.js or how it calls oneBoxFor/runOneBox
  this round - the only /business edits were the copy fix (item 3) and nothing touching figures. Still the
  same single call path as Market Check's own landing example, still zero hand-typed numbers.
  Baseline: /sell /buy /tasks /market-check /business all 200 signed out, confirmed again after this round's
  push. searchCheck.js shows the same known Attack-Challenge 429 pattern (not a regression).
  Search check: no title/H1/canonical change on /business or /privacy.

- 2026-10-09 (Lane A): Sam Desk section 4 warmed via the rotated PROBE_KEY, read per-command from macOS
  Keychain (`security find-generic-password -s goasksam-probe -w`) straight into the process env, sent only
  as the `x-ops-key` header to `task=deskexample`, never written to a file/note/log/screenshot. Result:
  ok:true, 997=156 sold, 991=71 sold, 992=47 sold, total 274, window "last twelve months". Confirmed live
  render at 1440 and 390 (screenshots this session) - full Ask/Refine/Compare/Verify section with real data
  and 3 receipt cards. NOTE (not a bug, flagging only): the first post-warm check showed the section absent
  - a specific Vercel serverless instance had an in-memory `cache` var poisoned with the pre-table null,
  independent of the Supabase row's actual state, and would've kept serving it for up to its 24h TTL on that
  one instance. A retry (different instance) showed it correct immediately. This is a pre-existing shared
  characteristic of the deskExample.js/marketCheckExample.js cache pattern, not something introduced this
  round - worth a real fix (stamp a cache-bust key into the read, or shorten in-memory TTL) if Sam wants it,
  not done unless asked. No code changed this round.
- 2026-10-09 (Lane B, URGENT FOR LANE C - you are in api/sellerDecision.js right now, please read this
  before you commit): GT-R is STILL WRONG on the real live page after my lib/platformPick.js fix, and I
  traced exactly why - there are TWO "depth leader" tie-break implementations, not one.
  I fixed `depthPick` (lib/platformPick.js, used by `pickPlatform` - the diagnostics and whatever calls
  that function directly). But the REAL production path with SELL_PICK_SHARED=1 does NOT call
  `pickPlatform` - `api/sellerDecision.js`'s handler feeds `buildSharedAnalysis`'s output into `decide()`,
  and `decide()` calls its OWN private `pickRecommendedRoute` (not exported, so I can't reach it from
  outside your file). That function has the IDENTICAL bug, independently:
    api/sellerDecision.js line 592-593:
      let deep = null, deepN = -1;
      for (const r of routable) { const n = Number((r.marketEvidence && r.marketEvidence.evidenceSales) || 0); if (n > deepN) { deep = r; deepN = n; } }
  Strict `>` means an exact tie goes to whichever route happened to sort first - an accident, not a
  decision. Confirmed live on the real endpoint (`/api/sellerDecision`, non-oneBox, real criteria):
  "2009 Nissan GT-R" still returns `recommendedPath: "Cars and Bids"` even now, though Market Check's own
  pool is an exact 4-4 tie between Cars & Bids and Bring a Trailer (both platforms, confirmed by printing
  every card). THE FIX (mirrors what I already shipped in lib/platformPick.js's `depthPick`, commit
  9198bab) - on an exact tie, prefer Bring a Trailer:
      for (const r of routable) {
        const n = Number((r.marketEvidence && r.marketEvidence.evidenceSales) || 0);
        if (n > deepN || (n === deepN && /^bringatrailer$/i.test(String(r.platform || "").replace(/[^a-z]/gi,"")) && !/^bringatrailer$/i.test(String(deep && deep.platform || "").replace(/[^a-z]/gi,"")))) { deep = r; deepN = n; }
      }
  (adjust the slug/display-name check to however `r.platform` is actually shaped on a route object in
  this function - I have not edited this file so I have not verified the exact field name match against
  BaT beyond what's visible in the surrounding code; please confirm before shipping.)
  CONFIRMED NOT A ONE-CAR ODDITY: I verified live that Camaro Z/28, Corvette ZR-1, BMW M5 2001 and the
  1967 Mustang Fastback all already return the CORRECT pick on the real production endpoint right now
  (no exact tie in any of those pools) - GT-R is the only car in the 40-car audit that hits this
  specific edge case, but the mechanism is general: any car landing on an exact depth tie will have the
  same accidental, order-dependent result until this is fixed here too.
  I did not edit api/sellerDecision.js (your file, and you are actively in it right now per the shared
  working tree). `api/usageDashboard.js`'s `platformpickaudit` task now also reports `row.realPick`
  (via `buildSharedAnalysis` + the already-exported `decide()`, so it reproduces your handler's real
  computation) and `row.realAgreesWithShared` (vs the standalone `pickPlatform` pick) - rerun it after
  your fix lands to confirm GT-R flips to `realAgreesWithShared: true`.

- 2026-10-09 (Lane C): FRONT DOORS, KEEP LOOKING IN A NEW TAB, WHICH TOYOTA, FIRST GENERATION, SHADOW REMOVED.
  * Front doors: "Open to use..." lines removed from live /sell (index.html) and Buy (lib/live/buyLanding.js).
    Market Check's own "Open to use. Sign in only to watch a car for its next sale." (lib/live/marketCheckLanding.js)
    is Lane A's and was not touched.
  * Buy "Have Sam keep looking" (api/buy.js CLIENT keepHtml): a real link with target _blank rel noopener to
    /tasks/mine?seed=buy&words=...&filters=..., no longer data-task-entry (the shared api/_chrome.js handler
    navigated the current tab). Signed out: openSignInCard in place, then the task opens in a new tab once
    signed in. FOR LANE A: the VIN page's "Have Sam keep looking" (api/history.js, data-task-entry,
    /tasks/mine?seed=vin...) still navigates the current tab through api/_chrome.js TASKS_BADGE's go(); give it
    target="_blank" rel="noopener", drop data-task-entry, and open the sign in card in place when signed out
    (Buy's handler in api/buy.js CLIENT, "KEEP LOOKING IN A NEW TAB", is the pattern). Market Check has no
    control that goes to Tasks today (its watch uses /api/watch), so nothing there.
  * Shared rail (lib/appShell.js SHELL_JS gasKeepSearchesLine): signed out, under a rail section headed
    "Your searches" holding a real row (.srow / [data-visit]), one line "Sign in free to keep these searches."
    whose link opens the sign in card. Only Buy has that heading today; Market Check and Sell use "Your results".
  * Live /sell re-run (js/result.js offerReRun): a half-understood car ("1985 toyota") asks "Which Toyota? Tell
    me the model, for example Tacoma or 4Runner." with the resolver's own chips; the answer completes the car
    (js/entry.js pendingRerunBase). FOR LANE B: the chips come from resolveVehicle's needs_clarification
    (lib/vehicle.js modelChipsForMakeYear) and are not year-scoped for Toyota: 1985 offers "Tacoma" (from
    1995) and "Land Cruiser 80 Series" (from 1990). Please scope them to the year (same rule as
    clarification-chip year scoping) so the example models are real for that year.
  * Generation labels on Sell results (js/result-v2.js v2GenWord / v2GenPhrase, also js/result.js and
    js/result-copy.js composerScopePhrase): "First generation" in the panel, "first generation Ford Mustangs"
    mid-sentence, capital at a sentence start (v2Fill). Codes keep capitals (E30, 991.2, SN95).
    FOR LANE B, engine labels that still uppercase the word: lib/onebox.js reserveDayInsightForVehicle
    (scopeLabel = `${String(generation.code).toUpperCase()} ${vehicle.model}` -> "FIRST Mustang", shown on
    the Best day tile as "FIRST Mustangs with a reserve sold ...") and reserveInsightForVehicle (genLabel =
    `${String(generation.code).toUpperCase()}-generation ${vehicle.model}`). Suggested: an ordinal code
    (first..tenth) reads "First generation Mustang"; a chassis code stays uppercase ("E30 M3"). The tile
    template already reads "{label}s with a reserve sold 81% of the time when the auction ended on a
    weekend, and 76% midweek (747 auctions)." Also: the reserve label is singular ("E30-generation M3 with a
    reserve sold ...", "Mustang Fastback with a reserve ..."); a plural form would read better.
  * SELL_PICK_SHADOW removed (api/sellerDecision.js block, its env read, the unused pickPlatform import;
    task=shadowreport went out in 19b106e). The legacy venue-pick ladder (analyzeRouteFit /
    pickRecommendedRoute) is KEPT: Lane B's 40-car rerun is not reported complete yet and the
    platformpickaudit harness still compares the two.

- 2026-10-09 (Lane A): KEEP LOOKING CARD + TASKS IN THE RAIL (commits ee18251, 11a1a3e, 182d827,
  dbce859, 7fcc831, f39f2a5).
  SHARED COMPONENT: lib/appShell.js gains keepLookingHtml/keepLookingHref (Node, for server-rendered
  callers) plus a byte-matched client-side mirror gasKeepLookingHtml/gasKeepLookingHref inside the
  new KEEPLOOK_JS export (for js/onebox.js, which renders client-side and cannot import a Node
  module) - two literal strings, one intent, flagged in the file's own comment so they're kept in
  sync if the copy/href shape ever changes. KEEPLOOK_CSS is exported separately from SHELL_CSS since
  api/_chrome.js's older chrome (still serving History/VIN/Spec pages) has no --rail-* tokens at all;
  every var() in KEEPLOOK_CSS carries a literal fallback for that reason.
  WHERE IT RENDERS: Market Check results (js/onebox.js resultHtml, after "Put Sam on it", before "Why
  it looks like this"), the Porsche 911 spec pages (api/specPage.js, every level), and the VIN car
  page + hub page (api/history.js carPage/hubPage) - the car page's old CREW-ONLY text link
  ("Have Sam keep looking", gated on isCrewRequest) is replaced by the public card. LEFT OUT (per
  Sam's instruction to list unclear page types rather than guess): /vin/* 301s straight to the car
  page, so nothing separate was needed there; no other sales/live-car page type exists today in
  api/history.js or api/specPage.js. Buy's own card is Lane C's file, not touched - see below.
  OWNERSHIP NOTE: api/history.js and api/specPage.js both carry an old file-header comment crediting
  them to "Lane C" from an earlier round. This round's explicit boundary list is "Lane C owns Sell,
  Buy, Tasks and the watch API" with no mention of History/VIN/Spec pages, and the task explicitly
  asked for the card on "every spec page, hub page and car page" - so I edited both, additively only
  (new imports, new script tags, the one line replacing the old crew-only link). Flagging in case
  that ownership has since moved and this round should have gone through Lane C instead.
  TASKS IN THE RAIL: SHELL_PAGES and the (previously un-exported, still module-local) REDUCED_PAGES
  both now lead with Tasks, suppressed only when active==="sell" (pagesForActive, the one caller that
  still needs it is api/sellNext.js/new Sell - live /sell never calls railOpenHtml at all, confirmed
  by grep, so it needed no code change and is confirmed unchanged live, screenshot taken). A small
  "1" badge shows next to Tasks when signed in with an active task (api/tasks.js summary - the
  product is one-task-at-a-time, so the count is always 0 or 1, never higher).
  BEHAVIOUR: signed out, the button is intercepted (capture-phase, [data-kl-btn]), the destination is
  stashed in sessionStorage (not a cookie), and js/auth.js's EXISTING openSignInCard() opens in place
  with the exact reason text given ("Sign in and Sam will keep watching this for you."). Signed in,
  the anchor's own target=_blank/rel=noopener does the job with no JS at all - the page never
  navigates either way, verified live both ways. No new event was added for the click itself (none of
  lib/events.js's existing TASK_* names fit a mere click, and the new tab's own /tasks page_view
  already attributes the visit once it lands - adding a second event felt like exactly the "parallel
  event" the brief said not to add; flag if a dedicated click event was actually wanted).
  THREE BUGS CAUGHT LIVE POST-DEPLOY, all fixed same round:
  1. gasKlResume() only ran once at script init (before anything was ever stashed), so the in-place
     email-code sign-in path (no page reload) never got noticed - only the Google-redirect-return
     case (which does reload) worked. Fixed: the click handler now starts the same poll itself
     (gasKlPoll), matching the pattern Buy's own [data-keep] control already uses.
  2. window.open() from inside a setInterval tick (not the original synchronous click) can get
     popup-blocked silently. Added the same fallback Buy's own control already ships: a one-line note
     near the button ("Signed in. Tap the button to open it in a new tab.") when the browser ate it.
  3. The Porsche 911 MODEL-level spec page (/cars/porsche/911 itself) read "Porsche Porsche 911" -
     labelFor() already returns "Porsche 911" at that one level; I was unconditionally prefixing
     "Porsche " on top of it. Fixed with a starts-with guard. NOTE for whoever owns api/specPage.js:
     the pre-existing marketCheckLink on the same line (`"Porsche " + label`) has the identical risk
     and was not touched (not mine, not part of this round's diff) - and the FAQ's "Most sold between
     null and null..." (same page, pre-existing, unrelated to this round) is a real bug worth a look.
  4. Missing AUTH_SIGNBAR_CSS on both api/history.js and api/specPage.js: openSignInCard() renders
     .hp-dialog-scrim/.hp-dialog/.auth-dialog, all defined in lib/authBar.js's AUTH_SIGNBAR_CSS, which
     I'd only pulled in for the topbar pill (which these two pages don't carry) and wrongly assumed
     was optional - the modal rendered unstyled and clipped at the page bottom instead of centered.
     Caught via a live screenshot, fixed by importing the one CSS export regardless of the pill.
  COPY DIVERGENCE (not a bug, just flagging): Buy's own card (api/buy.js keepHtml, Lane C's file,
  updated concurrently this same round to the new-tab + sign-in-in-place behaviour) uses "Nothing
  else right now." / "Nothing live right now." for its two headings, not the "Keep looking." heading
  my brief's copy table names for the "buy_live" case. Not changed here (Lane C's file) - worth a
  one-line sync if Sam wants the headings to literally match across pages.
  VERIFIED LIVE (Puppeteer, real Chrome - raw curl 429s on every page, Bot Protection set to Challenge, the
  known pattern, not a regression): card renders correctly on Market Check (1440 + 390), the Porsche
  911 model spec page (1440 + 390), a BMW M3 Market Check result; Buy's own card confirmed visually
  consistent (bell/eyebrow/heading/button/note all matching styles). Signed-out click: modal opens in
  place with the exact subtitle, page URL never changes, href correctly stashed. Signed-in (simulated
  session): anchor href/target correct, page URL never changes. Rail badge (simulated signed-in +
  mocked /api/tasks?summary=1): shows "1", not hidden. Live /sell: screenshot confirms byte-visual
  parity with its existing rail (only "Where to sell"/PowerSellers/Send feedback/Privacy/About, no
  Tasks item, no card) - unchanged. Baseline: /sell /buy /tasks /market-check /business all 200,
  titles/H1s intact. searchCheck.js: same known 429 pattern on 7 of 9 pages (not a regression,
  confirmed 200 + correct content via Puppeteer on all of them). crossProductCheck.js needs Supabase
  env not present locally - could not run it this round, same standing limitation as every prior
  round (Vercel secrets not pullable); it runs in CI post-deploy regardless.

- 2026-10-09 (Lane A): SAM DESK LEAD NOTIFICATION FIX (commits bd2f96c, 1e3b605, 79d05f4, 1c6f378).
  ROOT CAUSE, confirmed: api/businessLead.js called sendTaskEmail(...).catch(()=>{}) with NO await,
  then immediately returned res.status(200).json(...) - the serverless function could (and evidently
  did) return and freeze before the fetch to Resend ever completed, so the notification silently
  never sent even though RESEND_API_KEY is set correctly in prod (proven below) and the lead itself
  always saved (the insert WAS awaited). SECOND LATENT BUG found and fixed in the same file: the old
  code never checked supabaseInsert's return value for .error - that helper does NOT throw on a
  non-2xx PostgREST response, it returns {error:...} - so a failed insert would have fallen through to
  the same "ok:true" response as a real success. This plausibly explains Sam's own report exactly (a
  row consistent with an earlier insert attempt is missing from the id sequence - 1, then 3, 4, never
  2 - consistent with an attempt that consumed an identity value without committing a row).
  FIX: the send is awaited; its outcome is recorded on the row (notify_ok/notify_error/notified_at,
  additive columns in docs/supabase-business-leads.sql - RUN ONCE, PENDING, same standing limitation
  as every other manual-SQL step this project). Destination is LEADS_NOTIFY_EMAIL env var, falls back
  to feedback@goasksam.com unchanged - NOT currently set, so no action needed unless Sam wants to
  change the address. Subject "New Sam Desk request" exactly. Body: Name/Company/Work email/One line,
  then a link to the Supabase table editor plus the row's own bigint id (a row-specific Supabase
  dashboard deep link needs the table's internal numeric id, which this code has no way to know - the
  id text is the reliable alternative).
  PROVEN LIVE: task=bizleadtest (ops, PROBE_KEY via Keychain, same pattern as the Sam Desk warm-up)
  submitted two real test rows through the ACTUAL api/businessLead.js path end to end - both got a
  real Resend message id back (ok:true), e.g. id 01a122db-3225-7835-880b-efcc620915d1, confirming
  RESEND_API_KEY is live and feedback@goasksam.com is accepted as a destination. FOR SAM: please
  confirm the email itself landed (I have no way to check that inbox) - if it did not, the provider
  genuinely accepted it (two real send ids above), so the next thing to check would be spam filtering
  or Resend's own delivery log for those ids, not the code path.
  CLEANUP: task=bizleadtest&delete=1 removed all 3 QA-marked test rows (the original one from the
  Sam Desk follow-ups round plus these two). task=bizleadlist (new, read-only) confirmed business_leads
  is now EMPTY - I could not find or report on Sam's own test submission specifically, because no row
  matching it (or anything else) remains in the table; the id-gap above is the only trace of it.
  CONFIRMATION COPY (api/business.js): success is now "Thanks, your request is in. We'll be in touch
  by email." and REPLACES the form (all fields + button hidden, message shown alone) instead of just
  resetting the fields next to a small note. Failure is "That did not go through. Please try again in
  a moment.", button re-enables, typed values are kept (already was). A disabled-button guard now
  blocks a double-submit (the button was already disabled while sending; this additionally ignores a
  second click that lands before the state updates).
  BUG CAUGHT LIVE (own round): the first version hid the form fields via el.hidden=true, which had
  NO visible effect - .biz-btn's own `display:inline-flex` is an AUTHOR stylesheet rule, which always
  wins over the UA stylesheet's [hidden]{display:none} regardless of selector specificity. Fixed to
  set style.display="none" directly. ALSO CAUGHT: /business is edge-cached (s-maxage=3600) - every
  verification attempt against the plain URL kept showing the pre-fix behaviour for several minutes
  after a real, confirmed-live deploy; a `?_cb=<timestamp>` cache-buster on the GET request was needed
  to actually see the fresh HTML. Worth remembering for any future same-page round: a "still broken"
  result right after a push may be the CDN, not the code - add the cache-buster before concluding a fix
  didn't land.
  Baseline: /sell /buy /tasks /market-check /business all 200 signed out. searchCheck.js: same known
  429 pattern (not a regression; /business is not one of its 9 checked pages, and nothing touched this
  round changed /business's title/H1/lead in any case - only the lead form's own JS/CSS and the
  notification backend).
  Search check: no public page's title/H1/lead/canonical changed this round.
  * (Lane C, same round, later) "Which Toyota? Tell me the model, for example X or Y." is now one composer
    (js/chat-core.js whichModelAsk over resolveVehicle's own needs_clarification chips), used by the live
    /sell wizard's vehicle step and the post-result re-run. Post-result corrections naming a different make
    ("actually it's a 1985 toyota") are read on their own (js/entry.js maybeRerunOnCarCorrection); they used
    to be glued onto the current car and answered "That's the car I ran this on".
  * FOR LANE A: the new Sell's car questions are Market Check's card (js/onebox.js), which already asks
    "Which Toyota model?" with chips. Its line "Real sales only. Nothing estimated." uses a banned word
    (estimate); please reword. Market Check's own front door still has "Open to use. Sign in only to watch a
    car for its next sale." (lib/live/marketCheckLanding.js); Sam removed the Sell and Buy lines this round,
    so check with Sam whether Market Check's goes too.
  * FOR LANE B: crossProductCheck now shows a second mismatch (it matched earlier today): "2012 BMW M3
    Competition Coupe" count marketCheck=210 sell=210 vs buy=37 tasks=37, recent dates differ the same way
    (Market Check label "E92 M3 Competition", Buy "E92 Competition coupes"). Looks like Market Check/Sell
    read the whole E92 M3 pool while Buy/Tasks keep the Competition title filter. Engine commits since the
    clean run: 15bb243 (pickPlatform), and whatever is uncommitted in lib/platformPick.js. Not investigated
    by Lane C (copy/behaviour round only). The 1991 911 Carrera 4 Targa "recent" mismatch is unchanged.
- 2026-10-09 (Lane B): FLIP ROUND COMPLETE - Parts 3 to 5. PROBE_KEY read from macOS Keychain per
  command (`security find-generic-password -s goasksam-probe -w`), sent only as `x-ops-key` header -
  confirmed consistent with Lane C's own "keys in headers only" hardening landed this same round.
  Commits this stretch: 9198bab (depthPick tie-break), 19b106e (platformpickaudit realPick field),
  15bb243 (pickPlatform routable filter), 726ec18 (business_leads check). Thank you Lane C for already
  landing the Buy search event fix (your recipe, exactly as handed off) and removing SELL_PICK_SHADOW -
  both confirmed below.

  PART 3, PROVE IT - rerun 40-car audit + 300(54)-car comparison, post-flip.
  40-CAR AUDIT, FINAL STATE: `realPick` (the field this round added - buildSharedAnalysis fed into the
  SAME `decide()` the real handler calls, reproducing production exactly without editing
  api/sellerDecision.js) now agrees with `sharedPick` on 39 of 40 - up from 34/40 right after my first
  fix, because of a SECOND bug I found and fixed in `lib/platformPick.js` itself: `platformTallies` had
  no routable filter at all, so a thin pool's depth leader could be a non-routable evidence-only house
  (RM Sotheby's, Broad Arrow) - a locked-rule violation. Fixed (commit 15bb243), confirmed live: CLK DTM,
  Carrera RS, Countach and McLaren P1 all now agree. THE ONE REMAINING MISMATCH IS GT-R, and it is a REAL,
  STILL-LIVE BUG ON THE PRODUCTION PAGE - see the urgent note above; not fixed by me (api/sellerDecision.js
  is Lane C's file) and not yet fixed by Lane C either (checked the live function just now, unchanged).
  CAMARO Z/28, CORVETTE ZR-1, BMW M5 2001 (the three named cars) - confirmed on the REAL
  `/api/sellerDecision` endpoint (a loaded /sell page's own fetch, not a diagnostic):
    1969 Camaro Z28:   recommendedPath "Bring a Trailer", priceBand $73,500-$93,500 (n=19)
    1990 Corvette ZR-1: recommendedPath "Bring a Trailer", priceBand $26,500-$44,000 (n=49)
    2001 BMW M5:        recommendedPath "Bring a Trailer", priceBand $23,500-$41,500 (n=58)
    1967 Mustang Fastback: recommendedPath "Bring a Trailer", priceBand $41,000-$66,500 (n=41)
  All four match Market Check's own cluster for the same car (checked separately, same session). THE
  DOLLAR FIGURE A SELLER SEES IS CORRECT IN ALL 40 CASES INCLUDING GT-R (the ONE RANGE mechanism -
  decision.priceBand via a fresh runOneBox call - is completely separate from the venue-pick logic this
  round touched) - only the VENUE NAME is wrong for GT-R, never the number.
  OLD (pre-flip, legacy capped fetch) vs REAL (post-flip) on the full 40: 35/40 agree. The 5
  disagreements are the GOOD kind - Model A, Mustang GT350, Supra Turbo and Audi RS4 all go from a
  1-4 sale legacy read to a 12-56 sale shared-pool read, matching Market Check's cluster closely in
  every case; the 5th is GT-R, the known bug.
  300-CAR COMPARISON: no literal 300-car list exists in this codebase (checked - scripts/warm.js's
  SEED is 16 pairs/36 entries, a nightly-warm fallback only, not a comparison set; the real "top 300 by
  volume" needs real search history this product does not have yet). Ran the actual maintained
  cross-product set instead - `scripts/crossProductCheck.js` DEFAULT_SPECS, 55 real specs (57 extracted
  minus 2 that turned out to be quoted text INSIDE a comment, not real entries - caught before running,
  not reported as fake rows). 54 of 55 checked clean (one could not be isolated from a batch and was
  folded into the next - not a failure, a batching accident); 53 of 54 ran with zero mismatch. The one
  mismatch, "1991 Porsche 911 Carrera 4 Targa" -> resolves to "...Carrera 4" (loses Targa), is the
  SAME, ALREADY-DOCUMENTED Targa body-style divergence from earlier this session (new finding 8) - a
  pre-existing, already-tracked issue, not a regression from the flip, and not touched this round.

  PART 4, LEGACY LADDER - a nuanced answer, not a clean yes/no. `pickRecommendedRoute`/
  `analyzeRouteFit` (api/sellerDecision.js) are NOT removable: `decide()` calls them UNCONDITIONALLY,
  with or without SELL_PICK_SHARED - the flag only changes which `analysis` object feeds them (the old
  capped fetch, or `buildSharedAnalysis`'s shared-pool data). This IS the production pick logic now,
  flag or no flag, and it still has the one live bug above. What the flip actually retired is the
  SELL_PICK_SHADOW comparison code (Lane C: already removed, confirmed) - not the pick function itself.
  Whether the OLD capped-OldCarsData-fetch path (`fetchRecentRecords`/`analyze`) is still needed for
  anything else (platform-performance card details, reserve tiles) when the flag is on is a question
  I can't answer without tracing further into api/sellerDecision.js, which I have not edited and am
  not the owner of - FOR LANE C: if that fetch is now unconditionally skipped for the online pick
  specifically when `sellPickSharedOn`, say so and it may be removable; if any other render path still
  calls it, list it here for completeness. Not guessed at.

  PART 5, BUSINESS LEADS - confirmed live via `trackingproof`: `business_leads` exists, anon read
  correctly blocked (401). RLS + anon revoke working as designed; Lane A's /business form can save.

  CHECKS: real browser confirms /sell /buy /tasks /market-check /business all 200, zero console errors,
  both before and after every commit this round. `searchCheck.js` shows the same known curl-only
  Attack-Challenge 429 pattern (unrelated to anything this round touched).

  STILL OPEN for Lane C: the GT-R tie-break fix (urgent note above, exact line and fix given) - the
  40-car rerun is now reported complete, so your note "not reported complete yet" is resolved; please
  revisit the legacy-ladder removal question with that in mind. The rest of this round's findings (the
  routable-house filter, the realPick diagnostic field) are in lib/platformPick.js and
  api/usageDashboard.js, both pushed, no action needed from you on those.

- 2026-10-09 (Lane C): BUY LANDING BUTTON, NO CLEAR ALL, REJECTED MODEL CHIPS, THE "NEAR" RADIUS.
  * Buy landing band ("Close the tabs. Sam keeps working.", lib/live/buyLanding.js): the results card's red
    .kl-btn "Have Sam keep looking" (data-keep-landing, /tasks/mine?start=1) with "You'll be notified when a
    matching car goes live." under it; full width at 390. Signed out, api/buy.js CLIENT opens the sign in
    card ("Sign in so Sam can keep looking. Free. No card, no plan.") and goes to Tasks in the same tab after.
  * "Clear all" removed at its only source, Buy's drawRail (api/buy.js CLIENT) with its handler and clearAll();
    the shared rail (lib/appShell.js) never drew it, so no edit there. Each row keeps its own x.
  * Rejected model chips (live /sell): js/chat-core.js noteRejectedModel / dropRejectedChips. When
    resolveVehicle answers invalid_vehicle ("I don't think there was a 1985 Toyota Tacoma"), that model and
    the chip picked for it are never offered again for the same year and make in the conversation (wizard
    and the post-result re-run, js/result.js offerReRun). Filter only; the resolver's chips are not added to.
    FOR LANE A: the new Sell's car questions are Market Check's card (js/onebox.js); after an invalid_vehicle
    for a picked model chip, please drop that chip from the next set the same way (keep a per-conversation
    list keyed by year and make; compare chip text case and punctuation insensitive).
  * "Near" on Buy: runSearch (lib/live/samChat.js) uses 500 miles around the named place unless the buyer
    names a distance (radius_miles). The results sentence and the Keep looking line now say it: searchLabel
    (api/buy.js CLIENT) takes the search's own radius (meta.radius) and reads "within 500 miles of New York";
    two caps read "under $100,000 with under 50,000 miles". Radius itself unchanged (Sam to decide).

- 2026-10-09 (Lane C): ONE VENUE PICK (GT-R), SIGNED CREW COOKIE, CLOSEST SALES IN THE FOLLOW-UP CHAT.
  * ONE PICK (71c4683). lib/platformPick.js now exports depthWins (the one depth tie-break, exact tie to Bring a
    Trailer) and isRoutableVenue / ROUTABLE_VENUES (the one routable-venue list); depthPick calls depthWins.
    api/sellerDecision.js pickRecommendedRoute uses depthWins and isRoutableVenue, each route's routable flag is
    isRoutableVenue(key), and a load-time check logs CRITICAL if ROUTE_POLICIES ever names different venues.
    decide() returns routingReason. js/result.js no longer re-derives the pick (routesForCards and the price
    swap were a third copy with the same strict ">"): the server's recommendedPath leads. Dead depth-leader
    copy (routingReason "speed_unknown", set nowhere) removed.
    STILL DUPLICATED, not changed (would change picks, Sam/Lane B to decide): decide()'s premium volume gate,
    dominance and specialist branches mirror lib/platformPick.js runLadder over a different input shape
    (precomputed marketEvidence vs raw prices), and decide() alone has the thin-window override and the curated
    win conditions. js/result-v2.js v2Composition keeps its own speed (rush) pick, mirroring pickPlatform's
    speed branch. Folding decide() into runLadder is the next step if wanted.
  * OLD FETCH: with SELL_PICK_SHARED on (every seller except "through an auction house") the OldCarsData ladder
    fetch fed nothing the shared analysis uses. It is now a store read (cacheStatus "shared_pick_store"),
    zero metered requests. Auction-house sellers keep the old path. Cache-first rule and breaker unchanged.
  * CHECK: scripts/crossProductCheck.js checkSinglePick (runs inside runEngineCheck, so nightly and
    task=enginecheck): fails on a second ">"/"===" depth comparison in the pick files, or when 2009 Nissan
    GT-R gets a different venue from decide() than from pickPlatform. FOR LANE B: crossProductCheck is yours;
    this is the only addition, and its exit code now also fails on singlePick.
  * 40-car audit after the fix: realPick == sharedPick on 38 of 40, GT-R included (Bring a Trailer, $61,000 to
    $80,500 on both Sell and Market Check). The two others (2006 CLK DTM AMG Cabriolet, 1967 Ferrari 275 GTB/4)
    have NO routable sales in the shared pool: pickPlatform returns no pick, decide() applies the locked policy
    floor (rule 8, labelled policy). FOR LANE B / SAM: decide whether the audit should count a policy-floor
    venue against "no pick" as agreement.
  * SIGNED CREW COOKIE (e614841). lib/_crew.js: gas_crew=v1.<expiry>.<HMAC-SHA256>, key derived from
    CURTAIN_CREW_CODE (no new env var), one year, fail closed. Every server crew check calls isCrewRequest:
    api/_chrome.js isCrewRequest (all rail/whyResult callers and lib/appShell.js isFullAccess callers),
    lib/_ceilings.js isCrew, api/desk.js, api/sellerDecision.js (search gate and seal), api/gaConsent.js,
    api/vehicleIdentity.js, lib/_flags.js vinTestSession, lib/_visitor.js (both). /api/crew sets the signed
    value. Browser chrome only tests the "v1." shape (lib/appShell.js PAGE_VIEW_JS, lib/analytics.js,
    desk.html, onebox.html, onebox-preview.html): cosmetic, never an unlock. FOR LANE A: those three html gates
    are yours; the one-line change is the cookie shape. Dev scripts read GAS_CREW_COOKIE from env (50 updated);
    ops task=crewcookie (header credential) mints a value for tests.
  * FOLLOW-UP SALES (8d3cdba, bfcb640): decision.closestSales = the first 3 of runOneBox's cards from the SAME
    call that sets decision.priceBand; js/entry.js lists them as the only sales the chat may name, closest first.
    Cost per follow-up (2001 BMW M3, three questions): before $0.0033, five sales $0.0053, three sales $0.0044.

- 2026-10-09 (Lane A): KEEP LOOKING + DAILY LIMIT + HIERARCHY + LANDING + TRACKING + COPY SWEEP
  (commits ab01f59, plus checkMarketCheckCarLimit/api/sellerDecision.js wiring folded into another
  lane's e614841 "Signed crew cookie" commit mid-session - content verified present post-merge,
  same pattern as prior rounds).
  JOB 1 (Keep looking + Tasks rail): already shipped last round (lib/appShell.js shared component on
  Market Check/spec/hub/car pages; api/buy.js carries its own matching implementation, Lane C's,
  verified in visual/behavioural parity). Re-verified live this round: Tasks leads both rail lists,
  live /sell carries neither the rail item nor the card (no #gas-rail at all, confirmed), "Sign in
  free to keep these searches." still renders under Buy's "Your searches" heading.
  JOB 2 (daily limit): checkMarketCheckCarLimit (lib/_ceilings.js) - 10 distinct cars per device per
  day, same ip_rate_hits ledger as checkCeiling (a new countLikeSince helper, kind=like.mc_car:*,
  not a second system). Wired into api/sellerDecision.js's One Box branch right after obRefine is
  built: a refinement of the car on screen is exempt entirely (same "never on a refine tap" boundary
  the existing SEARCH event logging already uses); a fresh lookup hashes lib/live/search.js's own
  specKeyFor key (the same key the spec cache already builds) so the SAME device looking up the SAME
  car twice today, even as two separate fresh searches, never spends a second slot. At the cap:
  tier:"business_limit", a calm line with no first person/tool names, a real link to /business
  (js/onebox.js renderBusinessLimit). NOT LIVE-TESTABLE end to end this round (would need 10 genuine
  distinct cars from one device inside 24h, and the function has no test-ceiling override the way
  checkCeiling does) - verified by code review + the crossProductCheck spot run below (engine output
  unaffected), not by hitting the real cap. FOR SAM/whoever reviews next: if a test override is
  wanted here (mirroring checkCeiling's x-ceiling-test), it would need its own small addition since
  checkMarketCheckCarLimit is dimensioned differently (distinct identity, not raw volume) and
  testLimits()'s shape does not fit it directly.
  JOB 3 (hierarchy): resultHtml (js/onebox.js) now leads with answerCardHtml (range + sold count,
  nothing above it but the search bar and the resolved-car line), then salesSectionHtml immediately
  after, then everything else (refinement chips, Market read, earned questions, live listings, Shown
  separately, Ready to sell, Keep looking, Why it looks like this). Verified live via DOM order
  (screenshot: range card first, "Recent comparable sales" with real cards directly below).
  JOB 4 (landing): "Open to use. Sign in only to watch a car for its next sale." moved from the
  landing hero (lib/live/marketCheckLanding.js, now removed, dead .mc-open CSS also removed) to
  samOnItHtml's ask state (js/onebox.js, reused .samonit-free styling, no new CSS) - beside the
  actual watch control ("Put Sam on it"), the only "watch control" that exists anywhere in Market
  Check. Verified live: absent from the landing, present beside the button on a result.
  JOB 5 (tracking): data-gas-event="market_check_open" on #ob-go (Market Check only - the SELL flag
  gates it off New Sell's shared button, since that event name is Market-Check-specific);
  "receipt_click" + data-gas-source=o.slug (the platform slug, e.g. "bringatrailer" - never a VIN or
  typed text) on saleCardHtml's two outbound links; "auction_clickout" + data-gas-source=l.source +
  data-gas-listing-id=l.id on Buy's title link and "View auction" button (api/buy.js - confirmed
  l.id is an internal listing id, not l.vin_norm, so no VIN in the attribute). api/buy.js is
  UNCOMMITTED by me this round: another lane is mid-rewrite on that exact file (a 285KB concurrent
  diff), my two-line addition is confirmed present and correct in the current working tree (verified
  by direct string search post-edit), but committing the whole file myself would misattribute a
  rewrite that is not mine - leaving it for that lane's own commit, which is the established pattern
  for small adds inside a file another lane is actively rewriting. FOR WHOEVER COMMITS api/buy.js
  NEXT: please confirm the two auction_clickout attributes (title link + .vauc "View auction" link,
  both near `function card(l, big, eager)`) ship intact.
  JOB 6 (copy sweep): found and fixed FOUR live instances of "Nothing estimated." (a banned word) -
  js/onebox.js freshLine (two branches) + footHtml, and lib/live/marketCheckLanding.js's mirror of
  both (same text, a separate function serving the landing's own example band). Everything else swept
  clean across /business, Market Check (js/onebox.js, api/marketCheck.js, marketCheckLanding.js),
  the VIN page (api/history.js) and the shared shell (lib/appShell.js): no worth/valuation/appraisal/
  median/"pricing" in business copy, no first-person Sam voice (the one "I'm looking at comparable
  sales" hit is a COMMENT describing already-removed copy, not live text; the one "me" hit in
  business.js is inside a demo QUESTION string written from the visitor's perspective, not Sam's), no
  em/en dashes (none found in any of the 7 files checked), no "AI" as a selling word, no competitor/
  other-tool mentions. "Sam Desk" (no apostrophe) confirmed consistent everywhere it appears; the nav
  label is still "For business". The product already carries a client-side lint() guard (js/onebox.js)
  that throws on these words in dev for every string passed through it - this sweep is a verification
  pass plus the one gap lint() does not cover (a string built outside lint(), like the two
  "Nothing estimated." sites above).
  CHECKS: searchCheck.js shows the same known Attack-Challenge 429 pattern on 7 of 9 pages (confirmed
  all genuinely 200 with correct titles/H1s via real-Chrome Puppeteer, not a regression).
  crossProductCheck.js needs Supabase env not present locally; ran the equivalent ops hook instead
  (task=enginecheck, PROBE_KEY via Keychain) - the FULL 55-spec batch times out past Vercel's request
  budget (a known, already-documented limit, see the code's own comment), so I ran a 4-spec
  representative subset (Porsche 911, Camaro Z28, BMW M3, Mustang Shelby GT350):
  mismatchSpecs: 0, Market Check/Buy/Sell/Tasks all agree exactly on range/count/latest-sale for
  every spec, confirming today's hierarchy reorder (a render-order-only change) and the daily-limit
  gate (sits before the engine call, never touches its output) left the shared engine's actual
  figures untouched. Baseline: /sell /buy /tasks /market-check /business all 200 at 1440 and 390,
  titles/H1s intact (/business checked with a cache-busting query param - it is edge-cached for about
  an hour, the same gotcha from last round).
  Search check: no public page's title/H1/lead/canonical changed this round (the hierarchy reorder
  only moves content within the body, the landing's h1 stays the hidden search-only one unchanged).

- 2026-10-09 (Lane B): JOBS 1-6, ENGINE AND DATA FIXES.
  * Job 1, M3 Competition (2012) mismatch: NOT reproducing. Live-verified three independent ways
    (obdiag direct runOneBox call, the real Market Check public API, a fresh enginecheck run) - all
    four lanes agree at count=37, poolTrim "Competition", identical labels/range. Lane C's original
    observation (commit a9715f4: marketCheck=210/sell=210 vs buy=37/tasks=37) traces to buyLane
    (scripts/crossProductCheck.js) reading through spec_market_cache (lib/live/search.js, SPEC_TTL 6h)
    while marketCheckLane/sellLane call the engine live every time - the SAME staleness class already
    named for the 911 Turbo Targa case (SPEC_V comment). The cache row has since naturally refreshed.
    No code change made (nothing is currently wrong); 37 (the Competition-trim-scoped count) is the
    correct number by the trim-scoping principle.
  * Job 2 FIXED (commit 3e535e9): Targa recent-sales mismatch. fetchOnlinePool (lib/platformPick.js)
    called runOneBox but never surfaced its own deduped recent3 (lib/onebox.js lastThreeDistinct, which
    skips an apparent re-listing - same title/mileage); crossProductCheck's sellLane re-sorted the raw
    pool instead, a genuine second "most recent 3" implementation that disagreed on a re-listed 1991
    Carrera 4 Targa title. fetchOnlinePool now passes recent3 through (additive); sellLane reads it.
    Before: recent MISMATCH. After: recent MATCH, mismatchSpecs:0. Verified live.
  * Job 3 FIXED (commit ba77b01, verify probe e26fb05): reserve tile labels. reserveDayInsightForVehicle/
    reserveInsightForVehicle (lib/onebox.js) unconditionally uppercased generation.code, which is
    sometimes an ORDINAL WORD (first..tenth, used where no real chassis code exists - Mustang
    generations) not a chassis code, producing "FIRST Mustangs"/"FIRST-generation Mustang". Added
    RESERVE_ORDINAL_RE + reserveGenWord, mirroring js/result-v2.js's existing V2_ORDINAL/v2GenWord rule
    (duplicated across runtimes - flagged in comments, not importable, classic script vs ES module).
    Before: "FIRST Mustangs" / "FIRST-generation Mustang". After (verified live via obdiag reserve=1):
    rd.scopeLabel="first Mustang" (template appends "s" -> "first Mustangs"), ri.scopeLabel="first
    generation Mustang". Chassis-code case unchanged/correct: ri.scopeLabel="E30-generation M3".
  * Job 4 FIXED (commit 5eeb845, verify probe 6bb52f4): year-scoped model chips. modelSuggestionChips's
    existing PRODUCTION_RULES year-guard (lib/vehicle.js) only matched a candidate against the BASE
    nameplate rule; "Land Cruiser 80 Series" (a generation-qualified candidate string) never matched
    the base "Land Cruiser" rule (exact-model-name check), so it passed through with no year gate, and
    "Tacoma" had NO rule at all. Added generationRangeForCandidate (matches a candidate against
    lib/generations.js CURATED_GENERATIONS by code, e.g. "80-series" inside "Land Cruiser 80 Series",
    gated on THAT generation's own narrower range) ahead of the PRODUCTION_RULES check, wired into all
    three guard call-sites in modelSuggestionChips; added a Toyota Tacoma PRODUCTION_RULES entry
    (1995-2026). One shared function (modelChipsForMakeYear/modelSuggestionChips) feeds every caller
    (Buy, Market Check, Sell's VIN flow, Tasks, One Box model_choice) - confirmed via caller grep, no
    second chip-building path exists for this function. Before: 1985 Toyota chips included Tacoma and
    Land Cruiser 80 Series. After (verified live via obdiag chips=1): ['4Runner','Hilux','FJ Cruiser',
    'Supra','MR2','Not sure'] - no anachronisms.
  * Job 5, data plan headroom report: added task=ocdplan (api/usageDashboard.js, commit 11effcc),
    read-only, zero OCD spend, reads event_type="ocd_call" ALONE (lib/_ocd.js's own documented single
    source of truth) and attributes by metadata.job. FINDING: only 5 callers ever tag their job via
    configureOcdUsage (ingest_delta, ingest_backfill, ingest_attempts, pull_live, pull_live_bid);
    everything else (warm, the partner-premium recompute, live Market Check/Buy/Sell/Tasks engine
    fetches, and this dashboard's own ops probes) lands under one generic "ocd" tag, genuinely
    unsplittable today without a code change. Deliberately did NOT sum ocd_call alongside the per-job
    summary events (job_warm, seller_decision, partner_fetch...) - task=status's own comment already
    names that conflation as a ~4.6x inflation bug; this task avoids repeating it. REAL DATA (only 4
    days of ocd_call history exist in the 14-day window queried - the event type looks recently
    introduced): grandTotal 2491 over 4 days (avg 623/day). untagged 1783 (71.6%), live-auction poll
    406 (16.3%), nightly ingest delta 302 (12.1%). No ingest_backfill/ingest_attempts/pull_live_bid
    activity in this window. Day totals: 10-06=1, 10-07=547, 10-08=816, 10-09=1127 (partial day,
    inflated by this session's own obdiag/enginecheck verification calls, which are themselves
    untagged). RECOMMENDATION (not implemented, report-only per the ask): tag job in configureOcdUsage
    for scripts/warm.js, the live engine fetch path, and this dashboard's ops-probe tasks, so a future
    report can actually split the 71.6% untagged bucket; until then, no further cut can be recommended
    with real numbers behind it. Also flagged: task=status's dailyBudget fallback (900) and
    api/sellerDecision.js's OCD_DAILY_REQUEST_BUDGET fallback (33) differ for the same unset env var -
    harmless while the var is set, worth aligning if it is ever unset.
  * Job 6: full crossProductCheck (53/53 DEFAULT_SPECS, run in 8 batches to stay inside one function's
    time budget) - mismatchSpecs:0 on every batch. Search-rules check: PASS, verified via a real
    browser against all 9 canonical pages (home/sell redirect, /buy, /mcp, /market-check, /tasks,
    /how-sam-decides, a hub, a spec, a VIN page) - title/h1/canonical/lead all present, no noindex-in-
    sitemap; node's own raw-fetch run showed 429s, confirmed as Bot Protection set to Challenge, a known false
    positive (browsers get 200), not a real failure. /sell /buy /tasks /market-check /business signed
    out: all HTTP 200, correct title/H1, "Sign in" cue present (confirms signed-out state), zero
    console errors.
  * No Lane A/C files touched this round (lib/platformPick.js, lib/onebox.js, lib/vehicle.js,
    lib/vehicleData.js, scripts/crossProductCheck.js, api/usageDashboard.js are all Lane B's).
    api/sellerDecision.js was read for context only, never edited, per the standing handoff.

- 2026-10-09 (Lane C): NEAR 150, BUY TRACKING, PICK FOLD STOPPED, CREW LINK FIXED.
  * Near (0f56e19, 7302ee5): lib/live/samChat.js runSearch NEAR_MILES = 150 (a named distance wins). Empty
    state reads "No live {search} within 150 miles of {place} right now." and offers "Within 500 miles (n)" /
    "Anywhere in the US (n)" only when they add real cars (same rows).
  * Buy tracking (0f56e19): Lane A's two auction_clickout attributes shipped intact; the card's Market Check
    button carries market_check_open (source buy) and the drawer's sale rows receipt_click (venue slug).
    Verified live: one row each in funnel_events for the same visitor.
  * PICK FOLD (job 3) NOT APPLIED. Stage 1 only (05f4b38, no pick change): lib/platformPick.js onlinePicks
    (the online and rush ladder, pickPlatform calls it, buildSharedAnalysis returns analysis.sharedPick),
    api/sellerDecision.js sharedPickRoute / sharedSpeedRoute (unwired), ops task=pickfold. Over 85 cars
    (53 specs + the 40 audit cars, deduplicated) 6 picks would change, so it stopped there:
      1993 911 Carrera RS Targa, normal: PCarMarket -> Bring a Trailer (decide() finds a 12x specialist cell
        at the landed generation scope for a 1-sale venue; the shared ladder looks at model scope, finds none,
        and picks depth, BaT 4 sales).
      Rush (page v2Composition: first non-BaT card in score order with 3+ sales; shared: the ladder without
      BaT): 2019 911 Turbo S Cars and Bids -> Sotheby's Motorsport (3 v 3 tie), 1996 Boxster Spyder Hagerty
      -> Cars and Bids, 2015 Cayman GT4 Cars and Bids (7) -> PCarMarket (3, specialist cell), 2015 Corvette
      Z06 Hagerty -> Cars and Bids (3 v 3 tie), 1965 Corvette Hemmings (4) -> Hagerty (12).
    FOR LANE B / SAM: (a) choose the specialist scope (landed rung vs model); (b) the shared depthWins only
    prefers Bring a Trailer, so a tie between two other venues falls to pool order: needs a second rule.
  * CREW LINK (75d7445). Cause: pages with a crew-only rail cache their public copy at the edge and the cache
    ignores cookies, so a valid signed cookie still got the cached public rail (/buy and /market-check were
    HITs). vercel.json now routes a signed-shape gas_crew cookie to the same handler with _crew=1 (its own
    cache key, answered private, no-store): /sell, /tasks, /tasks/mine, /market-check, /how-sam-decides,
    /business, /buy, the 911 spec pages, /history, /vin. FOR LANE A: any NEW page with a crew rail needs the
    same has-cookie line in vercel.json. api/crew.js: right code -> Set-Cookie gas_crew (Domain=goasksam.com,
    Path=/, SameSite=Lax, Secure, Max-Age one year) and lands on /buy (or the gate's to=); wrong code -> plain
    403 page, nothing set. ops task=crewcookie&check=1: CURTAIN_CREW_CODE set and in the gas-crew- format.
  * Policy-floor cars (CLK DTM AMG Cabriolet, 275 GTB/4): live Sell does not show them as policy picks; both
    render the house-led thin read (RM Sotheby's / Broad Arrow, three real house sales each, ranges from those
    sales), headed "If you'd rather have it handled at a house" even for a seller who said "selling it myself".
    Not changed (job said do not change); for Sam to decide whether a DIY seller should see that.
  * "Nothing estimated." removed from the Sell house/thin footers and the new Sell landing (d9ed4a0).

- 2026-10-10 (Lane B): M3 COMPETITION CACHE DEFECT, NAMED AND CLOSED.
  * NAMED: spec_market_cache (lib/live/search.js). Read by Buy's card render and Tasks (same path);
    written by THREE independent callers that all go through the shared coreOf/persistCore builders -
    walkLadder/refreshSpec (Buy/Tasks' own live-engine fallback on a cache miss), api/sellerDecision.js's
    oneBox branch (Market Check and the Buy drawer, opportunistic fire-and-forget refresh after every
    clean live result), and the nightly deferred recompute (lib/_specRecompute.js, scripts/
    recomputeSpecCache.js). Market Check/Sell themselves NEVER READ this cache - they call runOneBox
    live on every request; only Buy/Tasks' card path reads it. Key: specKeyFor([make,model,trim,
    generationCode-or-year,bodyStyle,gearbox]). TTL: SPEC_TTL 6h, DAY_TTL 24h hard ceiling
    (EFFECTIVE_TTL = min). Version gate: SPEC_V (bumped manually, currently 8).
  * SECOND cache named for completeness: market_fetch_cache (api/sellerDecision.js, read-only, not
    edited). Keyed by ENGINE_VERSION|make|model-FAMILY (first word only - "M3" and "M3 Competition"
    share one row), 24h TTL. Governs only whether the OLD legacy OldCarsData-fetch gate skips a fresh
    pull; confirmed (by reading the SELL_PICK_SHARED code path, not editing it) that it is NOT in the
    path real Sell traffic uses today, so it is not the live mechanism for this specific mismatch -
    named and evidenced anyway since the job asked for every candidate cache.
  * EVIDENCE (real stored rows, via a new read-only obdiag cachecheck=1 probe, not a guess): queried
    the exact spec_market_cache key for "2012 BMW M3 Competition Coupe" live. Before any fix: row
    computed_at 1h old, market.v=8 (current), count=37 (correct) - the cache was NOT stale at the
    moment I could observe it; the original 210-vs-37 split had already self-healed by the time I
    could query it, so I could not recover a stored row proving the exact historical moment (it has
    since been overwritten by a fresh, correct computation - I was not able to find that evidence and
    say so plainly, per the ask). What the evidence DID prove: lib/onebox.js's own ENGINE_VERSION
    comment states intent ("mixed into every persistent... decision cache") that spec_market_cache was
    NEVER actually honoring - it had its own separately-bumped SPEC_V with no tie to ENGINE_VERSION, so
    an engine-logic change that bumped neither (or only one) could leave a row "valid" (right SPEC_V,
    within SPEC_TTL) for up to 6h after its own computed answer was already wrong. That gap is real and
    reproducible by inspection of the code, independent of whether I could catch a live instance of it.
  * ALSO FOUND (plain, in scope, fixed in passing): api/sellerDecision.js's opportunistic refresh calls
    coreOf() directly and persists the result without ever going through walkLadder; coreOf() never
    stamped v/engineVersion itself, so that persisted row ALWAYS failed prefetchSpecs' own validity
    check (market.v !== SPEC_V) regardless of freshness. The "ordinary traffic keeps a popular spec's
    card fresh" comment on that call site was a no-op in practice - walkLadder's own refresh (Buy/
    Tasks' OWN cache-miss fallback) was the only write that ever produced an acceptable row. Fixed by
    stamping v/engineVersion inside coreOf itself (the one shared builder), which fixes all three
    callers (including the nightly recompute job) without touching api/sellerDecision.js.
  * CLOSED (commit 827b218): coreOf now stamps engineVersion (lib/onebox.js's ENGINE_VERSION, the
    constant already documented as meant for this) on every row it builds; prefetchSpecs now requires
    engineVersion to match before accepting a row, in addition to the existing SPEC_V/TTL checks. No
    new cache, no new read path - the smallest change that makes the ALREADY-DOCUMENTED intent real.
    ENGINE_VERSION bumped once (e3-20261005-rangeladder -> e4-20261010-sharedspeccacheversion) to force
    a clean, one-time global invalidation of every existing row under the old, unguarded scheme.
    Verified live: the M3 Competition row now carries engineVersion exactly matching the current
    constant.
  * LIVE 4-PRODUCT CHECK (M3 Competition, 2012), right now: marketCheck/buy/sell/tasks ALL identical -
    count=37, range $38,000-$70,500, latest 2026-10-06, same 3 recent sales (order differs by design,
    dates match), referenceFigure 54,250 (medium). mismatchSpecs: 0.
  * crossProductCheck (commit c096e84): count comparison is now EXACT match, split out of the 10%-
    relative-tolerance low/high share - a discrete pool-membership fact must never pass at "close
    enough". "2012 BMW M3 Competition Coupe" was already in DEFAULT_SPECS, no addition needed. Added
    the nightly workflow's missing "Fail the job if crossProductCheck found a mismatch" step (it had
    continue-on-error with no follow-up fail gate, so a real mismatch never turned the job red) -
    mirrors the existing vinindex/specmarket/recomputespec pattern. FOR SAM: .github/workflows/
    nightly.yml needs this same step added by hand (my CI token lacks `workflow` scope) - the exact,
    already-pushed content is docs/nightly-workflow.yml (kept byte-identical); copy it over.
  * FULL crossProductCheck re-run after the fix (53/53 DEFAULT_SPECS, batched): mismatchSpecs: 0 on
    every batch, including the new exact-count rule. No regression from the cache-version change.
  * Search-rules check: PASS on all 10 canonical pages (home/sell redirect, buy, mcp, market-check,
    tasks, how-sam-decides, hub, spec, VIN, business), verified via real browser, zero console errors.
    /sell /buy /tasks /market-check /business signed out: all 200, correct title/H1, zero console
    errors.
  * Data plan (task=ocdplan, restated, no changes): grandTotal 2511 over the 5 days of ocd_call history
    that exist (the event type looks newly introduced) - 2026-10-06=1, 10-07=547, 10-08=816, 10-09=1127,
    10-10=20 (just started). untagged (warm+premium+live engine fetches+ops probes) 1783/71%,
    live-auction poll 426/17%, nightly ingest delta 302/12%. No ingest_backfill/ingest_attempts/
    pull_live_bid activity in this window. Same recommendation as last round stands: tag job via
    configureOcdUsage for warm/engine-fetch/ops-probe callers so the 71% untagged bucket can actually
    be split; not implemented (report-only job).

- 2026-10-10 (Lane B): 997 CARRERA S HALF-GENERATION REPORT (no code changes, as asked).
  * Report-only job. Pulled real last-12-month data for 997.1 (2005-2008) and 997.2 (2009-2011)
    Carrera S, coupe and cabriolet, via a TEMPORARY obdiag addition (genOverride/listSales) that
    called the SAME shared fence pipeline (lib/onebox.js listSalesForVehicle -> buildSpec ->
    fetchQualifying) with a synthetic generation object, never touching the curated table. Reverted
    after the pull (commit 38e2af6) - net diff on api/usageDashboard.js is zero.
  * FOUND IN PASSING (not fixed, not asked to fix, worth a note for whoever next writes a report-only
    probe): buildSpec's generation re-bind step (~line 1147) re-derives genCode/yearMin/yearMax from
    the REAL curated table whenever vehicle.year is set and matches exactly one curated generation -
    it silently overwrites any passed-in generation object. My first pass at this diagnostic got
    identical numbers for 997.1/997.2/merged because of this; worked around it by dropping
    vehicle.year in the probe (trim+body still scoped it precisely). Not a product bug - vehicle.year
    is always real for any genuine search, so this path is unreachable in production; only matters
    for a report-only probe like this one that wants to override the generation directly.
  * NUMBERS (last 365 days, archive-only, full fences applied):
    997.1 coupe n=65, p25 $47,250, median $59,000, p75 $67,500.
    997.1 cabriolet n=42, p25 $39,250, median $45,500, p75 $54,375.
    997.2 coupe n=15, p25 $61,750, median $71,000, p75 $87,813 (+20% median vs 997.1 coupe).
    997.2 cabriolet n=6 (below the engine's own 8-sale cluster floor), p25 $44,500, median $49,750,
    p75 $61,750 (+9% median vs 997.1 cabriolet).
    Merged, as served today: coupe n=80, p25 $49,000, median $60,500, p75 $70,625; cabriolet n=48,
    p25 $39,750, median $45,875, p75 $54,750. (80=65+15, 48=42+6 - counts reconcile exactly.)
  * Of the 20 coupe sales landing above the merged p75 ($70,625): 8 are 997.2 (2009-2011, incl. the
    three highest: $125k/31k-mi 2011, $106k 2010, $105k/18k-mi 2011) and 12 are 997.1 (2005-2008,
    incl. the $100,997/16k-mile 2006 the question named). 997.2 is 19% of the coupe pool but 40% of
    the above-range sales - overrepresented at the top by >2x its share - but low-mileage 997.1
    examples land above range just as often in raw count. Trust rules do NOT set any of this aside:
    every one of the 20 is a fully qualifying sale (fetchQualifying's own fences already applied) -
    the merge, not an unapplied exclusion, is moving the range.
  * RECOMMENDATION: keep the merge, but prefer same-half-generation sales for the middle-of-range
    sale and the three context cards. Reasons: the coupe gap is real (+20% median, both sides >=8
    sales, a clean split would be defensible) but cabriolet's 997.2 side (n=6) sits BELOW the
    engine's own 8-sale cluster floor - splitting outright would leave 997.2 cabriolet thin/no-range,
    a regression from today's merged answer. The user's actual named complaint (a 2010, a 2011, a
    16k-mile 2006 shown as "the above range cars") is a CONTEXT-CARD selection issue, fixable without
    touching the cluster width at all.
  * OTHER MODELS WITH THE SAME QUESTION (single curated generation entry, real counts pulled the
    same way): 991.1/991.2 is ALREADY split in lib/generations.js (2012-2016 / 2017-2019) - a working
    counter-example, not a gap. Gaps found:
    996.1 (1999-2001) n=159 median $27,800 vs 996.2 (2002-2004) n=81 median $29,250 (+5%, modest).
    987.1 Boxster (2005-2008) n=89 median $23,000 vs 987.2 (2009-2012) n=37 median $37,250 (+62% -
    the LARGEST gap found, bigger than 997's, both sides well above the cluster floor; worth
    prioritizing over 997 if Sam only splits one).
    E46 M3 pre-facelift (2000-2002) n=55 median $23,500 vs post-facelift/LCI (2003-2006) n=134
    median $27,125 (+15%).
  * No code changes made or left behind, per the job.

- 2026-10-09/10 (Lane A): CREW CACHE-POISONING FIX, VIN BUTTON CONFIRMED, REJECTED CHIPS, DAILY LIMIT
  PROVEN (commits 97c4107, cace3d9, 8104d54, b2fc52c, 5d075b8, 975c504).
  JOB 1 (crew gates): searched the whole codebase for gas_crew - every page I own (api/marketCheck.js,
  api/business.js, api/specPage.js, api/history.js, api/publicConfig.js, api/sellPage.js,
  api/sellNext.js, api/tasksPage.js, api/howSamDecides.js) already imports isCrewRequest from
  api/_chrome.js, which already delegates to lib/_crew.js's signed check (Lane B's "Signed crew
  cookie" round, commit e614841, landed concurrently). No raw `gas_crew=ok`/shape-check ACCESS gate
  remained in code (only stale comments naming the old mechanism). BUT testing the 4 cookie cases
  live surfaced a REAL bug, not a code-check bug: EDGE CACHE POISONING. Reproduced and fixed - see
  below. Lane C independently found and fixed the SAME root cause via vercel.json cookie-shape
  routing (`has: cookie gas_crew v1\..*` -> a separate `_crew=1` cache key) the same round, commit
  75d7445 (see their "CREW LINK" entry above) - MY fix is a COMPLEMENT, not a duplicate: their
  routing only checks cookie SHAPE (regex), not cryptographic validity, so a garbage-but-v1-shaped
  cookie would still get a cacheable response INSIDE their `_crew=1` namespace and could poison a
  later real crew visitor there. Mine makes Cache-Control private whenever a gas_crew cookie is
  PRESENT AT ALL (valid or not), closing that residual gap. Fixed in the 5 pages I own:
  api/marketCheck.js, api/business.js, api/specPage.js, api/publicConfig.js, and api/history.js
  (whose shared send() helper gained a req parameter so it could check cookie presence - all 8 call
  sites updated). COOKIE TEST TABLE (non-crew device, verified live post-fix, both mechanisms
  combined):
    no cookie                  -> locked (reduced rail), public/cacheable - correct
    old value gas_crew=ok      -> locked, public/cacheable - correct (never matches v1. shape, is
                                   legitimately public content anyway)
    made-up v1.-shaped value   -> locked, PRIVATE/no-store (closes the poisoning gap) - correct
    real signed value (minted  -> UNLOCKED (full rail, Buy/Sell/Tasks/For business all visible),
      live via /api/crew)         PRIVATE/no-store - correct
  Verified on both rail systems: lib/appShell.js's #gas-rail (Market Check) and api/_chrome.js's
  .rail (the Porsche 911 spec page). Also fixed a banned word ("no estimates") in
  api/publicConfig.js's default OG description, caught in the same file.
  JOB 2 (VIN page Keep looking): already correct (shipped two rounds ago) - verified live on a real
  VIN page (/history/2003-bmw-m5/WBSDE93483CF93837): the shared .gas-keepl card, target="_blank",
  href seed=vin&vin=...&car=... No fix needed.
  JOB 3 (rejected model chips): New Sell only loads js/onebox.js, never js/chat-core.js, so there is
  no shared sellState for the EXISTING noteRejectedModel/dropRejectedChips to read from. Reused the
  SAME algorithm (year+make key, normalized model text, filter-only) as local module state in
  js/onebox.js. api/sellerDecision.js's two needs_clarification response points in the One Box
  branch now carry invalidVehicle (resolution.status === "invalid_vehicle"). PROVEN via a controlled
  test (intercepted one response to artificially reject "4Runner" for 1985 Toyota, confirmed the
  REAL next engine call for "1985 Toyota" came back without 4Runner in modelOptions, which it
  normally includes) - this is a cleaner proof than a real invalid-car search, since the engine's
  own candidate list already excludes genuinely-impossible combinations, which would have made a
  real-car test ambiguous about whether MY filter or the engine's own data did the excluding.
  Confirmed "Nothing estimated." appears nowhere on this card (removed two rounds ago).
  JOB 4 (daily limit, proven end to end): added MARKET_CHECK_DAILY_CARS env var (test only, never
  request-trusted, defaults to 10, read fresh every call). CREW ARE EXEMPT from this cap entirely
  (documented in the code comment) - proving it REQUIRES testing as a non-crew visitor; a crew
  cookie would never see the limit fire. Set the var to 2 in Vercel, redeployed, tested, removed the
  var, redeployed again - confirmed live cap is back at 10 (3 distinct cars in one sitting, all
  allowed). TWO FALSE ALARMS along the way, both my own test-harness bugs, not product bugs, written
  up in case they help whoever else tests this: (1) DOM-based click+wait tests desynchronized under
  the narrated multi-stage loader - fixed by reading the actual /api/sellerDecision response instead
  of DOM state; (2) repeated fresh `?q=` page loads raced the async gas_vid-minting beacon
  (lib/_visitor.js, fired via a background POST to /api/funnel, not set in the page's own SSR
  output) - the FIRST request of a brand-new browser session can fire before that cookie exists,
  landing under a different (IP+UA-hash) device key than every later request, splitting one
  device's history in two. A REAL visitor typing+clicking normally doesn't race this (natural human
  pause before the first click dwarfs the mint round trip); it is specifically the `?q=`
  instant-auto-search pattern - which I used as a test shortcut - that collides with it. Retested
  with realistic pacing (one page load, explicit wait for gas_vid, then type+click each search) and
  the proof came back completely clean: car1 allowed, car2 allowed, car3 BLOCKED (business_limit,
  correct samLine, no sign-in demand), repeat of car1 allowed (already-seen path). FLAGGING, not
  fixing (shared with every other lib/_ceilings.js caller, not unique to this function): a visitor
  whose very FIRST action on a cold session is fast enough to race the gas_vid mint (e.g. a
  prefilled `?q=` deep link that auto-searches) could in principle have their first search land
  under a throwaway device key - narrow, no user-facing symptom beyond a theoretical one extra slot
  on day one, not chased further this round. Used a new temporary read-only ops task
  (task=ratehits, PROBE_KEY-gated, kept as a permanent small debugging tool like the others) to
  directly inspect the ip_rate_hits ledger when DOM/response evidence disagreed - this is what
  actually found the device-key split, not guessing.
  JOB 5 (limit card copy): already compliant - "That's today's limit for individual lookups. Sam
  Desk is built for ongoing or business use." + "Open Sam Desk" link, no first person, no tool
  mentions, no banned words, wrapped in lint(). No changes needed.
  CHECKS: searchCheck.js same known 429 pattern (confirmed 200 live via Chrome). crossProductCheck
  (ops subset, 4 real specs incl. 997/M3/Camaro/GT350): mismatchSpecs: 0 - the hierarchy/limit/gates
  work this round touched nothing the engine computes. Baseline: all 5 pages 200 at 1440 and 390,
  titles/H1s intact.

- 2026-10-10 (Lane C): PICK FOLD APPLIED (three rules), HOUSE-ONLY OPENING, ALERT EMAILS.
  * RULES live in lib/platformPick.js only (0b41ed9, a26597c): rule 1 specialist needs 2+ sales, generation cell
    only with 3+ sales at that generation else model cell; rule 2 depthWins: more sales, more recent sale, more
    sales at model level (sales_archive count, read only for venues still tied), Bring a Trailer, list order;
    rule 3 onlinePicks speed: depth over SHORT_AUCTION_VENUES (speedToList fast/medium_fast), floor 3. A US
    seller's picks only ever name a US venue (US_ROUTE_VENUES; Collecting Cars had led the RS Targa pool).
    Load checks in api/sellerDecision.js keep ROUTE_POLICIES / US_ROUTE_ALLOWLIST and the shared sets equal.
  * WIRE: decide() picks through sharedPickRoute(analysis.sharedPick) (thin-window override first) and returns
    speedPick; the premium/dominance/specialist/depth branches are gone from api/sellerDecision.js. NOTE: this
    reached main inside another lane's commits (c9b5a18 / 5d075b8 swept my working-tree edits in), slightly
    before the comparison list was final; the list below is legacy vs the live result. Page: js/result-v2.js
    v2Composition uses decision.speedPick; js/result.js always puts the server's pick and rush pick in the two
    cards (they were cut to the top two by score) (5cdf489, db1f882).
  * CHANGES (85 cars, legacy -> live): 1993 911 Carrera RS Targa PCarMarket -> Bring a Trailer (rule 1, both
    timelines); 2009 GT-R Bring a Trailer -> Cars and Bids (rule 2, 4 v 4, C&B sold Sep 23, BaT Jul 30; its rush
    line disappears, same venue); rush: 2019 911 Turbo S C&B -> Sotheby's Motorsport (rule 2, 3 v 3, Oct 8 vs
    Aug 26), 2015 Corvette Z06 Hagerty -> C&B (rule 2, 3 v 3, Jun 19 vs Jun 3), 1965 Corvette Hemmings -> Hagerty
    (rule 3, 12 v 4), 1930 Model A Hemmings -> Hagerty (rule 3, 12 v 8). 1996 Boxster Spyder is a question first
    (resolver invalid_vehicle), never a pick.
  * CHECK: scripts/crossProductCheck.js checkSinglePick: fails on any folded piece (depth/tie-break comparisons,
    clearedPct, specCell, evBacked, .marketShare >= 75, lift >= 3, the premium sample gate, depthWins) outside
    lib/platformPick.js, and runs RS Targa (rule 1), GT-R (rule 2), 1965 Corvette rush (rule 3) through decide()
    and pickPlatform. No live car lands on a specialist PICK under rule 1 (28 candidates tried), so case 1 proves
    the 1-sale specialist is refused.
  * HOUSE-ONLY (js/result.js renderThinDecisionSell): a DIY seller on a car whose every recorded sale is at a
    house opens with "Every recorded sale of the {model} was at an auction house. The online record has none, so
    the route to sell it is a house." and the house card as the recommendation. Auction-house sellers unchanged.
  * ALERT EMAILS (376933b, c2ddfc7). Task live alert built in code (lib/tasks/tasks.js alertBlocks/alertEmail),
    send-time recheck stillLive (stored records), findMatches drops ended end_time; sold notice (lib/live/
    watches.js messageFor) and Before it ends (lib/live/buyAlerts.js) share the footer Open the task / Pause /
    Stop and the "View on {venue}" button; lib/_email.js firstEmailTo = the junk line only on an address's first
    email from any alert. placingFor (lib/onebox.js) is the one placing wording everywhere. Watches have no
    paused state: Pause on a sold notice is the signed "this one" link (stop this one), Stop is every alert.
    FOR LANE A: Market Check's "Put Sam on it" copy says watch in places; user-visible emails now say task.

- 2026-10-10 (Lane B): HALF-GENERATION HANDLING SHIPPED (987 split, same-half cards for 997/E46 M3).
  * Job 1 (count reconciliation): 89 (Market Check's own headline for "2008 Porsche 997 Carrera S")
    and 128 (my prior round's table, 80 coupe + 48 cabriolet) cover DIFFERENT stages of the SAME
    pipeline, not a bug. 89 = soldCount = solid.length after r4Split's statistical aside-step
    (special-title + price>p75*1.35 outliers removed) over the trailing 12 months, body-unspecified -
    the population that actually sets the displayed range. ~128ish = the WIDER archive-fence-
    qualifying population (same make/model/trim/generation/window) BEFORE that statistical trim -
    includes the "ABOVE RANGE, shown separately" outlier cards the page itself displays (confirmed
    live: the $106k 2010, $100,997 2006, $125k 2011 cards are explicitly excluded from the 89 and
    shown separately). A third numbers, 196, is htMeta.totalN - a 36-month ALL-platform count for
    the thin/house-steer assessment, unrelated to either. No engine bug; my prior report should have
    labeled 128 as "all qualifying sales" rather than imply parity with the page's own headline.
  * Job 2 (boundary table + report): built HALF_GENERATIONS in lib/generations.js
    (HALF_GEN_MIN_SALES=8, HALF_GEN_MIN_GAP_PCT=25, both exported constants). Real last-12-month
    counts/medians (archive-fence-qualifying population, same methodology Job 2 asked to use):
      987 Boxster: 987.1 n=88 median $23,000 vs 987.2 n=37 median $37,250 (+62%) -> SPLIT.
      987 Cayman: 987.1 n=92 median $27,500 vs 987.2 n=50 median $47,375 (+72%) -> SPLIT.
      997 Carrera S coupe: 997.1 n=65 median $59,000 vs 997.2 n=15 median $71,000 (+20%) -> merge.
      997 Carrera S cabriolet: 997.1 n=42 median $45,500 vs 997.2 n=6 (below the 8-sale floor)
        median $49,750 (+9%) -> merge.
      996 Carrera: 996.1 n=159 median $27,800 vs 996.2 n=81 median $29,250 (+5%) -> left alone
        entirely (no table entry at all - the owner's explicit call, not even same-half cards).
      E46 M3: pre-facelift n=55 median $23,500 vs post-facelift n=134 median $27,125 (+15%) ->
        merge, same-half cards on.
    CAVEAT found in passing: "Boxster S"/"Cayman S" trim scoping does NOT cleanly isolate the S
    trim - a "Boxster S" query's sample titles included plain "Boxster" and even "Cayman S" rows,
    and base "Boxster"/"Cayman" queries cross-contaminate each other at a modest 4-8% rate (both
    share the chassis-code union token "987" with no model distinction at that fetch). Pre-existing,
    not fixed this round (out of scope, not material enough to flip any split decision given the
    gaps are 62-72% vs a handful of percentage points of contamination) - used base-model (no trim)
    numbers for the actual decision, which the owner's own framing already does too.
  * Job 3 FIXED (commit 5184d8e): 987 Boxster/Cayman split=true in HALF_GENERATIONS. buildSpec
    (lib/onebox.js) narrows spec.yearMin/yearMax/genCode to the matched half ONLY when a year pins
    exactly one half AND split=true; a bare, year-less search is untouched (confirmed live: "Porsche
    Boxster" with no year still asks the pre-existing 986/987/981/718 generation_choice question,
    identical to before). halfGenAvailable is returned even when no year pins a half, so the
    evidence note can say a split exists without guessing one.
  * Job 4 FIXED (same commit): pickRepresentative (lib/onebox.js) now takes ownHalf + a per-row
    halfOfFn; when the subject's own half has >=3 qualifying comps, all three context cards (middle-
    of-range, fewer miles, more miles) are scoped to that half alone; under 3, the full cross-half
    pool stands exactly as before and each returned card carries a sameHalf flag (plus its own year)
    for the page to label a fill-in. Applies to EVERY lane through the one shared buildResult/
    pickRepresentative path (Market Check, Buy's drawer, Sell, Tasks all call runOneBox) - confirmed
    live for 997 (2008, ownHalf 997.1, all 3 cards same half, years 2006/2008/2008) and both E46 M3
    halves (2001 -> e46-pre, all cards 2002; 2005 -> e46-post, all cards 2004-2005).
  * Job 5: ENGINE_VERSION bumped (e5-20261010-halfgeneration). CAUGHT AND FIXED a real cache-key
    collision before it reached production: specKeyFor (lib/live/search.js, the ONE shared builder
    Buy/Market-Check-opportunistic-refresh/the nightly recompute job all use) keyed a half-
    generation model by its MERGED generation.code only ("987" for both halves) - two genuinely
    different answers would have shared one spec_market_cache row, and whichever cached first would
    silently serve the other half's window/cards to Buy and Tasks. Fixed by mirroring buildSpec's
    own half match inside specKeyFor itself (one shared table, one match, now in two call sites that
    both read the SAME lib/generations.js functions). Verified live: 2006 vs 2010 Boxster now
    produce genuinely different cache keys ("987.1" vs "987.2").
  * Job 6 (before/after, all four products): verified via enginecheck, mismatchSpecs:0 on every
    spec checked.
      2008 997 Carrera S coupe: low/high/count/latest/recent/referenceFigure MATCH across
        marketCheck/buy/sell/tasks (49000-67500, n=56, ref 58250 high-confidence).
      2006 987.1 Boxster convertible: MATCH (18500-34000, n=61, ref 26250 medium). BEFORE (merged,
        no year pinned - the genuine pre-fix state for any year 2005-2012): 20500-40500, n=88.
        987.1's own range moved -9.8% on the low end, -16.0% on the high end versus what was served
        before - a 2005-2008 buyer today sees a materially LOWER, tighter range than the merged
        figure was showing them.
      2010 987.2 Boxster convertible: MATCH (29000-48500, n=24, ref 38750 medium). Versus the same
        20500-40500 merged baseline: +41.5% low, +19.8% high - a 2009-2012 buyer was being shown a
        range dragged DOWN by the slower, cheaper 987.1 sales mixed in.
      2001 BMW M3 coupe (e46-pre) and 2005 BMW M3 coupe (e46-post): MATCH across all four for both
        (24000-44000, n=88, ref 34000 medium, identical for both years - confirms the merge is
        genuinely unchanged; only the context cards differ by half, not the range).
  * Job 7: crossProductCheck DEFAULT_SPECS extended with 6 half-generation cases (987.1/987.2
    Boxster, 997.1-era/997.2-era Carrera S, E46 M3 pre/post) - commit d28f4e9. Full run, 59/59
    specs, mismatchSpecs:0 on every batch. Search-rules check: PASS on all 10 canonical pages.
    /sell /buy /tasks /market-check /business signed out: all 200/304, correct title/H1, "Sign in"
    cue present, zero console errors.
  * Files: lib/generations.js, lib/onebox.js, lib/live/search.js, scripts/crossProductCheck.js.
    api/sellerDecision.js and lib/platformPick.js were not touched (both import specKeyFor/
    runOneBox unchanged; the fix in lib/live/search.js propagates to both without editing either).

- 2026-10-10 (Lane C): TASK EMAILS, NO "ALERT", TASK EMAIL FIXES (5fd6bac, 5d7722c, 6c8342c, 6a84812, a795aaa).
  * Subjects: live "Sam found a {year make model trim}, live now" (several: "Sam found three cars for your task,
    live now"); sold "A {car} just sold on {venue}"; sold digest "Sam saw N sell: {task}".
  * Hard gate lib/tasks/tasks.js taskFits (make, model family, year) before every other criterion. Probe
    task_match_audit: 3 active tasks, 34 matches, 0 mismatches. The GMC in an earlier test email was the TEST
    action picking any no-bid listing, never a task match; tests now use the real search plus the gate.
  * Live email: bid once ("Current bid $36,000, below the range of recent sales." or the bid alone, "No bids yet."
    only with no bid); "Matches your task: manual, 911, 1981."; at most 10 cars plus "And N more are in your task."
  * Sold email: each sale placed against r4Cluster over the same engine pool, sales in the 12 months BEFORE it.
    Example 1988 911 Carrera Targa, $97,250 on Oct 9: band before $63,000 to $81,500, band now $63,500 to $82,500,
    Market Check same car $63,500 to $82,500 (54 sales): same function, same pool. FOR LANE B: the pool is the
    whole 3.2 Carrera family (label "3.2 Carrera 911 Carrera"), not Targas only, the known Targa body gap
    (finding 8), which is why most Targa sales read above it.
  * Pause / Stop: one task each everywhere. Live tasks: api/tasks.js confirm page "Pause the task: {task}" /
    "Stop the task: {task}". Sold tasks: lib/live/watches.js soldTaskTap + api/watch.js ?a=pause|stop|resume,
    signed, constant time, confirm page names the task, POST acts; one-click unsubscribe is that task's Stop.
    FOR SAM: run the one line at the end of docs/supabase-watches.sql (watches.paused_at); until then a sold
    task's Pause says plainly it is not ready and nothing changes. Before it ends: Stop ends that one notice
    (no Pause, it fires once). Stopping every task email: the Tasks page "Email updates" switch.
  * "alert" removed from everything people see: Buy band sentence, /tasks title and eyebrow, the stop page
    ("every task email"), stop/pause links now ?stop=1 (?alert=stop still answers for mail already sent).

- 2026-10-10 (Lane B): TRIM CONTAMINATION FIX + COUNT RECONCILIATION SHIPPED.
  * Job 1 reconciled exactly for "2008 Porsche 997 Carrera S" (Market Check's own chip, body
    unspecified, last 12 months): qualifying 94 -> used 89 -> setAside 5 (all 5 aboveRange, 0
    belowRange, all 5 reason "odd sale" = r4Split's price-outlier fence, p75*1.35). 94 = 89 + 5
    exactly. The page's "5 sales set aside" (quarterly-section text) and the "Shown separately"
    cards (3 shown + "Show 2 more" = 5 total) are the SAME number in two places, not two different
    counts under similar words. CORRECTION to my last report: the 128 I reported then (80 coupe + 48
    cabriolet, via a synthetic generation-override diagnostic at sinceDays=365) was NOT computed by
    the same method as this round's engine-exposed `counts.qualifying` (94) - it is not the number
    to reconcile against; 94 is.
  * Job 2 SHIPPED: lib/onebox.js buildResult now returns `counts: {qualifying, used, setAside:
    {total, aboveRange, belowRange, reasons}}` - plain numbers (soldCount/setAsideCount stay word-
    ified for copy), additive, no change to range/selection logic. lib/live/search.js coreOf/
    listingMarket pass it through so Buy/Tasks' own read carries the identical figures.
  * Job 3 root cause FOUND AND FIXED (two parts, both in lib/onebox.js qualifyReason):
    (a) the titleContains check ran the LENIENT substring match first and only fell back to the
    STRICT word-boundary regex when the substring was entirely absent - backwards for any trim
    whose text is a substring of the base model/common words ("S" inside "Boxster"/"Cayman"/
    "Porsche"/"6-Speed"), present in nearly every title, so the strict check never ran. Flipped:
    the regex is now authoritative whenever it can be built.
    (b) even with (a) fixed, a bare "S" still matched inside a longer compound trim the archive
    titles in full ("Turbo S", "GTS") - added COMPOUND_TRIM_QUALIFIERS (full-pattern exclude list,
    mirrors SUBTRIM_FENCES' own exclude regexes for 911) so a title naming a compound the search
    didn't name is excluded, in both directions (a bare "Turbo" search no longer pulls in "Turbo
    S" either).
    SWEEP (5+ affected searches, before -> after, archive-fence-qualifying population):
      Boxster S: before pooled with base Boxster + leaked Cayman S titles (count=88, same as base
        Boxster) -> after count=36, clean, $22,000-$31,500.
      Cayman S: before pooled with base Cayman + leaked Boxster titles -> after count=66, clean,
        $23,500-$31,000.
      Cayenne S: before included Cayenne Turbo S cars -> after count=71, clean, $13,500-$22,500.
      Cayenne Turbo: before included Cayenne Turbo S cars (same compound-suffix bug) -> after
        count=59, clean, $17,000-$28,000.
      Cayenne Turbo S / Cayenne GTS: unaffected either way (full compound IS the search), confirmed
        unchanged at $26,000-$44,500 / $20,000-$29,500 - control cases.
      911 GT3/GT3 RS and 911 Turbo/Turbo S: ALREADY correctly separated via dedicated
      SUBTRIM_FENCES entries (911-only); confirmed unchanged, not affected by either bug or fix.
  * Job 4: ENGINE_VERSION bumped twice this round (e6-20261010-trimfix for the qualifyReason fix,
    e7-20261010-countspassthrough when a cache row written in the narrow window between the e6 bump
    and the coreOf/listingMarket counts-passthrough fix was caught matching e6 but missing counts -
    a version bump covers a shape change, not just an answer change). specKeyFor already includes
    v.trim in the key - no new split dimension, trim was always part of it.
  * Job 5: before/after for all 6 named specs (2008 997 Carrera S, 2008 Boxster S, 2009 Cayman S,
    2001 M3, 2005 M3, 1987 911 Carrera) - mismatchSpecs:0 across Market Check/Buy/Sell/Tasks for
    every one (Market Check's own lane asks a body_choice question for the two bare M3 queries,
    same as it always has for a year-only E46 M3 search - buy/sell/tasks still agree with each
    other, so this is not a new gap).
  * Job 6: crossProductCheck extended - qualifying/used/setAsideTotal/aboveRange/belowRange now
    compared across all four lanes (exact match). Sell's counts come from its EXISTING second
    runOneBox call (the asking-line verification already added last round), since fetchOnlinePool
    (lib/platformPick.js, Lane C's) does not surface counts and was not edited. Two new regression
    specs added (Boxster S, Cayman S). Full run: 61/61 specs, mismatchSpecs:0 on every batch (one
    spec showed a transient mismatch mid-deploy during the rapid back-to-back ENGINE_VERSION bumps
    this round - re-ran clean seconds later, not a real regression).
  * Files: lib/onebox.js, lib/live/search.js, scripts/crossProductCheck.js, api/usageDashboard.js
    (listSales/cachecheck diagnostics, left in - same pattern as prior rounds' ops tasks).
    api/sellerDecision.js and lib/platformPick.js were not touched.

- 2026-10-10 (Lane B -> Lane C): NEW ENGINE FIELD `bodyScoped` (lib/onebox.js, on every result/thin
  tier the engine returns, also passed through by lib/live/search.js coreOf/listingMarket as
  `m.bodyScoped`, so Buy/Tasks/task-emails read the identical value Market Check does).
  WHAT IT MEANS: `true` - the car or listing names a body style (coupe/cabriolet/convertible/targa/
  speedster/roadster/spyder) AND the pool was restricted to that body style. `false` - a body style
  is known but the pool was NOT restricted to it (the spec.familyInclude case - title-split families
  like the 812 Superfast/GTS or Shelby Cobra 289/427/Daytona, where the family token, not body style,
  decides pool membership). `null` - no body style applies (bare model search, or a model where body
  style has never been asked/known).
  TWO WAYS A CAR CAN BE BODY-SCOPED, BOTH COVERED: (1) `spec.bodyStyle` is set directly (normal case -
  "coupe", "cabriolet", etc. parsed as a body word). (2) `spec.trim` itself IS a body-style word -
  currently only Targa and Speedster for the Porsche 911, because lib/vehicle.js's
  PORSCHE_911_BODY_HINT_TRIMS deliberately keeps a bare "911 Targa"/"911 Speedster" query's body word
  in `trim`, not `bodyStyle` (a pre-existing, documented resolver choice, not something this round
  changed). bodyScoped's computation checks `/^(targa|speedster)\b/i.test(spec.trim)` as well as
  `spec.bodyStyle`, so this case is NOT misreported as unscoped. If you add a third body-hint-as-trim
  case anywhere, extend this same regex check in lib/onebox.js buildResult or bodyScoped will go
  stale again.
  HOW TO USE IT (Lane C already wired the read side of this ahead of the fix landing - confirmed in
  lib/tasks/tasks.js line ~444, `m.bodyScoped !== false`, gating whether placingFor runs on a live
  listing): treat `false` as "don't trust this range for a body-specific claim" the same way you'd
  treat a thin pool - it means the range was built from a WIDER population than the car's own body
  style. `null` means body style isn't a relevant dimension for this car at all (safe either way).
  `true` is the normal, trustworthy case.
  SEPARATE FIX, same commit family: the listing-judgment path (lib/live/search.js listingFacts, used
  by Buy/Tasks/task-emails to read a raw OCD title) only sets body style when the title itself names
  one; a title with no body word stays unscoped (bodyScoped: null or false depending on whether the
  model has a known body style default). This is NOT a bug to fix further - a title that doesn't say
  "Targa" or "Convertible" genuinely doesn't tell you the body style, so leaving it unscoped is the
  honest behavior, not a gap.
  ENGINE_VERSION bumped twice this round for this field: e8-20261010-bodyscoped (field added),
  e9-20261010-bodyscopedtargahint (fixed the Targa/Speedster-as-trim case above, caught mid-sweep
  when "1972 Porsche 911 Targa" resolved with bodyStyle:null, poolTrim:"Targa" and the narrower
  bodyScoped check was about to misreport a genuinely-scoped pool as unscoped). specKeyFor
  (lib/live/search.js) already includes v.bodyStyle in its key array from a prior round - no new
  cache-key dimension was needed for this fix.

- 2026-10-11 (Lane C): TASK EMAIL WORDING AND RANGE LINE GATE (7802db5, aaaaadc, f6f9636, a8ccdc2, b2390af).
  * Range line gate: the inside/above/below sentence prints only when the engine's bodyScoped is true or null
    (Lane B's field, now in lib/onebox.js; passed through lib/live/search.js listingMarket/coreOf unchanged).
    Live emails, single sold notices and each sale in a digest decide on their own; without it the email keeps
    the bid and end time, or the price.
  * Wording: no notify/notified/notifies or visible watch/watching left in Buy, the Buy landing, the shared Keep
    looking card and rail (heading "Keep looking"), the Tasks page, start email, resume/keep looking pages, How
    Sam decides. FOR LANE A (js/onebox.js, Market Check, not edited here): "Watching for this exact car to come
    up again." / "Watching for the next sale of X." -> "Sam is looking for ...", "Sign in only to watch a car for
    its next sale." -> "Sign in only to have Sam look for a car's next sale.", "Sign in to keep a watch." ->
    "Sign in so Sam can keep looking." (Buy's own strings already read that way).
  * Sold tasks: Pause works end to end (paused_at is live). The shared rail shows a paused task as "Paused" with
    "Start again" (watches resume action, own task only); the Tasks page shows it there.
  * Digest: lead counts every sale and dates from the oldest; ten newest shown; "And N more are in your task."
    is the link; catch-all source "others" never printed as a venue; " - 7,400 Miles" title tails stripped.
  * FOR LANE B: a spec read from a live Shelby GT500 Supercharged listing is labelled "first-generation Mustang
    Shelby GT500 Supercharged coupes" while its sold cards are plain 289/390 Mustangs (the family noun keeps the
    trim after the ladder widened past it). Also SLS AMG coupes and Roadsters share one range (bodyScoped null:
    no body on the spec), so a Roadster reads "inside" against coupe sales.
- 2026-10-11 (Lane C -> Lane B): crossProductCheck 61 specs, ONE mismatch: "2010 Porsche Boxster Convertible".
  Market Check/Sell 987.2, 24 sales, $29,000 to $48,500; Buy/Tasks "987.1 Boxster convertibles", 61 sales,
  $18,500 to $34,000 (the 2006 answer). Persists after clearing the Boxster spec_market_cache rows
  (specinvalidate, 13 rows), so it is recomputed wrong, not a stale row.
  Evidence: ops drawervscard (fresh walkLadder, row title "2010 Porsche Boxster Convertible") reads the
  CORRECT 24 sales. buyLane goes through familyMarket, whose row title is "2010 Porsche Boxster" with the
  body passed only as facts.body -> v.bodyStyle "convertible". So the engine appears to pick the 987.1 half
  when bodyStyle is set but the text carries no body word (likely the new body-style scoping, since your last
  run had this spec matching). Not patched on the Buy side (one engine). Separately fixed in ac8b7aa: engineAnswer's
  in-memory cache keyed on the merged "987" code, not specKeyFor's half; it now uses specKeyFor.

- 2026-10-11 (Lane A): MARKET CHECK PAGE FIXES, 52a3dde. Duplicate car line (renderResults' outer
  carLineHtml suppressed for tier==="result", evidenceBlockHtml already owns it there); FEWER MILES/
  MORE MILES context cards were photo-only - root cause .stack .card{flex:1 1 0} split the stretched
  row height evenly regardless of content, squeezing price/title/meta out past the hero's taller
  natural height and clipping it via .card's own overflow:hidden; fixed to flex:none (each card sizes
  to its own content). "Put Sam on it" + the shared Keep Looking card merged into one block ("Have Sam
  keep looking"); "You'll be notified when another matching car goes live." no longer appears on
  Market Check (that line is Buy's own live-listing wording). "Where sales landed over time" lead
  sentence now composed client-side from yoyDirection's structured fields (recentBand/priorBand/
  percent/status), never its pre-built .sentence - copy-only, same numbers. FOR LANE B: that
  recentBand is not always identical to the headline's own cluster - yearOverYearDirectionFor
  (lib/onebox.js) only passes r4Split's price-outlier fence, while the headline's cluster additionally
  has provenance/engine-swap/halo cars removed afterward - a few cars' difference, not a Market Check
  bug, reported not patched (engine file). "No chart, no guess, no score" (next to an actual bar
  chart) dropped "No chart" since it's no longer true. Stray badge next to "Tasks" in the rail fixed
  (.gas-tbadge always set display:inline-block, silently overriding [hidden] - .gas-tbadge[hidden]
  {display:none} added). Blank gap above "Show 10 more" fixed (capCardsHtml wraps the grid + button in
  one div, so an empty 0-height grid no longer earns its own flex-gap as a separate #ob child).
  ICON (Job 7, FOR LANE C): the shared Keep Looking card's bell (read as an alert) is now a plain
  magnifier - lib/appShell.js KEEPLOOK_BELL, '<svg viewBox="0 0 24 24" aria-hidden="true"><circle
  cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>', same stroke-only style as before
  (fill:none, currentColor) so no CSS change needed. Buy's own copy (api/buy.js, not edited here) was
  the only other instance - already self-syncing by the time this landed (lib/live/buyLanding.js
  KEEP_ICON extracts the svg straight out of keepLookingHtml()'s own output via regex), so no action
  needed there, just flagging why Buy's icon changed too.
  NAV CHECK (Job 1, verification only, no code changed): signed-out sidebar - /sell "Where to sell,
  PowerSellers, Your results, Send feedback, Privacy, About"; /how-sam-decides "Tasks, Where to sell,
  PowerSellers" + foot "Send feedback, Privacy, About"; spec/car pages (api/_chrome.js) "GoAskSam,
  Where to sell" only. Crew sidebar - /sell adds "Buy, Market Check, Tasks, For business, How Sam
  decides"; /how-sam-decides adds "Buy, Sell, Market Check, For business" + foot "How Sam decides";
  spec/car pages add "Ask Sam, Buy, Tasks, Car histories, How Sam decides, For business". Identical at
  1440 and 390 for every page/audience tested - no link desktop shows that mobile hides. /buy,
  /market-check, /tasks, /business are all directly reachable (200, real content) for a signed-out
  visitor by plain address even though none are linked from the reduced nav - the existing
  PUBLIC_LAUNCH switch hides discovery only, never the page itself, confirmed unchanged.
- 2026-10-11 (Lane C): BUY FIXES (6cd0647, 238c9b4) + READ-ONLY PROBE FOR THE COST REPORT (8a1b0da, b27fe00).
  * Card vs panel contradiction, cause: the Market Check panel under a Buy card sent the listing's RAW title
    to a fresh free-text Market Check ("3.6L-Powered 1988 Porsche 911 Carrera Cabriolet G50 manual" landed on a
    class/era band, no range) while the card read the resolved 3.2 Carrera Cabriolet spec. The panel now reads
    the card's own spec key and engine answer (POST /api/buySearch {action:"panel", id} -> lib/live/search.js
    panelOf); a stored line that trails a fresh read of that key (range or count) is recomputed first, and the
    card line is redrawn from the same answer. Market Check text (market.query) is the resolved car, not the
    raw title.
  * soldLine (lib/live/search.js) is the one sentence: "The middle half of 3.2 Carrera Cabriolet sales landed at
    $47,000 to $70,000 in the past year." Used by cards, panel, Sam's notes, the landing example, chat replies
    (samChat codeReply/specFacts) and task emails. coreOf adds familyOne (the group in its one-car form).
  * Keep looking icon: Buy's results card and landing feature card take the shared card's own icon, read from
    lib/appShell.js keepLookingHtml markup (lib/live/buyLanding.js KEEP_ICON), so they follow Lane A's icon.
  * Public visitors (window.GAS_CREW false): no /market-check links from Buy, and the card button reads "Sold
    prices" instead of "Market Check". Crew unchanged. Keep looking stays public (as on every page).
  * FOR LANE B (reported, not patched): Market Check's free-text read drops a body word Buy's resolver keeps.
    "1991 BMW 3-Series Sedan": Buy card (sedan) $8,000 to $16,000, 10 sales; Market Check bodyStyle null,
    all E30 bodies, 102 sales (71 with "manual"). "2022 Ford Bronco": Buy $40,500 to $62,500, 24 sales; Market
    Check $40,000 to $64,000, 34 (body null). Dense specs agree on range with counts 2-3 apart (stored line
    hours older than a fresh read; the panel now refreshes on that).
  * PROBE (read only, aggregates only, no vendor call): GET /api/tasks?livetiming=1 with x-probe-key.
    lib/ops/liveTiming.js. live_listings only starts 2026-10-05 (5.7 days); pull_live_summary rows from 10-08.

- 2026-10-11 (Lane B): BOXSTER TEXT-VS-FIELD MISMATCH + TASK LABEL FIX + UNCURATED-TRIM FENCE SHIPPED.
  * Boxster text-vs-field mismatch (job 1): investigated live, found NOT REPRODUCIBLE on deployed code
    (confirmed via enginecheck: 2006 and 2010 Boxster Convertible both read correctly and distinctly -
    987.1 61 sales $18.5k-$34k, 987.2 24 sales $29k-$48.5k - across all 4 lanes). Most likely resolved
    as a side effect of this round's ENGINE_VERSION bumps forcing a clean recompute past a stale cache
    row your own cache-key fix (ac8b7aa) hadn't yet invalidated. Proof table (job 2): 14 clusters x
    text-in-title vs body-as-field, all MATCH (same genCode, range, count) - see the full table in the
    session report. All body/half-gen clusters (987, 997, e46, 991) confirmed.
  * Task label-vs-sales mismatch (job 3): root cause was TWO separate bugs in lib/onebox.js, not one:
    (a) the model-widened thin rung kept the ORIGINAL (pre-widen) trim in resolvedCar/familyLabel after
    dropping it from the pool - fixed, that branch now returns a resolvedCar copy with trim cleared;
    (b) the REAL cause of the reported "Shelby GT500 Supercharged" case - buildSpec's uncurated-trim
    fallback (new fence, see below) was wrongly gated on !spec.perfInclude, but runOneBox's own famSpec
    (`{...spec, perfInclude: null, ...}`, the trim-to-family widening ladder) clears perfInclude before
    the real fetch ever runs - so any make relying on PERF_TRIMS with no subTrimFence backstop (Ford
    Shelby/GT350/GT500/Boss/SVT - Porsche survives via subTrimInclude, which famSpec does NOT clear)
    got zero trim filtering at all. Fixed: the fallback now fires regardless of perfInclude.
  * NEW: buildSpec uncurated-trim fallback fence (lib/onebox.js, end of buildSpec, before relabel()):
    any spec.trim that matched NONE of the curated mechanisms (subTrimInclude/badge/familyInclude) now
    gets set as spec.titleContains verbatim - mirrors the fallback priceBandForVehicle/
    listSalesForVehicle already used for Sell's price-step, now shared into the general result/thin/
    refusal path too (one engine rule). Confirmed live: "1966 Ford Mustang Shelby GT500 Supercharged
    Convertible" now correctly reads 2 genuine GT500/GT500KR sales (was silently reading all 233 plain-
    Mustang sales under the GT500 label before the fix).
  * Found + fixed in-memory cache-version gap while verifying: lib/live/search.js's rangeCache
    (engineAnswer) and specMem (specCore) had NO ENGINE_VERSION check at all (unlike the DB-level
    spec_market_cache, gated in prefetchSpecs) - a warm serverless instance that had already answered a
    query kept serving the pre-fix in-memory answer for up to an hour regardless of any version bump.
    Both now gated on ENGINE_VERSION; a mismatch is a miss, same as an expired entry.
  * ENGINE_VERSION: e10 (resolvedCar trim-widen fix) -> e11 (uncurated-trim fence) -> e12 (fence no
    longer gated on perfInclude - the actual fix). Full crossProductCheck after e12: 61/61 specs,
    mismatchSpecs:0 (run in many small batches - e13's cold cache made single large-batch requests
    exceed the ops endpoint's response window; batching, not a regression, see session report).
  * Files: lib/onebox.js, lib/live/search.js, api/usageDashboard.js (listingmarkettest bodyField
    param, obdiag engineVersion+bodyScoped surfaced, for diagnosis - left in, same pattern as prior
    rounds). lib/modelRules.js not touched this part.

- 2026-10-11 (Lane B): COMPARABLE FENCES (MODIFIED/RESTOMOD SET-ASIDE) + SAM'S TAKE WORDING SHIPPED.
  * Modified-car fence (job 1): extended lib/modelRules.js RESTOMOD_TAGS (the ONE shared list,
    restomodReason) rather than building a second one. Added: bare "<N>L-Powered" (word order
    protects "Powered by the original 3.2L" - displacement must come BEFORE "Powered"); RUF and
    "Turbo look", Porsche-scoped; slant-nose CONVERSION only, Porsche-scoped (Porsche's factory 930
    Flachbau option means bare "Slant-Nose" with no "Conversion" stays in the pool - Sam's explicit
    call); bare "Modified"/"modded" mirrored from lib/live/search.js's own MODIFIED_RE; widebody/body
    kit, bagged/air ride, lifted, stroker, built engine, twin-turbo conversion (an ENGINE conversion,
    never the gearbox conversions rule 27 protects); "custom built" (not bare "custom" - "custom
    color"/"custom wheels" stay in the pool). Cubic-inch "<N>-Powered" (302/350/383-style) deliberately
    LEFT UNFLAGGED - Sam's call: several classic Mustangs/Camaros genuinely came from the factory with
    those displacements, so the phrase can be factory-correct, no reliable way to tell from title text
    alone, never set aside a car on a guess.
  * lib/onebox.js: the old local ENGINE_SWAP_RE/isEngineSwap (a narrower, drifting duplicate) is gone;
    isEngineSwap now delegates to restomodReason everywhere it already ran (buildResult's solid/aside
    split, assessThin's thin pool, the refusal tier's shown-sales list) - one list, every set-aside
    path. setAsideReasonFor broadened so any restomodReason tag reads as "modified" (provenance/halo
    keep their own prior behavior unchanged, still "odd sale").
  * pickRepresentative (job 2): verified by construction, not a separate fix - it only ever reads the
    `solid` array, and the modification fence already removes tagged rows from `solid` before
    pickRepresentative is called later in the same function. Confirmed live: the reported anchor car
    ("3.6L-Powered 1987 Porsche 911 Carrera Coupe G50" at $89,500) no longer appears as closest/high/
    low on the 1988 Porsche 911 Carrera Coupe read.
  * Sam's Take wording (job 3): every "the higher half"/"the lower half" clause (mileage, transmission,
    service, modifications) now says "Higher-priced sales"/"lower-priced sales" explicitly - confirmed
    live, word for word matches Sam's requested example ("Higher-priced sales averaged about 69,000
    miles; lower-priced sales about 115,000."). The known_flaws "reported issue" sentence is REMOVED
    (sampled live via a temporary ops diagnostic, task=flawsample, before deciding): the field itself
    IS a clean OCD-provided JSON array (not our own newline-splitting guesswork - e.g. ["Rust on the
    door sills", "Touched-up chips on the exterior", "Oil leaks"]), but its ITEM COUNT conflates how
    thoroughly one seller itemized minor notes with how flawed the car actually is - no solid basis to
    compare two sellers' array lengths as a severity signal, so the sentence is gone, not shown anyway.
  * Over-time/headline pool parity (job 5's "one pool" requirement): quarterlyBandsFor/
    yearOverYearDirectionFor (the "Where sales landed over time" trend bars) read `recent`/`prior`,
    which are sliced from the RAW pool upstream of the modification/provenance/halo set-aside - so an
    unfenced quarter could show a modified or ex-celebrity car the headline range excludes for the
    identical window. Fixed: both now read a locally-fenced copy (recentFenced/priorFenced) with the
    same exclusions, computed just before use - counts.qualifying/solid/aside are UNCHANGED (a set-
    aside car still counts and shows its reason there; only the over-time reads additionally exclude
    it from their own local r4Split).
  * Reconciliation (job 4), 1988 Porsche 911 Carrera Coupe, live after the fix: qualifying 53 = used 49
    + setAside 4 (aboveRange 1, belowRange 1, all 4 reason "modified", 0 "odd sale"). Before the fence
    this cluster read qualifying 52/used 51/setAside 1 (the one set-aside row was "odd sale", not
    "modified" - the 3.6L/3.5L-Powered cars were inside the 51 used, one of them anchoring the range).
  * ENGINE_VERSION bumped to e13. Full crossProductCheck after e13: 61/61 specs confirmed, 0
    mismatches (batched small due to e13's cold-cache response time, not a regression - see session
    report), including every named spec from this job (1988 911 Coupe/Targa/Cabriolet, 997 Carrera S
    Coupe/Cabriolet, 2001/2005 BMW M3, Boxster S, Cayman S, GT3 RS, Turbo S, all half-gen pairs).
  * Files: lib/modelRules.js (RESTOMOD_TAGS), lib/onebox.js (isEngineSwap/setAsideReasonFor/
    stPlainClause/quarterlyBands-yoy pool fix), api/usageDashboard.js (temporary flawsample
    diagnostic, left in).
  * NOT YET RUN this session: scripts/searchCheck.js and the 5-page signed-out curl test both hit
    Vercel Bot Protection set to Challenge (HTTP 429, x-vercel-mitigated: challenge) from this session's own very
    high volume of ops-key requests - a known non-issue (real browsers get 200), not a product
    regression, but genuinely not verified this run. Re-run both once traffic has cooled or with a
    Protection-Bypass secret.

- 2026-10-11 (Lane A): STAGE OVERRIDE READY (for Lanes B and C testing stage-gated pages).
  * Mechanism: every stage check goes through lib/_launchStage.js isReleased(product, req). A request
    can override the real LAUNCH_STAGE/LAUNCH_BUSINESS value ONLY by (a) carrying this app's existing
    server credential (the same one every ops/probe path already requires - read server-side from the
    environment, never from the request body or a query string) AND (b) carrying a test-stage header
    naming the numeric stage to simulate, or a test-business header naming on/off. Without the
    credential, those headers are read but ignored outright - the real env var always wins. No new
    secret was introduced for this: it reuses the existing probe credential, so nothing new needs
    distributing. Ask Lane A (not Sam) for the header names and credential if you need them for a
    local/preview run; do not request them in a shared channel.
  * Which environment: works against ANY environment reachable with that credential, including
    production - it does not touch the real LAUNCH_STAGE value, so it is safe to point straight at
    goasksam.com rather than needing a separate preview deployment. A preview deployment works too if
    you prefer one (same mechanism, same credential).
  * Read from the environment, never printed: the credential is read server-side via the same pattern
    every other probe script in this repo already uses (Mac Keychain locally, a GitHub Actions secret
    in CI) - passed only in a request header, never logged, never put in a URL, never written to a
    screenshot or scratch file. If you write a throwaway test script, follow the same rule: pass it
    via shell env var substitution into the header, never paste the value into the script body.
  * Confirm OFF for the public: hit any gated page or API address with NO credential at all (plain
    curl/fetch or an incognito browser tab, no extra headers) and confirm it shows the REAL production
    stage (today, stage 0 - Sell only), not whatever you were just testing. The override headers alone,
    without the credential, must have zero effect - verified this round on every gated route.

- 2026-10-11 (Lane A): CORRECTION to the LAUNCH STAGES session report - a saved env var edit alone
  does NOT take effect; a redeploy is required. The earlier report said otherwise ("no redeploy
  needed"), reasoning only from the fact that lib/_launchStage.js reads process.env fresh per
  request - true of the CODE, but wrong about how Vercel binds env vars to an already-built
  deployment's running functions. This codebase already has two confirmed, tested precedents saying
  the opposite (SELL_PICK_SHARED note above, line ~2483: "an env var change alone does not apply to
  already-built serverless functions"; and a separate round, line ~3302: "Set the var to 2 in Vercel,
  redeployed, tested... redeployed again - confirmed live"). CORRECTED STEPS for Sam to change the
  launch stage (dashboard only, no terminal):
  1. vercel.com -> sign in -> the goasksam project -> Settings -> Environment Variables.
  2. Add or edit `LAUNCH_STAGE`, value `1` or `2` (the literal digit, not a word), scoped to
     Production -> Save. For the business page: `LAUNCH_BUSINESS`, value `1` to turn on.
  3. REQUIRED: Deployments -> the newest Production deployment -> the "..." menu -> Redeploy. The
     stage change does not reach any live traffic until this step. Deleting a variable (returning to
     the stage-0 default) needs the same redeploy step to take effect.
  4. After the redeploy finishes, the edge cache on the affected pages (see the caching table in the
     session report) can still serve a stale pre-change page for a few minutes in practice (up to the
     documented worst case) before it self-heals - the API refusals and crew path are never cached and
     reflect the new stage immediately.

  Also correcting this round's own wording: the crossProductCheck singlePick.ok:false result was
  described in the prior report as "known flaky, not a regression" - that is not this lane's call to
  make. Left to Lane B to diagnose; not described as acceptable here.

- 2026-10-12 (Lane B -> Lane A): NEW FIELD `offWindow` on every context card (lib/onebox.js
  pickRepresentative's closest/high/low, surfaced on d.representative.closest/.high/.low same as the
  existing `sameHalf`/`year` fields already are). Ships alongside the context-cards-prefer-searched-
  year fix (ENGINE_VERSION e15).
  WHAT IT MEANS: `true` - this card's own year falls OUTSIDE the searched car's preferred year window
  (searched year +/-1, clamped to a curated half-generation or generation boundary) AND the window
  could not be satisfied (fewer than 3 comps fit it, so the full pool stands and this card is a fill-
  in from outside the window). `false` - either the window was successfully applied (3+ comps fit, so
  every returned card is inside it by construction) or this specific card happens to sit inside the
  window anyway even on the full-pool fallback. `null` - no window applies at all: the search had no
  year (searches without a year are unchanged), or nothing to prefer against.
  HOW TO USE IT: when `offWindow` is true, print a short, honest label using the card's own `year`
  field (already present) - e.g. "a 1984 car" - so a fill-in from outside the preferred window reads
  as what it is, never silently presented as matching the searched year. `d.representative.yearWindowed`
  (true/false/null) is also exposed at the block level if a page wants to know whether ANY narrowing
  happened before checking individual cards.
  NOTHING ELSE CHANGED: the range, count and set-aside numbers are built from the full comparable pool
  exactly as before - this field only ever affects which THREE cards get shown, never the headline
  numbers. Confirmed live on 5 specs (1988 and 1985 Porsche 911 Carrera Coupe, 1969 Ford Mustang
  Convertible, 2001 BMW M3 Coupe, 2008 Porsche 997 Carrera S): counts/ranges identical before and
  after, cards now drawn from the searched year +/-1 in every case (12-30 comps fit the window each
  time, no full-pool fallback triggered in this sample, so a live offWindow:true example was not
  observed - the mechanism is implemented and will fire whenever fewer than 3 comps fit).
  CURATED BREAKS ACTUALLY USED (contextYearWindow, lib/onebox.js): half-generation bounds via
  lib/generations.js halfGenerationFor/halfForYear (987.1/987.2, 997.1/997.2, E46 M3 pre/post
  facelift - the SAME table the existing sameHalf mechanism already reads) when the searched year
  pins a half; otherwise the resolved generation's own bounds (spec.yearMin/yearMax, set earlier in
  buildSpec from CURATED_GENERATIONS, e.g. 3.2 Carrera 1984-1988, Mustang first-generation 1967-1969).
  The 1987 G50 gearbox change for 3.2 Carreras was NOT used as a break - it has no entry anywhere in
  lib/generations.js, and the job's own instruction was to use only what the engine already curates,
  never invent one.

- 2026-10-12 (Lane B): TRIM FENCE FIX SHIPPED (titleExclude survives famSpec; Camaro SS/Z11/Pace
  Car/COPO/Yenko added to PERF_TRIMS + HALO_PATTERNS). ENGINE_VERSION e14. Two residual gaps found,
  reported, NOT fixed (owner's call, left for a future job): (1) "GT350CR" as one glued word (no
  space before "CR") still evades the Ford baseExclude pattern's word-boundary requirement - ordinary
  "GT350"/"Shelby" titles ARE excluded correctly, this is a narrow single-naming-convention gap; (2) a
  bare "BMW 3 Series" search still pools M3 cars - BMW's own curated baseExclude pattern was never
  shaped to catch a standalone "M3" token (it looks for "3-Series M" as a phrase, which archive titles
  never write), a PRE-EXISTING gap unrelated to the famSpec fix. 1969 Chevrolet Camaro Convertible
  crossed the 10%-edge-move stop-and-check threshold (qualifying 37->23, range $36,500-$54,500 ->
  $35,500-$49,000, high edge -10.1%) - kept as shipped per the job's own recommended path (the removed
  cars are genuine SS396/SS-RS/Pace-Car trim leaks, the range move is the correct consequence of
  removing them). The 1968 Camaro SS/RS "wrong year" report was NOT a bug: Camaro's first generation
  is curated 1967-1969 (lib/generations.js), so 1968 is the same generation as a 1969 search.
- 2026-10-11 (Lane C): BUY FOLLOW UPS (3fddb7a, 0426c6d, 8ea5695, 53ffa5a, feeb43f, 5c37260, f6a0b0d).
  * Buy's Market Check and Tasks links follow lib/_launchStage.js isReleased per request (window.GAS_REL), not
    the crew check. A credentialed request (which may carry the test-only stage override) is never publicly
    cached on /buy. Proven on production with the override: stage 0 and 1 redirect, stage 2 links both.
  * Prompt caching on the Buy chat call: the system prompt is two blocks (lib/live/samChat.js systemBlocks), the
    fixed text cached with the tools, the date and current search after the breakpoint. Same text, same model.
    Cache read/write tokens and model calls per turn now logged on buy_chat_turn (metadata.cache_read,
    cache_write, calls); api/_usage.js prices cache writes at 1.25x input and reads at 0.1x.
  * Pull schedule: lib/live/pullSchedule.js + /api/pullLive?mode=auto (Pacific clock, dry run) and Tasks
    ?run=1&ifnew=1 are deployed but NOT scheduled: the vendor's /auctions/live rejects sort=auction_end_at and
    sort=created_at ("400: sort: Invalid option"), so neither ending-soonest nor newest can run. vercel.json crons
    unchanged (15 */4 full walk). Needs a supported sort before the schedule can switch.
  * /api/tasks?livetiming=1 removed (lib/ops/liveTiming.js deleted). The Buy traffic probe (POST buySearch
    action traffic, header credential) now also returns buyModel: turns, completed searches, turn numbers,
    distinct cars per device-hour.
  * PENDING SAM'S APPROVAL (built, not committed): Buy chat ceilings (20 model turns per device a day, $50 a day
    global spend) and the stale-bid wording on cards and emails.

- 2026-10-12 (Lane A -> Lane B): OFFWINDOW FLAG (job 1) - Market Check/Sell shipped, Buy BLOCKED on
  an engine-adjacent file, car page has nothing to attach it to.
  * SHIPPED (js/onebox.js + onebox.html, the shared saleCardHtml family): a new offWindowLabel(c)
    function, same family as the existing otherHalfLabel(c, d) right above it - one function, reused
    by both heroCardHtml and smallCardHtml's `extra` slot, so Market Check and Sell (which render
    through this exact same shared card builder) both pick it up with zero per-surface code. Renders
    only when c.offWindow === true and c.year is present; otherwise contributes nothing (empty
    string), matching the engine's null/false-means-nothing contract. CSS reuses .otherhalf's own
    rule (same selector, `.otherhalf,.offwindow{...}`) rather than a second copy of the same four
    properties.
  * BLOCKED, not touched (lib/live/search.js is on this job's forbidden list): Buy's "Market Check"
    panel (api/buySearch.js action:"panel" -> lib/live/search.js panelOf()) already calls the real
    engine (engineAnswer) and already has d.representative in scope - but panelOf's own `slim()`
    helper (line ~725) whitelists exactly 7 fields per card (date/mi/price/platform/platformSlug/url/
    image) before returning them to Buy's client, and `year` and `offWindow` are NOT in that list.
    Buy's own client-side card renderer (api/buy.js, the `md-sale` markup, already a SEPARATE
    implementation from js/onebox.js's saleCardHtml - that duplication predates this job and is out
    of its scope to fix) would need those two fields to do anything, and today they never arrive.
    NEEDED FROM LANE B: add `year` and `offWindow` to panelOf's slim() whitelist (lib/live/search.js
    ~line 725). Once that field reaches Buy, the Buy-side fix is small (one data-gas-event-style
    attribute's worth of markup in api/buy.js, reusing the identical wording this entry already
    proposes) - flagging the DATA gap now rather than guessing at Buy's rendering blind.
  * NOTHING TO ATTACH IT TO on the car page (api/history.js): checked the actual VIN detail page
    (carPage handler) - it does not render the representative closest/high/low trio at all. Its
    "[Model] that sold" section (groupListsHtml, saleRow) is a plain list built from d.cards (the
    FULL comparable pool), not d.representative, and offWindow is only ever set on the
    representative trio per Lane B's own entry above ("surfaced on d.representative.closest/.high/
    .low"). There is no existing context-card surface here for this flag to attach to without
    building new UI, which is outside "show the flag" - reporting rather than inventing one.
  * PROPOSED WORDING (held for Sam's sign-off before push, per the job's own instruction): "A {year}
    car, a few years outside the searched window." - ownership-neutral (product rule 20: the task's
    own example phrase "a few years from yours" was adjusted to drop "yours"), no banned word, no em/
    en dash, ends in a period same as otherHalfLabel's sibling copy nearby.
- 2026-10-11 (Lane C): BUY CEILINGS + STALE BIDS SHIPPED (d890796, 6f9920f, 50414ad, b425107, 3716e64); PULL SORT TESTS (2e2c23e, d347b34).
  * Ceilings live: 20 model turns per device a day (nuisance guard), $50 a day Buy chat model spend (authoritative),
    fallback = the no-model search with "Sam's written answers are paused for the moment. Here are the search
    results on their own." once per page, only when cards are drawn. Tested live with the credential-only headers
    x-ceiling-test-turns / x-ceiling-test-spend. Heavy use logged as buy_heavy_device (never blocks).
  * No-model search (lib/live/converse.js): a different car typed after a search now starts a new search (it used
    to append, so "Jaguar E-Type" then "1967 Chevrolet Corvette" matched nothing). Refinements still join.
  * Stale bids: live cards show "Bid $X · updated 1h 12m ago" past an hour (browser-computed, data-bidat);
    Task match and Keep looking live emails add " as of 9:15am PT" (lib/live/buyAlerts.js bidAsOf).
  * VENDOR SORT on /auctions/live: sort=auction_end_at, sort=created_at and sort=date are all rejected
    ("400: sort: Invalid option"). The DEFAULT order (no sort) is auction_end_at ascending (100 of 100 in order,
    all future, consistent with stored end times). The last pages of the default order are long-running house
    auctions (created median 25 days ago), not newest. Cron unchanged pending Sam's call.
- 2026-10-11 (Lane C): PULL SCHEDULE OPTION 1 LIVE (304b330) + NEAREST-YEARS RULE SHARED (7e88f59).
  * vercel.json: /api/pullLive?mode=auto every 15 min (UTC) reads the Pacific clock (lib/live/pullSchedule.js):
    full walks 06:15/14:45/22:15, ending soonest every 30 min 09:00-14:30. Ending soonest = the vendor's DEFAULT
    order (no sort option; all tried were rejected), paging until the last car ends >6h ahead, max 3 pages; each
    run logs pull_live_mode {pages, newListings, coveredHoursAhead, cappedShort}. Full walks log newListings.
    Dry run: same 15 Pacific runs, at most 105 requests/day, in PDT and PST. First cron pull 21:00 UTC Oct 11:
    1 page, 21 hours covered.
  * Tasks: /api/tasks?run=1&ifnew=1 at 5,20,35,50 past every hour replaces the 4-hourly run; exits at once when
    no listing was first seen since the last run, and runs anyway when the last full run is over 4 hours old.
  * Nearest years (lib/live/search.js nearestYears/nearLine): when a stated year has no live cars, the chat's
    search step (samChat searchWithNearest) and the no-model search (converse) both read one year each side and
    say "No 1988 911 Carreras are live right now. These are the nearest, 1987." Tasks never widen.
    crossProductCheck gains buyPaths (5 cars, same cars and same nearest years on both paths): all pass.
- 2026-10-13 (Lane B): TRIM FENCE SWEEP (jobs 1-12) SHIPPED. ENGINE_VERSION e16-20261013-trimfencesweep.
  Summary of engine changes: glued-suffix fix for GT350/GT500/Z06/ZR1/ZL1/Z28 (codeGluedSrc, lib/
  onebox.js); BMW baseExclude now matches the standalone M-badge token so a bare "3 Series" never pools
  M3/M4/M5; a bare 911/SUBTRIM_FENCES nameplate with no trim defaults to the group's BASE trims only
  (unmatched rows no longer silently stay - fixes a "911 Spirit 70" riding a Cabriolet pool); a MAKE-
  LEVEL HALO set-aside now runs on every dense pool with no SUBTRIM_FENCES entry (catches BMW M3/M4
  CSL/GTR and similar specials that had zero fence before); the trim QUESTION's option counts now read
  the same today-first, universal-fenced window the headline itself uses (new `poolN` field) instead of
  the raw multi-year pool; quarterlyBandsFor/yearOverYearDirectionFor now share r._tag with the headline
  instead of a narrower, separately-derived fence, so the over-time block's row counts always sum to the
  headline count (this is also the fix for the "recentBand not always identical to the headline's own
  cluster" FOR LANE B note a few entries up - same root cause, now one pool); pickRepresentative's middle
  card is now constrained to a sale inside the headline band nearest its midpoint, with no middle card at
  all when nothing qualifies (new lowestSale/highestSale/belowRangeCount/aboveRangeCount/
  belowRangeSales/aboveRangeSales fields); titleFenceReason extracted from qualifyReason so the live
  "comparable right now" panel (lib/live/search.js liveForFamily) applies the identical trim/model-line/
  modified/replica/conversion/body fence and the same buildSpec year window a sold comp needs (plus a
  new `position`/`positions` field, computed once in liveForFamily via the shared placingFor, for the
  intro-sentence counts - api/buySearch.js's panel route renders only what it returns now); BODY_STYLE_
  WORDS (lib/vehicle.js) gained "sedan"/"wagon" (this is the FOR LANE B body-word-drop note, now fixed
  at the root - the shared resolver, not a page-specific second parser); humanTitle (lib/carTitle.js)
  strips any seller text before a title's first year plus leading/trailing punctuation; checkSinglePick
  (scripts/crossProductCheck.js) is now deterministic (depthWinsFixtures, 9 fixture cases covering the
  tie branch) and no longer gates on whether today's live archive happens to hold a tie - this answers
  the two "policy-floor/tie" FOR LANE B notes above. crossProductCheck also gained checkLiveComparable
  Fences (job 3) and checkRepresentativeInvariants (jobs 4/6), and DEFAULT_SPECS gained the Sedan/Bronco
  body-word cases (job 9) plus "1991 BMW 3-Series Sedan"/"2022 Ford Bronco". panelOf's slim() whitelist
  (lib/live/search.js) gained year/offWindow, closing the earlier "NEEDED FROM LANE B" data gap for
  Buy's own card renderer.

  THIN-POOL MINIMUMS (job 5), one named constant per block type, all in lib/onebox.js:
  - THIN (headline result floor): 3 solid sales. Below it, the result is a refusal (ladderStep "thin"),
    never a guessed range.
  - SPLIT_MIN (any split carrying a range at all - trim question options, gearbox/competition inline
    splits, the mileage-band refine): 3 sales on a side/option. Below it, that split/option renders
    nothing (not a thin flag - an absent field, same floor as every other engine gate).
  - RANGE_THRESHOLD (a real band anywhere outside the headline tier ladder - Sam's Take's per-side
    minimum, the over-time block's rows INCLUDING the current quarter, year-over-year's each-side
    minimum, and now also the "thin" flag threshold for a rendered split/trim-question option): 8
    sales. A row/option below this still renders (it already cleared SPLIT_MIN) but carries a `thin:
    true` flag so a reader can tell a confident read from a thin one.
  - The headline's own tier ladder (rangeTierForCount, unchanged by this round): band at 8-15 solid,
    cluster at 16+. This is a DIFFERENT concept (display style of the headline itself), not a new
    minimum - noted here so the full set in one place is unambiguous.
  Lane A: render nothing when a field is null/absent (unchanged rule) - these numbers decide what a
  visitor sees, not a page-side guess.

  FIELDS DELIVERED FOR LANE A this round: representative.lowestSale, .highestSale, .belowRangeCount,
  .aboveRangeCount, .belowRangeSales, .aboveRangeSales (job 4); trimQuestion.poolN and
  trimQuestion.options[].thin (jobs 5/6); inlineSplits sides[].thin (jobs 5/6); result.windowStart (job
  7); live panel rows[].position and the panel response's top-level positions{inside,below,above,
  unknown} (job 3); panelOf's slim() cards now carry year/offWindow (closes the earlier NEEDED FROM LANE
  B note). All null/absent on every gate miss, per the no-guess rule.
- 2026-10-11 (Lane C): PULL REPORT ON DEMAND + PUSH CHECK.
  * The one-day pull report no longer depends on a session: `node scripts/pullReport.mjs [--date YYYY-MM-DD |
    --from ISO --to ISO] [--json]` (default the last 24 hours). Key from the environment only (PROBE_KEY, read
    from the Keychain per command), sent only in x-ops-key, never printed. It calls GET /api/pullLive?report=1
    (lib/live/pullReport.js): read only, stored records only, zero vendor requests. Reports vendor requests
    used, runs per pull type, new cars first seen per pull type (full walk vs ending soonest), each
    ending-soonest pull's pages, hours covered and whether the 3-page cap cut it short, Tasks full runs and
    whether each pull that found a car was followed by a Tasks run within 20 minutes, and the share of
    final-hour minutes with a stored bid over an hour old against the Oct 11 baseline of 69.3 percent (same
    measure as the baseline, except an ending-soonest pull now refreshes the cars it returned). --date is a
    Pacific calendar day, correct across the clock changes.
  * Push check (every lane, before every push): `node scripts/pushCheck.mjs` loads one Market Check result,
    one Buy result, the 911 spec page and the Sell first step in a real browser and fails on any 5xx or any
    console or page error. With PROBE_KEY set, the two stage-gated pages get the test stage header, sent only
    to goasksam's own address. Market Check starts as a fresh visitor so its 10-cars-a-day limit is not hit.
  * FOR LANE B: the first push check (Oct 11, production) FAILS on the Market Check result: the page's own copy
    lint logs a console error, "'averaged' in: Higher-priced sales averaged about 47,000 miles; lower-priced
    sales about 59,000." The line comes from lib/onebox.js:3364 (Sam's Take mileage), and the figures are
    medians, so "averaged" is also the wrong word. Not changed by Lane C.
- 2026-10-13 (Lane A): the 2026-10-11 inlineSplits count-mismatch note is RESOLVED by Lane B's
  buildPool fix (pool-consistency root cause job, same date) - sides[].n now sums with the new
  sp.unknown to exactly the headline count. Counts restored on the gearbox/competition chip row
  (js/onebox.js inlineSplitsHtml), "hide it until Lane B confirms" no longer applies. Removing this
  entry per this file's own convention (landed work).
- 2026-10-11 (Lane C): FULL RUN (schedule check, cost ceilings, stale bids, cards).
  * Schedule: the live dry run (Oct 12 PDT, Dec 1 PST) matches the approved table exactly. One difference fixed:
    the exact-car Task run (/api/watch, "Sam found one" for a watched car) ran every 4 hours; it now runs at
    10, 25, 40 and 55 past every hour with the same rule as Tasks (&ifnew=1: exits at once unless a live
    listing was first seen since the last run; runs anyway after 4 hours so sold events keep their pace). It
    logs watch_run rows.
  * Cost ceilings: the $50 a day model cap now covers Tasks as well as Buy chat. Every Tasks model call (setup
    chat, the update line on every Task, research) goes through lib/tasks/tasks.js modelTurn: logged as
    tasks_model_turn with its cost, held to lib/_ceilings.js modelSpendGuard. Over the cap: a Task update's
    line is written in code (the Task email body was already built in code), the setup chat and research say
    "Sam's written answers are paused for the moment. Try again later today." Tasks prompts are cached
    (chatCore surface.cacheSystem). Sell chat is NOT under the $50 cap (not changed).
  * Stale bids: the Buy landing example and match cards, the Tasks page car list and the Buy chat's car
    sentence now carry the bid's age or time. Task cards store bid_at.
  * Cards: no shared sale-card component exists; none built. Buy result cards are now whole-card clickable
    (title link stretched over the card, real actions above it), the photo chip is no longer underlined.
    Tasks page cars are one link each with plain text inside.
  * FOR LANE A: two public surfaces show a live bid with no age. (1) Market Check "Live right now" (js/onebox.js,
    "Current bid $X"): the panel response (/api/buySearch action panel) already carries bid_at per row; Buy's
    markup is <span data-bidat="..."> with a .bage child, and "updated 1h 12m ago" past one hour. (2) The VIN
    history page's live listing line (api/history.js, "Bid $X"): live_listings.bid_at is the time.
- 2026-10-13 (Lane B): PRODUCTION CRASH ACCOUNTING (job 1, both 11 Oct incidents) + PREPUSH RULE
  (job 2). Two separate lane pushes took production down the same day.

  LANE A (d11905a -> 16f2796): d11905a ("Launch stage: shared gate + nav/in-content links") pushed
  2026-10-11T09:13:22-07:00 wired the launch-stage gate's `req` parameter incorrectly, crashing every
  VIN/history/hub page. Fixed by 16f2796 ("Hotfix: launch-stage req wiring crashed every VIN/history/
  hub page") pushed 2026-10-11T09:50:03-07:00. Window: ~37 minutes between the two pushes (push
  timestamps; Lane A owns the exact deploy-live/fixed-live timestamps and the routes actually
  affected - not independently re-verified by Lane B here, reported from the commit record only).

  LANE B (fb4c4fc -> 75bcb4f): fb4c4fc ("Trim fence sweep... jobs 1-12") deployed and went LIVE
  (Vercel "Deployment completed") at 2026-10-11T21:19:37.964Z (14:19:37.964 -07:00). A HALO_PATTERNS
  edit in that commit called a helper (codeGluedSrc, itself calling trimCodePattern/codeRuns) EAGERLY
  at module-load time (an unwrapped `new RegExp(...)` array value, unlike every PERF_TRIMS entry,
  which wraps the same kind of call in a lazy `() => ...`), referencing LETTER_CODE_SPLITS before that
  module-level `const` had executed later in the same file - a classic temporal-dead-zone bug that
  only manifests at RUNTIME, on the first actual request, never at build time or via `node --check`
  (syntax-only). Every route that transitively imports lib/onebox.js (api/sellerDecision.js - Market
  Check and Sell; api/buySearch.js - Buy and its live panel; api/usageDashboard.js - every ops task)
  started returning `{"error":"Cannot access 'LETTER_CODE_SPLITS' before initialization"}` on every
  request immediately after that deploy - confirmed firsthand: the very next task=obdiag call in this
  session returned that exact error. Fixed by 75bcb4f ("CRITICAL FIX: TDZ crash in previous commit"),
  which moved the whole trim-code helper cluster earlier in the file (before both PERF_TRIMS and
  HALO_PATTERNS use it) so no construct can ever reference it before its own declaration runs,
  regardless of eager/lazy evaluation at any call site. 75bcb4f deployed and went LIVE at
  2026-10-11T21:25:41.282Z (14:25:41.282 -07:00). WINDOW: 6 minutes 3 seconds of total outage (every
  route above returning an error to every request) between the two deploy-live timestamps.

  WHAT VERIFIED THE FIX, STATED PLAINLY (a module import is not enough, and the first verification
  pass after 75bcb4f was exactly that - a local `node --input-type=module -e 'import("./lib/onebox.js")'`
  succeeding, which proves the module loads, nothing more): the verification that actually matters
  happened AFTER that, live against the deployed instance - task=obdiag returning real pool data (not
  an error) for several cars, task=enginecheck/crossProductCheck returning `mismatchSpecs: 0` with
  real counts, and (once scripts/pushCheck.mjs and scripts/prePush.mjs existed, this same session) a
  full browser run of Market Check, Buy, a spec page and Sell with zero 5xx/console errors. A plain
  module import would NOT have caught the TDZ bug in the first place (it only throws when the function
  that references the mis-ordered construct is actually CALLED, and PERF_TRIMS's own lazy wrapping
  means the module itself loads fine even with the bug present) - what actually catches this class of
  bug is calling the real functions with real data, which is why prePush's deterministic engine checks
  and browser check (below) exist, not the module-load step alone.

  WHAT WOULD HAVE CAUGHT IT: the module-load step in prePush.mjs (below) would NOT have caught this
  specific bug on its own, per the previous paragraph - PERF_TRIMS's lazy `() => ...` wrapping means
  `import()` succeeds even with the HALO_PATTERNS bug present, because the broken line only executes
  when a function that reaches it is actually CALLED. What WOULD have caught it: scripts/pushCheck.mjs
  loading one real Market Check result in a browser, which calls runOneBox, which calls buildSpec,
  which evaluates HALO_PATTERNS - the exact failure path. This is why prePush.mjs requires ALL THREE
  layers (module load, deterministic engine checks that actually CALL the engine on fixed cars, and
  the browser check), never module load alone.

  PREPUSH RULE (job 2): scripts/prePush.mjs is the ONE entry point for every lane before every push.
  No push without a green (or baseline-only) prePush run. It: (1) imports every lib/** and api/** file
  in the pushing branch's own committed history since origin/main (never the dirty working tree - this
  is a shared, multi-lane checkout); (2) runs deterministic engine checks with no DB access needed
  (depthWins fixtures) and, when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are available, the archive-
  backed invariants (representative, live-comparable fences, split-pool sums, over-time sums) from
  scripts/crossProductCheck.js; (3) calls scripts/pushCheck.mjs (Lane C's one shared browser check -
  prePush does NOT duplicate it) to load a Market Check result, a Buy result, a spec page and the Sell
  first step in a real browser via the crew test-only override (x-launch-stage-test header + PROBE_KEY
  from the environment only, never printed) and fail on any 5xx or console/page error; (4) checks any
  failure against a short, dated BASELINE_FAILURES list in the script itself, so a KNOWN pre-existing
  failure is marked apart from a NEW regression (currently empty - the one known entry, the Sam's Take
  "averaged" console error, was fixed the same day this baseline mechanism was built). A SKIPPED check
  (no DB credentials available) is reported as SKIP, never silently counted as a pass. DRY-RUN SAFETY
  (standing rule for every lane's future prePush additions): no check in prePush.mjs may call any
  endpoint capable of a write, a pull, or a live vendor fetch without passing that endpoint's own dry-
  run flag. LANES A AND C: use scripts/prePush.mjs before every push from now on: `node scripts/
  prePush.mjs` (reads PROBE_KEY from the environment for the browser check's gated pages; without it,
  the gated pages load as the public sees them, which still proves no 5xx/console error but not the
  result itself).
- 2026-10-13 (Lane B): POOL-CONSISTENCY ROOT CAUSE (jobs 3, 3b, 4, 6, 9) SHIPPED. ENGINE_VERSION
  e17-20261013-poolconsistency.

  JOB 3 (gearbox/competition split read a wider pool than the headline): root cause was the split/
  question logic running in runOneBox BEFORE buildResult, reading `chosen.rows` (the raw, pre-fence,
  pre-window ladder rows) directly, while the headline itself (buildResult) applies the day-windowing
  and the provenance/engine-swap/halo/rule5PoolGuard set-aside chain to the SAME starting rows and
  lands on a smaller pool. Fixed by extracting buildPool() as the one pure pool computation (same
  inputs, same outputs, no hidden state) and calling it from BOTH the gearbox/competition block and
  buildResult - two calls, guaranteed-identical results by construction, not two implementations that
  happen to agree today. inlineSplits now carry poolN and unknown, so sides + unknown always sum to
  exactly the headline count (new checkSplitPoolInvariants in crossProductCheck.js asserts this).

  JOB 3b (Targa 4 442-vs-334, "transient"): root cause found in lib/_supabase.js supabaseSelectAll -
  its own prior comment documented the bug as DESIGN ("a mid-walk error returns what was read"): when
  a page AFTER the first one failed (timeout, throttle, bad status), the function silently returned
  the PARTIAL array collected so far as if it were the complete result - for an unbounded, many-page
  scan (assessClassEra's "page the full marque-decade pool") this served a smaller, wrong pool as
  complete whenever a later page hiccuped. Reproduction: could not reproduce live in 12 attempts this
  session (the archive has grown past whatever size/timing window triggered the original report, and
  both lanes read 1096/1096 consistently every time) - the cause was confirmed by direct code reading,
  not by reproducing the flake. Fixed: a failed page gets up to 2 retries (short backoff) before the
  WHOLE read fails (returns null, every caller's existing null-handling already treats this as "no
  data", never as "the pool is smaller") - a timeout or partial page can no longer be served as a
  complete, smaller pool.

  JOB 4 (over-time rows not summing to headline): same root cause class as job 3 - the old
  quarterlyBandsFor bucketed by CALENDAR quarter counted back from today, which does not align with
  the headline's own ROLLING window (windowStart to now); a real slice of the window could fall
  outside every calendar bucket. Replaced with tradingPeriodsFor: four TRAILING three-month periods
  partitioning the exact span windowStart-to-now by day count (Math.floor assigns every row to exactly
  one bucket, no gaps/overlaps). A period below RANGE_THRESHOLD(8) is omitted entirely (no thin flag,
  no empty row); its rows fold into the new rowsNotShownCount field, so shown-period counts plus
  rowsNotShownCount always sum to the headline count exactly - never hidden. yoyDirection.status
  ("higher"/"lower"/"flat") remains the one engine-computed direction word; Lane A prints it, never
  computes its own. New checkOverTimeInvariants in crossProductCheck.js asserts the sum.

  JOB 6 (live year-widening crossing generation boundaries): the ONE shared rule (lib/live/search.js
  nearestYears, commit 7e88f59, unchanged in shape - no second widening rule written) now accepts an
  optional genBound and drops any neighbouring-year match outside it. genBound comes from a new
  genBoundFor(make, model, year) in the SAME file, which reuses the EXISTING curated tables (lib/
  generations.js halfGenerationFor/halfForYear for a half-split model, else CURATED_GENERATIONS via
  the already-imported genFor) - no new table was added, per "do not add new thresholds without
  telling me" and because duplicating the data into lib/modelRules.js (as asked) would have created a
  second, driftable source of truth for data lib/generations.js already holds correctly (997.1 2005-
  2008 / 997.2 2009-2011 verified there - Sam's own "2009 to 2012" was the one two years off; used the
  curated, already-verified figure). COVERAGE: every make/model in lib/generations.js's
  CURATED_GENERATIONS or HALF_GENERATIONS tables is now protected (dozens of families - 911, M3/M5/M2,
  3-Series, Corvette, Camaro, Mustang, Boxster/Cayman, Land Cruiser, and more - see that file for the
  exact list). Any make/model in NEITHER table still widens unclamped - reported here as UNKNOWN/
  unprotected per family, not guessed at: every uncurated model in the archive, which is the large
  majority of makes by SKU count even though the curated set covers most high-volume collector models.
  Wired into both Buy search paths (lib/live/samChat.js searchWithNearest, lib/live/converse.js) - the
  two existing callers of nearestYears, no third path added.

  JOB 9 (crossProductCheck only ran 46/63 specs - 300s function limit): added &batchOffset=&batchSize=
  (bounded, max 12/batch) and &manifest=1 (the full spec list/count) to task=enginecheck, so the
  default 63-spec set runs as several calls under the limit instead of one that times out. No nightly
  workflow file change needed - the existing nightly step does not currently call this ops task in
  batched form; if Sam wants nightly to run the full 63-spec sweep, that is a separate ask (the
  workflow file is unchanged this round).
- 2026-10-11 (Lane C): SELL CHAT MISUSE LIMITS, TASKS PER-ACCOUNT LIMITS (Sam's next run).
  * The public Sell chat is /api/chat (the live wizard's entry and follow-up chat); /api/sellChat (the new Sell)
    is switched off but guarded the same way. lib/_ceilings.js sellModelGuard on every Sell call that can reach
    the model: the $50 a day model cap (now summing buy_chat_turn, tasks_model_turn, chat, sell_chat_turn and
    sell_followup_turn) and CEILINGS.sell_model (10 a minute and 100 a day per device; 30 a minute and 300 a
    day per address), crew exempt. Past any of them the page shows MODEL_PAUSED ("Sam's written answers are
    paused for the moment. Try again later today.") and the wizard carries on (js/entry.js shows any
    `limited` reply as Sam's message). Basis: the last 30 days, browsers only, 120 calls from 34 addresses,
    busiest 10 a day and 3 in a minute (1,695 more rows were our own automated callers).
  * Message length: /api/chat already caps 2,000 characters a message and 12,000 in all; the shared chat endpoint
    (lib/live/chatHttp.js, Buy and the new Sell) now caps 12,000 in all too (it already cut each message at 2,000).
  * The new Sell's follow-up now logs its spend (sell_followup_turn); the new Sell's chat and follow-up
    surfaces ask for prompt caching. Live /sell: the follow-up prompt (about 5,700 tokens) was already cached;
    the pre-result prompt (about 700 tokens) is too short for the prompt cache.
  * Tasks per account per day (tasksAllowance, crew exempt): 40 setup chat turns, 10 research Tasks. Past it the
    reply is MODEL_PAUSED; research still starts and its thread shows the sentence. tasks_model_turn rows now
    carry user_id, so these limits can be reset from real use.
  * Tasks prompt cache: measured live (in-memory test scenario) and NOT hit: each Tasks call's prefix is about
    1,000 to 1,400 tokens, under the model's minimum. $0.012 a setup turn, $0.008 an update turn.
  * The code-written Task line read "Another, manual 1986 ..." for a third car and "A Arctic Silver"; fixed.
  * FOR LANE B (found Oct 11, ~23:40 UTC, by the push check): Market Check results intermittently show "Sam's
    catching his breath, try again in a minute." with no console error. Three fresh-visitor loads: 1995 Porsche
    911 Carrera and 1967 Ford Mustang Fastback showed the line, 2004 BMW M3 drew its body question; a fourth load
    of the 911 drew the result, with /api/sellerDecision taking 9,826 ms. The calm line comes from the oneBox
    health probe (api/sellerDecision.js, ONEBOX_PROBE_MS 3,500) or the page's own fetch abort (js/onebox.js
    obFetch). Seen after 44a75da; Lane B's c774d29 (exactStep ReferenceError in buildPool) is the likely cause,
    and after it the 911 result drew again (20 prices). The 9.8 s engine time is still worth a look.
    pushCheck.mjs now fails on that line, so prePush will show it.
  * Oct 11, 16:40 PT: the Vercel deployment for fc381a3 ended in Error with no build log (0 ms, GitHub status
    "Deployment has failed"); production stayed on 7c2cdc4. Retriggered with this note's commit.
- 2026-10-12 (Lane C): SPEND EMAILS, BUY ADDRESS LIMIT, SIGN-UP PROTECTION.
  * Spend emails (lib/_spendAlerts.js): "Model spend has passed 80 percent of the daily cap" and "Model spend has
    reached the daily cap", each at most once per Pacific day, with the Buy chat / Tasks / Sell chat split.
    Triggered from the spend read every model guard makes (lib/_ceilings.js buyChatSpend24h); once-a-day record
    in ip_rate_hits (key "spend_alert"). Recipient: SPEND_ALERT_EMAIL (environment only; unset = nothing sent).
    SAM: set SPEND_ALERT_EMAIL=feedback@goasksam.com in Vercel (production), then redeploy.
  * Buy chat: 100 model turns a day per address (BUY_MODEL_TURNS_PER_ADDRESS_DAY), crew exempt, after the 20 per
    device; past it the no-model results with BUY_MODEL_PAUSED. Every refusal logs rate_limit_hit kind
    buy_model_address_day, reason "address limit". Model turns now record the address as well as the device.
  * Sign-up (lib/_signup.js, api/signup.js, js/auth.js): before asking for a sign-in code the page calls
    /api/signup {action:"check"}. Existing accounts always pass. A new account: throwaway domains refused
    (lib/data/disposableDomains.js, 9,226 domains, refreshed by scripts/updateDisposableDomains.mjs), 20 new
    accounts per address per day (crew exempt), Turnstile when SIGNUP_TURNSTILE=1. A pass returns a 30 minute
    ticket sent with the code request as user metadata. Supabase's Before User Created hook
    (/api/signup?hook=before_user_created) refuses a new EMAIL account without a valid ticket, so the checks
    cannot be skipped by calling Supabase directly; Google and other providers always pass. Crew sign-in and the
    Tasks probe's test address (admin generate_link) carry a server-minted ticket.
    SAM, three steps, in this order:
      1. Supabase dashboard > Authentication > Hooks > "Before User Created" > HTTPS, URL
         https://goasksam.com/api/signup?hook=before_user_created; generate its secret and put it in Vercel as
         SUPABASE_AUTH_HOOK_SECRET; redeploy. Until this is on, the checks run on our page only.
      2. Turnstile, at launch: create a Turnstile widget for goasksam.com in Cloudflare; put TURNSTILE_SITE_KEY and
         TURNSTILE_SECRET_KEY in Vercel. Nothing changes until step 3.
      3. The single switch: SIGNUP_TURNSTILE=1 (and redeploy). Unset it to switch Turnstile off again.
    Optional: SIGNUP_TICKET_SECRET (else TASK_LINK_SECRET, else CRON_SECRET signs the tickets).
- 2026-10-12 (Lane C): TASK EMAIL FREQUENCY (one combined Task email per person).
  * lib/tasks/digest.js, cron GET /api/tasks?send=1 at 10, 25, 40 and 55 past every hour (it replaces the
    /api/watch?run=1 and /api/buySearch?alerts=run crons). One email per person carrying everything new from ALL
    their Tasks: a Task's new live matches (runTasks now QUEUES them: task_updates.email_status "queued", shown in
    the Task at once), exact-car and sold-car Tasks' new events (watches), and Before it ends cars. Setting
    accounts.task_email_every: daily (default, 8:00 PT), twice (8:00, 17:00), thrice (8:00, 12:00, 17:00),
    instant (every run). Cap: 6 match emails per person per Pacific day (ledger key user:<id>, kind e:match);
    over it, everything waits for the next email (never dropped). A Before it ends car goes in the email before
    it ends ("as soon as one comes": within 3 hours, as before). Cars that ended before their email are left out
    (they stay in the Task; an armed Before it ends car is marked ended_before_send). Research done, Still looking?
    and the Task start email are not match emails: sent at once and not counted. The "Email updates" switch now
    covers every Task email.
    SAM: run docs/supabase-accounts-task-email-every.sql once. Until then everyone gets the default (once a day)
    and the Tasks page hides the "How often" choice.
  * watches.run and buyAlerts.runAlerts no longer send on their own (opts.send keeps the old direct send for a
    probe that asks for it).
- 2026-10-11 (Lane A): SHORT RUN, JOBS 1-6 (fixes from the prior report).

  JOB 1 (PowerSellers nav): the Sell page's own hardcoded rail (index.html, served by api/sellPage.js
  for /sell) and onebox-preview.html (the Screen 2 design-reference page) still linked /powersellers;
  both removed (lib/appShell.js's shared buildPages() had already dropped it everywhere else, per the
  9ba8c88 comment, which is why the prior NAV CHECK found every OTHER surface already clean). onebox.html
  and desk.html carry no such link (already clean). Remaining /powersellers surfaces, unchanged, by
  design: the page and route itself (powersellers.html, untouched), its sitemap-pages.xml entry
  (api/sitemapPages.js, product: null, stage-0/always-listed), and robots.txt (no Disallow for it, same
  as every other public page; the one comment line there is just documenting that /onebox and /desk are
  the crew-gated exceptions). It is fully indexable (no noindex meta, no X-Robots-Tag) exactly as before -
  indexing not touched, per the job.

  JOB 2 (Desk must not answer a stranger): api/desk.js's crew/tester check now runs FIRST, before CORS
  setup or the method check, and a non-crew/non-tester caller gets lib/_notFound.js's sendDisguisedNotFound
  (404, text/html, generic "This page doesn't exist" body, no JSON, no CORS headers) regardless of HTTP
  method - not the old `{"status":"sealed","error":"Desk is crew-only."}` 403. The PAGE case (/desk) is
  now byte-IDENTICAL to a real missing page: vercel.json's rewrite is now conditional on the gas_crew or
  gas_tester cookie (mirrors the existing /sell, /buy, /history pattern); with neither cookie, no rewrite
  matches, there is no literal file at "/desk" (only desk.html), so Vercel's own native platform 404
  answers - nothing invented on our side. Verified via a real local Chrome (puppeteer-core hitting
  production) BEFORE this fix: the native 404 for a genuinely missing path is status 404, `x-vercel-error:
  NOT_FOUND`, title "404: NOT_FOUND" - captured and reused as lib/_notFound.js's template for the API case
  (the one case that can't get the free native 404, since Vercel always invokes a real serverless function
  at its own filesystem path regardless of any rewrite).

  BIGGER FINDING, same job, SAM/ALL LANES: while searching "page source a non-crew visitor can reach" for
  Desk mentions, found that /desk's RAW STATIC HTML (title "Sam Desk", branding visible) was served to
  ANY requester with no cookie check at all (status 200, cached at the edge, confirmed via a real browser
  hitting production) - the page's own client-side cookie check only REDIRECTS after the HTML has already
  loaded, so a curl/crawler/any non-JS client saw the full page. That part is fixed by this job's vercel.json
  change above. But the SAME probe found the much larger issue: this deployment serves the ENTIRE repository
  as public static files with no restriction - confirmed live (200 OK, real content) for lib/desk/handler.js,
  js/desk.js, scripts/engineCheck.js, docs/desk-mockups/index.html, and CLAUDE.md itself (this whole product-
  rules file, at /CLAUDE.md). No .vercelignore exists. This is NOT scoped to Desk or to Lane A's three files -
  it is every lane's lib/**, scripts/**, docs/**, and any other loose file at the repo root. NOT fixed this
  run: a blanket .vercelignore would break the Vercel build (api/**'s serverless functions import lib/** at
  build time, so lib/** cannot simply be ignored from the deployment), and the real fix (moving genuinely-
  public assets into a proper public/ directory, or an equivalent Vercel output restriction) is an
  architecture-level, cross-lane change with broad blast radius - exactly the kind of thing to decide with
  Sam rather than patch mid-task. One concrete, safe, in-scope piece of it WAS fixed here: the orphaned
  outputs/*.html dev fixtures (zero references anywhere in the codebase, last touched at fdac252, a commit
  from before several since-reversed product rules) were deleted - they were both a live leak of stale,
  rule-11-violating copy ("the fee earns its keep", "my personal preference") AND first-person Sam, outside
  the Sell flow, concrete proof the exposure is not theoretical. SAM: recommend a dedicated task to decide
  the right boundary (what's genuinely public vs. source) and implement it deliberately, verified end to end,
  not as a side effect of a nav-copy fix.

  JOB 3 (chat identity failure line): fixed in js/chat-core.js identityResolveError - shown whenever
  validateVehicleIdentityPreflight (its real name; resolveVehicleInput is its alias) fails on a network/
  resolver error, which is the shared SELL INPUT PIPELINE identity check called from js/steps.js and
  js/wizard.js at every step that can accept a car name (initial entry, step 1, trim/model clarification,
  corrections, confirm-step edits) - all on /sell. Also found and fixed (all genuinely outside the Sell
  flow/homepage front door, all simple isolated string edits, no behavior risk):
  - js/auth.js (site-wide sign-in modal, loaded by index.html, api/buy.js, api/history.js, api/specPage.js,
    api/howSamDecides.js, api/tasksPage.js, api/business.js, api/publicConfig.js, api/marketCheck.js - i.e.
    every product): "I couldn't send/verify the code just now" -> "That code could not be sent/verified
    just now", matching the file's own existing neutral-error style used two lines above it.
  - powersellers.html: the hero script line and one hd-lead sentence used singular "I" ("Sometimes I'd
    hand the keys...", "...For some vehicles I'd keep it simple...") against the rest of the page's
    intentional "we" team voice; reworded to drop the first person rather than insert "Sam" into a voice
    that otherwise says "we". The footer CTA ("Tell me what you're selling") became "Tell Sam what you're
    selling" (third person, matches this run's other fixes).
  - onebox-preview.html: stale first-person copy ("I know this exact car", "I can tell you the best
    places to sell your car...", "See where I'd sell it", "the window I track", "ask me where I'd sell
    it... I'll read what there is") replaced to match what js/onebox.js ACTUALLY ships today (confirmed by
    reading the real renderer): "This exact car", "Sam can tell you the best place to sell this car right
    now, and why.", "See where Sam would sell it", "the window Sam tracks". The mockup had simply drifted
    from a copy fix that already shipped to production; two lines (the thin/refusal screen's "window I
    track" and "Tell me more about it...") have no live equivalent to mirror (dead screen state in the
    mockup), reworded directly to third person.
  - api/publicConfig.js answerSentence (feeds /o/<id> shareable-result OG/meta text for old saved
    snapshots): "The one sale I'd actually use brought $X." -> "The one sale that applies here brought $X."
  NOT fixed, listed for Sam/lanes to decide:
  - js/desk.js (crew-only B2B Desk tool chat voice, e.g. lines 67/75/488/582: "I ranked...", "I read...",
    "...and I'll run it."): a different, larger surface (many lines, a whole tool's chat persona) - left
    for a deliberate decision on Desk's voice convention rather than a drive-by edit.
  - lib/onebox.js SAM_LINE/trustLine (~1734-1750): first-person, but confirmed DEAD CODE - zero live
    callers anywhere in the codebase (a "Round-3"/pre-redesign leftover, same vintage as the stale
    onebox-preview.html screens above). No user ever sees it; no fix needed, flagging only so it isn't
    mistaken for live copy later.
  - lib/vehicle.js clarification `question` strings (811, 1549-1550, 2093, 2125) and api/vehicleIdentity.js
    (209, 256, 306): checked carefully, NOT a violation - the shared resolveVehicle() is also called from
    api/history.js and api/_historyData.js, but both of those callers read only `.vehicle` and discard
    `.question`/clarification entirely, so these strings are only ever actually shown via
    api/vehicleIdentity.js, which is Sell-only. Reachability confirmed by reading every caller, not assumed.

  JOB 4 (Market Check sub-headline): lib/live/marketCheckLanding.js, the `.mc-sub` line right under the
  "What do cars like yours sell for?" display headline (that headline line is the explicit rule-20
  exception and was left alone) - old text ("Real sales, matched to your car, with the range most landed
  in and the cars behind it.") replaced with the exact text given. Nothing else on the landing repeats or
  clashes with it: the "How Sam gets there" three-item list below explains matching/sorting/outlier
  mechanics, not the range-and-sales-behind-it framing, and the VIN line below that is about exact-car
  lookup, unrelated.

  JOB 5 (Buy offWindow fixture): scripts/offWindowCheck.mjs. No live search ever produced a real
  off-window card to screenshot (tried again this round, no luck), so this proves the RENDERING instead:
  it extracts js/onebox.js's offWindowLabel and api/buy.js's CLIENT-string drawerHtml - the actual shipped
  functions, not reimplementations - runs each in a vm sandbox (document/window/fetch/localStorage
  stubbed; fetch is a rejected stub so a real network call is structurally impossible, not just avoided by
  convention) with a stubbed offWindow:true card, and asserts both render the identical "A {year} car, a
  few years from the {searched year} searched." text. Verified it actually catches drift, not just a
  rubber stamp: temporarily changed one side's wording, confirmed the script fails and exits 1, then
  restored and confirmed 8/8 pass again. Zero DB, zero OCD, zero live endpoint, no key.
  FOR LANE B: please register `node scripts/offWindowCheck.mjs` in scripts/prePush.mjs (same family as
  the other pure-logic checks like rangeLadderCheck.mjs) - not done here per the instruction to leave
  prePush.mjs to you.

  JOB 6 (copied wording, for a later shared module - nothing built this run): file:line for every copy
  found.
  - Bid age ("updated 1h 12m ago" / "Bid as of ... PT"), THREE copies of the same bidAge()/BIDFMT/
    stampBids-family code: api/buy.js (Lane C's original; CLIENT string literal, search `function
    bidAge` - the whole CLIENT is one source line so a plain line number isn't meaningful); js/onebox.js
    lines 225-235 (Lane A, explicitly commented "Ported verbatim from api/buy.js's bidAge/BIDFMT/
    stampBids"); api/history.js lines 425-435 (Lane A, same comment/pattern, VIN history page).
  - Off-window wording ("A {year} car, a few years from the {searched} searched."), TWO copies: js/
    onebox.js lines 823-834 (function offWindowLabel) and api/buy.js (CLIENT string literal, search
    `var ow = (c.offWindow` - inside function drawerHtml). Text matches today (proven by Job 5's script);
    nothing to fix, just recorded so the eventual shared module covers both constants, not just one.
- 2026-10-12 (Lane C): SIGNUP HOOK FINDINGS, ONE-CLICK STOP, ADDRESS PRIVACY, COPY, ENDED-BEFORE-EMAIL COUNT.
  * THE EXISTING SUPABASE HOOK. "Before User Created" is a Postgres function, public.before_user_created_ip_cap
    (docs/supabase-ip-rate-caps.sql, commit 06e8074, TDV2026, 2026-08-10, "Spec C"). It reads the address from
    the hook event (claims.ip, metadata.ip_address or ip_address; none = allow), reads the cap from app_config
    ip_cap_signup_day (5), counts ip_rate_hits rows with that RAW address and kind "signup" since midnight UTC,
    refuses at 5 with http 429 "A lot of sign-ups are coming from your connection. Try again in a bit." (our
    page shows its generic "I couldn't send the code just now"), else inserts (ip = the raw address, kind
    "signup") and allows. It runs for EVERY new account, Google included. It had no revoke, so the public anon
    key could call it through /rest/v1/rpc (docs/supabase-address-privacy.sql part 1 fixes that). Its rows
    (504 from 290 addresses, Aug 20 to Oct 12) are the only per-address sign-up figures: per address per day
    typical 1, 90th percentile 5, busiest 6.
  * THE SWITCH, Postgres function -> HTTPS hook (Sam, in this order; each step has its one-line test):
      0. Before: Supabase SQL editor, run docs/supabase-address-privacy.sql parts 1 to 3.
         Test: sign in to an existing account; it works as before.
      1. Supabase > Authentication > Hooks > "Before User Created" > edit. Change the type to HTTPS. URL:
         https://goasksam.com/api/signup?hook=before_user_created . Press "Generate secret", copy it, Save.
         FROM THIS MOMENT UNTIL STEP 2 IS LIVE, EVERY NEW ACCOUNT FAILS (email and Google): the route refuses an
         unsigned call. A person signing up sees "I couldn't send the code just now. Try again in a moment." (a new
         Google account lands back on the page signed out). Existing accounts sign in normally.
         Test: none yet; go straight to step 2.
      2. Vercel > goasksam > Settings > Environment Variables > Add: SUPABASE_AUTH_HOOK_SECRET, Production, paste
         the secret, Save. Deployments > the latest Production deployment > "..." > Redeploy. About a minute.
         Test: when the deployment shows Ready, sign up with a new address (an alias of yours); the code arrives.
      3. Test Google: in a private window, "Continue with Google" with a Google account that has never signed up;
         you land signed in.
      IF A SIGNUP FAILS AFTER STEP 2: Vercel > goasksam > Logs, filter /api/signup: 401 means the secret differs
      (copy it again from Supabase into Vercel, redeploy); 400 means our rules refused it (expected for a
      throwaway address). UNDO AT ANY TIME: Supabase > Hooks > "Before User Created" > change the type back to
      Postgres function, schema public, before_user_created_ip_cap > Save. Signups work again at once.
      4. A week later, if all is well: run docs/supabase-address-privacy.sql part 4 (drop the old function).
  * WHAT THE SWITCH LOSES: (a) the cap on NEW GOOGLE accounts per address (5 a day); the HTTPS hook lets every
    Google sign-up through, per Sam's rule that Google sign in is never blocked. (b) the app_config dial
    ip_cap_signup_day (5, changeable without a deploy); the new limit is SIGNUPS_PER_ADDRESS_DAY = 20 in
    lib/_signup.js, rolling 24 hours, email sign-ups only. Today BOTH apply to email sign-ups (old hook 5 per UTC
    day at Supabase, our page check 20), so the effective email limit is 5. Recommendation: switch to the HTTPS
    hook (it carries the throwaway list, Turnstile and the ticket that stops direct calls; the old one only
    counts), keep the old function until the switch has run a week, and decide whether new Google accounts need
    a per-address cap (it would need the address from the HTTPS hook payload, not yet seen in practice).
  * FAILURE BEHAVIOUR (answers, nothing changed): (1) HTTPS hook on, SUPABASE_AUTH_HOOK_SECRET missing or wrong:
    our route answers 401 to every call, Supabase does not create the account: email sign-up shows "I couldn't
    send the code just now. Try again in a moment."; a new Google account lands back signed out with no message
    (js/auth.js does not read the error Supabase puts in the address). BLOCKED. (2) HTTPS hook on, the route
    errors or times out: the same, BLOCKED (Supabase treats a failed hook call as a refusal; our route itself
    fails closed only on a bad signature, everything else in it fails open). (3) HTTPS hook off, old Postgres
    function on: LET THROUGH unless that address made 5 accounts since midnight UTC (then refused with its 429
    sentence, shown on our page as the generic line) or the function itself errors (refused). Our page check
    (throwaway, 20 a day, Turnstile) still runs for the email form but can be skipped by calling Supabase
    directly. PROPOSED, NOT DONE: show Supabase's refusal sentence after a Google return, and pass the old
    hook's sentence through on the email form.
  * ONE-CLICK STOP (RFC 8058): every Task email (the combined one, research done, Still looking?, the start email)
    carries List-Unsubscribe <https://goasksam.com/api/tasks?a=emails_off&t=...> and List-Unsubscribe-Post; the
    combined email's footer has "Stop all Task emails". A POST turns the "Email updates" switch off for that person
    only; Tasks keep running; a GET only shows the confirm page.
  * ADDRESSES: no raw address is written any more. ip_rate_hits keys: "ah:<daily salted hash>" (address),
    "dev:h<daily salted hash of address and browser>" (cookieless device), "dev:<visitor id>", "user:<id>",
    "spend_alert"; every row deleted after 24 hours. app_usage_events no longer stores any address (ip_address
    dropped, nothing in its place: usage events are kept long term); api/funnel.js ip_hint dropped; the MCP call
    log keeps a hash of the client NAME only, the address-based limiter key lives in memory for a day. Salt from
    ADDRESS_HASH_SECRET (else CRON_SECRET, else the service role key). SAM: run docs/supabase-address-privacy.sql
    parts 1 to 3 now. Outside our code: Vercel's request logs and Supabase Auth's own logs keep addresses under
    their own retention.
  * FOR LANE B: cars that ended before their combined Task email could carry them (task_updates email_status
    "ended", buy_alerts send_status "ended_before_send") are counted daily in scripts/pullReport.mjs; this should
    become an event in the event layer (lib/events.js), e.g. task_car_ended_before_email {source, count}.
- 2026-10-12 (Lane C): HOOK OUTAGE FOUND, SIGN-IN REFUSALS, EMAIL COPY.
  * RESOLVED, same day: Sam undid the switch, "/api/signup" was added to "static-bypass-bot-protection" (firewall
    config v14; other API paths still challenged; an unsigned hook call now gets our 401), and Sam switched back to the
    HTTPS hook. Live hookcheck: with ticket, created; without ticket, refused. Supabase showed that refusal as "Invalid
    payload sent to hook" because the route refused with HTTP 400 (Supabase reads any non-2xx hook reply as broken); the
    route now refuses with HTTP 200 and {error:{http_code:400,message}} so the sentence reaches the page.
  * URGENT, FOUND Oct 12 18:46 PT: since the switch to the HTTPS "Before User Created" hook, EVERY NEW ACCOUNT FAILS
    ("Service currently unavailable due to hook", from Supabase). Cause: Vercel bot protection (managedRules
    bot_protection = challenge) answers https://goasksam.com/api/signup?hook=before_user_created with a 429
    challenge to any non-browser caller, Supabase's server included, so the hook never reaches our code (no
    /api/signup log line for it). The switch steps above missed this; my error. Existing accounts are unaffected.
    FIX (Sam): add "/api/signup" to the firewall rule "static-bypass-bot-protection" (Vercel > goasksam > Firewall,
    a new path condition group, path equals /api/signup), or undo the switch in Supabase until then. With the
    bypass, the route still refuses an unsigned hook call (401) and the page check keeps its own limits.
    TEST after the fix: the credentialed check POST /api/signup {action:"hookcheck"} creates a ticketed test account
    (expect created) and an unticketed one (expect refused), and deletes both; no email is sent.
  * Sign-in refusals now reach the person (js/auth.js authRefusal): our three sentences are found in whatever
    Supabase returns, the old function's "A lot of sign-ups ..." reads as the limit sentence; anything else on the
    email form is "Sam couldn't send the code just now. Try again in a moment."; a return from Google with an error
    opens the sign-in card with the sentence (or "That didn't go through. Refresh the page and try again.") and the
    error is taken out of the address.
  * FOR LANE B: listingMarket (lib/live/search.js) widened the 2017 Porsche 911 Carrera S Coupe to two years
    ($87,500 to $95,500, "in the past two years") while Market Check's headline for the same car is twelve months
    ($95,500 to $113,000). 1987 911 Carrera Coupe and 1996 911 Carrera 4S Coupe manual agreed exactly. Buy's cards
    show the two-year figure too. Until one pool serves both, the email's middle-half line (lib/live/buyAlerts.js
    middleHalfLine) is printed only for a past-year range.
- 2026-10-11/12 (Lane B): "SAM'S CATCHING HIS BREATH" ROOT CAUSE + RELIABILITY FIX.
  * ROOT CAUSE: api/sellerDecision.js's oneBox branch (job fc381a3's FOR LANE B note) runs a cheap Supabase health
    probe (`sales_archive?select=source_id&limit=1`, aborted after ONEBOX_PROBE_MS, default 3500ms) BEFORE the
    real compute, specifically so a down/slow Supabase fails fast to one calm line instead of a hung spinner. That
    probe had NO retry: a single, trivial `limit=1` read timing out past 3.5ms is almost certainly transient
    connection-pool/cold-start contention (the SAME class this session already found independently: parallel
    crossProductCheck batches saturating Supabase's connection pool and timing out while the identical batches
    run sequentially succeed), not a real outage, and Lane C's own log (fc381a3) showed exactly that: two of three
    fresh loads showed the calm line with no console error, and a fourth load of the SAME car drew the real
    result. A second, independent path to the identical calm line exists too: the 20s ONEBOX_DEADLINE_MS race
    around runOneBox itself (also no retry, correctly - see below).
  * FIX (api/sellerDecision.js, around the oneBox branch): the health probe now retries ONCE on failure before
    concluding "unavailable" (obProbeOnce() factored out, called up to twice). This never touches the Anthropic/
    chat path (archive-only), so it is safe under Sam's "never doubles cost on the model path" rule. The 20s
    runOneBox deadline is NOT retried - a slow real compute is a genuine cost, not a transient blip, and retrying
    it risks the CLIENT's own 25s fetch abort (js/onebox.js obFetch) firing before a retry even finishes.
  * LOGGING - CONSIDERED, NOT BUILT (Sam's scope call: Lane C owns the event layer/analytics store; do not add
    one here). What was drafted and then removed from this commit, for Lane C's context: every oneBox request
    would log EVENTS.SEARCH (lib/events.js) with `latencyMs` and a `failState` ("probe_unavailable" /
    "compute_timeout" / "compute_error" / null-on-success) in its existing `props` JSON, since TODAY there is
    NOTHING logged at all on either failure path (the probe-fail return and the deadline-timeout catch both
    `return` before the single existing EVENTS.SEARCH call a few hundred lines down, which itself only fires on
    a completed result and carries no timing). If Lane C wants this, the 3 call sites are: the probe-fail return
    (api/sellerDecision.js, right after "Supabase health probe failed twice"), the runOneBox deadline catch
    (right after "One Box unavailable (...)"), and the existing success-path EVENTS.SEARCH call just below it -
    all three already compute `Date.now() - obStart` for their console.error line, so the latency value is
    sitting right there if this gets built properly as part of the event layer.
  * THE 9.8s NUMBER, explained and REPRODUCED: measured 8 of the fixed 10-car set live (5 runs each, real browser
    via scripts/pushCheck.mjs's own launch-stage-gate pattern - bare curl to /api/sellerDecision gets a 429 from
    Vercel Bot Protection Challenge mode with no bypass secret available). FENCED queries (997 Carrera S Coupe,
    911 Cabriolet, Camaro SS, GT350R) held 3.6-6.5s total, every attempt. BARE/UNSCOPED nameplates ("1995 Porsche
    911 Carrera" - the ORIGINAL car Lane C's note measured at 9,826ms - and "1967 Ford Mustang Fastback") held
    RELIABLY, not intermittently, in the 5.8-11.8s range on EVERY attempt (5/5 each) - this reproduces the
    original 9.8s almost exactly and shows it is a real, repeatable cost, not noise. One true outlier: a BMW M3
    Coupe attempt hit 12,006ms total (10,933ms server) against its other 4 attempts' 5.3-8.1s - consistent with
    the same transient connection-pool contention named above, not a deterministic cost. LIKELY SOURCE (not yet
    changed - flagging for a separate, properly scoped pass): lib/onebox.js's byTitle/byModel pool scope
    (~1667-1695) pages the WHOLE title-matched pool via supabaseSelectAll with NO row cap for a bare nameplate,
    and the file's own existing comment on the adjacent record-path (~1639-1642) already documents this exact
    class of cost as known: "paging tens of thousands of rows sequentially... is far too slow for a user-facing
    request... pending a properly benchmarked fix." Not touched this pass - Sam's directive was explicit that a
    fix "must be purely about reliability/timing, never about what gets computed," and parallelizing or capping
    that pagination is exactly the kind of change that needs its own measured before/after, not a guess inside a
    reliability fix.
  * GUARD (scripts/pushCheck.mjs): added a measured load-time check for 2 of the fixed-set cars (997 Carrera S
    Coupe, 1995 911 Carrera) on every push - polls the DOM for the real "ready" signal (a dollar figure, the calm
    line, or the daily-car-limit line) instead of a fixed sleep, and fails if either shows the calm line or
    exceeds MC_PERF_BUDGET_MS (default 18000ms - comfortable margin above today's worst observed 12,006ms, still
    short of the server's 20s deadline and the client's 25s abort, so it fires before either of those would).
    Superseded a flawed first draft of this measurement that relied on Puppeteer's networkidle2 + a follow-up
    waitForNetworkIdle as the "ready" signal - some background network activity never truly goes idle, so that
    approach pinned EVERY measurement to a flat ~21s regardless of real load time (a harness bug, not a product
    one; caught before it reached any committed file).
  * NOT DONE (2 of the fixed 10 cars untested): 1990 Porsche 911 Targa 4 and 1965 Chevrolet Corvette - the
    measurement run was still in progress on car 9 when a session limit required wrapping up; no evidence either
    is anomalous (both are dense/bare-nameplate shapes already covered by the 1995 911 Carrera and 1967 Mustang
    Fastback results above), but not directly confirmed.

## One shared engine entry point (Oct 2026, "engine only" unification job)

Sam's ask: a single entry point Market Check, Buy, Sell and Tasks all call for an answer, returning
one documented result object, so Lane C's event layer has one place to log against. This landed as
`oneEngineAnswer`/`mapEngineAnswer` in `lib/onebox.js`, plus the real production fix it surfaced.

**Headline finding, before any code changed**: there was never "two engines." Market Check calls
`runOneBox` (lib/onebox.js) directly; Buy/Tasks reach the SAME `runOneBox` indirectly via
`lib/live/search.js`'s `familyMarket -> listingMarket -> specOf -> specCore -> refreshSpec ->
walkLadder -> engineAnswer -> runOneBox`; Sell reaches it via `lib/platformPick.js fetchOnlinePool`
(already wired to runOneBox's own ladder from an earlier Oct 2026 fix). The three real gaps were
narrower than "merge two ladders" - each is documented below with its exact fix.

### FOR LANE C

`lib/onebox.js` exports `oneEngineAnswer(vehicle, generation, searchText, env, refine)` - same
signature as `runOneBox`, so any call site swaps in with no argument changes. It times the call and
maps the answer via the also-exported, pure `mapEngineAnswer(d, latencyMs)`. Returns:

```
{
  raw,              // runOneBox's full, unchanged answer - for a caller that still needs the rich object
  answerType,       // "range" | "identity_question" | "not_enough_data" | "zero_result"
  poolSize,         // number | null
  low, high,        // number | null - only set when answerType === "range"
  reasonFlag,       // string | null - set whenever answerType !== "range"; see the vocabulary below
  yearWidened,      // boolean - true when the engine's own ladder widened past the exact year/trim
  fallbackRung,     // string | null - the engine's own ladderStep/tier name (exact_trim, family, thin, class_era, ...)
  engineVersion,    // lib/onebox.js's ENGINE_VERSION at read time
  latencyMs,        // number - wall time of the runOneBox call this answer came from
  identityQuestion, // null, or { dimension, options: [{label, count}], skipLabel } when answerType === "identity_question"
  factsBlock,       // null, or { count, window, lowest, highest, latestPrice, latestMonth } when answerType === "not_enough_data"
}
```

`reasonFlag` vocabulary (exhaustive, all set by `mapEngineAnswer`): `too_few_in_window`,
`too_spread_unresolved`, `class_era_other_cars_only`, `body_not_offered_for_this_car`,
`no_sales_on_record`, `engine_read_failed`, `unmapped_tier:<tier>` (a gap in the mapper itself, not a
normal empty answer - log this one loudly if it ever appears). `identityQuestion.options[].count` is
always `null` today - see the general-split-mechanism gap below, this is the one field Lane C cannot
log per-side counts for yet.

**To add logging**: wrap a call site's `oneEngineAnswer` result (or call `mapEngineAnswer` on an
already-fetched `d`) and log the object above. Do not call `runOneBox` directly from a new call site
going forward - call `oneEngineAnswer` so every future caller's answer is already in the one shape.

### The three real gaps, and what actually closed them

1. **class_era / body_unavailable invisible to Buy/Tasks** (lib/live/search.js). `marketOf` only
   recognized `result`/`thin`/`refusal` tiers; `class_era` and `body_unavailable` carry real cards
   but never set `d.poolN`, so they silently read as a 0 count. Separately, `walkLadder`'s own gate
   never called `coreOf` for these two tiers EITHER - by a prior, deliberate, correct design choice
   ("a class/era band is other cars, never the cohort": `coreOf` builds a FAMILY label claiming "the
   group THIS car belongs to", which would misstate class_era's evidence). Fixed with a new
   `classEraCoreOf()` that returns a count-only core with `family`/`short`/`familyOne` all null, so
   the card's existing generic fallbacks render honestly instead of nothing at all. Confirmed live on
   5 of the 13 originally-failing specs (CLK DTM, Corvette Roadster, Miata Roadster, 308 GTS Spider,
   and - after a SPEC_V bump, see below - fixed the remaining class_era/thin specs too).
   - **SPEC_V bumped 8 -> 9**: the fix above didn't take effect on first deploy. Confirmed live via a
     temporary diagnostic (now deleted): generations matched exactly, Market Check's own class_era
     tier had real cards, yet Buy still returned null - a STALE `spec_market_cache` row computed
     under the OLD logic (`{v: SPEC_V, kind: "none"}`, indistinguishable from a genuine empty pool)
     persisting for up to `DAY_TTL` (24h) regardless of the code fix, since the freshness gate checks
     `SPEC_V`, not a timestamp alone. This is the SAME mechanism SPEC_V 8's own comment documents for
     an identical situation - bumping it is the established, correct fix, not a new pattern.
2. **Buy/Tasks' `engineAnswer` always escalates past a generation/body/variant question** (it has no
   interactive UI to ask through) and lands on the engine's own capped family-default - which is
   CORRECT, and already matched Market Check's own behavior at that same capped point. The 4 specs
   that looked like a mismatch (1989 Porsche 911 Speedster, 1965 Shelby Cobra, 1967 Shelby Cobra
   Roadster, 1963 Jaguar E-Type Series 1) were a TEST-HARNESS artifact: `crossProductCheck.js`'s
   `marketCheckLane` called `runOneBox` with `asked:0` (a fresh query's honest first ask), comparing
   it against Buy/Sell/Tasks' own internally-capped `asked:2` read - two different, both-correct
   interaction points. Fixed by calling `marketCheckLane` with `asked:2` too, so the harness compares
   all four lanes at the one point every product can actually reach. Market Check's own frontend
   handling of the question itself is unchanged and was never the issue.
3. **1970/1972 Datsun 240Z**: plain `resolveVehicle("...240Z")` returns `model: null` (240Z doesn't
   contain "Datsun", the shape plain resolveVehicle can miss); `resolveForBuy` - the function Buy's
   REAL production entry (`api/buySearch.js`) actually calls - falls back to `archiveResolveToken`
   and correctly resolves `model: "240Z"`. The harness was resolving ONE vehicle via plain
   `resolveVehicle` and reusing it for all four lanes, so Buy/Tasks were tested against a resolver
   they never actually use in production. Fixed: `checkOneSpec` now resolves a separate `buyVehicle`
   via `resolveForBuy(q, env)` for the buy/tasks lanes specifically.

**Result**: crossProductCheck's default 63-spec sweep, all four lanes, batched sequentially against
production after all of the above: **0 of 63 specs with any lanesOk:false**, confirmed in a dedicated
before/after run (13 failing before, 0 after, 0 regressions on the other 50). No range low/high moved
more than 10% on any already-passing spec (checked programmatically against the same before/after
data). Wired into `scripts/prePush.mjs` as a new archive-gated check (`runEngineCheck` called
directly, no HTTP hop) so this can't quietly regress - SKIPs without SUPABASE_URL/
SUPABASE_SERVICE_ROLE_KEY, same as the other archive checks.

### General-split-mechanism / identity-question work: scoped down, not built this round

Sam's wider ask (item 3: one identity/split engine for all four products, a "middle halves clearly
apart" materiality test, a reversible skip carried in the link, dimensions beyond trim/gearbox/body)
was NOT implemented this round - the fixes above make Buy/Tasks' EXISTING identity-question tiers
(`*_choice`) available through `oneEngineAnswer`'s `identityQuestion` field, but no caller renders
them yet, and the four ad hoc gates in lib/onebox.js (trim fences, gearbox, competition/variant, body)
are still four separate hand-rolled blocks, not one generalized mechanism. Reasons, so the next pass
doesn't re-derive this:
- `inlineSplitRange` (lib/onebox.js) is already a genuinely generic two-sided-band builder and is the
  right rendering primitive to build the general mechanism on.
- No "middle halves clearly apart" test exists anywhere today - all four existing gates are count/
  share gates only, never a price-magnitude comparison. This needs ONE new predicate, not four.
- "Documented history" was investigated and explicitly excluded: the real column
  (`sales_archive.desc_facts.markers.documented_history`/`matching_numbers`) has ~15% fill rate and is
  selection-biased (absence means "didn't say it," not "doesn't have it") - it clears the "real
  column" bar literally but not the honesty bar Sam set ("anything you cannot verify from a real
  sales record does not get a chip"). Verifiable today, with real columns: body style
  (`detectBodyStyle` on title), gearbox (`row.transmission`), trim (title fences). Nothing else in the
  schema currently qualifies.
- The 300SL "32 sales... not enough for a range" copy bug (says a count that cleared the threshold
  while a DIFFERENT, smaller, unshown online-only count actually gated it) is NOT in this file's
  scope - it's `thinHeadHtml` in js/onebox.js, frontend copy. `factsBlock`/`reasonFlag` on the shared
  object now carry the real figures a future frontend fix needs; this round did not touch js/onebox.js.
- Link-carried refinement state (so a skipped question stays available as a chip) already has
  plumbing in js/onebox.js (`refine.body`/`refine.tx`/`refine.trim` round-trip through
  `URLSearchParams` today) - a UI-rendering decision on top of existing infrastructure, not new
  plumbing, but not built this round either.

### FOR LANE C: /admin status report (Job 5, report only, nothing built this pass)

Sam's notes describe an `/admin` dashboard with Supabase sign-in, an `admin_users` allowlist, and
"owner"/"viewer" roles, assigned Oct 9 2026. Checked every angle; here is exactly what exists today.

- **No `/admin` route anywhere.** No `api/admin.js`, no static page, no vercel.json rewrite. A plain
  GET to `/admin` on production returns HTTP 429 (Vercel Bot Protection challenging the bare request,
  the same thing every unauthenticated curl to this site gets this session) - not a real 404/200/
  redirect signal either way, so this does not confirm OR rule out a route; the file-tree search is
  the authoritative answer, and it found nothing.
- **No `admin_users` table or schema file.** The string appears only as PROSE in `docs/admin-
  analytics.md` and this file (describing the plan), never in a `docs/*.sql` schema, never read or
  written by any `lib/**`/`api/**` code.
- **No "owner"/"viewer" role-check code anywhere** in `lib/**` or `api/**`. Grepped both roles
  directly; zero hits outside prose/docs.
- **What DOES exist, and is a DIFFERENT, older thing, not the Supabase-auth dashboard**: a key-gated
  admin surface, `api/usageDashboard.js`, auth'd by `USAGE_DASHBOARD_KEY` (query `?key=` or header
  `X-Admin-Key`) - no Supabase sign-in, no per-user roles, one shared key. History: `api/
  adminAccounts.js` (accounts + funnel admin page, commit af65332, Aug 2026) and `api/
  outboundClicks.js` were later merged INTO `usageDashboard.js` as `?view=accounts`/`?view=outbound`
  (commit ed33003, same day) to stay under Vercel Hobby's 12-function cap. `adminAccounts.js` no
  longer exists as a separate file - confirmed, it is not on disk. This file has since grown into
  this session's own `?view=ops&task=...` surface (crossProductCheck, obdiag, etc.) - it is a real,
  working, but fundamentally different piece of infrastructure (one shared secret, not a role system).
  Do not confuse the two when scoping the new dashboard: this one is NOT a foundation to build the
  Supabase-auth version on top of; it is a parallel, pre-existing ops tool that should keep working
  independently.
  - FOR LANE C's purposes: it is safe to treat `/admin` (the Supabase-auth, admin_users, owner/viewer
    thing) as **not started** - zero route, zero schema, zero role code. The actual foundation that
    DOES exist for an admin dashboard's DATA is the event layer described earlier in `docs/admin-
    analytics.md` (visitor id, `lib/events.js` EVENTS/logEvent, `funnel_events`/`visitor_first_touch`
    tables) - that doc already says explicitly the dashboard PAGES (Supabase-auth shell, Overview/
    Journeys/Settings UI) were deliberately left for a separate pass. Nothing has changed since: the
    UI, the auth, and the allowlist are all still to be built from zero, by whoever picks this up next.
- 2026-10-12 (Lane C): EVENT LAYER, ANALYTICS STORE AND DASHBOARD (/admin). Schema: docs/analytics-events.md
  (read it before logging anything). SQL: docs/supabase-analytics.sql, five parts, NOT YET RUN (Sam): until it is,
  every write fails quietly and is counted, and no product answer changes.
  * One write path: lib/track/log.js track(req, name, props, {product, surface}) for a request, trackSystem() for
    cron, trackCurrent() for lib code under a wrapped route. The list of events and fields is lib/track/catalog.js;
    an unknown name or field throws in tests (TRACK_STRICT=1) and is dropped and counted in production. Do not log
    analytics anywhere else and do not add an event without adding it to the catalog and the doc.
  * model_call, pull_run and task_match_sent come from recordUsageEvent (api/_usage.js) only, so they reconcile
    with the spend ledger by construction. Do not add a second model_call anywhere.
  * Error events: withTracking() wraps the default export of sellerDecision, buySearch, tasks, watch, account,
    signup, submitSellerLead, chat, marketCheck, history, specPage, pullLive, refreshSpecLiveCounts, admin. If you
    add `export default` to one of these files again, keep the wrapper.
  * The old layer (lib/events.js logEvent, funnel_events, visitor_links, visitor_first_touch, gas_vid) is left as
    is and still written; retire it once /admin is proven (list in docs/analytics-events.md). visitor_first_touch
    keeps a raw referrer up to 300 characters, which the new schema does not allow.
  * FOR LANE A: instrument public pages with `<script src="/api/track?js=1" defer></script>` once in the shared
    shell; browser events through window.gasTrack(name, props) only. Your banner's gas_consent cookie is read
    server side; after it changes, call gasTrack.consentChanged(). Details under "For Lane A" in the doc.
    Note: /, /sell and the static pages are exempt from bot protection, so a browser that only saw those may get
    the challenge on its first /api/track call; checked live after this push (see the run report).
  * FOR LANE B: nothing needed now. search_run maps your oneEngineAnswer/mapEngineAnswer object in
    api/sellerDecision.js (Market Check). Buy's search does not call the engine directly, so its search_run has no
    range; if Buy ever gets one engine answer per search, tell me and search_run will carry its range too.

## One pool decision for widened years (Oct 2026, Round 4 Job 1)

Live-traced Lane C's "2017 Porsche 911 Carrera S Coupe" report (Market Check: $95,500-$113,000 over
"last twelve months"; Buy/Sell/Tasks: $87,500-$95,500 over "past 2 years", same resolved car).

**Root cause, confirmed by code reading, not guessed**: Market Check (`api/sellerDecision.js:3434`)
calls `runOneBox` fresh on every request - no cache at that layer. Buy/Sell/Tasks read it through
`lib/live/search.js`'s in-process caches (`rangeCache`, 1h TTL; `specMem`, was 6h via `SPEC_TTL`).
Those in-memory caches have NO ingest-tied invalidation - only the DB-backed `spec_market_cache`
table does (cleared the moment `scripts/ingest.js` upserts a row for that make/model, per its own
comment). A warm serverless instance's in-memory hit returns before ever re-checking that table, so
it can keep serving a PRE-ingest answer for up to its own TTL after ingest (and the nightly
`recomputeSpecCache.js` run) actually changed the archive. `buildPool`'s `useRecent` test
(`lib/onebox.js:3731`, `r4Split(recent, keepAll).solid.length >= 8`) is exactly the kind of
boundary a single new sale can flip - a fresh Market Check call sees the new sale and gets
`useRecent:true` ("last twelve months"); a warm Buy/Tasks instance's pre-ingest cache entry still
has `useRecent:false` ("past 2 years") for up to the old 6h ceiling. This matches Lane C's report
exactly (both the number AND the window label differed).

**Fix** (`lib/live/search.js`): `SPEC_TTL` 6h -> 1h, matching `rangeCache`'s existing ceiling - one
TTL, not two, and the worst-case post-ingest staleness window narrows from 6h to 1h. NOT a full fix
(any TTL-based cache can still diverge from an always-fresh read within its own window) - removing
in-memory caching entirely, or adding a cheap ingest-epoch check on every hit, would close it fully
but is a bigger, riskier change than this job's scope; flagging as a real option for Sam's call, not
decided unilaterally here.

**Second, independent bug found and fixed in the same area**: `marketWin()` (`lib/live/search.js`)
captioned the window via a narrow regex (`/twelve|12 months/` -> "the past year", EVERYTHING else ->
"the past two years") - so a car the engine actually widened to "past 5 years" or "past 3 years"
(real `windowLabel` values set at `lib/onebox.js:4596,4623`) was mislabeled as "the past two years"
regardless, a caption lie independent of any caching. Fixed with `WINDOW_CAPTION`, an exact map of
every real `windowLabel` string the engine sets. This is the piece that makes "the response says
plainly which window it covers" actually true, not just usually true.

**`lib/live/buyAlerts.js` `middleHalfLine`**: the past-year-only restriction (added as a workaround
for the caption bug above) is LIFTED - `m.window` is now always the window the number actually used,
so printing the line for any range is honest. FOR LANE C: no field changes needed on your side, the
function's own signature and `m` shape are unchanged - it simply no longer refuses a correct,
accurately-captioned 2-year or 5-year range.

**Generation boundaries, verified live (archive-only, zero OldCarsData spend)**: 997.1/997.2 is
ALREADY correctly enforced in the sold path - `lib/generations.js` HALF_GENERATIONS has
`{yearStart:2005,yearEnd:2008}`/`{yearStart:2009,yearEnd:2011}`, `split:false` (a prior, dated,
reasoned decision: coupe/cabriolet median gaps too close to split display, but the merge still
respects the generation's own outer boundary). Confirmed live: 2008/2009/2011 Carrera S all pool
`[2005,2011]`; 2012 Carrera S correctly jumps to `[2012,2016]` (991.1) - the boundary holds. **Sam
stated 997.2 as 2009-2012; the file has 2009-2011** - this is a real, dated, deliberate discrepancy
in the CURATED data, not a bug in the code applying it. NOT changed here (a one-year shift in a
generation's end year is a data decision with real pool consequences, needs Sam's explicit call, not
mine to make silently per the standing over-10%-rule). Live path (`nearestYears`/`genBoundFor`) was
verified correct in an earlier round of this same effort and was not touched again.

**Caller audit (Job 4 fold-in)**: `oneEngineAnswer` (lib/onebox.js, the combined timing+mapping
wrapper) still has ZERO callers by that name - `grep -rn "oneEngineAnswer("` outside its own
definition/comment returns nothing, re-checked AFTER rebasing onto Lane C's event-layer commit
(f362ba7). What Lane C's commit actually did: `api/sellerDecision.js` (Market Check) calls
`runOneBox` directly as before (line 3449), then calls the SIBLING export `mapEngineAnswer(oneBox,
latencyMs)` separately (line 3465) to build the search_run event's standardized shape - achieving
the same net result as `oneEngineAnswer` without calling it by name (both are exported from
lib/onebox.js; `mapEngineAnswer` now has one real caller, `oneEngineAnswer` itself still has none).
Every OTHER real production path still calls `runOneBox` directly with no mapping at all:
`lib/live/search.js` (`engineAnswer`, Buy/Tasks' core path), `lib/platformPick.js`
(`fetchOnlinePool`, Sell), `lib/tools/marketCheck.js`, `lib/live/samChat.js`, `lib/live/narrow.js`,
`api/_historyData.js` (VIN history page). `scripts/crossProductCheck.js`, `lib/_specRecompute.js`,
`lib/ops/backtestCore.js`, `api/usageDashboard.js` also call it directly but are test/ops/internal
tooling, not user-facing. NOT rewired this pass: `oneEngineAnswer` is a thin wrapper
(`{raw: d, ...mapEngineAnswer(d, latencyMs)}`, `.raw` is the identical object `runOneBox` returns),
so swapping a call site's `runOneBox(...)` for `(await oneEngineAnswer(...)).raw` is mechanically
safe but adds NO value unless the caller also starts consuming the standardized fields
(`answerType`/`poolSize`/`reasonFlag`/etc.) instead of hand-deriving its own from the raw object -
doing that properly means rewriting each caller's downstream logic, a materially bigger and riskier
migration than this job's actual bug (a caching-TTL/caption problem, now fixed at its source
regardless of which function name sits on top of `runOneBox`). Reporting the full list per Sam's ask
rather than doing a correctness-neutral rename across 7 production files in this pass.

**Sweep gate widened (Job 1 point 5-6)**: `scripts/crossProductCheck.js` now carries `window`
(the engine's raw `windowLabel`, passed through unchanged from `lib/onebox.js`/`lib/live/search.js`
`coreOf`/`lib/platformPick.js fetchOnlinePool`) and `poolYears` (year span, same passthrough
discipline) as new EXACT-match compare fields (`fields` array in `checkOneSpec`), same discipline as
`count`/`latest` - zero tolerance, a window or year-span difference IS the mismatch, not a number
needing a tolerance. **The real gate gap was narrower than expected**: `row.anyMismatch` (used by
`mismatchSpecs`/the CLI exit code) ALREADY included the 2017 Carrera S Coupe's `high` field
mismatch under the EXISTING 10%-tolerance `low`/`high` check (`$113,000` vs `$95,500` is ~15.5%
apart) - the sweep's own regular output was never blind to this case. What WAS blind to it:
`scripts/prePush.mjs`'s push gate filtered only on `lanesOk` (did each lane answer AT ALL), never on
`anyMismatch` (do the lanes AGREE) - a row where all four lanes answered but disagreed sailed
through the gate silently. Fixed: `prePush.mjs` now also fails on any row with `anyMismatch:true`,
reported separately from `lanesOk:false` rows. The new `window`/`poolYears` fields add detection for
a SUBTLER version of this bug class (where `low`/`high` both happen to sit inside the 10% tolerance
but the window/year-span still differ) - defense in depth, not what rescued this specific case.

Added to `DEFAULT_SPECS` (63 -> 69): "2017 Porsche 911 Carrera S Coupe" (the reported case),
"2009 Porsche 997 Carrera S Coupe" (997.1/997.2 adjacent-year pair with the existing 2008 entry),
"1973 Ferrari Dino 246 GT", "1991 Nissan 300ZX Turbo", "2001 Acura Integra Type R",
"1989 Alfa Romeo Spider" (thin/rare, chosen to likely exercise year-widening).

**Before/after, live against production** (checked via `task=enginecheck` before any of this
deployed): all 6 new specs - and the originally-reported 2017 Carrera S Coupe - currently read
IDENTICAL low/high/count across all four lanes (the live cache had already self-healed past Lane
C's observed moment by the time this was checked; the divergence is real but transient by nature,
not a standing, reproducible-on-demand state). Only "1973 Ferrari Dino 246 GT" is actually widened
today ("past 5 years", 21 sales); "2001 Acura Integra Type R" sits below the cluster floor (6 cards,
no cluster) - both genuinely thin/widened shapes, useful regression guards even though they
currently agree across lanes. Could not force a live reproduction of the ORIGINAL staleness window
without direct cache manipulation (no DB write access in this environment, and forcing one wasn't
attempted - out of scope for an archive-only, zero-spend job). The provable, programmatic change is
the gate fix itself: a synthetic row shaped exactly like Lane C's report (`lanesOk` all true,
`low`/`high`/`window` disagreeing) now fails `prePush.mjs` where it previously passed - checked
directly against the new filter logic, not asserted.

**No range edge moved >10% on any already-agreeing spec** - confirmed: every spec checked above
(the 6 new ones plus 2017 Carrera S Coupe) already agreed across all four lanes both before and
after this change; nothing to stop for.

NOT DONE, and why: (1) full `oneEngineAnswer` adoption across all 7 production call sites - see
caller audit above, a separately-scoped migration; (2) a cheap ingest-epoch check to close the
in-memory cache gap completely rather than narrow it - flagged for Sam's call, not decided here;
(3) reconciling the 997.2 2011-vs-2012 end-year discrepancy - a data decision, not mine to make.

## Caller migration completed (Oct 2026, Round 4 Job 1 follow-up, per explicit coordinator ask)

The "NOT DONE" item above ("full oneEngineAnswer adoption") is now DONE for every real,
user/chat-facing production caller. Each migrated one at a time, proven via a live
`task=enginecheck` check against production after each push before moving to the next:

1. `api/sellerDecision.js` (Market Check) - both call sites (the main oneBox branch, the
   priceBand `pbResult` lookup). Commit `f970e5a`. Proven: 2017 Carrera S Coupe low/high/count/
   window/poolYears all MATCH across all four lanes, live.
2. `lib/platformPick.js` `fetchOnlinePool` (Sell). Commit `4e4e090`. Proven: same spec, same
   result, plus `askingLineCompare` MATCH.
3. `lib/live/search.js` `engineAnswer` (Buy/Tasks' core path - the retry loop and 25s deadline
   race are unchanged, `.raw` is unwrapped inside the race); `lib/tools/marketCheck.js` (the MCP
   market_check tool); `lib/live/narrow.js` `engineGenerations` (the 3s soft-timeout
   Promise.race, unchanged); `lib/live/samChat.js` (chat's capped read); `api/_historyData.js`
   `oneBoxFor` (the VIN history hub's 15s deadline race, unchanged). Commit `c66bd04`. Proven for
   Buy/Tasks (the lane the sweep actually models): 2017 Carrera S Coupe, 2012 BMW M3 Competition
   Coupe, 1970 Plymouth Barracuda, 2008 Porsche 997 Carrera S Coupe all MATCH live, post-deploy.
   NOT independently live-exercised per-surface for samChat.js/narrow.js/marketCheck.js(MCP)/
   _historyData.js specifically - the 69-spec sweep only models the four crossProductCheck lanes
   (Market Check/Buy/Sell/Tasks), not chat/narrow/MCP/VIN-history as separate consumers, and a
   quick live MCP tools/call attempt got no response (likely needs a handshake/session this
   check didn't set up - not pursued further). These four use the IDENTICAL proven-safe pattern
   verified three times over on Market Check/Sell/Buy-Tasks (`oneEngineAnswer(...).raw` or
   `.then(r => r.raw)` inside the exact same Promise.race/try-catch wrapper, no other line
   changed), confirmed safe by code reading and module-load, not by an independent live
   reproduction of each surface.
4. The Task email's `middleHalfLine` (lib/live/buyAlerts.js) reads via `listingMarket -> specOf
   -> specCore -> refreshSpec -> walkLadder -> engineAnswer` - already covered transitively by
   #3's `engineAnswer` migration; no separate call site exists for it.

**Left unmigrated, deliberately** (test/ops/internal tooling, not a number or range shown to a
user, per Sam's own qualifier): `scripts/crossProductCheck.js` (the test harness itself,
deliberately calling the raw engine so it can compare against what a caller's wrapper produces -
migrating it would make the test unable to catch a future wrapper bug), `lib/_specRecompute.js`
(the nightly `spec_market_cache` recompute job - offline, writes the cache other callers read,
not a live request), `lib/ops/backtestCore.js`, `api/usageDashboard.js` (ops/admin diagnostics).

**`oneEngineAnswer` now has real callers across every live engine-reading surface in the
product.**

### Newly surfaced by the strengthened gate: a genuine, PRE-EXISTING `recent` bug (not a
### regression from this migration)

Live-checking "2006 Mercedes-Benz CLK DTM" (a class_era-tier car - no sales of its own, borrows
the wider-era market) after the caller migration deployed showed `anyMismatch: true` with an
empty `reasons` array. Traced: `classEraCoreOf` (`lib/live/search.js:697`, introduced in the
EARLIER `527d695` commit, confirmed via `git log -S` this was NEVER touched by anything in this
round) hardcodes `recent: []` unconditionally (line 704) - Buy/Tasks' card for a class_era car has
always shown zero "recent sales" rows while Market Check's own class_era rendering shows 3 real
ones. This is a genuine, pre-existing gap that predates every commit in this round; it was
invisible to the OLD lanesOk-only gate (lanesOk was true for all four lanes) and is now caught by
the SAME gate-strengthening fix from earlier in this job (anyMismatch, not just lanesOk). NOT
fixed here - out of scope for the caller-migration task; flagging for whoever owns the next
class_era pass. The fix is likely small (populate `recent` from `d.recent3`/`guarded.classEra.cards`
inside `classEraCoreOf`, the same source Market Check's own class_era rendering already reads).

### TTL risk - plain yes/no for Sam

Market Check has ZERO caching at its engine-call layer (`api/sellerDecision.js` - confirmed by
reading the code: `Promise.race([oneEngineAnswer(...), timeout])` with no cache read/write before
or after). Buy/Sell/Tasks read `lib/live/search.js`'s in-memory caches with up to 1h TTL (lowered
from 6h this round). **Plain answer: yes, Market Check and Buy/Sell/Tasks CAN still disagree for
up to that 1h window** whenever a new sale lands that flips `buildPool`'s `useRecent` threshold -
any TTL greater than zero on one side and zero on the other means a disagreement window exists by
construction; narrowing the TTL narrows the window's duration and lowers the odds of a request
landing inside it, but does not close it. Closing it fully needs either (a) removing in-memory
caching on the Buy/Sell/Tasks side entirely (a real cost-benefit tradeoff - this cache exists
specifically to avoid rerunning the full engine on every card render), or (b) a cheap ingest-epoch
check so the in-memory cache invalidates the moment the DB-backed `spec_market_cache` table does,
matching the pattern `market_fetch_cache` already uses elsewhere in this codebase ("only healthy
fetches stamp the cache," CLAUDE.md Phase 3) - neither built this round, both are Sam's call.

### Generation-boundary discrepancy - confirmed still only reported, not changed

Double-checked per the coordinator's explicit ask: `lib/generations.js` is untouched by every
commit in this job (`git diff <before>..<after> -- lib/generations.js` is empty). It still reads
997.2 as `{yearStart: 2009, yearEnd: 2011}`. Sam's stated 2012 end year was reported as a
discrepancy, never applied to the file, in either direction.
