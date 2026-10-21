-- FUNCTION SEARCH PATH (Lane S, Oct 2026). Fixes the Supabase Security Advisor warning "Function Search Path Mutable".
-- SAM RUNS THIS in the Supabase SQL editor. Lane S has no database key and ran nothing.
--
-- WHAT IT DOES: sets a fixed search_path (public, pg_temp) on each function listed below. Nothing else changes: not the
-- function bodies, not the grants, not any table, not any count, range, line or answer. Each function only ever touches
-- tables in the public schema (checked against its definition in the DDL file named beside it). pg_temp is listed LAST on
-- purpose: it stops a caller from planting a same-named temporary table or function ahead of the real one.
-- pg_catalog (now(), date_trunc, coalesce, count, round, upper, lower, regexp_replace, jsonb_build_object ...) is always
-- searched first by Postgres, so those calls are unaffected.
--
-- ORDER: (0) read-only discovery and BEFORE test, (1) the ALTERs, (2) AFTER test (same queries, compare), (3) rollback if
-- ever needed. All statements in (1) are metadata-only and take a brief lock on the function, not on any table.
--
-- NOTE ON RE-RUNS: CREATE OR REPLACE FUNCTION without a SET clause clears this setting. If anyone re-runs one of the older
-- DDL files named below, run this file's ALTER block again afterwards. The same ALTER lines are appended to the end of each
-- owning DDL file (marked "Lane S") so a re-run of that file ends with the setting in place.

-- =====================================================================================================================
-- (0) DISCOVERY (read-only). Lists EVERY function in the public schema that has no fixed search_path, so the live list can
-- be compared with the 10 below. Functions that belong to an extension (pg_trgm, ...) are left out, the Advisor does the same.
-- Any function in this result that is NOT in the list of 10 was created outside this repo (dashboard or another app):
-- send its name and Lane S will add the ALTER line.
-- =====================================================================================================================
select p.oid::regprocedure as function, p.prosecdef as security_definer, p.proconfig as current_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
order by 1::text;
-- Expected BEFORE: the 10 below (some may be absent if never applied) plus possibly dashboard-made ones.
-- Expected AFTER: none of the 10 below appear.

-- Who can call each one over the public REST API (RPC)? Read-only. true under anon = anyone holding the public key.
select p.oid::regprocedure as function,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_call,
       has_function_privilege('service_role', p.oid, 'execute')  as service_can_call,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1::text;
-- This second query is the one that decides the separate GRANT finding in docs/lane-security.md (F-02): expect false/false/true
-- for every function the standing rule locks down. A security_definer function showing anon_can_call = true is a hole.

-- =====================================================================================================================
-- (1) THE FIX. Ten functions. Schemas used: public only (tables named per line).
-- =====================================================================================================================

-- 1. docs/supabase-backfill-usd-fn.sql. Plain SQL, SECURITY INVOKER. Reads/updates sales_archive, fx_rates. Service role only.
alter function public.backfill_sales_usd_range(uuid, uuid)      set search_path = public, pg_temp;
-- 2. same file. Updates auction_attempts, reads fx_rates. Service role only.
alter function public.backfill_attempts_usd_range(text, date, date) set search_path = public, pg_temp;
-- 3. same file. Updates auction_attempts. Service role only.
alter function public.backfill_attempts_usd_nulldate(text)      set search_path = public, pg_temp;

-- 4. docs/supabase-desk-dictionary-queue.sql. plpgsql, SECURITY INVOKER. Writes desk_dictionary_queue (row type of the same table). Service role only.
alter function public.desk_queue_log(text, text, text)          set search_path = public, pg_temp;

-- 5. docs/supabase-daily-caps.sql (current definition; older copies in supabase-phase3-2c.sql and -2c-fix.sql). SECURITY DEFINER.
--    Reads accounts, app_config, rate_limits; reads and writes search_events.
alter function public.reserve_search(uuid, text, text, integer) set search_path = public, pg_temp;
-- 6. docs/supabase-phase3-2c.sql. SQL, SECURITY DEFINER. Deletes from search_events.
alter function public.release_search(bigint)                    set search_path = public, pg_temp;
-- 7. docs/supabase-phase3-2c.sql. plpgsql, SECURITY DEFINER. Updates saved_results.
alter function public.claim_result(uuid, uuid)                  set search_path = public, pg_temp;

-- 8. docs/supabase-ip-rate-caps.sql. plpgsql, SECURITY DEFINER, the Auth "before user created" hook. Reads app_config, reads and writes ip_rate_hits.
alter function public.before_user_created_ip_cap(jsonb)         set search_path = public, pg_temp;

-- 9. docs/supabase-vin-index-atomic-swap.sql. plpgsql, SECURITY DEFINER. Truncates and fills vin_index, vin_summary and the two staging tables.
--    (Written without a schema prefix in the DDL, so it lives in whatever schema the editor defaulted to: public.)
alter function public.swap_vin_index()                          set search_path = public, pg_temp;

-- 10. docs/supabase-journeys-schema.sql. Pure SQL, IMMUTABLE, touches no table. Used inside record_journey_event.
alter function public.journey_rank(text)                        set search_path = public, pg_temp;

-- NOT TOUCHED (already carry "set search_path = public" in their DDL, so the Advisor does not flag them):
-- analytics_refresh_day, analytics_refresh_retention, analytics_width_behavior, analytics_repeats, analytics_purge,
-- analytics_forget, analytics_link_anon, record_journey_event, journey_manual_update.

-- =====================================================================================================================
-- (3) ROLLBACK (only if an AFTER test fails; restores the previous state exactly)
-- =====================================================================================================================
-- alter function public.backfill_sales_usd_range(uuid, uuid)      reset search_path;
-- alter function public.backfill_attempts_usd_range(text, date, date) reset search_path;
-- alter function public.backfill_attempts_usd_nulldate(text)      reset search_path;
-- alter function public.desk_queue_log(text, text, text)          reset search_path;
-- alter function public.reserve_search(uuid, text, text, integer) reset search_path;
-- alter function public.release_search(bigint)                    reset search_path;
-- alter function public.claim_result(uuid, uuid)                  reset search_path;
-- alter function public.before_user_created_ip_cap(jsonb)         reset search_path;
-- alter function public.swap_vin_index()                          reset search_path;
-- alter function public.journey_rank(text)                        reset search_path;

-- =====================================================================================================================
-- BEFORE / AFTER TEST PLAN. Run (a) before step 1 and again (b) after, compare. Everything below is read-only or provably
-- touches zero rows (a nil UUID, an empty phrase, a source name that does not exist, or an id that cannot exist).
-- =====================================================================================================================
-- (a) Configuration check, all 10 at once. BEFORE: search_path is null for each. AFTER: {search_path=public, pg_temp} for each.
select p.proname, p.pronargs, p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('backfill_sales_usd_range','backfill_attempts_usd_range','backfill_attempts_usd_nulldate','desk_queue_log',
                    'reserve_search','release_search','claim_result','before_user_created_ip_cap','swap_vin_index','journey_rank')
order by p.proname;

-- (b) Call test. Same result before and after. Run as the SQL editor role (postgres). Each returns at once.
--  1 backfill_sales_usd_range: empty id range (lo = hi), updates nothing.            Expect 0
select public.backfill_sales_usd_range('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
--  2 backfill_attempts_usd_range: a source name that does not exist, empty dates.     Expect 0
select public.backfill_attempts_usd_range('lane-s-no-such-source', date '2000-01-01', date '2000-01-01');
--  3 backfill_attempts_usd_nulldate: same unknown source.                             Expect 0
select public.backfill_attempts_usd_nulldate('lane-s-no-such-source');
--  4 desk_queue_log: an empty phrase returns before any insert.                       Expect NULL (an empty row)
select public.desk_queue_log('', 'lane-s test', 'global');
--  5 reserve_search: a nil user has no account, so it returns before any insert.      Expect {"allowed": false, "reason": "no_account"}
select public.reserve_search('00000000-0000-0000-0000-000000000000', 'x', 'x', 2000);
--  6 release_search: an id that cannot exist (ids are positive), deletes nothing.     Expect empty result (void)
select public.release_search(-1);
--  7 claim_result: nil ids match no row.                                              Expect false
select public.claim_result('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
--  8 before_user_created_ip_cap: an event with no address is returned unchanged, no write. Expect {}
select public.before_user_created_ip_cap('{}'::jsonb);
-- 10 journey_rank: pure function.                                                     Expect 20
select public.journey_rank('vehicle_identified');
--  9 swap_vin_index: DO NOT CALL. It truncates the live VIN tables. Its test is (a) only. After the change, the next
--    nightly VIN rollout run (which calls it) must still succeed: that run is the functional test, read its log.

-- (c) Optional end-to-end read after the change: the three RPCs the app calls every day keep working if
--     (i) the next search on the site still reserves and shows its daily count (reserve_search), (ii) the next signup is
--     not blocked (before_user_created_ip_cap), (iii) the next nightly "caches" job swaps the VIN index (swap_vin_index).

-- WHICH ARE CALLABLE OVER RPC (the public REST API):
--   Served by the app through /rest/v1/rpc with the service key: release_search, claim_result (api/account.js); reserve_search has NO caller left in api/ or lib/ (open search policy, Oct 9 2026), so it is likely legacy and a candidate to drop later;
--   desk_queue_log, swap_vin_index (scripts/buildVinIndex.js), backfill_* (scripts/backfillUsd.js).
--   Called inside the database only: journey_rank (by record_journey_event).
--   Called by Supabase Auth, not by the app: before_user_created_ip_cap (a hook; still the old Postgres hook until the HTTPS hook replaces it).
--   Whether anon can ALSO call them depends on the live grants: run the second discovery query above. In the repo, the
--   DDL locks down desk_queue_log, backfill_*, swap_vin_index and (docs/supabase-address-privacy.sql part 1) the hook;
--   it does NOT lock down reserve_search, release_search, claim_result or journey_rank. See F-02 in docs/lane-security.md.
-- (note) claim_result is called by api/account.js (attaches an anonymous saved result to an account on sign-in), with the service key.
