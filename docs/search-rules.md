# Search and AI-citation rules (STANDING, locked Oct 2026)

Search and AI citation are part of the **definition of done** for every change in this repo. Any public
page a person or a crawler can reach must satisfy these 12 rules before it ships. Every lane reads this
file before touching any public page, and every lane report ends with a `Search check:` line naming the
rules the change touched and how each was met (see CLAUDE.md).

"Public page" means any URL served to an unauthenticated visitor or a crawler: the home page, `/buy`,
`/sell`, `/onebox`, VIN / history pages, spec pages, generation/make/month hub pages, and the MCP
landing page. Crew-only surfaces (`/desk`, keyed ops endpoints) are out of scope.

---

1. **Answer first, dated.** Any page reachable from search opens with ONE plain sentence stating the
   result, its numbers, and "as of [date]".
   *How:* the lead sentence is generated server-side at build/request time from the engine's own facts
   and always carries the analysis date ("as of October 2026"); it is regenerated nightly so the date
   and numbers never go stale.
   *Accepted alternative (Sam, Oct 2026):* a lead computed per request from the live tables and cached
   briefly also meets this rule, because it can never go stale. In use: `/buy` (the live count, cached
   10 minutes, api/buy.js) and `/sell` (the last 12 months' sale count, cached 1 hour, api/sellPage.js).

2. **One URL per object.** A car, a spec, a generation, a make, and a month of results each have exactly
   one canonical URL for life. No duplicate routes or query-string variants in the index.
   *How:* every page type has a single canonical path shape, emits a `<link rel="canonical">` to it, and
   query-string / alias variants 301 to the canonical or are excluded from every sitemap. VIN pages
   canonicalise on `vin_norm`; spec pages on the resolved spec key.

3. **Server rendered.** Title, H1, lead sentence, tables and links are in the HTML before any script
   runs. No "Loading", no generic titles.
   *How:* the page handler returns fully-formed HTML (SSR), never a client-only shell; `searchCheck.js`
   asserts the title, H1 and lead sentence are present in the raw response body.

4. **Thin means noindex.** A page is indexed only when the engine's thin-and-spread rules pass.
   Otherwise it says so in one line and carries `noindex`.
   *How:* the handler reuses the One Box cluster/thin test; a page that fails it renders the honest
   one-liner ("too few recorded sales to mark a typical band"), emits `<meta name="robots"
   content="noindex">`, and is left out of every sitemap.

5. **Named and unique.** A title pattern per page type, no two pages share a title, meta description from
   the lead sentence.
   *How:* each type has a documented `<title>` template that includes its unique object (year/make/model
   + VIN, or spec, or month); the meta description is the generated lead sentence; `searchCheck.js` fails
   on a missing or duplicate title.

6. **Linked three ways.** Up to parent, sideways to siblings and other appearances, down to children.
   No orphans.
   *How:* every page renders in-HTML links up (a VIN -> its model/spec), sideways (other appearances of
   the car, the live listing, sibling specs) and down (a make -> its models, a spec -> its VINs); no
   indexable page ships without an inbound and outbound internal link.

7. **In the sitemap or noindex.** Every indexable page is in its type's sitemap with a real `lastmod`;
   everything else is `noindex` and out of all sitemaps.
   *How:* the nightly build regenerates each `sitemap-*.xml` from the live tables with a true `lastmod`;
   a page is either indexable-and-listed or noindex-and-absent, never neither and never both.

8. **Crawlers allowed.** `robots.txt` allows Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot,
   Claude-User, PerplexityBot.
   *How:* `public`/`robots.txt` explicitly `Allow`s those six plus a `Sitemap:` line.
   **Training-crawler decision (Sam, Oct 2026): GPTBot, ClaudeBot and Google-Extended are ALLOWED** for
   now (training crawls permitted until Sam decides otherwise). Revisit here when that decision changes.

9. **Public copy rules.** Never "AI", "valuation", "worth", "estimate", "verdict"; never a count of
   houses or sources; never "our data"; no verdict on a live bid.
   *How:* all public copy passes the `sam()` banned-words filter (lib/tools/_shared.js) extended with
   "verdict" and the house/source-count ban; a live listing shows the record, never a verdict on the
   open bid.

10. **Measured.** Every new page type gets its own sitemap and is listed in `docs/search-panel.md` (the
    30 prompts) before it ships.
    *How:* adding a page type means adding its `sitemap-<type>.xml` to the sitemap index AND a row/prompt
    in docs/search-panel.md in the same change; a type with neither does not ship.

11. **Fast.** Under 1 second to first paint on a phone, served from cache.
    *How:* pages read from the pre-built archive/spec caches (zero live OCD on the public path), are SSR
    so first paint needs no round-trip, and are served with cache headers; the TTFP gate (see
    onebox-latency-gate) covers the hot paths.

12. **Nothing fake.** No page is built from an estimate, placeholder or guess.
    *How:* every number traces to a real record in the archive (product rule 1); a page with no real
    evidence renders the honest thin state (rule 4), never a filler figure, placeholder, or guess.

---

## Page-type registry

Each public page type, its canonical URL shape, its title template, and its sitemap. Keep this in sync as
types ship (rule 10).

| Type | Canonical URL | Title template | Sitemap |
|---|---|---|---|
| Home | `/` | `GoAskSam: where collector cars actually sell` | sitemap-pages.xml |
| Buy | `/buy` | `Collector cars for sale, by what they actually sell for` | sitemap-pages.xml |
| Sell | `/sell` | `Where to sell your collector car` | sitemap-pages.xml |
| MCP landing | `/mcp` | `GoAskSam for ChatGPT and Claude` | sitemap-pages.xml |
| VIN / history | `/history/<car-slug>/<vin>` (legacy `/vin/<vin>` -> canonical) | `[Year Make Model], VIN [vin]: auction history` | sitemap-vins.xml |
| Spec | `/onebox?q=<spec>` -> canonical spec path (pending) | `[Spec]: what they sell for` | sitemap-specs.xml (pending) |
| Make / generation / month hub | pending | pending | sitemap-hubs.xml (pending) |

## Enforcement

- `scripts/searchCheck.js` fetches the live public URLs and fails on: missing or duplicate title,
  missing H1, no lead sentence, no canonical, or a `noindex` page present in a sitemap. It runs in the
  nightly workflow after the spec-cache step and logs its result to `app_usage_events`
  (`event_type: "search_check"`).
- `docs/search-panel.md` holds the 30 citation prompts the panel is measured on (rule 10).
