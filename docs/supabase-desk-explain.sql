-- Sam Desk — read-only EXPLAIN helper (diagnosis only; spec item 0 / EXPLAIN investigation).
-- =====================================================================
-- PostgREST's plan media type (application/vnd.pgrst.plan) is DISABLED on Supabase
-- (db-plan-enabled=false), so the deskexplain ops task cannot run EXPLAIN through the REST API.
-- This function lets it run EXPLAIN (ANALYZE, VERBOSE, BUFFERS, FORMAT JSON) server-side for a
-- SELECT against sales_archive ONLY. It is read-only (guards non-SELECT / non-sales_archive text)
-- and returns the plan as JSON. Once applied, task=deskexplain calls rpc/desk_explain and reports
-- the real plan (index usage, where the time goes).
--
-- Apply once in the Supabase SQL editor (Sam; service-role secret not pullable locally). ANALYZE
-- actually EXECUTES the query to time it; keep it to bounded SELECTs (the task passes limited ones).
-- =====================================================================

create or replace function desk_explain(q text)
returns jsonb
language plpgsql
security invoker
as $$
declare
  r jsonb;
  norm text := lower(btrim(q));
begin
  -- read-only guard: only a SELECT that reads sales_archive, nothing else.
  if norm !~ '^select' or position('sales_archive' in norm) = 0 then
    raise exception 'desk_explain only runs a SELECT against sales_archive';
  end if;
  if norm ~ '(insert|update|delete|drop|alter|truncate|create|grant|revoke|;)' then
    raise exception 'desk_explain rejects any write / DDL / statement separator';
  end if;
  execute 'EXPLAIN (ANALYZE, VERBOSE, BUFFERS, FORMAT JSON) ' || q into r;
  return r;
end;
$$;
