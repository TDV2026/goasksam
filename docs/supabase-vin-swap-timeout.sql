-- VIN index swap timeout (Lane C, Nov 5 2026). Run ONCE in the Supabase SQL Editor.
-- CAUSE: nightly runs 129 and 130 (Nov 2 and 3) ended red because "Rebuild VIN index" failed at the swap with a statement timeout (57014).
-- swap_vin_index() is SECURITY DEFINER, which changes whose privileges it runs under, not the statement timeout the API request carries:
-- PostgREST applies the calling role's timeout (service_role, a minute or so) to the whole call. A function-level setting overrides it for this
-- function only. Nothing else gets a longer timeout.
alter function swap_vin_index() set statement_timeout = '600s';

-- CHECK (read only): the setting is stored on the function.
select p.proname, p.proconfig from pg_proc p where p.proname = 'swap_vin_index';
-- Expect proconfig to contain {statement_timeout=600s}.
-- NOTE: "create or replace function swap_vin_index()" in docs/supabase-vin-index-atomic-swap.sql drops this setting; re-run the alter after any re-create.
