-- ADDRESS PRIVACY (Lane C, Oct 2026). Run in the Supabase SQL editor, part by part, in order.
-- Since commit (this file's), the app stores no raw address anywhere it writes: limits keep a daily salted hash
-- (lib/_addr.js) and every ip_rate_hits row is deleted after 24 hours (lib/_ceilings.js pruneLedger, run by the
-- quarter-hour cron). This file deals with what was stored BEFORE, and with the old signup hook function.

-- PART 1 (run now). The old "Before User Created" Postgres function was created without the standing lock-down
-- (docs/supabase-ip-rate-caps.sql, Aug 2026): anyone holding the public anon key could call it through
-- /rest/v1/rpc and write rows. Supabase Auth runs it as supabase_auth_admin, so that role keeps execute.
revoke execute on function public.before_user_created_ip_cap(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created_ip_cap(jsonb) to supabase_auth_admin;
-- ip_rate_hits had RLS on but no revoke (standing rule):
revoke all on public.ip_rate_hits from anon, authenticated;

-- PART 2 (run now). Remove raw addresses already stored in usage events (21,717 rows with ip_address since
-- Jul 30 2026, 34 with ip_hint, counted Oct 12). Only those two keys are removed; every other field stays.
update public.app_usage_events set metadata = metadata - 'ip_address' - 'ip_hint'
  where metadata ? 'ip_address' or metadata ? 'ip_hint';

-- PART 3 (run now; the cron does it too). Ledger rows older than 24 hours, including the old hook's raw ones.
delete from public.ip_rate_hits where created_at < now() - interval '24 hours';

-- PART 4 (only AFTER the switch to the HTTPS hook has run cleanly for a week; docs/lane-notes.md has the steps).
-- The old function is then unused; dropping it ends the last place a raw address is written.
-- drop function public.before_user_created_ip_cap(jsonb);
