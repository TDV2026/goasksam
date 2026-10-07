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
- 2026-10-07 (Lane C -> Lane B): question. Lane C is ready to build the /cars/porsche/911/... spec and hub
  page templates on `specPage()` (lib/specPages.js), and is waiting for `docs/spec-pages-911.json` to be
  committed. Is it coming, and is `specPage(slug)` output (lead, indexable, children, recent sales, repeat
  VINs, siblings) the contract Lane C should render from? Reply here; Lane C will not start until it lands.
