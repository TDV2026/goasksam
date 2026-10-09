# Admin analytics (Stage 1 data layer)

Written Oct 2026, Lane B, as the data-layer half of the open-search policy round. This
document is the first real artifact of the previously-parked "admin Stage 1" plan - the
canonical event vocabulary and the SQL that answers every metric Sam named. It does NOT
yet include the admin dashboard pages themselves (Supabase-auth + `admin_users` allowlist,
dark-rail shell, Overview/Journeys/Settings UI) - that is still a separate, real frontend
build and is flagged as the next step, not done here. Scoping this round to the data layer
(visitor id + events + views) rather than attempting the full UI in the same pass was a
deliberate call so each piece could be verified on its own; say the word if the UI should
be next instead of continuing Part 1/2/3.

## What exists after this round

- **Visitor id**: `lib/_visitor.js`. A random, first-party `gas_vid` cookie, ~2 years,
  minted on a visitor's first in-house event (via `/api/funnel`, see below), never for
  crew (`gas_crew=ok`) and never for the EEA/UK/Switzerland for now (see Consent below).
  No email, no typed text, no personal data in it - just an opaque id.
- **Canonical events**: `lib/events.js` `EVENTS` + `logEvent(env, {...})`. One place names
  every event; writes to `funnel_events`, which gained `visitor_id`, `tool`, `props`
  columns additively (`docs/supabase-visitor-tracking.sql`, run once by Sam) - every
  existing caller (sellerDecision.js `logFunnel`, api/account.js `funnel()`, the old
  `/api/funnel` insert) keeps working unchanged, just leaving the new columns null on old
  rows.
- **Sign-in stitch**: `lib/events.js` `stitchVisitorToAccount(env, visitorId, userId)`,
  called from `api/account.js` on every `/api/account` ensure (idempotent upsert into the
  new `visitor_links` table: many visitor ids -> one account, so history from every device
  a person searched anonymously on before signing in stays attached once they sign in on
  any one of them).
- **Wired so far** (additive, zero behavior change to existing responses):
  - `api/funnel.js`: mints/reads the visitor id, stamps it (+ `tool`/`props` when the
    client sends them) onto every existing and new client-emittable event. Widened
    `ALLOWED` with the client-emittable canonical events: `cross_product_move`,
    `market_check_open`, `receipt_click`, `auction_clickout`, `task_created`,
    `watch_created`, `sell_followup_gated`, `sign_in_started`.
  - `api/account.js`: stitches the visitor id to the account on every ensure; logs
    `sign_in_completed` only when the client sends `freshSignIn:true` (so a routine page
    load that happens to call ensure never over-counts a sign-in).
  - `js/auth.js`: `gasFunnel(event, dedupKey, extra)` gained an optional 3rd arg for
    `tool`/`props` (backward compatible - every existing 2-arg call site is untouched).
    `authSignInGoogle`/`authSignInEmail` now fire `sign_in_started` (method google/email).
    The three `authEnsureAccount` call sites that represent an ACTUAL fresh sign-in
    (email-code verify; both OAuth/magic-link "returned" boot paths, wizard and
    topbar-only) now pass `freshSignIn:true`; the one that is a mid-wall tier *refresh*
    (`gateRefreshTier`, not a sign-in) correctly does not.
  - First-touch/last-touch attribution was NOT duplicated: `js/auth.js`
    `gasCaptureTouch()`/`gasClassifySource()` already captures UTM + referrer into
    `localStorage.gas_first_touch`/`gas_last_touch` on every page load (via the authBar
    work, now running on Market Check/Sell-landing/Tasks/homepage too) - it is reusable
    as-is for any event that wants to carry `gasAttribution()`'s `{first, last}` in its
    `props`; not forced into every event this round to keep the diff additive and small.

## Not done this round (proposed to the owning lane, not edited)

- **`search` event** at the moment each product actually runs a search (Buy/Market
  Check/Sell), and **`rate_limit_hit`** at the moment any of the caps in the Step 1 report
  fire - both live in api/buySearch.js / api/sellerDecision.js, Lane A/C's files. Exact
  call pattern for whoever wires it in:
  ```js
  import { logEvent, EVENTS } from "../lib/events.js";
  import { readVisitorId } from "../lib/_visitor.js"; // ensureVisitorId if the handler never goes through /api/funnel
  logEvent({ supabaseUrl, supabaseKey }, { event: EVENTS.SEARCH, tool: "sell", visitorId: readVisitorId(req), userId: accountId || null });
  // on any rate-limit block:
  logEvent({ supabaseUrl, supabaseKey }, { event: EVENTS.RATE_LIMIT_HIT, tool: "sell", visitorId: readVisitorId(req), props: { kind: "ip_hour" } });
  ```
  Never shown to the visitor beyond the calm message already in place (unchanged).
- **`market_check_open`** fired from the client the moment a result actually renders
  (js/onebox.js) - proposed for Lane A, same `gasFunnel("market_check_open", null, {tool:"market_check"})` pattern.
- **`cross_product_move`** fired wherever a page links to another product (e.g. Market
  Check's "sell handoff", Buy's "ask more" link) - proposed for whichever lane owns each
  link, `props:{from,to}`.
- **`receipt_click`/`auction_clickout`** on each comp-card/outbound-link click - proposed
  for Lane A/C wherever those links already render.
- **`task_created`/`watch_created`** at Tasks' creation point and `/api/watch`'s `arm` -
  proposed for Lane A/C.
- Admin dashboard pages themselves (next step, this doc's data layer is ready for them).

## Canonical event vocabulary (`lib/events.js`)

| Event | tool | props | Fired from |
|---|---|---|---|
| `search` | buy / market_check / sell | `{query_kind?}` | proposed, not yet wired (see above) |
| `cross_product_move` | - | `{from,to}` | proposed |
| `market_check_open` | - | - | proposed |
| `receipt_click` | - | `{source}` | proposed |
| `auction_clickout` | - | `{source, listing_id?}` | proposed |
| `task_created` | - | - | proposed |
| `watch_created` | - | `{kind:"spec"\|"vin"}` | proposed |
| `sell_followup_gated` | - | - | client-allowed in api/funnel.js; fire point (the Sell chat gate) is Lane C's |
| `sign_in_started` | - | `{method:"google"\|"email"}` | **wired**, js/auth.js |
| `sign_in_completed` | - | - | **wired**, api/account.js, `freshSignIn` only |
| `rate_limit_hit` | buy / market_check / sell | `{kind}` | proposed, not yet wired |

## SQL for the admin dashboard's Overview + Journeys views (Stage 1)

All of these read `funnel_events` (now carrying `visitor_id`/`tool`/`props`) joined to
`visitor_links` for the anon->account bridge. None of this is materialized yet (no
`admin_daily` table/nightly step this round - these are plain queries to verify the data
is right first; promoting the heavy ones to a nightly-summarized table is the natural next
step once real volume shows which ones are slow).

```sql
-- Unique visitors (by cookie) and returning visitors (seen on 2+ distinct days), 30d window
select
  count(distinct visitor_id) as unique_visitors,
  count(distinct visitor_id) filter (where days_active >= 2) as returning_visitors
from (
  select visitor_id, count(distinct created_at::date) as days_active
  from funnel_events
  where visitor_id is not null and created_at >= now() - interval '30 days'
  group by visitor_id
) v;

-- Searches per visitor (median + distribution), by tool
select tool, count(*) as searches, count(distinct visitor_id) as visitors,
       round(count(*)::numeric / greatest(count(distinct visitor_id), 1), 2) as searches_per_visitor
from funnel_events
where event = 'search' and created_at >= now() - interval '30 days'
group by tool;

-- Cross-product usage: visitors who used 2+ different tools in the window
select count(*) as multi_tool_visitors from (
  select visitor_id from funnel_events
  where event = 'search' and visitor_id is not null and created_at >= now() - interval '30 days'
  group by visitor_id having count(distinct tool) >= 2
) m;

-- 7-day and 30-day repeat rate: visitors whose first-ever event was >N days ago and who
-- also have an event in the trailing window
with first_seen as (
  select visitor_id, min(created_at) as first_at from funnel_events where visitor_id is not null group by visitor_id
)
select
  count(*) filter (where f.first_at <= now() - interval '7 days') as eligible_7d,
  count(*) filter (where f.first_at <= now() - interval '7 days' and exists (
    select 1 from funnel_events e2 where e2.visitor_id = f.visitor_id and e2.created_at >= now() - interval '7 days'
  )) as repeated_7d,
  count(*) filter (where f.first_at <= now() - interval '30 days') as eligible_30d,
  count(*) filter (where f.first_at <= now() - interval '30 days' and exists (
    select 1 from funnel_events e2 where e2.visitor_id = f.visitor_id and e2.created_at >= now() - interval '30 days'
  )) as repeated_30d
from first_seen f;

-- Market Check opens and receipt clicks
select
  count(*) filter (where event = 'market_check_open') as opens,
  count(*) filter (where event = 'receipt_click') as receipt_clicks
from funnel_events where created_at >= now() - interval '30 days';

-- Auction clickouts, by source
select props->>'source' as source, count(*) from funnel_events
where event = 'auction_clickout' and created_at >= now() - interval '30 days'
group by 1 order by 2 desc;

-- Tasks created
select count(*) from funnel_events where event = 'task_created' and created_at >= now() - interval '30 days';

-- Anonymous -> registered conversion: visitors with a pre-link search history who later signed in
select count(*) from visitor_links vl
where exists (
  select 1 from funnel_events fe where fe.visitor_id = vl.visitor_id and fe.created_at < vl.linked_at
);

-- Best acquisition sources: requires a touch to be attached to events' props (not yet
-- wired server-side - js/auth.js already computes gasAttribution() client-side; once an
-- event attaches it as props.source, this is: )
select props->>'source' as source, count(*) from funnel_events
where event = 'sign_in_completed' and created_at >= now() - interval '30 days'
group by 1 order by 2 desc;

-- "Created an account after using Sam 3+ times": visitors with 3+ pre-link search events
-- whose visitor_id later appears in visitor_links
select count(*) from (
  select vl.user_id, vl.visitor_id, count(fe.*) as pre_link_searches
  from visitor_links vl
  join funnel_events fe on fe.visitor_id = vl.visitor_id and fe.event = 'search' and fe.created_at < vl.linked_at
  group by vl.user_id, vl.visitor_id
  having count(fe.*) >= 3
) q;
```

These all depend on the `search` event actually being fired (currently proposed, not
wired - see "Not done this round" above); until Lane A/C wire it in, every query above
runs against zero `search` rows and returns 0/empty honestly, not wrong numbers.

## Consent banner flag (Sam's decision needed)

A persistent, cross-session, first-party id used purely for in-house product analytics
(no ad targeting, no third-party sharing) is a real EU ePrivacy / UK PECR gray area: some
readings treat it as "strictly necessary" (if used only for security/abuse prevention) and
some treat ANY non-essential persistent identifier as requiring consent regardless of
whether the data itself is personal. GoAskSam's existing GA4 integration already resolved
the analogous question for Google's own id by simply not loading GA at all in the
EEA/UK/Switzerland (`lib/analytics.js` `GA_BLOCKED_COUNTRIES`, `api/gaConsent.js`) rather
than building a banner. **This round applies the same default to the new visitor id**:
`lib/_visitor.js` `ensureVisitorId` returns `null` (mints nothing, sets no cookie) for
those same jurisdictions, using the same free `x-vercel-ip-country` header GA's consent
check already reads. This is a technical default, not a policy decision - it means the
admin numbers above simply have no EEA/UK/CH visitors in them for now, which is honest
(matches what the GA numbers already do) rather than a banner being needed to light that
traffic up. If Sam wants EEA/UK/CH visitors counted too, a consent banner (or a legitimate-
interest assessment that a pseudonymous id is plausibly a "strictly necessary" case for
basic analytics) would need to happen first - flagging, not deciding, per the brief.

### Draft Privacy page paragraph (for Sam's approval, not shipped to the live page)

> **How we measure usage.** GoAskSam sets a random, anonymous identifier in your browser
> (not tied to your name or email) so we can tell how many people use the site and which
> features are useful, and to keep search fair for everyone. It never leaves our systems,
> is never sold or shared, and never follows you to other websites. If you create an
> account, this identifier is linked to it so your search history carries over between
> devices; you can ask us to delete it at any time by contacting [support email]. We do
> not set this identifier for visitors in the EU, UK, or Switzerland at this time.

Not added to any live page this round - handing to Sam to approve or edit before it goes
anywhere public.

## Open question for Sam, not resolved here

The pre-launch cohorts (`gas_tester`/`gas_once`/`guest30`, lib/_tester.js + api/crew.js,
10/day and 3-total and 30-lifetime respectively) sit entirely outside the account wall
that's being removed - once search is unconditionally open to everyone, it's worth a call
on whether these pre-launch invite tiers still serve a purpose or should be retired. Not
touched this round either way (Lane C's file, sellerDecision.js, and not explicitly asked
for).
