# Analytics events (schema version 1)

Lane C, Oct 2026. This is the one list of product events. An event means the same thing on every
product. The code that enforces it is `lib/track/catalog.js` (the list and the field rules) and
`lib/track/log.js` (the one server write path). The browser helper is built from the same catalog
by `GET /api/track?js=1`, so the two can never drift. If an event or field is not in the catalog,
the helper rejects it in tests and drops it in production, without failing the request.

Store: `analytics_events` (SQL in `docs/supabase-analytics.sql`). Dashboard: `/admin`.

## Rules every event follows

- Server events are logged in one place per fact (the handler that knows the fact), through
  `track()` in `lib/track/log.js`. Never from a template or a page's markup.
- Browser events use the same names and fields, through the one helper (`window.gasTrack`).
- The write never slows or breaks a request: fire and forget, at most 1.5 seconds, a bounded
  queue (200 events per instance, at most three batches in flight), and a failure counter readable on the
  dashboard: each instance adds its lost-event count to `app_usage_events` (`analytics_write_failed`) at most once a
  minute. If the store
  is down, every product answers exactly as before.
- Never stored anywhere in an event: an IP address, an email address, a phone number, a sign-in
  code or token, a key, the full user agent, the full referrer, the quota device id (`gas_vid`),
  unscrubbed free text. A VIN only in the admin-only `vin` column, never in props, a log line or an
  address.
- No event carries a valuation or a computed price for a person's car. Ranges logged are the
  engine's own range for the pool, exactly as shown.

## The envelope (every event)

| Field | Type | Notes |
|---|---|---|
| `event_id` | uuid | Made by the caller (server or browser). Writes are idempotent on it: a retry never double counts. |
| `ts` | timestamptz, UTC | When it happened. Browser times older than 24 hours or in the future are replaced by the server's time. |
| `name` | text | From the catalog below. |
| `schema_version` | int | 1. |
| `product` | text | `buy`, `market_check`, `sell`, `tasks`, `site`, `email`. |
| `surface` | text | Where: `home`, `buy_page`, `market_check_page`, `spec_page`, `sell_page`, `tasks_page`, `history_page`, `static_page`, `email`, `api`, `mcp`, `cron`. |
| `anon_id` | text, nullable | First-party random id, cookie `gas_aid`. Null when consent is declined, for crew-free system events, and before the first page view. |
| `user_id` | uuid, nullable | The signed-in account. Null when consent is declined. |
| `session_id` | text, nullable | Cookie `gas_sid`, 30 minutes idle. Null when declined. |
| `region_class` | text, nullable | `restricted` (EEA, UK, Switzerland) or `open`. Null only for system events with no visitor (cron, ledger). Never the raw country. |
| `consent` | text | `granted`, `declined` or `not_required`. |
| `received_at` | timestamptz | When the store got it (set by the database). |
| `ref_domain` | text, nullable | Referring domain only (`google.com`), never the path or query. Own domain is dropped. |
| `utm_source`, `utm_medium`, `utm_campaign`, `launch_wave` | text, nullable | The whitelist. Each at most 60 characters, letters, digits, `_ - .` only. Nothing else from the address is kept. |
| `browser_family` | text, nullable | `chrome`, `safari`, `firefox`, `edge`, `samsung`, `other`, `bot`. |
| `device_class` | text, nullable | `desktop`, `mobile`, `tablet`, `bot`. |
| `is_bot` | boolean | Known crawler or headless browser. Stored, excluded from summaries. |
| `internal` | boolean | Crew cookie, probe or test credential, the launch-stage test header, or the test sink. Stored, excluded from summaries by default. |
| `engine_version` | text, nullable | The engine's `ENGINE_VERSION` on events that come from an engine answer (`search_run`, `sell_answer_shown`). Null elsewhere. |
| `props` | jsonb | The event's own fields, below. Validated against the catalog. |
| `vin` | text, nullable | Admin only (see Privacy). |

## Two classes of event

- **Service events** are needed to run the product and are logged for everyone, including a
  restricted-region visitor who declined. For a declined visitor they carry no `anon_id`,
  `session_id` or `user_id`, so nothing links one visit to another:
  `search_run`, `model_call`, `error`, `pull_run`, `task_match_sent`, `limit_hit`,
  `signup_completed`, `signup_refused`.
- **Journey events** are everything else. A declined visitor gets none of them: the helper drops
  them on the server before the write, and the browser helper does not send them.

## Events

"Who" is the one place the event is fired. Required fields must be present or the event is
rejected (tests) or dropped (production). "Never" is checked by the helper as well as stated here.

### Search and answers

**`search_run`** (service). One per search on Buy, Market Check and Sell, failed ones included (`answer_type`
`failed` with a `failure_state`). Not on a refinement tap of the result already shown (that is `refinement_applied`).
Market Check maps Lane B's engine object directly. Buy answers with live cars, so `range` there means live cars
were shown and `zero_result` none (or the car was not recognised, `reason_flag` `unresolved`). Sell always
answers (the evidence ladder never dead-ends): `range` when real sales back it, `not_enough_data` at the regional
policy floor. Known imprecision: Buy's live-listing drawer reuses the Market Check route and counts as Market Check.
Who: server, `api/sellerDecision.js` (Market Check, Sell), `api/buySearch.js` (Buy).
Built from Lane B's one engine result object (`oneEngineAnswer`/`mapEngineAnswer`, lib/onebox.js).
- Required: `query_text` (scrubbed, 120 max), `answer_type` (`range`, `identity_question`,
  `not_enough_data`, `zero_result`, or `failed`), `latency_ms`.
- Optional: `vehicle_key` (`make|model`, lower case), `year` (int), `result_count` (cars or sales
  shown), `live_count` (Buy: live cars), `pool_size`, `range_low`, `range_high`, `year_widened`,
  `fallback_rung`, `reason_flag`, `model_used` (bool), `cost_usd`, `failure_state`
  (`catching_breath`, `rate_limited`, `daily_limit`, null), `transmission` (`manual`, `auto`).
- Never: a VIN (goes to the `vin` column), an address, a typed email or phone.

**`identity_question_shown`** (journey). The page asked which car it is (generation, body, trim,
gearbox). Who: browser, when the question renders.
- Required: `dimension`. Optional: `option_count`, `vehicle_key`.

**`identity_question_answered`** (journey). Who: browser, on a choice or a skip.
- Required: `dimension`. Optional: `choice` (the option's label, 40 max), `skipped` (bool), `vehicle_key`.

**`refinement_applied`** (journey). A chip that reruns the pool (mileage, gearbox, body, trim).
Who: browser. Required: `field`, `value` (40 max). Optional: `vehicle_key`.

### Evidence and clicks (all journey, all browser)

- **`receipt_opened`**: a sale receipt opened. Required `sale_id`. Optional `platform`.
- **`auction_clickout`**: a click to an auction site. Required `platform`, `state` (`live` or `sold`). Optional `listing_id`.
- **`show_more_opened`**: the "show more" list opened. Optional `list` (which list).
- **`how_sam_decides_opened`**: the methodology explainer opened.
- **`over_time_row_opened`**: a row of the over-time view opened. Optional `period`.
- **`live_car_clicked`**: a live car on Buy opened. Required `listing_id`. Optional `platform`.
- **`sell_cta_clicked`**: a "sell" offer clicked from another product. Optional `from_product`.
- **`keep_looking_clicked`** (Lane A addition, Oct 2026): the "Keep looking" / "Have Sam keep
  looking" button tapped - the tap itself, not the Task it may lead to (`task_created` is separate
  and server-side). Optional `from_product`. Who: browser, `lib/appShell.js`'s shared
  `[data-kl-btn]` handler and Buy's own matching `[data-keep]` control (`api/buy.js`).

### Sell

- **`sell_started`** (journey, browser): the Sell flow's first answer given. Who: browser,
  `startSellFlow` (js/wizard.js).
- **`sell_step_shown`** (journey, browser, Lane A addition, Oct 2026): a step's question renders.
  Required `step` (the step's name, not its number - the field name from `STEP_SPECS`, or a short
  name for a step outside it: `vehicle_detail`, `confirm`). Not fired on a re-ask of the SAME step
  (`escalateStep`) - only a genuinely new step. Who: browser, `askNextSellQuestion`,
  `askPowerSellerStep`, `askSellPreferenceStep`, `askMissingVehicleDetail`, `showConfirmation`
  (js/wizard.js, js/steps.js), and the two inline re-asks on return from an edit.
- **`sell_step_completed`** (journey, browser): Required `step` (the step's name, not its number).
  Who: browser, the STEP_SPECS pipeline block, the region/state steps, step 8's preference, step
  16's confirm (js/steps.js).
  No separate "abandoned" event: `page_hidden` (every page, automatic) already carries seconds on
  page; a session with a `sell_step_shown` and no later `sell_answer_shown` is an abandon, read from
  the existing events rather than a new one.
- **`sell_answer_shown`** (journey, server, `api/sellerDecision.js`): Required `recommended_platform`. Optional `evidence_basis`, `confidence`.
- **`powerseller_suggested`** (journey, server): a PowerSeller card rendered. Optional `placement` (`lead`, `secondary`).
- **`introduction_requested`** (journey, server, `api/submitSellerLead.js`): Optional `destination_type`. Never the partner's or person's contact details.

### Tasks and email

- **`task_created`** (journey, server, `lib/tasks/tasks.js` for search and research Tasks, `lib/live/watches.js` for exact-car and sold-car Tasks): Optional `vehicle_key`, `year`, `kind` (`hunt`, `research`, `exact_car`, `sold_car`). Every kind carries the car: search Tasks from their filters, sold-car Tasks from the engine's spec, exact-car Tasks from the live listing or the VIN's auction history. An exact-car Task's VIN goes to the admin-only `vin` column, never `props`. Optional `fallback_rung` (`sibling`, `not_enough_data`; Lane C, Oct 2026): set only when the Task's car read landed on one of those two rungs of Lane B's model-first ladder (`lib/live/rung.js`). Sold-car Tasks read it from the same engine read that names the Task; search (`hunt`) Tasks from the Buy card's stored read for the Task's car, never waiting on the engine (a read not already held records nothing). Absent on every other rung, and on every Task until Lane B ships the field. Not a new event.
- **`task_paused`**, **`task_cancelled`** (journey, server): Optional `via` (`page`, `email_link`).
- **`task_frequency_changed`** (journey, browser, Lane A addition, Oct 2026): the "How often"
  select changed. Required `frequency` (`daily`, `twice`, `thrice`, `instant`). Who: browser,
  `api/tasksPage.js` APP_JS, `data-notify-every`. Account-wide (not per-task); the control itself is
  hidden until `accounts.task_email_every` exists (see "known accepted limitations" / Sam's pending
  SQL step), so this cannot fire before then.
- **`task_match_sent`** (service, server, from the Task email run's ledger row): Required `emails_sent`. Optional `matches`, `ended_before_send`, `failed`.
- **`task_email_opened`**, **`task_email_clicked`**: in the catalog but **not fired**. Resend reports
  opens and clicks only with domain-level open and click tracking switched on and a webhook
  endpoint; neither exists, and click tracking would rewrite every link in the email. Say so on the
  dashboard rather than show zero.

### Accounts

- **`signup_completed`** (service, server, `api/account.js` on a new account): Optional `method` (`email`, `google`). Never the address.
- **`signup_refused`** (service, server, `api/signup.js` page check and hook): Required `reason` (`throwaway`, `ticket`, `cap`, `turnstile`, `invalid`, `other`). Never the address, not even hashed.
- **`signin`** (journey, server, `api/account.js` on a fresh sign-in): Optional `method`, `new_account` (bool).

### Pages

**`page_view`** (journey). Public pages are cached at the edge, so the page's own handler does not
run for most views. The browser helper sends one hit per page load and the server records it,
adding the envelope (region class, consent, browser family, referrer domain). Minimal.
- Required: `path` (template form: `/cars/:make/:model`, VIN-shaped and id-shaped segments become `:id`). Never a query string.

**`page_hidden`** (journey, browser). Once per page view, sent by the helper itself when the page is first hidden
(tab switch, phone locked, app switched) or unloaded, whichever comes first. Time after the person comes back to
the tab is not counted; a page that is never hidden before the browser dies sends nothing.
- Required: `path` (template form, as `page_view`), `seconds` (whole seconds since the page loaded, capped at 21600).

**`signin_started`** (journey, browser). The sign-in card opened. Fired by `openSignInCard` in `public/js/auth.js`.
- No fields. Never the address, not even typed.

**`code_requested`** (journey, browser). A sign-in code was requested and the request went through. Fired by
`authSignInEmail` in `public/js/auth.js`. A refused new account is `signup_refused` (server) instead.
- Optional: `resend` (true when sent from the code screen). Never the address.

### Service and cost

- **`model_call`** (service, server). Fired in exactly one place: `recordUsageEvent` in
  `api/_usage.js`, after a spend-ledger row (`app_usage_events`) with model tokens above zero is written. So the event count
  and cost equal the ledger by construction. Required `ledger_type`, `tokens_in`, `tokens_out`,
  `cost_usd`. Optional `model`, `cache_read`, `cache_write`, `cache_hit` (bool), `status`.
  `product` comes from the ledger row's type (`buy_chat_*` buy, `tasks_*` tasks, `sell_*` and the
  wording layer `chat` sell).
- **`limit_hit`** (service, server, `lib/_ceilings.js`): Required `limit` (which one). Optional `scope`. Never an address or a device key.
- **`error`** (service, server): a 5xx answered (or a throw) by a wrapped API route: `withTracking` in
  `lib/track/log.js` around sellerDecision, buySearch, tasks, watch, account, signup, submitSellerLead, chat,
  marketCheck, history, specPage, pullLive, refreshSpecLiveCounts and admin. Cron routes' errors are the
  dashboard's cron failures. Required `route`, `status`. Optional `code` (short machine reason). Never a message
  that could hold user text.
- **`pull_run`** (service, server). Fired from the same ledger write as `model_call`, for the pull
  report's summary row (`pull_live_summary`). Optional `platforms`, `added`, `ended`, `updated`,
  `failures`, `requests`, `mode`.

## Consent and identity

`lib/track/consent.js`, `GET /api/track?consent=1` (uncached, `private, no-store`).

- Region class from the edge country header (`x-vercel-ip-country`), stored only as `restricted`
  (EEA, UK, Switzerland, the same 32-country set as `lib/analytics.js`) or `open`.
- Cookie `gas_consent` (set by Lane A's banner) is `granted` or `declined`. In a restricted region a
  missing cookie counts as declined. An explicit `declined` is honoured in an open region too.
- `consent`: open region with no decline is `not_required`; restricted plus granted is `granted`;
  anything declined is `declined`.
- `anon_id`: cookie `gas_aid`, 16 random bytes (base64url), lifetime 13 months (395 days) from the
  day it was made, never extended. Made only when consent is not declined. Never derived from the
  device, the address, the browser string or the quota device id.
- `session_id`: cookie `gas_sid`, random, 30 minutes idle.
- Both cookies are HttpOnly (the browser helper never reads them), Secure, SameSite=Lax.
- Declined: no `gas_aid` or `gas_sid` is made, and any existing ones are deleted on the next hit,
  so there is no link between visits.
- Sign-in link: `api/account.js` on sign-in calls `analytics_link_anon(anon_id, user_id)`, which
  fills `user_id` on earlier events from that anon_id. Never when consent is declined (there is no
  anon_id then, and the function refuses rows marked declined).

### The two identifiers

| | Quota device id | anon_id |
|---|---|---|
| Cookie | `gas_vid` (lib/_visitor.js, Lane B's) | `gas_aid` (lib/track/consent.js) |
| Purpose | Limits only (how many searches a device made today) | Analytics only |
| Stored | `ip_rate_hits` keys `dev:<id>` (lib/_ceilings.js), deleted after 24 hours; the old layer's `funnel_events.visitor_id`, `visitor_links`, `visitor_first_touch` | `analytics_events.anon_id`, deleted after 13 months |
| In events | Never. The tracker never reads `gas_vid`. | Yes, unless declined |

## Privacy in the data

- Free text (`query_text`, `choice`, `value`, any string prop): cut to 120 characters, then email
  addresses become `[email]`, phone numbers `[phone]`, any run of 7 or more digits `[number]`, and a
  VIN-shaped token (11 to 17 letters and digits with at least 3 digits, no I, O or Q) is moved to the
  `vin` column and replaced by `[vin]`.
- `vin` column: returned only by the journey endpoint, only to a viewer on the `ADMIN_EMAILS`
  allowlist. Never in an address, a log line or a summary table.
- Raw events are kept 13 months, then deleted by `analytics_purge()` (nightly).
- Daily summary tables hold counts, sums and percentiles by day, product and car, never an id; a
  summary row cannot identify anyone.
- Deletion: `analytics_forget(anon_id, user_id)` deletes every raw event for either id (see the SQL
  file, part 5). Summaries already computed are aggregates and stay. To run it for a person's
  request: find their `user_id` (accounts) or the anon_id from their browser (`gas_aid`), then
  `select analytics_forget('<anon_id>', null);` or `select analytics_forget(null, '<user_id>');`
  in the SQL editor. It returns the number of rows deleted.
- Bots (`is_bot`) and internal traffic (`internal`) are stored and excluded from summaries by default.
- End-to-end tests: send `x-gas-test: 1` on every own request (internal) and a normal browser string (a headless one is a bot). `x-gas-region: restricted` makes any request restricted, so the banner and a decline can be tested from outside Europe; it can never open a restricted visitor. `/api/admin` part `test_events` (server credential only) lists internal events from the last two hours with every field, ids shown as present or absent. Internal traffic never reaches the Today tab or the Journey recent list; look it up by anon_id in Journey.

## Summaries

`docs/supabase-analytics.sql` part 3 and 4. Refreshed hourly for today by the Vercel cron
(`/api/admin?refresh=hour`) and finalized nightly for yesterday (`/api/admin?refresh=night`), which
also runs the 13-month purge. Every number comes from `analytics_events`.

- `analytics_daily_counts`: day, product, name, events, distinct visitors, distinct sessions.
  Product totals and funnel steps read from it.
- `analytics_daily_search`: day, product, searches, by answer type, failures, fallback use, year
  widening, latency p50 and p95, range width median.
- `analytics_daily_demand`: day, make, model, year band (5 years), price band, transmission,
  searches by product, answered, not enough data, zero live cars, Market Checked, Tasks created.
- `analytics_daily_cost`: day, product, model calls, tokens in and out, cache hits, cost.
- `analytics_daily_errors`: day, route, status, errors.
- `analytics_daily_cross`: day, product set, visitors (distinct anon ids that used exactly that set).
- `analytics_weekly_retention`: cohort week, weeks after, visitors (by anon_id, so a second device counts as new).
- `analytics_weekly_retention_people` (part 6): cohort week, weeks after, people, signed in. A person is their
  account when any row carries one, directly or through the sign-in link on the same anon_id, otherwise their
  anon_id, so a signed-in person on a second device is not counted as new. Declined visitors are in neither.

## Retiring the old layer

`lib/events.js` (`funnel_events`, `visitor_links`, `visitor_first_touch`) and the key-gated
`/api/usageDashboard` stay untouched until `/admin` has been proven against them. To retire later:
the `logEvent` calls listed in `docs/lane-notes.md`, `funnel_events`' new rows, and
`visitor_first_touch` (it keeps a raw referrer up to 300 characters, which this schema does not allow).

## Where each fact is logged

| Event | File |
|---|---|
| `search_run` | `api/sellerDecision.js` (Market Check `mcRun`, Sell), `api/buySearch.js` (`buyRun`, the plain search) and `lib/live/samChat.js` (the Buy box, once per new car in a conversation) |
| `sell_answer_shown`, `powerseller_suggested` | `api/sellerDecision.js` |
| `introduction_requested` | `api/submitSellerLead.js` |
| `task_created`, `task_paused`, `task_cancelled` | `lib/tasks/tasks.js`, `lib/live/watches.js` (through `trackCurrent`) |
| `signin`, `signup_completed` | `api/account.js` |
| `signup_refused` | `api/signup.js` (page check and hook) |
| `limit_hit` | `lib/_ceilings.js` (`limitEvent`) |
| `model_call`, `pull_run`, `task_match_sent` | `lib/track/ledger.js`, called once from `recordUsageEvent` in `api/_usage.js` |
| `error` | `withTracking` in `lib/track/log.js` |
| browser events, `page_view` | `window.gasTrack` from `GET /api/track?js=1`, recorded by `api/track.js` |

## For Lane A: instrumenting a page

Add `<script src="/api/track?js=1" defer></script>` once per public page (after the move, in the shared shell).
It sends `page_view` by itself (turn off with `data-gas-no-pageview` on `<html>`), works out the product and
surface from the path (or `data-gas-product` and `data-gas-surface` on `<html>`), asks `/api/track?consent=1`
before sending anything, and sends nothing for a declined visitor. Call `gasTrack(name, props)` for a browser
event; `gasTrack.events` lists the allowed names. After the banner sets `gas_consent`, call
`gasTrack.consentChanged()`. Set `window.GAS_TRACK_STRICT = true` in a test to make a wrong name or field throw.

Sent by the helper or by `public/js/auth.js` already, so a page must NOT send them again (it would count twice):
`page_view`, `page_hidden`, `signin_started`, `code_requested`.

## After (not built)

- A per-session funnel view on the dashboard (today it shows step totals per day).
- Task email opens and clicks (needs Resend's open and click tracking and a webhook; click tracking rewrites every link).
