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
