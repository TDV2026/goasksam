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

## What exists after this round (updated through Part 1.1-1.5)

- **Visitor id**: `lib/_visitor.js`. A random, first-party `gas_vid` cookie, ~2 years,
  minted on EVERY page that includes the shared shell (lib/appShell.js's `page_view` beacon,
  Part 1.1 - not just a sign-in interaction anymore), never for crew (`gas_crew=ok`) and
  never for the EEA/UK/Switzerland for now (see Consent below). No email, no typed text, no
  personal data in it - just an opaque id. `ensureVisitorId` returns `{id, minted}` -
  `minted:true` only on the exact request that generated a brand new id, the one moment
  `visitor_first_touch` (below) may be written.
- **Canonical events**: `lib/events.js` `EVENTS` + `logEvent(env, {...})`. One place names
  every event; writes to `funnel_events`, which carries `visitor_id`, `tool`, `props`
  columns (`docs/supabase-visitor-tracking.sql`, run once by Sam).
- **First touch**: `lib/events.js` `storeFirstTouchOnce(env, visitorId, touch)`, called from
  `api/funnel.js`'s `page_view` handler only when `minted:true`. Writes ONCE (on_conflict
  ignore-duplicates) to the new `visitor_first_touch` table - raw `utm_source`/`utm_medium`/
  `utm_campaign`/`referrer`, read directly off the page by `lib/appShell.js`'s
  `gasFirstTouch()` (NOT via `js/auth.js`'s `localStorage.gas_first_touch` - that capture is
  a deferred script and can lag a visitor's genuinely first page load, exactly the moment
  that matters here). Carried to an account later by a plain join through `visitor_links` on
  `visitor_id` - never copied onto the account row.
- **Sign-in stitch**: `lib/events.js` `stitchVisitorToAccount(env, visitorId, userId)`,
  called from `api/account.js` on every `/api/account` ensure (idempotent upsert into
  `visitor_links`: many visitor ids -> one account).
- **Wired, all products** (Part 1.2): `search` fires once per completed search - Market
  Check and Sell from `api/sellerDecision.js` (skipped on a refine/transmission-rerun), Buy
  from `api/buySearch.js` - tagged by product, `props.key` = the resolved `make|model`
  only, never the typed query or a VIN.
- **Wired, click events** (Part 1.3): `lib/appShell.js`'s ONE delegated click listener
  (`data-gas-event="market_check_open"|"receipt_click"|"auction_clickout"` +
  `data-gas-source`/`data-gas-listing-id`) - the listener exists and is loaded on every
  shell page; the DATA ATTRIBUTES themselves are not yet on any card/link template (see
  docs/lane-notes.md for the exact splice points, left to Lane A/C since js/onebox.js and
  api/buy.js were both mid-edit when this was written).
- **Wired, server actions** (Part 1.3): `task_created` (`lib/tasks/tasks.js startDraft`,
  after the task row exists) and `watch_created` (`lib/live/watches.js arm`/`armVin`, after
  each successful upsert - re-arming a stopped watch also counts, a known minor
  imprecision).
- **`cross_product_move`**: NOT a dedicated event (Sam's "pick one, not both" - the
  derived-from-sequence approach was chosen). See the SQL below - two adjacent `page_view`
  rows for the same `visitor_id` with a different `tool` IS the signal.
- **`sign_in_started`/`sign_in_completed`**: wired, `js/auth.js`/`api/account.js`.
  `sign_in_completed` now carries `props.source` (Part 1.5 - `js/auth.js` sends
  `attributionSource` from `gasAttribution()` on the same fresh-sign-in call), so "best
  acquisition sources" below returns real rows for every sign-in from this point forward.

## Not done this round (proposed to the owning lane, not edited)

- **`rate_limit_hit`** at the moment any cap fires - lives in api/buySearch.js/
  api/sellerDecision.js/lib/_ceilings.js, Lane A/C's files. Call pattern:
  ```js
  import { logEvent, EVENTS } from "../lib/events.js";
  import { readVisitorId } from "../lib/_visitor.js";
  logEvent({ supabaseUrl, supabaseKey }, { event: EVENTS.RATE_LIMIT_HIT, tool: "sell", visitorId: readVisitorId(req), props: { kind: "ip_hour" } });
  ```
  Never shown to the visitor beyond the calm message already in place (unchanged).
- **`data-gas-event` attributes** on the actual card/link markup (js/onebox.js's receipt
  cards and outbound auction link, the Market Check search/go button, api/buy.js's own
  cards) - the listener is ready, the attributes are not yet added (see Part 1.3 above).
- Admin dashboard pages themselves (next step, this doc's data layer is ready for them).

## Canonical event vocabulary (`lib/events.js`)

| Event | tool | props | Fired from |
|---|---|---|---|
| `page_view` | buy/market_check/sell/tasks/null | `{path}` | **wired**, every shell page, lib/appShell.js |
| `search` | buy / market_check / sell | `{key: "make\|model"}` | **wired**, api/buySearch.js + api/sellerDecision.js |
| `market_check_open` | - | - | listener wired, attribute not yet placed |
| `receipt_click` | - | `{source}` | listener wired, attribute not yet placed |
| `auction_clickout` | - | `{source, listing_id?}` | listener wired, attribute not yet placed |
| `task_created` | tasks | - | **wired**, lib/tasks/tasks.js startDraft |
| `watch_created` | - | `{kind:"spec"\|"vin"}` | **wired**, lib/live/watches.js arm/armVin |
| `sell_followup_gated` | - | - | client-allowed in api/funnel.js; fire point is Lane C's |
| `sign_in_started` | - | `{method:"google"\|"email"}` | **wired**, js/auth.js |
| `sign_in_completed` | - | `{source}` | **wired**, api/account.js, `freshSignIn` only |
| `rate_limit_hit` | buy / market_check / sell | `{kind}` | proposed, not yet wired |

`cross_product_move` is not in this table - derived from `page_view` sequence, see above.

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

-- Cross-product MOVES (Part 1.3, the derived approach - no dedicated event): consecutive
-- page_view rows for the same visitor whose tool actually changed, pairing each with the one
-- immediately before it in time.
select prev_tool as "from", tool as "to", count(*) as moves
from (
  select visitor_id, tool, created_at,
         lag(tool) over (partition by visitor_id order by created_at) as prev_tool
  from funnel_events
  where event = 'page_view' and visitor_id is not null and created_at >= now() - interval '30 days'
) seq
where prev_tool is not null and tool is not null and tool <> prev_tool
group by 1, 2 order by 3 desc;

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

-- Best acquisition sources: FIXED Part 1.5 - js/auth.js now sends attributionSource (from
-- gasAttribution()) on the same fresh-sign-in call, api/account.js's sign_in_completed log
-- carries it as props.source. Real rows from here on; rows logged before this fix have no source.
select props->>'source' as source, count(*) from funnel_events
where event = 'sign_in_completed' and created_at >= now() - interval '30 days'
group by 1 order by 2 desc;

-- Alternative / more complete acquisition view (Part 1.4): visitor_first_touch, joined through
-- visitor_links, for every signed-in account regardless of whether they ever triggered a fresh
-- sign-in event with props attached (covers accounts created before this fix too).
select coalesce(vft.utm_source, 'none') as utm_source, count(distinct vl.user_id) as accounts
from visitor_links vl join visitor_first_touch vft on vft.visitor_id = vl.visitor_id
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
