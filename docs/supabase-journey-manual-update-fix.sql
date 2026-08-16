-- =====================================================================
-- FIX (Phase 3): journey_manual_update failed on non-text columns.
-- The RPC bound p_value as text and assigned it directly, so numeric
-- (sale_price, gas_revenue), date (listing_date) and timestamptz (*_at)
-- fields errored with 42804 "column is of type X but expression is of
-- type text". Text fields (sale_status, actual_platform, ...) worked.
--
-- This casts the value to the target column's real type. CREATE OR REPLACE
-- only; no data change, no table change. Safe to run once in the Supabase
-- SQL editor. After running, re-run the crew verification harness.
-- =====================================================================
create or replace function public.journey_manual_update(
  p_journey_id uuid, p_field text, p_value text, p_changed_by text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'intro_sent_at','contacted_at','engaged_at','consignment_at','listed_at',
    'actual_platform','listing_url','listing_date','sale_status','sold_at',
    'sale_price','gas_revenue','closed_no_sale_at','internal_notes','stage'];
  v_old  text;
  v_type text;
begin
  if not (p_field = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'reason', 'field_not_allowed');
  end if;
  select format_type(a.atttypid, a.atttypmod) into v_type
    from pg_attribute a
    where a.attrelid = 'public.journeys'::regclass and a.attname = p_field and a.attnum > 0 and not a.attisdropped;
  execute format('select (%I)::text from public.journeys where journey_id = $1', p_field) into v_old using p_journey_id;
  execute format('update public.journeys set %I = nullif($1, '''')::%s, updated_at = now() where journey_id = $2', p_field, v_type)
    using p_value, p_journey_id;
  insert into public.journey_audit (journey_id, changed_by, field, old_value, new_value, note)
    values (p_journey_id, p_changed_by, p_field, v_old, nullif(p_value, ''), p_note);
  return jsonb_build_object('ok', true, 'field', p_field, 'old', v_old, 'new', nullif(p_value, ''));
end;
$$;

revoke all on function public.journey_manual_update(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.journey_manual_update(uuid,text,text,text,text) to service_role;
