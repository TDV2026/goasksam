# Lane S security review

Reviewer: Lane S (report only; no code or database was changed by this review except the approved Stage 1 documentation). Names only for secrets; no key, cookie, partner code or personal data appears here. Severity scale: critical, high, medium, low.

## STAGE 1: Supabase Security Advisor (0 errors, 20 warnings, 69 info)

### 1a. Function Search Path Mutable (approved fix, SQL written, SAM RUNS IT)

Deliverable: `docs/supabase-function-search-path.sql` (discovery queries, 10 ALTER statements, rollback, read-only before/after test). The same ALTER line is appended to the end of each owning DDL file (marked "Lane S") so a re-run of an old DDL file, which would clear the setting, ends with it restored: supabase-backfill-usd-fn.sql, supabase-desk-dictionary-queue.sql, supabase-daily-caps.sql, supabase-phase3-2c.sql, supabase-ip-rate-caps.sql, supabase-vin-index-atomic-swap.sql, supabase-journeys-schema.sql. (supabase-phase3-2c-fix.sql and the older reserve_search in phase3-2c.sql are superseded by daily-caps and were not touched.)

The 10 functions in the repo that have no fixed search_path, with the schemas their bodies use (all `public`):

| # | Function | DDL file | Type | Tables touched | Callable through RPC by the app |
|---|---|---|---|---|---|
| 1 | backfill_sales_usd_range(uuid, uuid) | supabase-backfill-usd-fn.sql | SQL, invoker | sales_archive, fx_rates | yes, scripts/backfillUsd.js, service key |
| 2 | backfill_attempts_usd_range(text, date, date) | same | SQL, invoker | auction_attempts, fx_rates | yes, same script |
| 3 | backfill_attempts_usd_nulldate(text) | same | SQL, invoker | auction_attempts | yes, same script |
| 4 | desk_queue_log(text, text, text) | supabase-desk-dictionary-queue.sql | plpgsql, invoker | desk_dictionary_queue | yes, lib/desk/queue.js |
| 5 | reserve_search(uuid, text, text, integer) | supabase-daily-caps.sql | plpgsql, SECURITY DEFINER | accounts, app_config, rate_limits, search_events | no caller found in api/ or lib/ (legacy since the open search policy) |
| 6 | release_search(bigint) | supabase-phase3-2c.sql | SQL, SECURITY DEFINER | search_events | yes, api/sellerDecision.js |
| 7 | claim_result(uuid, uuid) | supabase-phase3-2c.sql | plpgsql, SECURITY DEFINER | saved_results | yes, api/account.js |
| 8 | before_user_created_ip_cap(jsonb) | supabase-ip-rate-caps.sql | plpgsql, SECURITY DEFINER | app_config, ip_rate_hits | no: a Supabase Auth hook, run by the auth service |
| 9 | swap_vin_index() | supabase-vin-index-atomic-swap.sql | plpgsql, SECURITY DEFINER | vin_index, vin_summary, 2 staging tables | yes, scripts/buildVinIndex.js |
| 10 | journey_rank(text) | supabase-journeys-schema.sql | SQL, IMMUTABLE | none | no: used inside record_journey_event |

Already fixed in their DDL (`set search_path = public`), so not flagged: analytics_refresh_day, analytics_refresh_retention, analytics_width_behavior, analytics_repeats, analytics_purge, analytics_forget, analytics_link_anon, record_journey_event, journey_manual_update.

Gap I cannot close without the dashboard: the Advisor says 20 warnings, the repo yields 10 function warnings. The other ten are dashboard-made or from another app on the same project (a trigger helper for shared_calculations is the likeliest), or are other warning classes (below). Discovery query (0) in the SQL file lists every public function with no fixed search_path so Sam can paste any extra names back.

Safety of the change: metadata only; no table is locked; no body changes; counts, ranges, lines and answers cannot change. Every body uses only public tables and pg_catalog built-ins (always searched first). Re-checked by the zero-row call test in the file. swap_vin_index must NOT be called as a test (it truncates the live VIN tables); its functional test is the next nightly VIN rollout.

SEPARATE FINDING found while doing 1a (not part of the approved fix; see F-02 in Stage 3): reserve_search, release_search, claim_result (all SECURITY DEFINER) and journey_rank have NO `revoke execute ... from public, anon, authenticated` anywhere in the repo, unlike every function created after the standing rule. If the live database matches the repo, anyone holding the public anon key can call them through /rest/v1/rpc. Second discovery query in the SQL file (has_function_privilege) shows the truth in one read.

### 1b. RLS Policy Always True on public.shared_calculations (report only)

- The table is NOT in this repo. No CREATE TABLE, policy, or reference to `shared_calculations` exists in docs/supabase-*.sql, api/, lib/, scripts/, public/ or the full git history (pickaxe search of every commit returned only this review's own note). No app code reads or writes it.
- So it came from the dashboard or an earlier/other app sharing project otkmxyrglikdoychnmvy (the name suggests a shared-link calculator template). What the warning means: a policy on it is written `using (true)` or `with check (true)` for INSERT, UPDATE or DELETE (the Advisor does not flag SELECT true). I cannot see which operations or roles from the repo. Plain-words risk if it is as the warning says: anyone with the public anon key, which ships in browser code by design, can write to the table through the REST API, and if UPDATE or DELETE is `true`, can change or delete another person's saved calculation, or fill the table with junk (storage and abuse). It holds no GoAskSam data, so the damage is bounded to that table and to the project's storage, but it is open write on a public endpoint.
- How the app reads and writes it: it does not (no route, no key). The only keys that could reach it are the public anon key (browser) and the service key (server); nothing in this repo uses either against this table.
- Severity: medium (open public write on an unused table; no leak of GoAskSam data), low if the table is empty and unused.
- Read-only checks for Sam in the SQL editor: `select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.shared_calculations'::regclass;` (polcmd r=select, a=insert, w=update, d=delete) and `select count(*), min(created_at), max(created_at) from public.shared_calculations;` if it has a created_at column (else `select count(*)`).
- Proposed fix, in order of preference: (1) if nothing uses it (the likely case), export the rows if any, then `drop table public.shared_calculations;` which removes the warning. (2) If something outside this repo uses it, replace the write policies with owner-scoped ones (`using (auth.uid() = user_id)`), keep read by share token only, and route anonymous writes through a server function. Owner: Sam (dashboard and SQL).

### 1c. Other Advisor classes derivable from the repo, and what the 69 info items likely are

Security Advisor lint classes and what the repo shows:

| Lint | Level | What the repo shows | Count likely |
|---|---|---|---|
| Function Search Path Mutable | warn | 10 functions, fixed by 1a | 10 of the 20 |
| RLS Policy Always True | warn | shared_calculations (1b); our own policies are only `for select using (true)` on taxonomy_makes, taxonomy_models, taxonomy_aliases, which the Advisor does not flag | 1 to 3 |
| Extension in Public | warn | pg_trgm created in public (docs/supabase-sales-archive-indexes.sql line 19) | 1 |
| Leaked Password Protection Disabled | warn | Auth setting, dashboard only (the app uses email codes and Google sign-in; passwords may still be enabled in the project) | 0 or 1 |
| Auth OTP Long Expiry | warn | Auth setting, dashboard only (the app sends email codes) | 0 or 1 |
| Vulnerable Postgres Version | warn | project setting, dashboard only | 0 or 1 |
| Public Bucket Allows Listing | warn | no storage bucket DDL in the repo; check Storage in the dashboard | 0 or more |
| Auth Users Exposed / Security Definer View / Materialized View in API | warn/error | no CREATE VIEW or materialized view exists in docs/supabase-*.sql, so none from our DDL (errors are reported as 0, consistent) | 0 |
| RLS Disabled in Public | error | the repo DDL lacks `enable row level security` for sales_archive, vehicle_market_records, vehicle_classifications, seller_leads, app_usage_events, canonical_sales, sale_aliases, outbound_clicks, auction_attempts (the last one has only a comment). The Advisor shows 0 errors, so the live database must have RLS on for them; the DDL files do not match the live database for these nine (standing rule: the DDL file must carry the lines) | 0 live |
| RLS Enabled No Policy | info | every table with RLS and no policy: by the DDL about 59 tables (list in Stage 2 section D) | the likely bulk of the 69 info |

Best reading of "69 info": almost all are "RLS Enabled No Policy", one per table with row level security on and no policy, which is the intended state for a server-only product (the service key bypasses RLS; the browser key can do nothing). It is information, not a hole. Roughly 59 from the repo DDL plus the ones the repo does not show. Not fixable and not needed; do not add policies to silence it.

What I could not see without the dashboard: the exact list of the 20 warnings and 69 info items; grants actually in force on tables and functions (use the has_function_privilege query and `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')`); Auth settings (leaked password protection, OTP expiry, hook configuration); Postgres version; Storage buckets; whether shared_calculations has rows; any function, view or table created in the dashboard rather than from these files.

### 1d. pg_trgm in public: is moving it ever worth it?

No, not now. The warning is hygiene: an extension in `public` shares a namespace with app objects. pg_trgm only supplies operators and index operator classes; it has no function that writes data or runs with elevated rights, so there is no practical attack path. Moving it means `drop extension pg_trgm cascade` (which DROPS every trigram index, including the large GIN indexes on sales_archive that One Box's ILIKE title scans depend on) then `create extension pg_trgm schema extensions` and rebuilding those indexes on sales_archive, vehicle_market_records and auction_attempts (eight trigram indexes in all: docs/supabase-sales-archive-indexes.sql and supabase-indexes-oct8.sql), with a window where the ILIKE scans fall back to sequential scans and time out, and the project is single-instance with the Supabase spend cap off. Reward: one warning cleared. Recommendation: leave it, record it as an accepted Advisor warning. Revisit only if the sales_archive trigram indexes are ever rebuilt anyway (then create them against an `extensions`-schema pg_trgm in the same maintenance window).

Search check: no public page touched.

## F-02 (HIGH, confirmed on the live database): four functions callable by anyone with the public key

What it is: claim_result, reserve_search and release_search are SECURITY DEFINER (they run with the owner's rights and skip row security) and the live database lets the anon role execute them. journey_rank is also anon-callable but it is a plain SQL function that touches no table (harmless by itself).
How it could be misused, in plain words: the anon key is public by design (it is in the browser). With it anyone can call these through the REST address /rest/v1/rpc/<name>. release_search(id) deletes a search_events row by number, so a stranger can erase other people's search records (the ids are small consecutive numbers). claim_result(result_id, user_id) attaches a saved anonymous result to any account id they choose. reserve_search(user_id, make, model, year) writes a search_events row against any user id, using up that person's allowance. None of them reads personal data back, so this is tampering and quota abuse, not a leak. Severity high because it is open write on a public endpoint to rows that belong to other people.

### 1. Every caller in the code (checked by search of api/, lib/, scripts/, public/, .github/, ops/)

| Function | Caller | Key used | Browser use |
|---|---|---|---|
| release_search | api/sellerDecision.js line 4123 and line 4591, through supabaseRpc defined at line 2695 | SUPABASE_SERVICE_ROLE_KEY (falls back to SUPABASE_ANON_KEY only if the service key is not set; line 2857) | none |
| claim_result | api/account.js line 45, through supabaseRpc defined at line 29 | env.supabaseKey from lib/_supabase.js: the service role key (same fallback to the anon key only if unset) | none. The browser (public/js/auth.js line 171) only sends claimResultId to /api/account; it never calls the database |
| reserve_search | no caller anywhere (mentions are comments only: api/sellerDecision.js lines 2781 and 3220, api/usageDashboard.js line 5407, public/js/wizard.js line 1340, public/js/result.js line 178). Since the open search policy of Oct 9 2026 nothing reserves a search | n/a | none |
| journey_rank | only inside record_journey_event (docs/supabase-journeys-schema.sql line 194). record_journey_event is SECURITY DEFINER, so it calls journey_rank with the owner's rights; the caller's grant is not used. record_journey_event is itself called only from lib/_journey.js with the service key | n/a | none |
| before_user_created_ip_cap | Supabase Auth runs it (Auth hook), not our code | the auth service role supabase_auth_admin | none |

No browser code calls any Postgres function: public/js/auth.js uses the anon key only for /auth/v1 (sign-in) addresses, and nothing under public/ or lib/ calls /rest/v1. Every RPC from our code goes out from a Vercel function with the service role key. So revoking anon and authenticated breaks nothing, PROVIDED the service role key is set in Vercel (it is: the other functions already work that way). One edge: the server code falls back to the anon key when the service key is missing; in that case these RPCs would start failing, quietly (supabaseRpc returns null on error). Production has the service key, so this is a note, not a risk today.

### 2. The SQL block (Sam runs it in the Supabase SQL editor; nothing has been run)

```sql
-- F-02: lock down the four RPC functions. Service role only.
revoke execute on function public.claim_result(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.claim_result(uuid, uuid) to service_role;

revoke execute on function public.reserve_search(uuid, text, text, integer) from public, anon, authenticated;
grant  execute on function public.reserve_search(uuid, text, text, integer) to service_role;

revoke execute on function public.release_search(bigint) from public, anon, authenticated;
grant  execute on function public.release_search(bigint) to service_role;

-- journey_rank: no browser or anon caller exists (only record_journey_event uses it, as the owner).
revoke execute on function public.journey_rank(text) from public, anon, authenticated;
grant  execute on function public.journey_rank(text) to service_role;
```

About before_user_created_ip_cap (the sign-up Auth hook): do NOT touch it in this block. The live check shows it already has anon_can_call = false. Supabase Auth runs a Postgres hook as the role supabase_auth_admin, so that role must KEEP execute on it (docs/supabase-address-privacy.sql part 1 already did: revoke from public, anon, authenticated; grant to supabase_auth_admin). The block above does not mention it, so it keeps what it has. If its grant to supabase_auth_admin were ever removed, new sign-ups would be refused by the hook. Check, read-only: `select has_function_privilege('supabase_auth_admin', 'public.before_user_created_ip_cap(jsonb)', 'execute');` must stay true.

Why journey_rank is included even though it is harmless: it removes the last anon-callable function from the standing-rule list, and nothing needs it. If Sam prefers the narrowest change, leave out the last pair of lines; nothing else depends on it.

### 3. Rollback (restores exactly the old state: anon and authenticated could call them)

```sql
grant execute on function public.claim_result(uuid, uuid) to public, anon, authenticated;
grant execute on function public.reserve_search(uuid, text, text, integer) to public, anon, authenticated;
grant execute on function public.release_search(bigint) to public, anon, authenticated;
grant execute on function public.journey_rank(text) to public, anon, authenticated;
```

### 4. Test after (read-only or provably zero-row), in the SQL editor

A. Who can call each, one query (all four must read anon false, signed-in false, service true; the hook row must show the auth role true):
```sql
select p.oid::regprocedure as function,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_call,
       has_function_privilege('service_role', p.oid, 'execute')  as service_can_call
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_result','reserve_search','release_search','journey_rank','before_user_created_ip_cap')
order by 1::text;
select has_function_privilege('supabase_auth_admin', 'public.before_user_created_ip_cap(jsonb)', 'execute') as auth_hook_still_ok;
```
B. The service role still works (zero-row calls, nothing changes). Run each line on its own:
```sql
set role service_role;
select public.release_search(-1);
select public.claim_result('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
select public.reserve_search('00000000-0000-0000-0000-000000000000', 'x', 'x', 2000);
select public.journey_rank('vehicle_identified');
reset role;
```
Expected: release_search returns empty (void), claim_result false, reserve_search {"allowed": false, "reason": "no_account"}, journey_rank 20.
C. Anon can no longer call (each must fail with "permission denied for function ..."; run each on its own, then run `reset role;`):
```sql
set role anon;
select public.release_search(-1);
reset role;
set role anon;
select public.claim_result('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
reset role;
```
(If the editor shows the role stuck after an error, run `reset role;` first.) Optional from outside, with the public anon key, from any terminal, one zero-row request that changes nothing: POST to <project url>/rest/v1/rpc/release_search with header apikey set to the anon key and body {"p_event_id": -1}. BEFORE the revoke it answers 200 (empty); AFTER it answers 401 or 403 with "permission denied for function release_search". Do not paste the key anywhere.
D. The feature to test after: claim_result is the only one in daily use. On goasksam.com, signed out, run a search to a result, then sign in with an email code (or Google) from that page; the result should appear under "Your results" for the account (api/account.js claims it). If it does not appear, run rollback line 1 and tell Lane F. release_search runs only when a search fails after reserving, and nothing reserves any more, so a normal search is unaffected; a normal /sell search completing is enough to show the engine path is intact.

### 5. The 10 search_path statements again (the approved Stage 1a fix; the whole file with the discovery and test queries is docs/supabase-function-search-path.sql)

```sql
alter function public.backfill_sales_usd_range(uuid, uuid)          set search_path = public, pg_temp;
alter function public.backfill_attempts_usd_range(text, date, date) set search_path = public, pg_temp;
alter function public.backfill_attempts_usd_nulldate(text)          set search_path = public, pg_temp;
alter function public.desk_queue_log(text, text, text)              set search_path = public, pg_temp;
alter function public.reserve_search(uuid, text, text, integer)     set search_path = public, pg_temp;
alter function public.release_search(bigint)                        set search_path = public, pg_temp;
alter function public.claim_result(uuid, uuid)                      set search_path = public, pg_temp;
alter function public.before_user_created_ip_cap(jsonb)             set search_path = public, pg_temp;
alter function public.swap_vin_index()                              set search_path = public, pg_temp;
alter function public.journey_rank(text)                            set search_path = public, pg_temp;
```
Order: run the revoke block (section 2) and the search_path block in either order; they do not interact. Rollback for the search_path block: `alter function <same signature> reset search_path;` for each.

Standing-rule note: after Sam runs the revoke block, the DDL files must match the live database (CLAUDE.md). Lane S appends the same revoke and grant lines to docs/supabase-phase3-2c.sql (claim_result, release_search), docs/supabase-daily-caps.sql (reserve_search) and docs/supabase-journeys-schema.sql (journey_rank) in the same docs-only commit.

## STAGE 2: code review (report only)

Method: read the gate code and every route's entry; searched all of api/, lib/, public/, scripts/, workflows and the full git history (5,427 commits, 253 refs). No production request was made. Not possible from here and said plainly: live response headers (needs a gap from Lane F), GitHub Dependabot / CodeQL / secret-scanning alerts (the gh tool is not installed in this environment; npm audit was run), actual database grants beyond what Lane F confirmed, Vercel and Supabase dashboard settings.

### A. Route map: every file under api/ and its gate (rewrites from vercel.json noted)

Legend: PUBLIC = no credential; LIMIT = a ceiling in lib/_ceilings.js or equivalent; CREW = signed gas_crew cookie (lib/_crew.js); OPS = x-ops-key / x-probe-key header (lib/_credential.js) or cron bearer; BEARER = signed-in Supabase session checked in-process (lib/_auth.js).

| Route (public address) | Gate as built | Is it what it claims? |
|---|---|---|
| api/sellerDecision.js (the engine) | PUBLIC + LIMIT (sell_search, market_check_search, launch stage; ops key bypasses) | yes. CORS wildcard. Takes a client-built `car.vehicle` (see F-07) |
| api/vehicleIdentity.js | PUBLIC, NO ceiling, CORS wildcard | reads archive + vPIC; unmetered cost is small, no OldCarsData spend |
| api/chat.js | PUBLIC "assist" and BEARER "followup", LIMIT (sell_model), prompts held server side | yes, good design. CORS wildcard |
| api/sellChat.js | PUBLIC + LIMIT | yes |
| api/sellNext.js, sellPage.js, marketCheck.js, buy.js, tasksPage.js, howSamDecides.js, business.js, specPage.js, history.js (pages) | PUBLIC pages, launch-stage sealed by isReleased; crew rewrite adds `_crew=1` only when the cookie shape matches, the handler re-verifies the signature | yes: the rewrite's cookie test is only a router; every handler calls isCrewRequest |
| api/buySearch.js | PUBLIC + LIMIT (buy_search, buy_chat), BEARER for saved items (user-scoped queries) | yes |
| api/mcp.js (/mcp) | PUBLIC, in-memory token bucket per instance, every call logged | weak limit (resets per cold instance, not shared) |
| api/account.js | BEARER, CORS wildcard | yes |
| api/hunts.js | BEARER, CORS wildcard, 2,000 chars, no per-user cap | low |
| api/watch.js (/api/task-link) | signed email-link tokens (HMAC) or BEARER; cron/probe for ?run | yes |
| api/tasks.js | BEARER; ?run and ?send need cron secret or probe key | yes |
| api/signup.js | PUBLIC "check" (Turnstile + address cap), hook signed with SUPABASE_AUTH_HOOK_SECRET, rawcheck/hookcheck need ops key | yes |
| api/crew.js | PUBLIC entry that checks CURTAIN_CREW_CODE, CURTAIN_TESTER_CODE, or a newsletter id (F-04, F-09, F-10) | see findings |
| api/desk.js (/desk) | CREW or signed tester cookie; else disguised 404 | yes; CORS wildcard header present but cookie required |
| api/partnerDemo.js (/preview) | CREW or partner cookie; code attempts limited (partner_code ceiling, 5 a minute) | yes; limiter fails open if the ledger is unreadable |
| api/partnerAnswer.js | CREW, partner cookie, or PARTNER_KEY header; LIMIT partner_demo and partner_photo | yes; see F-13 |
| api/usageDashboard.js | ?view=ops: ops key or cron; every other view: ops key header (key in the address refused); POST manual update also ops key | yes |
| api/admin.js (/admin) | page = disguised 404 until a signed-in session whose email is in ADMIN_EMAILS; ?refresh= needs cron secret | yes |
| api/pullLive.js, refreshSpecLiveCounts.js | ops key header or cron bearer | yes |
| api/history.js ?photocheck | ops key or cron; the rest of history.js is PUBLIC pages | yes |
| api/submitSellerLead.js | PUBLIC, NO limit, NO verification, CORS wildcard | F-03 |
| api/businessLead.js | PUBLIC, NO limit (stage-gated by LAUNCH_BUSINESS) | F-08 |
| api/out.js (/out) | PUBLIC redirect to a whitelist of platform submission URLs; writes a row per call, no limit | whitelist is sound (no open redirect); F-08 |
| api/funnel.js, pageview.js, track.js | PUBLIC beacons, no limit; funnel accepts unbounded JSON | F-08 |
| api/dailyPulse.js, publicConfig.js (/o/:id share, auth config), gaConsent.js, sitemapPages.js, gsc.js | PUBLIC read-only | fine. publicConfig returns the anon key by design; the service key never appears in any response, template or public/ file (searched) |
| api/_*.js | helpers, not routes | n/a |

Rewrites in vercel.json that are not what they appear: `/rudy` redirects to /api/crew?guest=clint (the guest path is now a no-op that just redirects; harmless but dead, remove). `/admin` and `/desk` are disguised 404s without the right session. No route is marked crew-only that is actually public; no ops route lacks a check. Cron paths in vercel.json all pass through a bearer/ops check.

### B. Gates: crew, tester, partner, ops
Good: crew, tester and partner cookies are HMAC-signed with a server secret, compared in constant time, expire, and fail closed when the secret is unset; the plain value "ok" is dead; partner cookie is HttpOnly, Secure, SameSite=Lax, scoped to two paths and ends when PARTNER_DEMO_CODE changes; ops keys are header-only and a key in an address is refused with 400; Beehiiv link, Turnstile and the sign-up hook are checked server side; the cron secret is required for every cron path.
Weak points (details in the findings table): codes travel in the address on first use (/api/crew?code=, ?tcode=, /preview?k=, and `?crew=`/`?tester=` handled by public/desk.html and onebox.html), so they land in Vercel request logs and browser history (F-09); the crew cookie is not HttpOnly, lasts a year and cannot be revoked one by one (F-09); /api/crew has no attempt limit on the crew code (the partner demo has one) (F-09); cron/ops comparisons in usageDashboard.js, tasks.js, watch.js, admin.js use `===` instead of a constant-time compare (F-20); the cookie signing key is a hash of the code itself, so a holder of any valid cookie can test guesses offline (F-09; mitigated by a long random code).

### C. Injection, scraped text, URLs
- Output escaping: every HTML-producing route uses an `esc` helper (about 20 copies, several of them `[&<>"]` only, which is safe in double-quoted attributes and text). Scraped titles, seller names and photo URLs go through `esc` in api/history.js, api/specPage.js, api/buy.js, lib/sell/*.js, public/js/onebox.js (cards, links) and the emails (lib/_email.js escapes). JSON-LD: api/history.js escapes `<`; api/specPage.js writes JSON.stringify without that escape but its content is a fixed vocabulary (slug parsed against known generations), so there is no injectable text today (info, F-22). I did not find an unescaped insertion of scraped text. I did not line-by-line audit the more than 100 innerHTML sites in public/js/desk.js (58 sites, crew-only) and _amazonDemo.js (partner-only); both render server-built answers.
- Link scheme: receipt links in public/js/onebox.js are `esc(utmUrl(c.url))` with no scheme check. The URL comes from auction-house feeds, so a `javascript:` value would need to originate upstream. Low (F-18); fix is an https-only check where the record is read.
- PostgREST filters: One Box (lib/onebox.js) encodes every user-derived value with encodeURIComponent, as do buySearch, history, vehicleIdentity, account, tasks and the share page (id checked against a hex pattern). One real gap: api/sellerDecision.js line 1274 builds `model.ilike.*${t}*` inside `or=(...)` from `vehicle.model`'s first word WITHOUT encoding, and `vehicle` can arrive from the browser (`car.vehicle`, sanitized only by sanitizeResolvedVehicle, which does not restrict characters). A caller can add filters or parameters to that read of vehicle_market_records (public auction data, a fixed table). It can narrow or change what is read, not reach another table or widen a user-scoped query; severity medium-low (F-07). Other user-scoped queries (`user_id=eq.${userId}`) take the id from the verified token. Ids typed by users in task stop/resume (`watches?id=eq.${id}`) are not encoded but extra filters are ANDed, so they cannot widen access.
- Wildcards: `*` and `%` typed by a user stay wildcards inside ilike patterns; this can make a slow scan, not a leak. Low.
- No raw SQL is built from input (only the ten fixed functions); RPC names are literals.
- SSRF: no route fetches an address supplied by a caller. Server fetches go to fixed hosts (Supabase, Resend, Anthropic, OldCarsData, vPIC with the VIN encodeURIComponent'd, Turnstile, Beehiiv). The photo proxy (api/partnerAnswer.js ?photo=, lib/_salePhoto.js) fetches image URLs read from our own archive, refuses non-https, userinfo, raw IPs and localhost-style names and follows redirects only on the same host; it is a blocklist, not an allowlist, and does not re-resolve DNS (low, F-23). api/history.js photocheck fetches archive photo URLs (cron only).
- Open redirect: /api/out is a whitelist (safe). /api/crew `to` is checked with `^/(?!/)`, which lets `/\host` through; browsers read `/\` as `//`, so a link such as /api/crew?guest=x&to=/\evil.example redirects off site (F-10, low-medium: phishing from a trusted domain).

### D. Supabase tables: RLS and the standing rule (from docs/supabase-*.sql, 59 CREATE TABLEs)
- Every table created after the standing rule carries enable RLS plus revoke from anon, authenticated. These carry RLS but NOT the revoke in the DDL (defense in depth only, RLS with no policy already denies): auction_attempts (comment only, no ALTER), desk_orgs, desk_seats, desk_saved_views, taxonomy_generations, journeys, journey_events, journey_audit, market_fetch_cache, narration_cache, partners, search_events, rate_limits, app_config, saved_results, hunts, taxonomy_makes/models/aliases (these three have an intentional public SELECT policy, public taxonomy only).
- These have NO RLS statement in the DDL: sales_archive, vehicle_market_records, vehicle_classifications, seller_leads, app_usage_events, canonical_sales, sale_aliases, outbound_clicks (and auction_attempts as above). seller_leads holds seller email, phone, VIN and notes. The Advisor reports 0 RLS errors, so RLS is on live; the files must be updated to match (standing rule: DDL equals live). Confirm with: `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;` (expect no rows) and the grants query in Stage 1.
- Service key use: it is set only in Vercel server env, GitHub Actions secrets and local scripts; it never reaches a response or public/ file. Most routes use it because the browser has no table grants (correct under the standing rule). Where a route could use less: api/hunts.js, api/account.js and api/buySearch.js write user-owned rows with the service key after checking the bearer token; with RLS policies on `auth.uid() = user_id` they could use the user's own token, but the current pattern is consistent and safe as long as every query carries `user_id=eq.<verified id>` (checked in buySearch, account, tasks, watches, buyAlerts; the list of each `...?id=eq.${id}` without a user filter is internal only: cron/digest/getTask-with-optional-user, F-24 low).
- The anon fallback: lib/_supabase.js and several routes fall back to SUPABASE_ANON_KEY when the service key is missing; with RLS on, a missing service key makes writes fail quietly rather than open anything. Fine, but silent.

### E. Abuse and cost (Supabase spend cap OFF; OldCarsData and Anthropic metered)
Routes WITH a limit: sellerDecision (ceilings plus OCD daily/monthly budgets, the real backstop), chat/sellChat (per device and address per minute and day, signed-in allowance for follow-ups), buySearch, partnerDemo/partnerAnswer, signup, mcp (weak).
Routes with NONE, and what an unauthenticated caller could cost:
- /api/submitSellerLead (F-03): unlimited lead rows; unlimited emails to real PowerSeller partners from our sending address (Resend quota and sender reputation, partner trust); free text and a link placed into those emails.
- /api/businessLead (F-08): unlimited rows and one email to our own inbox per call (Resend quota, inbox flood).
- /api/funnel (F-08): unbounded JSON into app_usage_events (client_diag) and funnel_events; fake analytics and journeys; database growth with the cap off.
- /api/pageview, /api/out, /api/track: one insert per call.
- /api/vehicleIdentity: archive and vPIC reads, no cap; /api/hunts: signed-in only, no per-user cap.
- Ceilings are keyed by a visitor cookie (`dev:<id>`), which a script can rotate to reset the per-device window; the per-address window (hundreds an hour) still applies, so a single machine is bounded, a botnet is bounded only by the OCD budget guard. The ledger fails open when unreadable (documented choice).
- CORS: `Access-Control-Allow-Origin: *` on sellerDecision, chat, vehicleIdentity, account, hunts, funnel, pageview, dailyPulse, submitSellerLead, publicConfig, desk, usageDashboard. No cookies are sent cross-origin, so a third-party page cannot ride a visitor's login; what it CAN do is make its visitors' browsers call the engine and chat from their own addresses, spreading load past per-address limits (F-06).

### F. Personal data
Stored: accounts (email, tier, consent, task email setting), seller_leads (seller email, phone, VIN, region, notes, full decision JSON, partner chosen), business_leads (name, company, work email, message), tasks / task_updates, watches, watch_requests, buy_alerts, buy_conversations, hunts (free text), saved_results (search payloads, user id), analytics_events (visitor ids, consent flag), funnel_events, visitor_links, visitor_first_touch, ip_rate_hits (daily-salted address hashes, deleted after 24 hours), app_usage_events (address fields removed Oct 2026 per docs/supabase-address-privacy.sql), outbound_clicks, mcp_calls. All are server-only (RLS on, no browser grants per Lane F's live check of functions; table grants should be confirmed with the Stage 1 query). Readable by: the service key (Vercel, GitHub Actions, any laptop holding it) and ADMIN_EMAILS through /admin summaries (which return counts, not rows). Retention: only ip_rate_hits (24h) and the analytics purge function have a stated limit; seller_leads, business_leads, accounts and task data are kept indefinitely (no deletion path except analytics_forget). Logs: no email or phone is written to console logs or to analytics props in the code I read (console lines carry references and error text only; lib/track is event names and ids). One caution: the lead and task emails are sent with the seller's address as reply-to, and the whole lead JSON (including phone) is stored in decision_summary.

### G. Secrets in git history (all 5,427 commits, all refs; type, commit, file only; values never printed)
- JWT-shaped tokens, Anthropic / OpenAI / GitHub / Resend / Slack / AWS / Supabase-PAT keys, private key blocks, a Vercel bypass secret in an address: NONE found.
- Test fixtures with fake key values (strings beginning "local", "fixture", "unused"): 41 matches in 20 check scripts (for example scripts/trimFirstCheck.mjs, scripts/keyInAddressCheck.mjs, first commit d77bb921). Not secrets.
- A real tester invite code, hard-coded as the fallback for CURTAIN_TESTER_CODE: commit 93fab5ec, file lib/_tester.js (17 characters; its expiry default was 2026-08-27, now past; removed from the tree by d77bb921 but still in history). Type: shared invite code. Action: confirm the live CURTAIN_TESTER_CODE is a different value (and 16+ characters); if it is the same, rotate. Rewriting history is not needed once rotated.
- Hard-coded fallbacks in history for removed features: DAYPASS_CODE (commit 0943ce8c, api/crew.js, 13 characters) and ONCE_SECRET (c88a9734, lib/_onepass.js, 26 characters; an HMAC key for one-time links, feature removed). If either env var was ever set to that same literal, rotate; otherwise dead.
- CURRENT TREE: scripts/beehiivSigninVerify.mjs (introduced 87c62c6f) holds a literal Beehiiv subscription id (type: bearer id). /api/crew?bhs=<that id> mints a real session for the subscriber's email without an email (api/crew.js lines 54 to 76). If it is a real subscriber (the founder's), anyone with repo access can sign in as that email, and if that email is in ADMIN_EMAILS, open /admin (F-04). Action: remove the literal from the script (read it from the environment) and, if it is real, unsubscribe and re-add that address so the id changes.
- The crew code and partner code were never committed (env only). The Supabase project ref is public in the docs (not a secret).

Planned rotations, every place each must be updated (names only):
1. Vercel protection-bypass secret. Vercel: project Settings, Deployment Protection, Protection Bypass for Automation (generate new, the old one stops). GitHub Actions secret VERCEL_AUTOMATION_BYPASS_SECRET (read by .github/workflows/nightly.yml, smoke-prod.yml, vin-rollout.yml; and the copies docs/nightly-workflow.yml, docs/vin-rollout-workflow.yml). Every lane's local Keychain item goasksam-bypass. Scripts that read env VERCEL_AUTOMATION_BYPASS_SECRET: scripts/buyMicCheck.mjs, oneboxGolden.mjs, searchCheck.js, pushCheck.mjs, smokeWizard.js, amazonTypedLive.mjs, engineCheck.js, amazonDemoCheck.mjs, prePush.mjs, smokeProd.js, searchCheckBrowser.mjs, warm.js. Docs that mention it: docs/launch-checklist.md, docs/lane-notes.md (no value is stored in either; confirmed by the history scan). Test after: scripts/pushCheck.mjs on a preview and the nightly smoke.
2. CURTAIN_CREW_CODE. Vercel env (Production and Preview) then a redeploy (the env is read per request but the Vercel value is applied on the next deployment). Effect: every gas_crew cookie ends at once because the signing key derives from the code. Update after: every crew link handed out (/api/crew?code=...), the founder's and each lane's cookie (scripts read GAS_CREW_COOKIE or use scripts/_crewCookie.mjs; about 50 scripts reference CURTAIN_CREW_CODE or GAS_CREW_COOKIE, listed by search), the Keychain / local env copies, any saved bookmark, Lane notes that quote the link shape, and GitHub Actions only if a workflow sets a crew cookie (none do today). The partner demo is unaffected (its own PARTNER_DEMO_CODE).
3. Also recommend (not yet planned): CURTAIN_TESTER_CODE (see history finding), the Beehiiv subscription id above, PROBE_KEY / OPS_KEY and CRON_SECRET only if ever pasted into a chat or ticket.

### H. Workflows and scripts
- No workflow uses pull_request or pull_request_target (no fork-run path to secrets). All nine are schedule or workflow_dispatch.
- permissions: contents: read is set in seven; build-desk-cube.yml and vin-rollout.yml have no permissions block (they get the repository default, which may be write): add `permissions: contents: read` (F-14, low).
- Actions are pinned to major tags (actions/checkout@v4/v5, setup-node@v4/v5, upload/download-artifact@v4), and one third-party action, browser-actions/setup-chrome@v1 (smoke-prod.yml), is unpinned by SHA. A moved tag runs new code with PROBE_KEY and the bypass secret in scope. Pin to commit SHAs (low-medium, F-14).
- Secrets scope: SUPABASE_SERVICE_ROLE_KEY and OLDCARSDATA_API_KEY are given to the jobs that need them; the premium job correctly uses only PROBE_KEY (the key goes to curl on stdin, not the command line: good). Anyone who can edit a workflow on the default branch can read these secrets; branch protection and required review on .github/workflows are the control (dashboard setting, Sam).
- Scripts that write to production with no explicit guard flag (no --live / --apply / --dry): backfillPartnerHistory.js, backfillUsd.js, buildSpecPagesCache.js, buildVinIndex.js, generateAliases.js, ingest.js, pullSources.js, seedGenerations.js, seedPartners.js, seedTaxonomy.js, warm.js. They are the ops scripts the workflows run, but run on a laptop with the env they write at once. The offline checks I inspected (analyticsCheck, rungCheck, taskStopCheck, amazonTypedCheck) point at stub or localhost addresses and are safe. `npm run deploy` still calls `vercel --prod`, against the lane rule (deploy by push only) (low, F-15).

### I. Headers and CORS (from the repo; live check not yet done)
- vercel.json has no "headers" block, and the code sets no Content-Security-Policy, X-Frame-Options / frame-ancestors, X-Content-Type-Options, Referrer-Policy or Permissions-Policy on normal pages. Only the partner pages (api/partnerDemo.js, api/partnerAnswer.js) set Referrer-Policy and nosniff. HSTS is added by Vercel for the domain automatically (to be confirmed by the live check). Effect: any site can frame /sell, /preview, /admin (clickjacking), no script-source restriction limits the damage of a future XSS, and referrers leak full addresses (including /api/crew?code= if followed to a link) (F-05, medium). A strict CSP is a large change here (inline scripts everywhere); a safe first step is the four low-risk headers plus `frame-ancestors 'self'`.
- CORS is wildcard on 12 routes (section E, F-06).
- Live check: ask Lane F for a gap; I need at most two header-only requests to goasksam.com (no cookies, no keys): one to /sell and one OPTIONS to /api/chat with an Origin header.

### J. Dependencies
npm audit (run locally, registry only): 0 vulnerabilities in total; the project has no runtime dependencies (one dev dependency, puppeteer-core, 25 packages in the tree). Dependabot, CodeQL and secret-scanning alert lists: not readable here (the gh CLI is not installed); Sam reads them in GitHub Security. Node runtime and Vercel platform versions are dashboard settings.

Search check: no public page touched.

## STAGE 3: ranked findings for Sam

Counts: critical 0; high 3 (F-02, F-03, F-04); medium 8 (F-01, F-05, F-06, F-07, F-08, F-09, F-11, F-21); low-medium 2 (F-10, F-12); low 11 (F-13 to F-20, F-23 to F-25); info 2 (F-22, F-26); accepted 2 (F-27, F-28). Nothing below has been changed in code or the database except the approved Stage 1 documentation. Sam approves item by item; the owner lane ships it by the normal push protocol; any fix that would change a count, range, line or answer is not proposed here (none do).

Owner lanes: Lane B engine / lib / onebox; Lane C Buy, history pages, Amazon screens; Lane D /sell, Tasks, emails; Lane E partner answer path / data checks; Lane G Amazon demo page; Sam = dashboard, GitHub, Vercel settings and SQL.

| ID | Sev | Plain summary | Where | How it could be misused | Proposed fix | Owner |
|---|---|---|---|---|---|---|
| F-02 | HIGH (confirmed live) | Three database functions that edit other people's rows can be called by anyone holding the public key | claim_result, reserve_search, release_search (+ journey_rank); docs/supabase-phase3-2c.sql, supabase-daily-caps.sql | A stranger deletes search records by number, attaches saved results to any account, or burns another user's allowance | The revoke block in section F-02 (service role only); rollback and tests given; DDL files already updated | Sam (SQL) |
| F-03 | HIGH | The lead form has no limit, no check, and takes any link and text, then emails real PowerSeller partners from our address; the "add details" step can overwrite any lead by guessing its 5-digit reference | api/submitSellerLead.js (whole handler; additionalDetails lines 103 to 146; makeReference line 60); lib/_email.js priorSaleUrl line 79 | Spam or phishing aimed at partners that looks like it comes from GoAskSam (partner trust, sender reputation, Resend quota); anyone can append notes or a VIN to a stranger's lead and trigger a partner email | Add a ceiling (per address per hour, per email per day) and Turnstile on the public lead; require the lead email to match on additionalDetails and use an unguessable reference (random 12+ characters, checked unique); accept priorSaleUrl only from the stored decision, https and an allowed host, never from the request; cap request size; make CORS same-origin | Lane D (submitSellerLead, emails), Lane E for the partner side |
| F-04 | HIGH until checked | A real-looking newsletter subscription id is committed in a script, and /api/crew?bhs=<id> turns such an id into a signed-in session; if that account is an admin, it opens /admin | scripts/beehiivSigninVerify.mjs (commit 87c62c6f); api/crew.js lines 54 to 76; ADMIN_EMAILS check api/admin.js | Anyone who can read the repo (or any forwarded newsletter link) signs in as that subscriber; for an admin email that is the dashboard of counts and costs | Check whether the id is live; read it from the environment in the script; re-create that subscriber so the id changes; consider excluding ADMIN_EMAILS addresses from the bhs path and add an attempt limit and a short-lived signed link | Sam (Beehiiv + env), Lane D (api/crew.js) |
| F-01 | MEDIUM | shared_calculations (not ours) has an open write policy | Supabase table, not in repo | Anyone with the public key writes, and maybe edits or deletes, rows; storage abuse | Inspect with the two read-only queries in Stage 1b; drop if unused, else owner-scoped policies | Sam (SQL) |
| F-05 | MEDIUM | No frame, content-type, referrer or script-source protection headers on any normal page | vercel.json (no headers block) | Other sites frame /sell, /preview, /admin (clickjacking); a future XSS has no CSP backstop; full addresses leak in referrers | Add a headers block: X-Frame-Options SAMEORIGIN plus frame-ancestors 'self', X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy; a CSP in report-only first (inline scripts need a nonce plan). Test on a preview with scripts/pushCheck.mjs | Lane C (shared page shell), Sam to approve |
| F-06 | MEDIUM | Any website can call the engine, chat, lead and sign-in-adjacent APIs from its visitors' browsers | `Access-Control-Allow-Origin: *` in sellerDecision, chat, vehicleIdentity, account, hunts, funnel, pageview, dailyPulse, submitSellerLead, publicConfig, desk, usageDashboard | A third party spends our metered budgets from many visitor addresses, getting around per-address limits; none of it can read a visitor's login | Allow only https://goasksam.com (and the www / preview host) in one shared helper; keep * only for truly public static reads (dailyPulse, pageview image) | Lane B (engine, chat), Lane D (leads, account), Lane C (rest) |
| F-07 | MEDIUM-LOW | A browser-supplied model name goes into a database filter without encoding | api/sellerDecision.js line 1274 (and lines 1291 to 1302); lib/vehicle.js sanitizeResolvedVehicle | A caller adds filters or parameters to a read of the auction-records table (public data); can cause odd or slow reads | encodeURIComponent each token and restrict model/make to letters, digits, space, dot, hyphen, slash and apostrophe in sanitizeResolvedVehicle | Lane B |
| F-08 | MEDIUM | Five write endpoints have no limit and the spend cap is off | api/funnel.js (client_diag unbounded JSON into app_usage_events; journey events), api/pageview.js, api/out.js, api/track.js, api/businessLead.js (also one email per call) | Fill the database and poison the analytics and cost dashboards; flood our inbox and Resend quota | Per-address ceilings through lib/_ceilings.js; cap diag size (for example 2 KB) and allow-list its keys; honeypot or Turnstile on businessLead; set a Supabase spend alert even with the cap off | Lane C (funnel, pageview, out, track), Lane D (businessLead) |
| F-09 | MEDIUM | Crew, tester and partner codes travel in addresses; crew link has no attempt limit; crew cookie is JS-readable, lasts a year and cannot be revoked singly | api/crew.js; api/partnerDemo.js q.k; public/desk.html and public/onebox.html (?crew=, ?tester=); lib/_crew.js | Codes end up in request logs, browser history, forwarded links; an unlimited guesser or a holder of a cookie can test code guesses offline | Rotate CURTAIN_CREW_CODE after the launch tests (lists in section G); add the partner_code style ceiling to /api/crew; make the crew cookie HttpOnly (scripts only use its shape: check lib uses of CREW_SHAPE_RE_SRC first) and 30 days; use a one-time exchange (code in a POST body or short-lived signed link) instead of the long-lived code in the address; keep codes 24+ random characters | Lane C (api/crew.js, shells), Sam to rotate |
| F-11 | MEDIUM (if values reused) | Old hard-coded codes remain in git history | commit 93fab5ec lib/_tester.js (tester code, 17 chars, expiry already past); commit 0943ce8c api/crew.js (DAYPASS_CODE fallback); commit c88a9734 lib/_onepass.js (ONCE_SECRET fallback) | If a live env value still equals one of these, the code is public to anyone who can read the repo | Confirm the live CURTAIN_TESTER_CODE / DAYPASS_CODE / ONCE_SECRET differ (or are unset); rotate if equal. No history rewrite needed after rotation | Sam |
| F-21 | MEDIUM (process) | The DDL files do not match the live database for nine tables | seller_leads, sales_archive, vehicle_market_records, vehicle_classifications, app_usage_events, canonical_sales, sale_aliases, outbound_clicks, auction_attempts | A rebuild from the files would create these tables with RLS OFF, including the one holding seller emails and phones | Add the enable RLS + revoke lines to each DDL file (live already has RLS); run the Stage 1 grants query to confirm table grants | Lane B (docs) or Sam |
| F-10 | LOW-MED | Open redirect through a backslash in the crew link's `to` | api/crew.js line 87 | A link on goasksam.com bounces a victim to another site | Reject any `to` containing a backslash or `//`; allow only `^/[A-Za-z0-9._~/%?=&-]*$` | Lane C |
| F-12 | LOW-MED | The rate-limit ledgers fail open, and device limits reset when the visitor cookie is dropped | lib/_ceilings.js; api/partnerDemo.js (partner_code catch returns ok) | A short database outage lifts the guess limit on the partner code; a script rotates cookies to dodge the per-device window | Fail closed for partner_code and crew-code attempts (a refused attempt is cheap); keep fail-open for ordinary search | Lane C |
| F-13 | LOW | The partner demo calls the engine with the server's ops key, which skips limits | api/partnerAnswer.js lines 217 to 221 | A partner (or a leaked partner cookie) drives any text through a privileged engine path (bounded by the partner_demo ceiling) | Replace the ops-key path with an internal-caller flag in sellerDecision as the code already suggests; scope the credential to demoRead | Lane E with Lane B |
| F-14 | LOW | Workflows: two lack a permissions block; actions pinned by tag not commit; one third-party action unpinned | .github/workflows/build-desk-cube.yml, vin-rollout.yml, smoke-prod.yml (browser-actions/setup-chrome@v1) | A moved action tag or a write-default token runs new code with the service key or bypass secret in scope | Add `permissions: contents: read`; pin actions to commit SHAs; branch protection with review on .github/workflows (dashboard) | Sam (workflow files are added by Sam) |
| F-15 | LOW | Eleven production-writing ops scripts and `npm run deploy` have no guard | scripts/backfillPartnerHistory.js, backfillUsd.js, buildSpecPagesCache.js, buildVinIndex.js, generateAliases.js, ingest.js, pullSources.js, seedGenerations.js, seedPartners.js, seedTaxonomy.js, warm.js; package.json deploy | A run from a laptop with the env writes straight to production; deploy bypasses push protocol | Require --live (workflows pass it); remove or repoint `deploy` | Lane B / Sam |
| F-16 | LOW | Table grants not revoked from anon/authenticated in DDL for ~18 RLS-only tables | list in section D | None while RLS stays on; becomes exposure if RLS is ever switched off by mistake | Add `revoke all ... from anon, authenticated` lines and run once | Sam (SQL) |
| F-17 | LOW | Some tables hold personal data with no retention or deletion path | seller_leads, business_leads, accounts, tasks, watches, buy_alerts, hunts | Data kept indefinitely; privacy-request handling is manual | Decide retention (for example leads 24 months) and write a deletion procedure; document in privacy page | Sam decides, Lane D builds |
| F-18 | LOW | Receipt links are not checked for a web scheme | public/js/onebox.js lines 316, 417, 1098, 1237; lib/live | A `javascript:` link from an upstream feed would run on click | Allow only https: when reading the record URL | Lane B / Lane C |
| F-19 | LOW | Link-signing secret falls back to other secrets, and finally to the word "dev" | lib/tasks/tasks.js line 789, lib/live/watches.js line 117, lib/live/buyAlerts.js line 63, lib/_addr.js line 8 | If TASK_LINK_SECRET were unset, links would be signed with the cron or service key (reuse), or forgeable if all were unset | Require TASK_LINK_SECRET and ADDRESS_HASH_SECRET as their own env vars; fail closed instead of "dev" | Lane D |
| F-20 | LOW | Cron/ops bearer checked with `===` not constant time | api/usageDashboard.js, tasks.js, watch.js, admin.js, history.js | Timing guesses are impractical over the network | Use the constant-time helper in lib/_credential.js everywhere | Lane C / Lane D |
| F-22 | INFO | JSON-LD in specPage not `<`-escaped | api/specPage.js line 138 | None today (fixed vocabulary) | Reuse history.js jsonLd() | Lane C |
| F-23 | LOW | Photo proxy uses a blocklist and does not re-check DNS | lib/_salePhoto.js | Only archive-sourced URLs are fetched; a poisoned upstream URL to an internal name is the theory | Allowlist the photo hosts (bringatrailer, carsandbids, pcarmarket, etc.) | Lane E |
| F-24 | LOW | Dead guest redirect and crew-code in desk.html query | vercel.json /rudy; public/desk.html, onebox.html | Dead path; code in address (see F-09) | Remove /rudy; fold ?crew= into F-09 | Lane C |
| F-25 | LOW | In-memory limiter on /mcp resets per instance | api/mcp.js | A scripted caller exceeds the nominal limit | Move to the shared ledger | Lane C |
| F-26 | INFO | Supabase Auth: leaked-password protection, OTP expiry, Postgres version, storage buckets, Dependabot / CodeQL / secret scanning alerts could not be seen | dashboard | n/a | Sam reads the Auth and Security pages and GitHub Security tab and reports any open item | Sam |
| F-27 | ACCEPTED | pg_trgm in public (Advisor warning) | Stage 1d | None | Leave | n/a |
| F-28 | ACCEPTED | RLS enabled with no policy (the likely 69 info items) | all server-only tables | None, it is the intended state | Leave | n/a |

Suggested order for Sam: (1) run the F-02 revoke block and the 10 search_path statements; (2) F-04 (check the id) and F-11 (confirm env values differ); (3) F-03 and F-08 as one "public write endpoints" job for Lane D and Lane C; (4) F-05 and F-06 together as one headers-and-origin job on a preview; (5) F-01 inspection; (6) F-09 rotation plus the crew-link changes after the launch tests; the rest in any order.

Search check: no public page touched.

### Live header check (Oct 21 2026, 04:10Z; two plain requests, no cookies, no keys; no lock open before either)
- GET /sell: HTTP 200, cache-control private no-store, server Vercel, strict-transport-security max-age=63072000 (Vercel adds HSTS). NO content-security-policy, x-frame-options, x-content-type-options, referrer-policy or permissions-policy header. F-05 CONFIRMED on the live site (HSTS is present, so that part is fine).
- OPTIONS /api/chat with an Origin header: HTTP 429 with no access-control headers. This is almost certainly Vercel bot protection answering a header-only request that carries no browser signals, not our code. F-06 is therefore NOT confirmed live; it stands from the code (Access-Control-Allow-Origin * set in api/chat.js line 51 and the other 11 routes). I did not retry, to avoid hammering production. A real-browser check by the owning lane on a preview would settle it.

## STATUS UPDATE: F-02 and the ten search_path statements are RESOLVED (Oct 21 2026)
Sam ran the revoke block and the ten ALTER FUNCTION statements in the Supabase SQL editor and Lane F relayed the checks: claim_result, reserve_search, release_search and journey_rank read anon false, signed-in false, service true; search_path is set on all ten functions; supabase_auth_admin keeps execute on before_user_created_ip_cap; and a real brand-new account claimed a result from a signed-out /sell result (the claim_result path works with the service role). DDL files confirmed to carry the matching lines (checked in the tree today): the ALTER lines at the end of supabase-backfill-usd-fn.sql (3), supabase-desk-dictionary-queue.sql, supabase-daily-caps.sql, supabase-phase3-2c.sql (2), supabase-ip-rate-caps.sql, supabase-vin-index-atomic-swap.sql, supabase-journeys-schema.sql; and the revoke/grant lines at the end of supabase-phase3-2c.sql (claim_result, release_search), supabase-daily-caps.sql (reserve_search), supabase-journeys-schema.sql (journey_rank). Status of F-02: RESOLVED. The Advisor warning count should drop by the ten function warnings; the remaining ten are listed in Stage 1c.

## EMAIL DELIVERABILITY (report only; Oct 21 2026): why the sign-in code email went to Hotmail spam

Method: the code (lib/_email.js and every caller), the repo docs, and PUBLIC DNS only (dig). No request to the app, no key.

### 1. What the code sends, and from where
Two Resend paths in lib/_email.js (the Resend REST address, key RESEND_API_KEY) and one path that is NOT in the code:
| Email | Sent by | From | Reply-To | Subject style | List-Unsubscribe | Plain-text part |
|---|---|---|---|---|---|---|
| Sign-in code (and the "Confirm signup" code for new accounts) | Supabase Auth, asked by the browser (public/js/auth.js line 114, /auth/v1/otp). The sender is a Supabase dashboard setting, NOT in this repo | UNKNOWN from code. Either Supabase's built-in sender or a custom SMTP; the launch checklist says custom SMTP via smtp.resend.com was planned with sender hello@goasksam.com (noreply@ as fallback), "still to do by Sam" | unknown | set in the dashboard template | none (transactional) | unknown |
| PowerSeller lead and "additional details" notices (sendLeadNotification, sendAdditionalDetails) | Resend | GoAskSam Leads <leads@mail.goasksam.com> (env LEAD_EMAIL_FROM can override) | the seller's address, unvalidated | "New GoAskSam lead: <car> (<partner>)" | none | yes (text and html) |
| Tasks start email, Tasks digest, sold-car (watch) notices, Before it ends, spend alerts, business-lead notice to Sam (sendTaskEmail) | Resend | GoAskSam <sam@mail.goasksam.com> (TASK_EMAIL_FROM can change the address, name always GoAskSam) | feedback@goasksam.com | task-specific, plain sentences | YES on Tasks, digests and Before it ends: List-Unsubscribe plus List-Unsubscribe-Post one-click (lib/tasks/tasks.js lines 797 to 800, lib/tasks/digest.js lines 187 and 255, lib/live/buyAlerts.js line 184); none on the internal spend alert and business-lead notices (they go to our own inbox) | yes (text and html) |
All Resend mail leaves from the subdomain mail.goasksam.com. A junk-folder reminder line is added to the first email an address ever receives (lib/_email.js firstEmailTo), so the team already knew Hotmail files this mail as junk.

### 2. What public DNS shows (queried today)
| Name | Result |
|---|---|
| goasksam.com MX | 0 goasksam-com.mail.protection.outlook.com (the apex mailboxes, feedback@ included, are Microsoft 365) |
| goasksam.com TXT (SPF) | v=spf1 include:secureserver.net -all (no Microsoft 365 include, no Resend; hard fail) |
| _dmarc.goasksam.com | v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net (policy quarantine, relaxed alignment, reports go to a GoDaddy address nobody reads) |
| DKIM for Microsoft 365 | selector1 and selector2 CNAMEs present (OK for mail sent from the apex mailboxes) |
| resend._domainkey.mail.goasksam.com | a 1024-bit RSA public key present: the Resend domain mail.goasksam.com IS set up for DKIM |
| resend._domainkey.goasksam.com (apex) | EMPTY: the apex goasksam.com is NOT a Resend domain |
| mail.goasksam.com TXT, MX, _dmarc.mail | none (DMARC falls back to the apex policy, p=quarantine) |
| send.mail.goasksam.com MX | 10 feedback-smtp.us-east-1.amazonses.com (Resend's return-path host, correct) |
| send.mail.goasksam.com TXT (SPF) | TWO SPF records: "v=spf1 include:dc-fd741b8612._spfm.send.mail.goasksam.com ~all" and "v=spf1 include:amazonses.com ~all". The first include resolves to the same Amazon list. Two SPF records on one name is a permanent error (RFC 7208): receivers must treat SPF as broken for that name |
| auth.goasksam.com | no record (no custom Supabase auth domain) |
Alignment: Resend mail has From mail.goasksam.com, DKIM d=mail.goasksam.com (aligned, DMARC passes through DKIM), return-path send.mail.goasksam.com (SPF is broken by the duplicate record, and send.mail is a different subdomain from the From, but relaxed alignment treats them as the same organization). So DMARC passes on DKIM alone; SPF contributes nothing right now.

### 3. What I cannot see, and the exact dashboard page Sam reads (one step at a time)
- Which sender the sign-in email really uses. Step 1: Supabase dashboard, project otkmxyrglikdoychnmvy, left menu Authentication, then Emails, then the SMTP Settings tab. Read: is "Enable custom SMTP" on; the Sender email and Sender name; Host. If it is OFF, the code email comes from Supabase's built-in sender (a shared address on a Supabase domain), which is the most likely cause.
- The email text. Step 2: same page, Templates tab: open "Magic Link" and "Confirm signup": read the Subject and body (does it hold only the code, {{ .Token }}, or a link too?).
- Whether Resend considers mail.goasksam.com healthy. Step 3: Resend dashboard, Domains, mail.goasksam.com: read the status of DKIM and SPF, and the settings "Click tracking" and "Open tracking" (should be OFF).
- What actually happened to the message. Step 4: Resend, Logs (Emails): if the sign-in code appears, read its status (Delivered or Bounced) and From; if it does not appear, the code did not go through Resend (built-in sender). Supabase, Authentication, Logs (or Logs, Auth) shows the send.
- Hotmail's own view of our reputation (Microsoft SNDS / Junk Mail Reporting) cannot be read without our sending IPs; Resend's shared IPs are not ours, so no action there.

### 4. Diagnosis: why Hotmail filed it to spam (ranked; confidence stated)
1. Most likely (cannot confirm without step 1): the sign-in mail still goes out through Supabase's built-in sender. That is a shared, rate-limited address on Supabase's domain that is not authenticated to goasksam.com, sent with generic text; Hotmail routinely junks it. The launch checklist lists the custom SMTP as "still to do by Sam".
2. If custom SMTP is already on: the planned sender hello@goasksam.com cannot be authenticated by Resend, because only mail.goasksam.com is a Resend domain (no DKIM key at the apex). Resend would refuse it, so a working custom setup must use an address on mail.goasksam.com. If it uses sam@ or another address at mail.goasksam.com the DKIM passes, and the cause is the next two items.
3. Broken SPF on the Resend return-path name: the duplicate SPF records on send.mail.goasksam.com make SPF a permanent error. Microsoft weighs SPF; a permerror next to a brand-new sending domain is a plain junk signal. Fixable today.
4. mail.goasksam.com is a young domain with no sending history; Hotmail starts such senders in junk until people open and mark it "not junk". Small volume makes this worse. Fix by consistency and by asking early recipients to mark it not junk (the existing junk line already does this for Tasks mail).
5. Content: a one-line code mail with a link, a tracking-rewritten link, or a subject like "Confirm your signup" scores poorly. A plain "Your GoAskSam sign-in code" with the code in the body and no tracked links scores best.
Not a cause: DMARC (policy quarantine is in place and passes through DKIM), List-Unsubscribe (not needed on a one-time code), the apex SPF (it only matters for mail sent from the Microsoft 365 mailboxes; see fix D).

### 5. Proposed fix (Sam adds it himself; nothing runs until he approves)
Answer first: YES, sign-in should move to a custom SMTP on Resend, from an address on mail.goasksam.com (not the apex), so the code email, the Tasks mail and the lead mail share one authenticated domain and one reputation.
A. Fix the duplicate SPF (DNS, GoDaddy: domain goasksam.com, DNS, Records; nameservers are domaincontrol.com).
   1. Open Resend, Domains, mail.goasksam.com and note the SPF record Resend lists (host send, type TXT, value v=spf1 include:amazonses.com ~all).
   2. In GoDaddy find the two TXT records with host "send.mail". Delete the one whose value contains "dc-fd741b8612._spfm". Keep exactly one TXT at send.mail with value: v=spf1 include:amazonses.com ~all
   3. Wait for DNS (GoDaddy TTL), then in Resend click Verify / Restart verification on the domain. Read-only check from any terminal: dig +short TXT send.mail.goasksam.com must show ONE line.
B. Turn Resend tracking off: Resend, Domains, mail.goasksam.com, set Click tracking OFF and Open tracking OFF (already in the checklist; confirm it).
C. Custom SMTP for sign-in:
   1. Resend, API Keys, Create API Key: name supabase-smtp, permission Sending access, domain mail.goasksam.com only. Copy it once; do not paste it anywhere except step 2.
   2. Supabase, Authentication, Emails, SMTP Settings: Enable custom SMTP. Sender email: login@mail.goasksam.com (or sam@mail.goasksam.com; any address at mail.goasksam.com works because the domain is verified). Sender name: GoAskSam. Host: smtp.resend.com. Port: 465. Username: resend. Password: the supabase-smtp key. Save. (Do NOT use hello@goasksam.com: the apex is not a Resend domain. If Sam wants hello@, first add goasksam.com itself as a Resend domain and publish the DKIM/SPF records Resend lists, which would put Resend beside Microsoft 365 on the apex SPF: not recommended.)
   3. Templates tab, Magic Link and Confirm signup: Subject "Your GoAskSam sign-in code". Body: two short plain lines, the code as {{ .Token }}, one line saying it expires and to ignore it if unrequested. No button, no tracked link.
   4. Authentication, Rate Limits: confirm "emails per hour" is raised (the built-in sender is limited to a few per hour; custom SMTP lifts it).
D. Apex SPF for Sam's own Microsoft 365 mailboxes (not the cause of this problem, but a real gap): in GoDaddy change the TXT at host @ from v=spf1 include:secureserver.net -all to v=spf1 include:spf.protection.outlook.com include:secureserver.net -all. Without it, mail Sam sends from his goasksam.com mailbox fails SPF and, with DMARC p=quarantine, can land in Hotmail junk too.
E. Optional: send DMARC reports somewhere readable: in GoDaddy edit the TXT at host _dmarc to v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:feedback@goasksam.com (expect XML report mail; use a free DMARC report reader if it is noisy). Keep p=quarantine.
F. Test (after A to C): Supabase, Authentication, Users, or just request a code on goasksam.com with a Hotmail address. In Hotmail open the message, "View message source" (Outlook.com: three dots, View, View message source) and read Authentication-Results: dkim=pass, spf=pass, dmarc=pass. In Resend, Logs, status Delivered. If it still lands in junk, mark it "Not junk" once and send two more; expect the placement to improve over the first days. A free tester that scores a received message (for example mail-tester.com) gives a second opinion; it needs one message sent to its address.
Rollback: turn "Enable custom SMTP" off in Supabase (back to the built-in sender); put the second SPF record back only if Resend asks for it.

Search check: no public page touched.

## F-04 ANALYSIS (Sam: the committed subscription id is LIVE) (Oct 21 2026, report only)

What the id proves: nothing about the person holding it. api/crew.js (lines 54 to 76) takes ?bhs=<id>, asks Beehiiv server side (lib/_beehiiv.js beehiivBySubscriberId) for that subscription, and if its status is active uses the email Beehiiv returns. The id is a bearer value: whoever presents it is treated as that subscriber.
What the path then does, with no second factor: (1) asks Supabase for a magic link for that email (creating the account if new, with a sign-up ticket that gets past the sign-up hook), verifies it server side and returns a real access and refresh token to the visitor in the address fragment (/sell#access_token=...); (2) sets the signed tester cookie if tester access is on (it is off now, expiry passed); (3) writes a funnel event. It needs nothing else: no email typed, no click from the inbox, no code. It does not need to arrive from a newsletter. Cost to the attacker: knowing the id. Where the id lives: every newsletter email link for that person (forwardable, visible to anyone reading that inbox or Beehiiv's click-tracking logs), Vercel request logs (it is in the address), browser history, and the committed script (scripts/beehiivSigninVerify.mjs, commit 87c62c6f). Anyone with repo read access holds it now.
Can it reach an admin path? Yes, indirectly. /admin and /api/admin accept a Supabase session whose email is in ADMIN_EMAILS (api/admin.js line 334: validateBearer then adminEmails().includes(email)). The token minted by the bhs path carries that subscriber's email. If the subscriber's email is in ADMIN_EMAILS (Sam's own address is the likely subscriber), the id alone opens the admin dashboard: counts, costs, reliability and journeys (it returns summaries, not raw leads, but it is the founder's view). Even if the email is not an admin address, the session is a full signed-in session for that person: their saved results, Tasks, watches and buy alerts, and the ability to create or stop Tasks and send Task emails to that address. The Desk is crew or tester cookie only, so the session alone does not open it (tester cookie only while tester access is on).
How to close it (options, strongest first):
1. Remove the path (recommended). Delete the q.bhs branch in api/crew.js and the beehiivBySubscriberId session minting. A newsletter reader signs in with the normal email code like everyone else. The reader's tier (tdv or free) is already looked up by email at sign-in (beehiivTier), so nothing of value is lost except one saved step.
2. Keep the convenience but make the id prove nothing alone: the bhs link lands on /sell with a "Welcome, Daily Vroom reader" screen that asks for the email and sends the normal code; the id is used only after the code is verified, to check the typed email equals the subscription's email (require the email too) and to mark the tier. The id never mints a session.
3. A signed, one-time, expiring link (HMAC over email and expiry, single use stored server side) would be safe, but Beehiiv cannot compute a per-recipient signature in a merge tag, so this cannot be done inside a newsletter. It would only work for links we send ourselves.
Also needed whichever option: make the id useless as a secret. Remove the literal from the script now (read it from the environment or take a command-line argument). Because the id cannot be rotated in place (Beehiiv fixes it per subscriber), if the owner treats it as compromised: unsubscribe and re-add that subscriber in Beehiiv so a new id is issued, update their newsletter links automatically (they carry the merge tag), and the old id then resolves to a non-active subscription and mints nothing. Proposed fix: option 1 now (smallest and safest), option 2 later if the shortcut is wanted. Owner lane: Lane D (api/crew.js sign-in flow, with the script cleanup) with Sam doing the Beehiiv re-add. Interim, zero code: set ADMIN_EMAILS to an address that is NOT a newsletter subscriber (a second address used only for /admin), which removes the admin reach immediately.
The id in git history: do not rewrite history for it. A rewrite on a repo with 5,427 commits and 253 refs breaks every lane's checkout and worktree, and the id stays in any existing clone, fork or cached copy anyway. Closing the path and re-creating the subscriber (new id) makes the old id worthless; after that the history copy is harmless. Never paste the id into a ticket, chat or lane-notes. If the repository is or becomes public before the re-add, treat the id as published.

## ROTATION PLAN, STEP 1 (Sam ruled all five rotate). Order: the three low-impact values first (this step), the crew code next, the Vercel bypass secret last. Names only; no value is shown here and none must be pasted into chat, lane-notes or a commit.

STEP 1: CURTAIN_TESTER_CODE, DAYPASS_CODE, ONCE_SECRET (all low impact; do together)
What each is today (from the code): CURTAIN_TESTER_CODE is read only from the environment (lib/_tester.js); tester access is OFF right now because TESTER_CODE_EXPIRES (Aug 27 2026) is in the past, so it fails closed. DAYPASS_CODE and ONCE_SECRET have NO reader in the current code (the day-pass and one-time-link features were removed); the old literals only exist in git history (commits 0943ce8c and c88a9734), so the only way they matter is if an environment variable of that name still holds the same old value.
What stops working meanwhile: nothing. No lane, script or page needs any of the three right now (scripts/testerCheck.mjs uses stub values). No Keychain item holds them. No GitHub Actions secret holds them (searched the workflows). So no lane needs to do anything after this step.
Where the NEW value must be set, by name: only Vercel project goasksam, Settings, Environment Variables, and only for CURTAIN_TESTER_CODE (all three environments: Production, Preview, Development). DAYPASS_CODE and ONCE_SECRET get DELETED, not replaced.
Sam's steps, one at a time:
1. Open Vercel, project goasksam, Settings, Environment Variables. In the search box look for each of the three names in turn. For each, note only: exists or not, and which environments. Do not open or copy a value.
2. DAYPASS_CODE: if it exists, delete it in every environment. If it does not exist, nothing to do.
3. ONCE_SECRET: same as step 2.
4. CURTAIN_TESTER_CODE: if it exists, choose Edit and replace the value in every environment with a new random value of at least 24 letters and digits made by a password manager (never a word, never reused, never typed into chat). If it does not exist, leave it absent: tester access stays off. Do not touch TESTER_CODE_EXPIRES (leave it in the past so tester access stays off).
5. Apply: an environment change only reaches the running site after a new deployment. Ask Lane F to post the hold line, then in Vercel, Deployments, open the latest Production deployment, menu, Redeploy (no code change). Lane F ends the hold when the new deployment shows Ready.
Check that it worked: (a) Vercel Environment Variables shows DAYPASS_CODE and ONCE_SECRET gone and CURTAIN_TESTER_CODE showing a new "updated" time; (b) the site behaves as before: goasksam.com/sell loads, and goasksam.com/desk without a crew cookie still shows the plain not-found page; (c) any old tester link (/api/crew?tcode=...) lands on the home page instead of setting a cookie (it already does while expired). Lane S can make that one plain request after the redeploy in a gap Lane F names (no cookie, no key; with a made-up code, never the old one).
Rollback: nothing needs rolling back for the two deletions (no reader). For CURTAIN_TESTER_CODE, tester access is off either way; if anything unexpected appears, Vercel, Deployments, Redeploy the previous Production deployment (a deployment keeps the environment it was built with), then edit the variable again. Never restore the old committed literal.
Next step (sent when Sam says Step 1 is done): STEP 2, CURTAIN_CREW_CODE (Vercel env plus redeploy; every crew cookie ends; lanes and the founder mint new cookies; the Keychain items and lane scripts to refresh, by name). STEP 3, the Vercel protection-bypass secret (Vercel project setting, the GitHub Actions secret VERCEL_AUTOMATION_BYPASS_SECRET, the Keychain item goasksam-bypass, then the nightly, smoke-prod and vin-rollout workflows).

## shared_calculations (Sam: do NOT drop; shared with the TDV Import Calculator)
Recorded. The earlier "drop if unused" advice is withdrawn for this table: the project is shared with a separate app and repo that likely uses it for share links. Waiting for the result of the two read-only queries in Stage 1b (the policy list and the row count). Plan once they arrive: keep anonymous SELECT only if the share link needs it, remove anonymous INSERT, UPDATE and DELETE, and move the calculator's writes to its own server route using the service role key; if it uses small numeric ids as the share handle, add an unguessable id column. Exact SQL and a rollback follow the query result; nothing runs until Sam says.

Search check: no public page touched.

## F-01 shared_calculations: DRAFT FIX (AWAITING THE CALCULATOR CODE FACTS; nothing runs until Sam approves) (Oct 21 2026)

Facts from Sam's query: table public.shared_calculations, 87 rows, belongs to the TDV Import Calculator (separate repo dailyvroom-calculator, same Supabase project). Policies: public SELECT using true, public INSERT with check true, public UPDATE using true, no DELETE policy. Plain reading: anyone holding the public key can (1) list and read all 87 shared calculations, (2) add rows with any content and any size, (3) change ANY row (inputs, outputs, counters) of someone else's shared calculation. No one can delete rows through the API. The share link is therefore not private (a listing returns every calculation) and not tamper-proof (a link's content can be rewritten after it was shared).

### What I need from Sam (the calculator repo is not on this machine and I have no gh; I will not try to fetch it)
1. Put a read-only copy of the repo dailyvroom-calculator on this machine, for example: `git clone` it into ~/Documents/GitHub/dailyvroom-calculator, or download its ZIP from GitHub and unzip it there. Tell Lane F the folder. I only read it; I do not run, build or push it.
2. The first files I will read, in this order: (a) every file that mentions shared_calculations (search the whole repo, including any supabase/migrations folder or .sql file that created the table and its policies); (b) the Supabase client setup (createClient or any fetch to /rest/v1): which key it uses in the browser and whether any service key appears in client code; (c) the share-link page or route (what the address looks like, how it finds the row); (d) the code that inserts a row when someone presses Share and the code that bumps the open counter; (e) the env file NAMES only (.env.example, README, vercel.json), never values; (f) package.json for the framework and hosting.
3. Questions the code must answer (I will answer them from the code, not guess): Does the browser insert directly with the anon key? Is the share token in the address, and is it a long random value or a small number? Does the share page read by token or by id? Is open_count / last_opened updated from the browser with an UPDATE? Does the insert read the new row back (insert ... select / returning), which would need SELECT? What columns hold inputs and outputs and how big are they? Any other app or script that reads or writes this table?

### Personal data check (read-only, Sam runs in the SQL editor; do not paste results containing real values, only counts)
Look for: names, email addresses, phone numbers, street addresses, VINs and prices that identify a person's car or deal, and free-text notes. Counts only:
```sql
-- which keys appear in the stored inputs and outputs (column names assumed inputs and outputs; adjust to the real names)
select k, count(*) from public.shared_calculations, lateral jsonb_object_keys(to_jsonb(shared_calculations)->'inputs') k group by 1 order by 2 desc;
select k, count(*) from public.shared_calculations, lateral jsonb_object_keys(to_jsonb(shared_calculations)->'outputs') k group by 1 order by 2 desc;
-- counts of rows that look like they hold an email, a VIN or a phone number (whole row as text)
select count(*) filter (where to_jsonb(t)::text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}') as rows_with_email,
       count(*) filter (where to_jsonb(t)::text ~ '\y[A-HJ-NPR-Z0-9]{17}\y') as rows_with_vin_shape,
       count(*) filter (where to_jsonb(t)::text ~ '\y\d{3}[-. ]?\d{3}[-. ]?\d{4}\y') as rows_with_phone_shape,
       count(*) as rows
from public.shared_calculations t;
-- column list and sizes, to set the insert limits
select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'shared_calculations' order by ordinal_position;
select max(pg_column_size(t.*)) as largest_row_bytes, round(avg(pg_column_size(t.*))) as average_row_bytes from public.shared_calculations t;
```
If any row holds an email, phone or a person's name, the open SELECT is a privacy problem today (anyone can download them), not only a hardening item: tell Lane F and treat the SELECT fix as first priority.

### (3) The SQL (DRAFT; names in angle brackets come from the calculator code and the policy query: TOKEN_COL is the column the share link carries, INPUTS and OUTPUTS the JSON columns)
```sql
-- 3a. Read ONE row by its share token; bump the counters server side. Replaces anon SELECT and the browser UPDATE.
create or replace function public.get_shared_calculation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.shared_calculations;
begin
  if p_token is null or length(p_token) < 8 or length(p_token) > 128 then return null; end if;
  update public.shared_calculations
     set open_count = coalesce(open_count, 0) + 1, last_opened = now()
   where <TOKEN_COL>::text = p_token
   returning * into r;
  if not found then return null; end if;
  return to_jsonb(r);
end;
$$;
revoke execute on function public.get_shared_calculation(text) from public;
grant  execute on function public.get_shared_calculation(text) to anon, authenticated, service_role;

-- 3b. Keep INSERT for the browser, but bounded (size limits; counters cannot be pre-set).
drop policy if exists "<existing insert policy name>" on public.shared_calculations;
create policy shared_calculations_insert_bounded on public.shared_calculations
  for insert to anon, authenticated
  with check (
    pg_column_size(<INPUTS>) <= 8192 and pg_column_size(<OUTPUTS>) <= 8192
    and coalesce(open_count, 0) = 0 and last_opened is null
  );

-- 3c. Stop listing and rewriting: remove the public SELECT and UPDATE policies and the table privileges behind them.
drop policy if exists "<existing select policy name>" on public.shared_calculations;
drop policy if exists "<existing update policy name>" on public.shared_calculations;
revoke select, update, delete on public.shared_calculations from anon, authenticated;
-- INSERT stays granted to anon, authenticated. RLS stays enabled.
```
Two variants depending on the code facts: (A) if the calculator inserts with `.insert(...).select()` or reads the new row back, removing SELECT breaks the Share button; then instead of 3b create `public.create_shared_calculation(p_inputs jsonb, p_outputs jsonb)` (SECURITY DEFINER, fixed search_path, size checks, returns the new token), grant it to anon, authenticated, and drop the INSERT policy and privilege too, so anon has no direct table access at all. (B) if the share token is a small integer or short value, add a long random column (`share_token text default encode(gen_random_bytes(16), 'hex')`) first, backfill the 87 rows, and point the link at it; otherwise a function that reads by a guessable id is the same exposure as the open SELECT. Existing links keep working only if the old value remains accepted for the 87 old rows (keep both columns in the function's WHERE clause during a transition).
Calculator code change needed (their repo, their lane): replace the browser's read-by-id/SELECT with `supabase.rpc('get_shared_calculation', { p_token })`, and remove the browser UPDATE for open_count (the function does it). I do not edit that repo.

### (4) Rollback (restores today's open state exactly; policy text from Sam's query result)
```sql
drop function if exists public.get_shared_calculation(text);
drop policy if exists shared_calculations_insert_bounded on public.shared_calculations;
create policy "<existing select policy name>" on public.shared_calculations for select to public using (true);
create policy "<existing insert policy name>" on public.shared_calculations for insert to public with check (true);
create policy "<existing update policy name>" on public.shared_calculations for update to public using (true);
grant select, insert, update on public.shared_calculations to anon, authenticated;
```
(Take the exact policy names, roles and clauses from the saved policy query before changing anything; the rollback must be pasted from that result, not from this draft.)

### (5) Before and after share-link test
Before (record, change nothing): (1) open one real, current share link in a browser: it loads (note what it shows). (2) In the SQL editor: `set role anon; select count(*) from public.shared_calculations; reset role;` returns 87 (shows the open listing). (3) `set role anon; update public.shared_calculations set open_count = open_count where <TOKEN_COL>::text = 'lane-s-no-such-token'; reset role;` answers UPDATE 0 (allowed, matches nothing). Note the real row's open_count: `select open_count, last_opened from public.shared_calculations where <TOKEN_COL>::text = '<the real token>';` as the owner role.
After (the SQL applied and the calculator's code change deployed): (1) the same real share link still loads in a browser, and its open_count rose by exactly 1 (read as owner). (2) `set role anon; select count(*) from public.shared_calculations;` fails with permission denied. (3) `set role anon; update public.shared_calculations set open_count = 0 where <TOKEN_COL>::text = 'lane-s-no-such-token';` fails with permission denied. (4) `set role anon; select public.get_shared_calculation('<the real token>');` returns that one row; with a wrong token it returns null. (5) Pressing Share in the calculator still creates a link, and that new link loads. (6) `select has_function_privilege('anon','public.get_shared_calculation(text)','execute');` true; `select has_function_privilege('public','public.get_shared_calculation(text)','execute');` is not applicable (revoked from public). Run each `set role` line on its own followed by `reset role;`.
Order of deployment (so no link breaks): apply 3a first (adds the function; breaks nothing), deploy the calculator code that calls it, test a link, and only then apply 3b and 3c. If the calculator code cannot change soon, stop after 3a and 3b (bounded insert) and leave SELECT/UPDATE for later.

Severity: medium for the open write (anyone can rewrite any shared link), high if the personal-data check finds emails, phones or names in the 87 rows. Owner: Sam for the SQL, the calculator's own repo owner for the code change. Search check: no public page touched.
